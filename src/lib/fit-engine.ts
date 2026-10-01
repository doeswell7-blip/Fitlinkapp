import type {
  BodyMeasurement,
  ProductMeasurement,
  FitPredictionResult,
  FitAreaResult,
  FitArea,
  FitType,
} from '@/lib/types';

const FIT_MODEL_VERSION = 'fit-geometric-v1';

export function getFitModelVersion(): string {
  return FIT_MODEL_VERSION;
}

// --- Area mapping: which body measurements compare to which product measurements ---
const AREA_MAP: Record<FitArea, { body: string; product: string }> = {
  chest: { body: 'chest', product: 'chest' },
  waist: { body: 'waist', product: 'waist' },
  hip: { body: 'hip', product: 'hip' },
  shoulder: { body: 'shoulder_width', product: 'shoulder' },
  length: { body: 'torso_length', product: 'length' },
  sleeve: { body: 'sleeve_length', product: 'sleeve' },
  neck: { body: 'neck', product: 'neck' },
};

// Ease allowance by fit type (cm added to body measurement to get the "ideal" garment measurement)
// A "slim" fit needs less ease, "oversized" needs more.
const EASE_BY_FIT_TYPE: Record<FitType, number> = {
  slim: 4,
  regular: 8,
  relaxed: 12,
  oversized: 18,
  custom: 8,
};

// Tolerance bands (cm) for how much deviation from ideal is acceptable
const TOLERANCE = {
  good: 2.5,
  slightly: 5.0,
};

function classifyFit(
  bodyValue: number,
  productValue: number,
  ease: number,
  toleranceCm: number,
): FitAreaResult {
  // The "ideal" garment measurement = body + ease
  const ideal = bodyValue + ease;
  const diff = productValue - ideal;

  // Adjust tolerance by manufacturing tolerance
  const effectiveTolerance = toleranceCm + TOLERANCE.good;

  if (diff < -(effectiveTolerance + TOLERANCE.slightly)) return 'too_tight';
  if (diff < -effectiveTolerance) return 'slightly_tight';
  if (diff > effectiveTolerance + TOLERANCE.slightly) return 'too_loose';
  if (diff > effectiveTolerance) return 'slightly_loose';
  return 'good';
}

export interface FitInput {
  bodyMeasurements: BodyMeasurement[];
  productMeasurements: ProductMeasurement[];
  productFitType: FitType;
  manufacturingToleranceCm: number;
  fitPreference: 'tight' | 'regular' | 'loose';
  size: string;
}

export function predictFit(input: FitInput): FitPredictionResult {
  const ease = EASE_BY_FIT_TYPE[input.productFitType] ?? EASE_BY_FIT_TYPE.regular;

  // Adjust ease by preference
  let adjustedEase = ease;
  if (input.fitPreference === 'tight') adjustedEase -= 2;
  if (input.fitPreference === 'loose') adjustedEase += 4;

  const areaResults: Record<string, FitAreaResult> = {};
  const explanation: string[] = [];
  const warnings: string[] = [];

  // Build lookup maps
  const bodyMap = new Map(input.bodyMeasurements.map((m) => [m.measurement_type, m]));
  const productMap = new Map(input.productMeasurements.map((m) => [m.measurement_type, m]));

  let areasChecked = 0;
  let areasGood = 0;
  let confidenceSum = 0;

  for (const area of Object.keys(AREA_MAP) as FitArea[]) {
    const { body: bodyKey, product: productKey } = AREA_MAP[area];
    const bodyM = bodyMap.get(bodyKey as any);
    const productM = productMap.get(productKey as any);

    if (!bodyM || !productM) continue;

    const result = classifyFit(
      bodyM.value_cm,
      productM.value_cm,
      adjustedEase,
      input.manufacturingToleranceCm,
    );

    areaResults[area] = result;
    areasChecked++;

    if (result === 'good') areasGood++;

    // Confidence contribution from body measurement confidence
    confidenceSum += bodyM.confidence;

    // Build explanation
    const diff = productM.value_cm - (bodyM.value_cm + adjustedEase);
    const direction = diff > 0 ? 'loose' : 'tight';
    const absDiff = Math.abs(diff).toFixed(1);

    if (result === 'good') {
      explanation.push(`${area.charAt(0).toUpperCase() + area.slice(1)}: good fit (${absDiff}cm ${direction} relative to ideal).`);
    } else if (result === 'slightly_tight') {
      explanation.push(`${area.charAt(0).toUpperCase() + area.slice(1)}: slightly tight (${absDiff}cm smaller than ideal).`);
    } else if (result === 'slightly_loose') {
      explanation.push(`${area.charAt(0).toUpperCase() + area.slice(1)}: slightly loose (${absDiff}cm larger than ideal).`);
    } else if (result === 'too_tight') {
      explanation.push(`${area.charAt(0).toUpperCase() + area.slice(1)}: too tight (${absDiff}cm smaller than ideal).`);
      warnings.push(`The ${area} area is significantly tighter than ideal for size ${input.size}.`);
    } else if (result === 'too_loose') {
      explanation.push(`${area.charAt(0).toUpperCase() + area.slice(1)}: too loose (${absDiff}cm larger than ideal).`);
      warnings.push(`The ${area} area is significantly looser than ideal for size ${input.size}.`);
    }
  }

  // Overall confidence: based on how many areas are "good" and body measurement confidence
  const areaScore = areasChecked > 0 ? areasGood / areasChecked : 0;
  const bodyConfidenceScore = areasChecked > 0 ? confidenceSum / areasChecked : 0;
  const confidence = Math.round((areaScore * 0.6 + bodyConfidenceScore * 0.4) * 1000) / 1000;

  // Determine if this size is recommended
  const problemCount = Object.values(areaResults).filter(
    (r) => r === 'too_tight' || r === 'too_loose',
  ).length;

  const isRecommended = problemCount === 0;
  const recommendedSize = isRecommended ? input.size : null;

  if (!isRecommended) {
    explanation.unshift(`Size ${input.size} has ${problemCount} problem area(s). Consider trying a different size.`);
  } else {
    explanation.unshift(`Size ${input.size} provides a good fit across all measured areas.`);
  }

  return {
    recommended_size: recommendedSize,
    confidence,
    area_results: areaResults,
    explanation,
    warnings,
  };
}

// --- Compare multiple sizes and recommend the best ---
export interface SizeComparison {
  size: string;
  result: FitPredictionResult;
}

export function compareSizes(
  bodyMeasurements: BodyMeasurement[],
  sizes: { size: string; productMeasurements: ProductMeasurement[]; fitType: FitType; manufacturingToleranceCm: number }[],
  fitPreference: 'tight' | 'regular' | 'loose',
): SizeComparison[] {
  const results = sizes.map((s) => ({
    size: s.size,
    result: predictFit({
      bodyMeasurements,
      productMeasurements: s.productMeasurements,
      productFitType: s.fitType,
      manufacturingToleranceCm: s.manufacturingToleranceCm,
      fitPreference,
      size: s.size,
    }),
  }));

  // Sort by confidence descending, then by number of "good" areas
  results.sort((a, b) => {
    if (b.result.confidence !== a.result.confidence) {
      return b.result.confidence - a.result.confidence;
    }
    const aGood = Object.values(a.result.area_results).filter((r) => r === 'good').length;
    const bGood = Object.values(b.result.area_results).filter((r) => r === 'good').length;
    return bGood - aGood;
  });

  return results;
}
