import { supabase } from '@/lib/supabase';
import type {
  BodyMeasurement,
  BodyTwin,
  EventRecord,
  FitPredictionResult,
  ProductMeasurement,
  ProductTwin,
  ScanRecord,
  ScanMethod,
} from '@/lib/types';
import { getScanModelVersion } from '@/lib/scanner';
import { getFitModelVersion } from '@/lib/fit-engine';

export async function ensureOrganization(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Check if user already has an organization
  const { data: existingOrg, error: orgError } = await supabase
    .from('organizations')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (orgError) throw orgError;
  if (existingOrg) return existingOrg.id;

  // Create a personal organization
  const { data: newOrg, error: createError } = await supabase
    .from('organizations')
    .insert({ name: `${user.email ?? 'My'} Organization`, type: 'personal', owner_id: user.id })
    .select('id')
    .single();

  if (createError) throw createError;
  return newOrg.id;
}

export async function createScanRecord(
  organizationId: string,
  scanMethod: ScanMethod,
  deviceInfo: Record<string, string>,
): Promise<string> {
  const { data, error } = await supabase
    .from('scans')
    .insert({
      organization_id: organizationId,
      status: 'capturing',
      scan_method: scanMethod,
      device_info: deviceInfo,
      capture_metadata: {},
      poses_captured: [],
      image_references: [],
      error_message: null,
      model_version: getScanModelVersion(),
    })
    .select('id')
    .single();

  if (error) throw error;

  await logEvent({
    organization_id: organizationId,
    event_type: 'scan.created',
    entity_type: 'scan',
    entity_id: data.id,
    payload: { scan_method: scanMethod },
    model_version: getScanModelVersion(),
  });

  return data.id;
}

export async function updateScanStatus(
  scanId: string,
  status: 'capturing' | 'processing' | 'completed' | 'failed',
  extra?: { poses_captured?: string[]; error_message?: string; body_twin_id?: string },
): Promise<void> {
  const update: Record<string, unknown> = { status };
  if (extra?.poses_captured) update.poses_captured = extra.poses_captured;
  if (extra?.error_message) update.error_message = extra.error_message;
  if (extra?.body_twin_id) update.body_twin_id = extra.body_twin_id;
  if (status === 'completed') update.completed_at = new Date().toISOString();

  const { error } = await supabase.from('scans').update(update).eq('id', scanId);
  if (error) throw error;
}

export async function createBodyTwin(
  organizationId: string,
  scanId: string,
  measurements: BodyMeasurement[],
  overallConfidence: number,
  scanQuality: string,
  heightCm: number | null,
  shapeParameters: Record<string, number>,
  poseParameters: Record<string, number>,
): Promise<string> {
  const { data: bodyTwin, error } = await supabase
    .from('body_twins')
    .insert({
      organization_id: organizationId,
      height_cm: heightCm,
      shape_parameters: shapeParameters,
      pose_parameters: poseParameters,
      overall_confidence: overallConfidence,
      scan_quality: scanQuality,
      model_version: getScanModelVersion(),
      metadata: {},
    })
    .select('id')
    .single();

  if (error) throw error;

  // Insert measurements
  const measurementRows = measurements.map((m) => ({
    body_twin_id: bodyTwin.id,
    measurement_type: m.measurement_type,
    value_cm: m.value_cm,
    uncertainty_cm: m.uncertainty_cm,
    confidence: m.confidence,
  }));

  const { error: mError } = await supabase.from('body_measurements').insert(measurementRows);
  if (mError) throw mError;

  // Link scan to body twin
  await updateScanStatus(scanId, 'completed', { body_twin_id: bodyTwin.id });

  await logEvent({
    organization_id: organizationId,
    event_type: 'body_twin.created',
    entity_type: 'body_twin',
    entity_id: bodyTwin.id,
    payload: { scan_id: scanId, measurement_count: measurements.length, overall_confidence: overallConfidence },
    model_version: getScanModelVersion(),
  });

  return bodyTwin.id;
}

export async function getBodyTwins(organizationId: string): Promise<BodyTwin[]> {
  const { data, error } = await supabase
    .from('body_twins')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getBodyMeasurements(bodyTwinId: string): Promise<BodyMeasurement[]> {
  const { data, error } = await supabase
    .from('body_measurements')
    .select('measurement_type, value_cm, uncertainty_cm, confidence')
    .eq('body_twin_id', bodyTwinId);

  if (error) throw error;
  return data ?? [];
}

export async function createProductTwin(
  organizationId: string,
  product: {
    product_name: string;
    sku?: string;
    size: string;
    category?: string;
    garment_type?: string;
    fit_type?: string;
    manufacturing_tolerance_cm?: number;
  },
  measurements: ProductMeasurement[],
): Promise<string> {
  const { data: productTwin, error } = await supabase
    .from('product_twins')
    .insert({
      organization_id: organizationId,
      product_name: product.product_name,
      sku: product.sku ?? null,
      variant: null,
      size: product.size,
      category: product.category ?? 'clothing',
      garment_type: product.garment_type ?? null,
      fit_type: product.fit_type ?? 'regular',
      manufacturing_tolerance_cm: product.manufacturing_tolerance_cm ?? 1.0,
      metadata: {},
    })
    .select('id')
    .single();

  if (error) throw error;

  const measurementRows = measurements.map((m) => ({
    product_twin_id: productTwin.id,
    measurement_type: m.measurement_type,
    value_cm: m.value_cm,
  }));

  const { error: mError } = await supabase.from('product_measurements').insert(measurementRows);
  if (mError) throw mError;

  await logEvent({
    organization_id: organizationId,
    event_type: 'product.created',
    entity_type: 'product_twin',
    entity_id: productTwin.id,
    payload: { product_name: product.product_name, size: product.size },
    model_version: null,
  });

  return productTwin.id;
}

export async function getProductTwins(organizationId: string): Promise<ProductTwin[]> {
  const { data, error } = await supabase
    .from('product_twins')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getProductMeasurements(productTwinId: string): Promise<ProductMeasurement[]> {
  const { data, error } = await supabase
    .from('product_measurements')
    .select('measurement_type, value_cm')
    .eq('product_twin_id', productTwinId);

  if (error) throw error;
  return (data ?? []).map((d) => ({
    product_twin_id: productTwinId,
    measurement_type: d.measurement_type as ProductMeasurement['measurement_type'],
    value_cm: d.value_cm as number,
  }));
}

export async function saveFitPrediction(
  organizationId: string,
  bodyTwinId: string,
  productTwinId: string,
  result: FitPredictionResult,
  fitPreference: 'tight' | 'regular' | 'loose',
  bodyPose: 'standing' | 'walking' | 'sitting' | 'bending' | 'arms_raised' | 'squatting',
): Promise<string> {
  const { data, error } = await supabase
    .from('fit_predictions')
    .insert({
      organization_id: organizationId,
      body_twin_id: bodyTwinId,
      product_twin_id: productTwinId,
      recommended_size: result.recommended_size,
      confidence: result.confidence,
      area_results: result.area_results,
      explanation: result.explanation,
      warnings: result.warnings,
      fit_preference: fitPreference,
      body_pose: bodyPose,
      model_version: getFitModelVersion(),
    })
    .select('id')
    .single();

  if (error) throw error;

  await logEvent({
    organization_id: organizationId,
    event_type: 'fit.predicted',
    entity_type: 'fit_prediction',
    entity_id: data.id,
    payload: {
      body_twin_id: bodyTwinId,
      product_twin_id: productTwinId,
      recommended_size: result.recommended_size,
      confidence: result.confidence,
    },
    model_version: getFitModelVersion(),
  });

  return data.id;
}

export async function saveFitFeedback(
  fitPredictionId: string,
  outcome: 'kept' | 'exchanged' | 'returned' | 'pending',
  outcomeReason?: string,
  fitRating?: number,
): Promise<void> {
  const { error } = await supabase.from('fit_feedback').insert({
    fit_prediction_id: fitPredictionId,
    outcome,
    outcome_reason: outcomeReason ?? null,
    fit_rating: fitRating ?? null,
    area_feedback: {},
  });

  if (error) throw error;
}

export async function logEvent(event: EventRecord): Promise<void> {
  await supabase.from('events').insert({
    organization_id: event.organization_id,
    event_type: event.event_type,
    entity_type: event.entity_type,
    entity_id: event.entity_id,
    payload: event.payload,
    model_version: event.model_version,
  });
}

export async function getEvents(organizationId: string, limit = 50): Promise<unknown[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}
