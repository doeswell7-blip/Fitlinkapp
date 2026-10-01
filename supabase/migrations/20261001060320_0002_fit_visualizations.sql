/*
# Fit Visualizations Table

## Purpose
Stores visual fit simulation results — the 3D rendering of how a specific
product (at a specific size and color) fits on a specific Body Twin. Each
row records the input parameters (body twin, product twin, size, color,
view, pose), the processing status, the fit prediction it was based on,
and metadata about the renderer and model versions used.

## New Tables
1. **fit_visualizations** — One row per visualization request. Tracks:
   - organization_id (tenant isolation)
   - body_twin_id + product_twin_id (what was compared)
   - size, color, pose, view (render parameters)
   - status (queued → preparing → simulating → rendering → completed/failed)
   - fit_prediction_id (link to the Fit Engine result)
   - input_hash (deterministic cache key for deduplication)
   - renderer + renderer_version + model_version (reproducibility)
   - output_metadata (JSONB: render quality, dimensions, asset references)
   - error_code + error_message (structured failure tracking)
   - created_at, completed_at, expires_at (lifecycle management)

## Security
- RLS enabled, organization-scoped CRUD (same pattern as all other tables).
- Users can only access visualizations within their own organization.
- No service-role keys exposed to clients.

## Notes
- input_hash enables caching: if the same body+product+size+color+pose+view
  combination is requested again, the existing visualization is returned
  instead of re-rendering.
- expires_at supports retention policies for generated visual content.
- The table is designed to work with both client-side WebGL rendering
  (current implementation) and future server-side GPU rendering pipelines.
*/

CREATE TABLE IF NOT EXISTS fit_visualizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  body_twin_id uuid NOT NULL REFERENCES body_twins(id) ON DELETE CASCADE,
  product_twin_id uuid NOT NULL REFERENCES product_twins(id) ON DELETE CASCADE,
  fit_prediction_id uuid REFERENCES fit_predictions(id) ON DELETE SET NULL,
  size text NOT NULL,
  color text NOT NULL DEFAULT 'default',
  pose text NOT NULL DEFAULT 'standing' CHECK (pose IN (
    'standing', 'walking', 'sitting', 'bending', 'arms_raised', 'squatting'
  )),
  view text NOT NULL DEFAULT 'front' CHECK (view IN (
    'front', 'side', 'back', 'three_d'
  )),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'preparing', 'simulating', 'rendering', 'completed', 'failed', 'expired'
  )),
  renderer text NOT NULL DEFAULT 'webgl-parametric-v1',
  renderer_version text NOT NULL DEFAULT '1.0.0',
  model_version text NOT NULL DEFAULT 'fit-geometric-v1',
  input_hash text NOT NULL,
  output_metadata jsonb NOT NULL DEFAULT '{}',
  error_code text,
  error_message text,
  confidence numeric(4,3),
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  expires_at timestamptz
);

ALTER TABLE fit_visualizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_fit_visualizations" ON fit_visualizations;
CREATE POLICY "select_own_fit_visualizations" ON fit_visualizations FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM organizations WHERE organizations.id = fit_visualizations.organization_id AND organizations.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_fit_visualizations" ON fit_visualizations;
CREATE POLICY "insert_own_fit_visualizations" ON fit_visualizations FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM organizations WHERE organizations.id = fit_visualizations.organization_id AND organizations.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_fit_visualizations" ON fit_visualizations;
CREATE POLICY "update_own_fit_visualizations" ON fit_visualizations FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM organizations WHERE organizations.id = fit_visualizations.organization_id AND organizations.owner_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM organizations WHERE organizations.id = fit_visualizations.organization_id AND organizations.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_own_fit_visualizations" ON fit_visualizations;
CREATE POLICY "delete_own_fit_visualizations" ON fit_visualizations FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM organizations WHERE organizations.id = fit_visualizations.organization_id AND organizations.owner_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_fit_visualizations_org ON fit_visualizations(organization_id);
CREATE INDEX IF NOT EXISTS idx_fit_visualizations_body ON fit_visualizations(body_twin_id);
CREATE INDEX IF NOT EXISTS idx_fit_visualizations_product ON fit_visualizations(product_twin_id);
CREATE INDEX IF NOT EXISTS idx_fit_visualizations_hash ON fit_visualizations(input_hash);
CREATE INDEX IF NOT EXISTS idx_fit_visualizations_status ON fit_visualizations(status);

-- Add event type for visualization lifecycle
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_event_type_check;
DO $$ BEGIN
  ALTER TABLE events ADD CONSTRAINT events_event_type_check CHECK (event_type IN (
    'scan.created', 'scan.processing', 'scan.completed', 'scan.failed',
    'body_twin.created', 'body_twin.updated',
    'product.created', 'product.updated',
    'fit.predicted', 'fit.feedback_received',
    'fit.visualization_created', 'fit.visualization_completed', 'fit.visualization_failed',
    'order.created', 'return.created', 'model.updated'
  ));
EXCEPTION WHEN duplicate_object THEN null;
END $$;
