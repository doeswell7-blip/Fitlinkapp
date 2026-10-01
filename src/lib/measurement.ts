import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { BodyMeasurement, MeasurementType } from '@/lib/types';

// MediaPipe Pose landmark indices (33-point model)
const LANDMARKS = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const;

function distance3D(a: NormalizedLandmark, b: NormalizedLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function distance2D(a: NormalizedLandmark, b: NormalizedLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function midpoint(a: NormalizedLandmark, b: NormalizedLandmark): NormalizedLandmark {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z ?? 0) + (b.z ?? 0) / 2,
    visibility: Math.min(a.visibility ?? 0, b.visibility ?? 0),
  };
}

function avgVisibility(landmarks: NormalizedLandmark[]): number {
  const vis = landmarks.filter((l) => l.visibility !== undefined).map((l) => l.visibility ?? 0);
  if (vis.length === 0) return 0;
  return vis.reduce((a, b) => a + b, 0) / vis.length;
}

// Reference body proportions (adult average) for converting normalized distances to cm.
// These are derived from anthropometric databases (NASA/ANSUR II ranges).
// The height is estimated first, then other measurements scale from it.
const PROPORTIONS: Record<MeasurementType, { ratio: number; tolerance: number }> = {
  height: { ratio: 1.0, tolerance: 0.02 },
  chest: { ratio: 0.52, tolerance: 0.04 },
  waist: { ratio: 0.45, tolerance: 0.05 },
  hip: { ratio: 0.53, tolerance: 0.04 },
  shoulder_width: { ratio: 0.25, tolerance: 0.03 },
  neck: { ratio: 0.10, tolerance: 0.03 },
  upper_arm: { ratio: 0.19, tolerance: 0.04 },
  forearm: { ratio: 0.16, tolerance: 0.04 },
  wrist: { ratio: 0.07, tolerance: 0.03 },
  thigh: { ratio: 0.29, tolerance: 0.05 },
  knee: { ratio: 0.12, tolerance: 0.03 },
  calf: { ratio: 0.14, tolerance: 0.04 },
  ankle: { ratio: 0.06, tolerance: 0.03 },
  inseam: { ratio: 0.45, tolerance: 0.04 },
  outseam: { ratio: 0.59, tolerance: 0.04 },
  torso_length: { ratio: 0.30, tolerance: 0.04 },
  sleeve_length: { ratio: 0.36, tolerance: 0.05 },
};

export interface MeasurementResult {
  measurements: BodyMeasurement[];
  overall_confidence: number;
  scan_quality: 'excellent' | 'good' | 'fair' | 'poor';
}

export function extractMeasurements(
  landmarks: NormalizedLandmark[],
  imageWidth: number,
  imageHeight: number,
  userHeightCm?: number,
  sideLandmarks?: NormalizedLandmark[] | null,
): MeasurementResult {
  const lm = landmarks;
  const side = sideLandmarks ?? null;

  // --- Height estimation ---
  // Use the vertical span from nose to ankle (the tallest visible point).
  const nose = lm[LANDMARKS.NOSE];
  const leftAnkle = lm[LANDMARKS.LEFT_ANKLE];
  const rightAnkle = lm[LANDMARKS.RIGHT_ANKLE];

  const ankleVy = Math.min(
    leftAnkle?.y ?? 1,
    rightAnkle?.y ?? 1,
  );
  const noseY = nose?.y ?? 0;

  // Normalized height (0-1 fraction of image height)
  const normalizedHeight = Math.abs(noseY - ankleVy);

  // If user provides their height, use it for calibration. Otherwise estimate
  // from the frame: assume the person occupies ~85% of the frame when properly framed.
  let heightCm: number;
  let heightConfidence: number;

  if (userHeightCm && userHeightCm > 100 && userHeightCm < 250) {
    heightCm = userHeightCm;
    heightConfidence = 0.95;
  } else {
    // Estimate: typical adult height 170cm, with uncertainty based on framing quality
    // The normalized height in the frame tells us about distance/framing
    if (normalizedHeight > 0.5 && normalizedHeight < 0.95) {
      // Good framing — person fills most of the frame
      heightCm = 170;
      heightConfidence = 0.40;
    } else {
      // Poor framing — can't estimate reliably
      heightCm = 170;
      heightConfidence = 0.25;
    }
  }

  // --- Pixel-to-cm calibration ---
  // Convert normalized distances to cm using the height estimate.
  // If the person's normalized height is H_norm and actual height is H_cm,
  // then 1 unit of normalized distance = H_cm / H_norm cm.
  const pxToCm = normalizedHeight > 0 ? heightCm / normalizedHeight : 0;

  // --- Shoulder width ---
  const leftShoulder = lm[LANDMARKS.LEFT_SHOULDER];
  const rightShoulder = lm[LANDMARKS.RIGHT_SHOULDER];
  const shoulderDist2D = leftShoulder && rightShoulder
    ? distance2D(leftShoulder, rightShoulder) * pxToCm
    : PROPORTIONS.shoulder_width.ratio * heightCm;
  const shoulderVis = leftShoulder && rightShoulder
    ? Math.min(leftShoulder.visibility ?? 0, rightShoulder.visibility ?? 0)
    : 0;

  // --- Chest: approximated as shoulder span * chest-to-shoulder ratio ---
  // Chest circumference is ~2.08x shoulder width (from anthropometric data)
  const chestCm = shoulderDist2D * 2.08;
  const chestConfidence = shoulderVis > 0.7 ? 0.65 : 0.35;

  // --- Waist: hip-to-shoulder midpoint area, estimated proportionally ---
  const leftHip = lm[LANDMARKS.LEFT_HIP];
  const rightHip = lm[LANDMARKS.RIGHT_HIP];
  const hipDist2D = leftHip && rightHip
    ? distance2D(leftHip, rightHip) * pxToCm
    : PROPORTIONS.hip.ratio * heightCm;
  const hipVis = leftHip && rightHip
    ? Math.min(leftHip.visibility ?? 0, rightHip.visibility ?? 0)
    : 0;

  // Waist is ~0.87x hip width (circumference ratio)
  const waistCm = hipDist2D * 1.82;
  const waistConfidence = hipVis > 0.7 ? 0.60 : 0.30;

  // Hip circumference from hip width
  const hipCm = hipDist2D * 2.10;
  const hipConfidence = hipVis > 0.7 ? 0.62 : 0.32;

  // --- Torso length: shoulder midpoint to hip midpoint ---
  const shoulderMid: NormalizedLandmark = leftShoulder && rightShoulder
    ? midpoint(leftShoulder, rightShoulder)
    : { x: 0.5, y: 0.3, z: 0, visibility: 0 };
  const hipMid: NormalizedLandmark = leftHip && rightHip
    ? midpoint(leftHip, rightHip)
    : { x: 0.5, y: 0.55, z: 0, visibility: 0 };
  const torsoLen = distance2D(shoulderMid, hipMid) * pxToCm;
  const torsoConfidence = shoulderVis > 0.7 && hipVis > 0.7 ? 0.70 : 0.35;

  // --- Inseam: hip to ankle ---
  const inseamDist = leftHip && leftAnkle
    ? distance2D(leftHip, leftAnkle) * pxToCm
    : PROPORTIONS.inseam.ratio * heightCm;
  const inseamConfidence = (leftHip?.visibility ?? 0) > 0.7 && (leftAnkle?.visibility ?? 0) > 0.7
    ? 0.65
    : 0.30;

  // --- Outseam: shoulder to ankle ---
  const outseamDist = leftShoulder && leftAnkle
    ? distance2D(leftShoulder, leftAnkle) * pxToCm
    : PROPORTIONS.outseam.ratio * heightCm;
  const outseamConfidence = shoulderVis > 0.7 && (leftAnkle?.visibility ?? 0) > 0.7
    ? 0.62
    : 0.28;

  // --- Upper arm: shoulder to elbow ---
  const leftElbow = lm[LANDMARKS.LEFT_ELBOW];
  const upperArmDist = leftShoulder && leftElbow
    ? distance2D(leftShoulder, leftElbow) * pxToCm
    : PROPORTIONS.upper_arm.ratio * heightCm;
  const upperArmConfidence = shoulderVis > 0.7 && (leftElbow?.visibility ?? 0) > 0.7
    ? 0.60
    : 0.28;

  // --- Forearm: elbow to wrist ---
  const leftWrist = lm[LANDMARKS.LEFT_WRIST];
  const forearmDist = leftElbow && leftWrist
    ? distance2D(leftElbow, leftWrist) * pxToCm
    : PROPORTIONS.forearm.ratio * heightCm;
  const forearmConfidence = (leftElbow?.visibility ?? 0) > 0.7 && (leftWrist?.visibility ?? 0) > 0.7
    ? 0.58
    : 0.26;

  // --- Sleeve length: shoulder to wrist ---
  const sleeveDist = leftShoulder && leftWrist
    ? distance2D(leftShoulder, leftWrist) * pxToCm
    : PROPORTIONS.sleeve_length.ratio * heightCm;
  const sleeveConfidence = shoulderVis > 0.7 && (leftWrist?.visibility ?? 0) > 0.7
    ? 0.60
    : 0.28;

  // --- Thigh: hip to knee ---
  const leftKnee = lm[LANDMARKS.LEFT_KNEE];
  const thighDist = leftHip && leftKnee
    ? distance2D(leftHip, leftKnee) * pxToCm
    : PROPORTIONS.thigh.ratio * heightCm;
  const thighConfidence = (leftHip?.visibility ?? 0) > 0.7 && (leftKnee?.visibility ?? 0) > 0.7
    ? 0.58
    : 0.28;

  // --- Calf: knee to ankle ---
  const calfDist = leftKnee && leftAnkle
    ? distance2D(leftKnee, leftAnkle) * pxToCm
    : PROPORTIONS.calf.ratio * heightCm;
  const calfConfidence = (leftKnee?.visibility ?? 0) > 0.7 && (leftAnkle?.visibility ?? 0) > 0.7
    ? 0.56
    : 0.26;

  // --- Neck: estimated from shoulder span ---
  const neckCm = shoulderDist2D * 0.40;
  const neckConfidence = shoulderVis > 0.7 ? 0.40 : 0.20;

  // --- Wrist circumference: estimated from forearm ---
  const wristCm = forearmDist * 0.44;
  const wristConfidence = forearmConfidence > 0.5 ? 0.38 : 0.18;

  // --- Knee circumference ---
  const kneeCm = thighDist * 0.75;
  const kneeConfidence = thighConfidence > 0.5 ? 0.35 : 0.18;

  // --- Ankle circumference ---
  const ankleCm = calfDist * 0.43;
  const ankleConfidence = calfConfidence > 0.5 ? 0.35 : 0.18;

  // --- Build measurement list ---
  const measurements: BodyMeasurement[] = [
    { measurement_type: 'height', value_cm: round(heightCm), uncertainty_cm: heightConfidence > 0.5 ? 1.5 : 5.0, confidence: heightConfidence },
    { measurement_type: 'chest', value_cm: round(chestCm), uncertainty_cm: chestConfidence > 0.5 ? 3.0 : 6.0, confidence: chestConfidence },
    { measurement_type: 'waist', value_cm: round(waistCm), uncertainty_cm: waistConfidence > 0.5 ? 3.5 : 7.0, confidence: waistConfidence },
    { measurement_type: 'hip', value_cm: round(hipCm), uncertainty_cm: hipConfidence > 0.5 ? 3.0 : 6.0, confidence: hipConfidence },
    { measurement_type: 'shoulder_width', value_cm: round(shoulderDist2D), uncertainty_cm: shoulderVis > 0.7 ? 1.5 : 4.0, confidence: shoulderVis > 0.7 ? 0.72 : 0.30 },
    { measurement_type: 'neck', value_cm: round(neckCm), uncertainty_cm: 2.0, confidence: neckConfidence },
    { measurement_type: 'upper_arm', value_cm: round(upperArmDist), uncertainty_cm: upperArmConfidence > 0.5 ? 2.0 : 4.0, confidence: upperArmConfidence },
    { measurement_type: 'forearm', value_cm: round(forearmDist), uncertainty_cm: forearmConfidence > 0.5 ? 2.0 : 4.0, confidence: forearmConfidence },
    { measurement_type: 'wrist', value_cm: round(wristCm), uncertainty_cm: 1.5, confidence: wristConfidence },
    { measurement_type: 'thigh', value_cm: round(thighDist), uncertainty_cm: thighConfidence > 0.5 ? 2.5 : 5.0, confidence: thighConfidence },
    { measurement_type: 'knee', value_cm: round(kneeCm), uncertainty_cm: 2.0, confidence: kneeConfidence },
    { measurement_type: 'calf', value_cm: round(calfDist), uncertainty_cm: calfConfidence > 0.5 ? 2.5 : 5.0, confidence: calfConfidence },
    { measurement_type: 'ankle', value_cm: round(ankleCm), uncertainty_cm: 1.5, confidence: ankleConfidence },
    { measurement_type: 'inseam', value_cm: round(inseamDist), uncertainty_cm: inseamConfidence > 0.5 ? 2.0 : 5.0, confidence: inseamConfidence },
    { measurement_type: 'outseam', value_cm: round(outseamDist), uncertainty_cm: outseamConfidence > 0.5 ? 2.5 : 5.0, confidence: outseamConfidence },
    { measurement_type: 'torso_length', value_cm: round(torsoLen), uncertainty_cm: torsoConfidence > 0.5 ? 2.0 : 4.0, confidence: torsoConfidence },
    { measurement_type: 'sleeve_length', value_cm: round(sleeveDist), uncertainty_cm: sleeveConfidence > 0.5 ? 2.0 : 4.0, confidence: sleeveConfidence },
  ];

  // --- Front/side consistency ---
  // The side capture is used as a second geometric observation. It does not pretend
  // to recover full 3D depth, but it can detect large posture/scale disagreement.
  let sideConsistency = 1;
  if (side && side.length >= 33) {
    const sideNose = side[LANDMARKS.NOSE];
    const sideLeftAnkle = side[LANDMARKS.LEFT_ANKLE];
    const sideRightAnkle = side[LANDMARKS.RIGHT_ANKLE];
    const sideHeight = sideNose && sideLeftAnkle && sideRightAnkle
      ? Math.abs(sideNose.y - Math.min(sideLeftAnkle.y, sideRightAnkle.y))
      : 0;
    if (normalizedHeight > 0 && sideHeight > 0) {
      const ratio = Math.min(normalizedHeight, sideHeight) / Math.max(normalizedHeight, sideHeight);
      sideConsistency = Math.max(0.5, Math.min(1, ratio));
    }
  }

  const confidences = measurements.map((m) => m.confidence * sideConsistency);
  const overallConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;

  // --- Scan quality ---
  let scanQuality: 'excellent' | 'good' | 'fair' | 'poor' = 'poor';
  if (overallConfidence >= 0.65) scanQuality = 'excellent';
  else if (overallConfidence >= 0.50) scanQuality = 'good';
  else if (overallConfidence >= 0.35) scanQuality = 'fair';

  return {
    measurements,
    overall_confidence: round(overallConfidence, 3),
    scan_quality: scanQuality,
  };
}

function round(value: number, decimals = 1): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

// --- Capture validation ---

export interface CaptureValidationResult {
  isValid: boolean;
  issues: string[];
  quality: 'good' | 'fair' | 'poor';
}

export function validateCapture(
  landmarks: NormalizedLandmark[] | null,
  imageWidth: number,
  imageHeight: number,
): CaptureValidationResult {
  const issues: string[] = [];

  if (!landmarks || landmarks.length < 33) {
    return {
      isValid: false,
      issues: ['No person detected or incomplete pose data. Please ensure your full body is visible.'],
      quality: 'poor',
    };
  }

  // Check key landmark visibility
  const keyLandmarks = [
    { name: 'nose', idx: LANDMARKS.NOSE },
    { name: 'left shoulder', idx: LANDMARKS.LEFT_SHOULDER },
    { name: 'right shoulder', idx: LANDMARKS.RIGHT_SHOULDER },
    { name: 'left hip', idx: LANDMARKS.LEFT_HIP },
    { name: 'right hip', idx: LANDMARKS.RIGHT_HIP },
    { name: 'left ankle', idx: LANDMARKS.LEFT_ANKLE },
    { name: 'right ankle', idx: LANDMARKS.RIGHT_ANKLE },
  ];

  const lowVisibilityParts: string[] = [];
  for (const part of keyLandmarks) {
    const lm = landmarks[part.idx];
    if (!lm || (lm.visibility ?? 0) < 0.5) {
      lowVisibilityParts.push(part.name);
    }
  }

  if (lowVisibilityParts.length > 0) {
    issues.push(`Body parts not clearly visible: ${lowVisibilityParts.join(', ')}. Please adjust your position or lighting.`);
  }

  // Check if person is too close (body fills almost entire frame)
  const nose = landmarks[LANDMARKS.NOSE];
  const leftAnkle = landmarks[LANDMARKS.LEFT_ANKLE];
  const rightAnkle = landmarks[LANDMARKS.RIGHT_ANKLE];

  if (nose && leftAnkle && rightAnkle) {
    const bodyTop = nose.y;
    const bodyBottom = Math.max(leftAnkle.y, rightAnkle.y);
    const bodyHeightFraction = bodyBottom - bodyTop;

    if (bodyHeightFraction > 0.95) {
      issues.push('You are too close to the camera. Please step back so your full body fits in the frame.');
    } else if (bodyHeightFraction < 0.40) {
      issues.push('You are too far from the camera. Please step closer so your body fills more of the frame.');
    }

    // Check if body extends outside frame
    if (bodyTop < 0.02 || bodyBottom > 0.98) {
      issues.push('Your body extends outside the frame. Please adjust your position.');
    }

    // Check horizontal centering
    const leftShoulder = landmarks[LANDMARKS.LEFT_SHOULDER];
    const rightShoulder = landmarks[LANDMARKS.RIGHT_SHOULDER];
    if (leftShoulder && rightShoulder) {
      const leftEdge = Math.min(leftShoulder.x, rightShoulder.x);
      const rightEdge = Math.max(leftShoulder.x, rightShoulder.x);
      if (leftEdge < 0.05) {
        issues.push('Your body is too far left. Please center yourself.');
      }
      if (rightEdge > 0.95) {
        issues.push('Your body is too far right. Please center yourself.');
      }
    }
  }

  // Check for multiple people (rough heuristic: if non-adjacent landmarks are very far apart)
  const leftWrist = landmarks[LANDMARKS.LEFT_WRIST];
  const rightWrist = landmarks[LANDMARKS.RIGHT_WRIST];
  if (leftWrist && rightWrist && nose) {
    const wristDist = distance2D(leftWrist, rightWrist);
    const shoulderDist = distance2D(landmarks[LANDMARKS.LEFT_SHOULDER], landmarks[LANDMARKS.RIGHT_SHOULDER]);
    if (wristDist > shoulderDist * 4 && wristDist > 0.6) {
      // Arms might be spread very wide, or there might be two people
      // This is a soft warning
      issues.push('Warning: Unusual body proportions detected. Please ensure only one person is in frame.');
    }
  }

  // Check pose (should be standing upright for front capture)
  if (nose && leftAnkle && rightAnkle) {
    const ankleMidY = (leftAnkle.y + rightAnkle.y) / 2;
    if (nose.y > ankleMidY) {
      issues.push('Unusual pose detected. Please stand upright facing the camera.');
    }
  }

  const isValid = issues.length === 0;
  const quality: 'good' | 'fair' | 'poor' = issues.length === 0 ? 'good' : issues.length <= 2 ? 'fair' : 'poor';

  return { isValid, issues, quality };
}

// --- Lighting check ---
export interface LightingCheckResult {
  isGood: boolean;
  brightness: number;
  message: string;
}

export function checkLighting(imageData: ImageData): LightingCheckResult {
  const data = imageData.data;
  let totalBrightness = 0;
  const pixelCount = data.length / 4;

  // Sample every 4th pixel for performance
  for (let i = 0; i < data.length; i += 16) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Perceptual brightness (ITU-R BT.601)
    totalBrightness += 0.299 * r + 0.587 * g + 0.114 * b;
  }

  const sampledPixels = Math.ceil(pixelCount / 4);
  const avgBrightness = totalBrightness / sampledPixels;

  if (avgBrightness < 40) {
    return { isGood: false, brightness: avgBrightness, message: 'Too dark. Please move to a brighter location.' };
  }
  if (avgBrightness > 220) {
    return { isGood: false, brightness: avgBrightness, message: 'Too bright / overexposed. Please reduce lighting or move away from direct light.' };
  }
  return { isGood: true, brightness: avgBrightness, message: 'Lighting looks good.' };
}
