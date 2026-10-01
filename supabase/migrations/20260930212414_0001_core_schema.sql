/*
# Core Platform Schema — Body/Product Compatibility Infrastructure

## Purpose
This migration creates the foundational database schema for a platform that creates
standardized digital representations of a person's body (Body Twin) and physical
products (Product Twin), then calculates compatibility between them.

## New Tables

1. **organizations** — Multi-tenant root. Every body twin, product twin, and
   fit prediction belongs to an organization. For consumer self-service, a
   personal organization is auto-created. For merchants, this is their company.

2. **body_twins** — The standardized digital body representation. Contains
   shape parameters, pose parameters, confidence, scan quality, model version.
   Does NOT contain PII — only internal IDs and body geometry data.

3. **body_measurements** — Individual anthropometric measurements linked to a
   body twin. Each row is one measurement (chest, waist, height, etc.) with
   value, uncertainty, and confidence. This separation allows adding new
   measurements without schema changes.

4. **scans** — Record of each body scanning session. Tracks device, OS, camera
   info, scanning method, depth availability, capture quality, processing
   status, and which body twin resulted from it. Raw image references point to
   Supabase Storage with retention policy enforcement.

5. **product_twins** — The standardized digital product representation. Contains
   category, size, garment measurements, material properties, geometry
   reference, fit type, manufacturing tolerance.

6. **product_measurements** — Individual garment measurements linked to a
   product twin (chest, length, shoulder, sleeve, etc.).

7. **materials** — Material/fabric properties abstraction. Supports elasticity,
   stretch, thickness, bending, compression, friction, drape, recovery.
   Linked to product twins. Designed to start simple and grow more sophisticated.

8. **fit_predictions** — The result of running the fit engine. Records which
   body twin, product twin, and size were compared, the recommendation,
   confidence, area-by-area results, explanation, and model version. Immutable
   once created — historical predictions are never overwritten.

9. **fit_feedback** — Post-purchase outcome data. Records whether the customer
   kept, exchanged, or returned the item, and their fit feedback. Linked to
   the original fit prediction for the feedback loop.

10. **events** — Platform-wide event log. Every significant action
    (scan.created, body_twin.created, fit.predicted, etc.) is recorded as an
    immutable event for analytics, audit, and ML pipeline.

11. **model_versions** — Registry of ML model versions used for predictions.
    Every prediction records which model version produced it for
    reproducibility and evaluation.

## Security
- RLS enabled on every table.
- Policies use auth.uid() for ownership checks.
- Organizations table links to auth.users for ownership.
- Body twins, measurements, scans are owner-scoped through organization
  membership.
- Product twins, materials are organization-scoped for merchant data.
- Fit predictions are organization-scoped.
- Events are organization-scoped.
- No service-role keys exposed to clients.

## Notes
- This is a multi-user, multi-tenant platform. Auth is required.
- All tables use uuid primary keys with gen_random_uuid() defaults.
- Timestamps default to now().
- JSONB columns store flexible structured data (shape params, pose params,
  area results, explanations) that will evolve as the platform grows.
- The schema is designed so clothing is the first market but the core
  abstractions (body twin, product twin, fit prediction) support shoes,
  uniforms, protective equipment, and other product categories.
*/

-- ============================================================
-- ORGANIZATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'personal' CHECK (type IN ('personal', 'merchant', 'enterprise')),
  owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_org" ON organizations;
CREATE POLICY "select_own_org" ON organizations FOR SELECT
  TO authenticated USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "insert_own_org" ON organizations;
CREATE POLICY "insert_own_org" ON organizations FOR INSERT
  TO authenticated WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "update_own_org" ON organizations;
CREATE POLICY "update_own_org" ON organizations FOR UPDATE
  TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "delete_own_org" ON organizations;
CREATE POLICY "delete_own_org" ON organizations FOR DELETE
  TO authenticated USING (owner_id = auth.uid());

-- ============================================================
-- MODEL VERSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS model_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL UNIQUE,
  model_type text NOT NULL CHECK (model_type IN ('pose', 'segmentation', 'depth', 'reconstruction', 'measurement', 'fit_prediction', 'fit_outcome')),
  description text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE model_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_model_versions" ON model_versions;
CREATE POLICY "read_model_versions" ON model_versions FOR SELECT
  TO authenticated USING (true);

-- ============================================================
-- BODY TWINS
-- ============================================================
CREATE TABLE IF NOT EXISTS body_twins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  height_cm numeric(6,2),
  shape_parameters jsonb NOT NULL DEFAULT '{}',
  pose_parameters jsonb NOT NULL DEFAULT '{}',
  mesh_reference text,
  overall_confidence numeric(4,3) NOT NULL DEFAULT 0.0,
  scan_quality text NOT NULL DEFAULT 'unknown' CHECK (scan_quality IN ('excellent', 'good', 'fair', 'poor', 'unknown')),
  model_version text NOT NULL DEFAULT 'pose-landmark-v1',
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE body_twins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_org_body_twins" ON body_twins;
CREATE POLICY "select_org_body_twins" ON body_twins FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM organizations WHERE organizations.id = body_twins.organization_id AND organizations.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_org_body_twins" ON body_twins;
CREATE POLICY "insert_org_body_twins" ON body_twins FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM organizations WHERE organizations.id = body_twins.organization_id AND organizations.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_org_body_twins" ON body_twins;
CREATE POLICY "update_org_body_twins" ON body_twins FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM organizations WHERE organizations.id = body_twins.organization_id AND organizations.owner_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM organizations WHERE organizations.id = body_twins.organization_id AND organizations.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_org_body_twins" ON body_twins;
CREATE POLICY "delete_org_body_twins" ON body_twins FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM organizations WHERE organizations.id = body_twins.organization_id AND organizations.owner_id = auth.uid())
  );

-- ============================================================
-- BODY MEASUREMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS body_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body_twin_id uuid NOT NULL REFERENCES body_twins(id) ON DELETE CASCADE,
  measurement_type text NOT NULL CHECK (measurement_type IN (
    'height', 'chest', 'waist', 'hip', 'shoulder_width', 'neck',
    'upper_arm', 'forearm', 'wrist', 'thigh', 'knee', 'calf', 'ankle',
    'inseam', 'outseam', 'torso_length', 'sleeve_length'
  )),
  value_cm numeric(7,2) NOT NULL,
  uncertainty_cm numeric(5,2) NOT NULL DEFAULT 0.0,
  confidence numeric(4,3) NOT NULL DEFAULT 0.0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE body_measurements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_body_measurements" ON body_measurements;
CREATE POLICY "select_own_body_measurements" ON body_measurements FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM body_twins
      JOIN organizations ON organizations.id = body_twins.organization_id
      WHERE body_twins.id = body_measurements.body_twin_id
      AND organizations.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_own_body_measurements" ON body_measurements;
CREATE POLICY "insert_own_body_measurements" ON body_measurements FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM body_twins
      JOIN organizations ON organizations.id = body_twins.organization_id
      WHERE body_twins.id = body_measurements.body_twin_id
      AND organizations.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "update_own_body_measurements" ON body_measurements;
CREATE POLICY "update_own_body_measurements" ON body_measurements FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM body_twins
      JOIN organizations ON organizations.id = body_twins.organization_id
      WHERE body_twins.id = body_measurements.body_twin_id
      AND organizations.owner_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM body_twins
      JOIN organizations ON organizations.id = body_twins.organization_id
      WHERE body_twins.id = body_measurements.body_twin_id
      AND organizations.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "delete_own_body_measurements" ON body_measurements;
CREATE POLICY "delete_own_body_measurements" ON body_measurements FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM body_twins
      JOIN organizations ON organizations.id = body_twins.organization_id
      WHERE body_twins.id = body_measurements.body_twin_id
      AND organizations.owner_id = auth.uid()
    )
  );

-- ============================================================
-- SCANS
-- ============================================================
CREATE TABLE IF NOT EXISTS scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  body_twin_id uuid REFERENCES body_twins(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'capturing', 'processing', 'completed', 'failed'
  )),
  scan_method text NOT NULL DEFAULT 'rgb_camera' CHECK (scan_method IN (
    'rgb_camera', 'arcore_depth', 'arkit_depth', 'lidar', 'professional'
  )),
  device_info jsonb NOT NULL DEFAULT '{}',
  capture_metadata jsonb NOT NULL DEFAULT '{}',
  poses_captured text[] NOT NULL DEFAULT '{}',
  image_references text[] NOT NULL DEFAULT '{}',
  error_message text,
  model_version text NOT NULL DEFAULT 'pose-landmark-v1',
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE scans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_scans" ON scans;
CREATE POLICY "select_own_scans" ON scans FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM organizations WHERE organizations.id = scans.organization_id AND organizations.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_scans" ON scans;
CREATE POLICY "insert_own_scans" ON scans FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM organizations WHERE organizations.id = scans.organization_id AND organizations.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_scans" ON scans;
CREATE POLICY "update_own_scans" ON scans FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM organizations WHERE organizations.id = scans.organization_id AND organizations.owner_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM organizations WHERE organizations.id = scans.organization_id AND organizations.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_own_scans" ON scans;
CREATE POLICY "delete_own_scans" ON scans FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM organizations WHERE organizations.id = scans.organization_id AND organizations.owner_id = auth.uid())
  );

-- ============================================================
-- PRODUCT TWINS
-- ============================================================
CREATE TABLE IF NOT EXISTS product_twins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  sku text,
  variant text,
  size text NOT NULL,
  category text NOT NULL DEFAULT 'clothing' CHECK (category IN (
    'clothing', 'shoes', 'uniforms', 'sportswear', 'protective_equipment',
    'wearables', 'made_to_measure', 'other'
  )),
  garment_type text,
  fit_type text NOT NULL DEFAULT 'regular' CHECK (fit_type IN (
    'slim', 'regular', 'relaxed', 'oversized', 'custom'
  )),
  manufacturing_tolerance_cm numeric(4,2) DEFAULT 1.0,
  geometry_reference text,
  geometry_format text CHECK (geometry_format IN ('glb', 'gltf', 'obj', 'fbx', null)),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE product_twins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_org_product_twins" ON product_twins;
CREATE POLICY "select_org_product_twins" ON product_twins FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM organizations WHERE organizations.id = product_twins.organization_id AND organizations.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_org_product_twins" ON product_twins;
CREATE POLICY "insert_org_product_twins" ON product_twins FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM organizations WHERE organizations.id = product_twins.organization_id AND organizations.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_org_product_twins" ON product_twins;
CREATE POLICY "update_org_product_twins" ON product_twins FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM organizations WHERE organizations.id = product_twins.organization_id AND organizations.owner_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM organizations WHERE organizations.id = product_twins.organization_id AND organizations.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_org_product_twins" ON product_twins;
CREATE POLICY "delete_org_product_twins" ON product_twins FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM organizations WHERE organizations.id = product_twins.organization_id AND organizations.owner_id = auth.uid())
  );

-- ============================================================
-- PRODUCT MEASUREMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS product_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_twin_id uuid NOT NULL REFERENCES product_twins(id) ON DELETE CASCADE,
  measurement_type text NOT NULL CHECK (measurement_type IN (
    'chest', 'length', 'shoulder', 'sleeve', 'waist', 'hip', 'neck',
    'hem', 'cuff', 'armpit', 'back_length', 'foot_length', 'foot_width',
    'heel_width', 'insole_length', 'insole_width'
  )),
  value_cm numeric(7,2) NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE product_measurements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_product_measurements" ON product_measurements;
CREATE POLICY "select_own_product_measurements" ON product_measurements FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM product_twins
      JOIN organizations ON organizations.id = product_twins.organization_id
      WHERE product_twins.id = product_measurements.product_twin_id
      AND organizations.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_own_product_measurements" ON product_measurements;
CREATE POLICY "insert_own_product_measurements" ON product_measurements FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM product_twins
      JOIN organizations ON organizations.id = product_twins.organization_id
      WHERE product_twins.id = product_measurements.product_twin_id
      AND organizations.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "update_own_product_measurements" ON product_measurements;
CREATE POLICY "update_own_product_measurements" ON product_measurements FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM product_twins
      JOIN organizations ON organizations.id = product_twins.organization_id
      WHERE product_twins.id = product_measurements.product_twin_id
      AND organizations.owner_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM product_twins
      JOIN organizations ON organizations.id = product_twins.organization_id
      WHERE product_twins.id = product_measurements.product_twin_id
      AND organizations.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "delete_own_product_measurements" ON product_measurements;
CREATE POLICY "delete_own_product_measurements" ON product_measurements FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM product_twins
      JOIN organizations ON organizations.id = product_twins.organization_id
      WHERE product_twins.id = product_measurements.product_twin_id
      AND organizations.owner_id = auth.uid()
    )
  );

-- ============================================================
-- MATERIALS
-- ============================================================
CREATE TABLE IF NOT EXISTS materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_twin_id uuid NOT NULL REFERENCES product_twins(id) ON DELETE CASCADE,
  fabric_name text,
  elasticity numeric(5,2) DEFAULT 0.0,
  stretch_percentage numeric(5,2) DEFAULT 0.0,
  thickness_mm numeric(5,2) DEFAULT 0.0,
  bending_stiffness numeric(5,2) DEFAULT 0.0,
  compression numeric(5,2) DEFAULT 0.0,
  friction numeric(5,2) DEFAULT 0.0,
  drape numeric(5,2) DEFAULT 0.0,
  recovery numeric(5,2) DEFAULT 0.0,
  density_gsm numeric(6,2),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_materials" ON materials;
CREATE POLICY "select_own_materials" ON materials FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM product_twins
      JOIN organizations ON organizations.id = product_twins.organization_id
      WHERE product_twins.id = materials.product_twin_id
      AND organizations.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_own_materials" ON materials;
CREATE POLICY "insert_own_materials" ON materials FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM product_twins
      JOIN organizations ON organizations.id = product_twins.organization_id
      WHERE product_twins.id = materials.product_twin_id
      AND organizations.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "update_own_materials" ON materials;
CREATE POLICY "update_own_materials" ON materials FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM product_twins
      JOIN organizations ON organizations.id = product_twins.organization_id
      WHERE product_twins.id = materials.product_twin_id
      AND organizations.owner_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM product_twins
      JOIN organizations ON organizations.id = product_twins.organization_id
      WHERE product_twins.id = materials.product_twin_id
      AND organizations.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "delete_own_materials" ON materials;
CREATE POLICY "delete_own_materials" ON materials FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM product_twins
      JOIN organizations ON organizations.id = product_twins.organization_id
      WHERE product_twins.id = materials.product_twin_id
      AND organizations.owner_id = auth.uid()
    )
  );

-- ============================================================
-- FIT PREDICTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS fit_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  body_twin_id uuid NOT NULL REFERENCES body_twins(id) ON DELETE CASCADE,
  product_twin_id uuid NOT NULL REFERENCES product_twins(id) ON DELETE CASCADE,
  recommended_size text,
  confidence numeric(4,3) NOT NULL DEFAULT 0.0,
  area_results jsonb NOT NULL DEFAULT '{}',
  explanation jsonb NOT NULL DEFAULT '[]',
  warnings jsonb NOT NULL DEFAULT '[]',
  fit_preference text NOT NULL DEFAULT 'regular' CHECK (fit_preference IN (
    'tight', 'regular', 'loose'
  )),
  body_pose text NOT NULL DEFAULT 'standing' CHECK (body_pose IN (
    'standing', 'walking', 'sitting', 'bending', 'arms_raised', 'squatting'
  )),
  model_version text NOT NULL DEFAULT 'fit-geometric-v1',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE fit_predictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_fit_predictions" ON fit_predictions;
CREATE POLICY "select_own_fit_predictions" ON fit_predictions FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM organizations WHERE organizations.id = fit_predictions.organization_id AND organizations.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_fit_predictions" ON fit_predictions;
CREATE POLICY "insert_own_fit_predictions" ON fit_predictions FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM organizations WHERE organizations.id = fit_predictions.organization_id AND organizations.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_fit_predictions" ON fit_predictions;
CREATE POLICY "update_own_fit_predictions" ON fit_predictions FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM organizations WHERE organizations.id = fit_predictions.organization_id AND organizations.owner_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM organizations WHERE organizations.id = fit_predictions.organization_id AND organizations.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_own_fit_predictions" ON fit_predictions;
CREATE POLICY "delete_own_fit_predictions" ON fit_predictions FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM organizations WHERE organizations.id = fit_predictions.organization_id AND organizations.owner_id = auth.uid())
  );

-- ============================================================
-- FIT FEEDBACK (outcome tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS fit_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fit_prediction_id uuid NOT NULL REFERENCES fit_predictions(id) ON DELETE CASCADE,
  outcome text NOT NULL CHECK (outcome IN ('kept', 'exchanged', 'returned', 'pending')),
  outcome_reason text,
  fit_rating integer CHECK (fit_rating BETWEEN 1 AND 5),
  area_feedback jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE fit_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_fit_feedback" ON fit_feedback;
CREATE POLICY "select_own_fit_feedback" ON fit_feedback FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM fit_predictions
      JOIN organizations ON organizations.id = fit_predictions.organization_id
      WHERE fit_predictions.id = fit_feedback.fit_prediction_id
      AND organizations.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_own_fit_feedback" ON fit_feedback;
CREATE POLICY "insert_own_fit_feedback" ON fit_feedback FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM fit_predictions
      JOIN organizations ON organizations.id = fit_predictions.organization_id
      WHERE fit_predictions.id = fit_feedback.fit_prediction_id
      AND organizations.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "update_own_fit_feedback" ON fit_feedback;
CREATE POLICY "update_own_fit_feedback" ON fit_feedback FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM fit_predictions
      JOIN organizations ON organizations.id = fit_predictions.organization_id
      WHERE fit_predictions.id = fit_feedback.fit_prediction_id
      AND organizations.owner_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM fit_predictions
      JOIN organizations ON organizations.id = fit_predictions.organization_id
      WHERE fit_predictions.id = fit_feedback.fit_prediction_id
      AND organizations.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "delete_own_fit_feedback" ON fit_feedback;
CREATE POLICY "delete_own_fit_feedback" ON fit_feedback FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM fit_predictions
      JOIN organizations ON organizations.id = fit_predictions.organization_id
      WHERE fit_predictions.id = fit_feedback.fit_prediction_id
      AND organizations.owner_id = auth.uid()
    )
  );

-- ============================================================
-- EVENTS (platform-wide event log)
-- ============================================================
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'scan.created', 'scan.processing', 'scan.completed', 'scan.failed',
    'body_twin.created', 'body_twin.updated',
    'product.created', 'product.updated',
    'fit.predicted', 'fit.feedback_received',
    'order.created', 'return.created', 'model.updated'
  )),
  entity_type text,
  entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}',
  model_version text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_events" ON events;
CREATE POLICY "select_own_events" ON events FOR SELECT
  TO authenticated USING (
    organization_id IS NULL OR
    EXISTS (SELECT 1 FROM organizations WHERE organizations.id = events.organization_id AND organizations.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_events" ON events;
CREATE POLICY "insert_own_events" ON events FOR INSERT
  TO authenticated WITH CHECK (
    organization_id IS NULL OR
    EXISTS (SELECT 1 FROM organizations WHERE organizations.id = events.organization_id AND organizations.owner_id = auth.uid())
  );

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_body_twins_org ON body_twins(organization_id);
CREATE INDEX IF NOT EXISTS idx_body_measurements_twin ON body_measurements(body_twin_id);
CREATE INDEX IF NOT EXISTS idx_scans_org ON scans(organization_id);
CREATE INDEX IF NOT EXISTS idx_product_twins_org ON product_twins(organization_id);
CREATE INDEX IF NOT EXISTS idx_product_measurements_twin ON product_measurements(product_twin_id);
CREATE INDEX IF NOT EXISTS idx_materials_product ON materials(product_twin_id);
CREATE INDEX IF NOT EXISTS idx_fit_predictions_org ON fit_predictions(organization_id);
CREATE INDEX IF NOT EXISTS idx_fit_predictions_body ON fit_predictions(body_twin_id);
CREATE INDEX IF NOT EXISTS idx_fit_predictions_product ON fit_predictions(product_twin_id);
CREATE INDEX IF NOT EXISTS idx_fit_feedback_prediction ON fit_feedback(fit_prediction_id);
CREATE INDEX IF NOT EXISTS idx_events_org ON events(organization_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_organizations_owner ON organizations(owner_id);

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_organizations_updated ON organizations;
CREATE TRIGGER trg_organizations_updated BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_body_twins_updated ON body_twins;
CREATE TRIGGER trg_body_twins_updated BEFORE UPDATE ON body_twins
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_product_twins_updated ON product_twins;
CREATE TRIGGER trg_product_twins_updated BEFORE UPDATE ON product_twins
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();