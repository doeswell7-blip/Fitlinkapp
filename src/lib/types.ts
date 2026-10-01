export type MeasurementType =
  | 'height'
  | 'chest'
  | 'waist'
  | 'hip'
  | 'shoulder_width'
  | 'neck'
  | 'upper_arm'
  | 'forearm'
  | 'wrist'
  | 'thigh'
  | 'knee'
  | 'calf'
  | 'ankle'
  | 'inseam'
  | 'outseam'
  | 'torso_length'
  | 'sleeve_length';

export interface BodyMeasurement {
  measurement_type: MeasurementType;
  value_cm: number;
  uncertainty_cm: number;
  confidence: number;
}

export interface BodyTwin {
  id: string;
  organization_id: string;
  height_cm: number | null;
  shape_parameters: Record<string, number>;
  pose_parameters: Record<string, number>;
  mesh_reference: string | null;
  overall_confidence: number;
  scan_quality: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';
  model_version: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type ProductCategory =
  | 'clothing'
  | 'shoes'
  | 'uniforms'
  | 'sportswear'
  | 'protective_equipment'
  | 'wearables'
  | 'made_to_measure'
  | 'other';

export type FitType = 'slim' | 'regular' | 'relaxed' | 'oversized' | 'custom';

export interface ProductTwin {
  id: string;
  organization_id: string;
  product_name: string;
  sku: string | null;
  variant: string | null;
  size: string;
  category: ProductCategory;
  garment_type: string | null;
  fit_type: FitType;
  manufacturing_tolerance_cm: number;
  geometry_reference: string | null;
  geometry_format: 'glb' | 'gltf' | 'obj' | 'fbx' | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type ProductMeasurementType =
  | 'chest'
  | 'length'
  | 'shoulder'
  | 'sleeve'
  | 'waist'
  | 'hip'
  | 'neck'
  | 'hem'
  | 'cuff'
  | 'armpit'
  | 'back_length'
  | 'foot_length'
  | 'foot_width'
  | 'heel_width'
  | 'insole_length'
  | 'insole_width';

export interface ProductMeasurement {
  product_twin_id: string;
  measurement_type: ProductMeasurementType;
  value_cm: number;
}

export interface Material {
  product_twin_id: string;
  fabric_name: string | null;
  elasticity: number;
  stretch_percentage: number;
  thickness_mm: number;
  bending_stiffness: number;
  compression: number;
  friction: number;
  drape: number;
  recovery: number;
  density_gsm: number | null;
}

export type FitArea = 'chest' | 'waist' | 'hip' | 'shoulder' | 'length' | 'sleeve' | 'neck';
export type FitAreaResult = 'too_tight' | 'slightly_tight' | 'good' | 'slightly_loose' | 'too_loose';

export interface FitPredictionResult {
  recommended_size: string | null;
  confidence: number;
  area_results: Record<string, FitAreaResult>;
  explanation: string[];
  warnings: string[];
}

export type ScanStatus = 'pending' | 'capturing' | 'processing' | 'completed' | 'failed';
export type ScanMethod = 'rgb_camera' | 'arcore_depth' | 'arkit_depth' | 'lidar' | 'professional';

export interface ScanRecord {
  id?: string;
  organization_id: string;
  body_twin_id: string | null;
  status: ScanStatus;
  scan_method: ScanMethod;
  device_info: Record<string, string>;
  capture_metadata: Record<string, unknown>;
  poses_captured: string[];
  image_references: string[];
  error_message: string | null;
  model_version: string;
}

export type EventType =
  | 'scan.created'
  | 'scan.processing'
  | 'scan.completed'
  | 'scan.failed'
  | 'body_twin.created'
  | 'body_twin.updated'
  | 'product.created'
  | 'product.updated'
  | 'fit.predicted'
  | 'fit.feedback_received'
  | 'order.created'
  | 'return.created'
  | 'model.updated';

export interface EventRecord {
  organization_id: string;
  event_type: EventType;
  entity_type: string | null;
  entity_id: string | null;
  payload: Record<string, unknown>;
  model_version: string | null;
}


export interface FitPredictionRecord {
  id: string;
  organization_id: string;
  body_twin_id: string;
  product_twin_id: string;
  recommended_size: string | null;
  confidence: number;
  area_results: Record<string, FitAreaResult>;
  explanation: string[];
  warnings: string[];
  fit_preference: 'tight' | 'regular' | 'loose';
  body_pose: string;
  model_version: string;
  created_at: string;
}

export interface FitFeedbackRecord {
  id: string;
  fit_prediction_id: string;
  outcome: 'kept' | 'exchanged' | 'returned' | 'pending';
  outcome_reason: string | null;
  fit_rating: number | null;
  area_feedback: Record<string, unknown>;
  created_at: string;
}
