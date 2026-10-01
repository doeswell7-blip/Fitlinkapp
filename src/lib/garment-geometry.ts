import * as THREE from 'three';
import type { BodyMeasurement, ProductMeasurement, FitAreaResult } from '@/lib/types';

export interface BodyDimensions {
  heightCm: number;
  shoulderWidth: number;
  chestRadius: number;
  waistRadius: number;
  hipRadius: number;
  neckRadius: number;
  upperArmRadius: number;
  thighRadius: number;
  calfRadius: number;
  torsoLength: number;
  inseamLength: number;
  calfLength: number;
  upperArmLength: number;
  forearmLength: number;
}

export function extractBodyDimensions(
  measurements: { measurement_type: string; value_cm: number }[],
  heightCm: number | null,
): BodyDimensions {
  const m = new Map(measurements.map((x) => [x.measurement_type, x.value_cm]));
  const h = heightCm ?? 170;
  return {
    heightCm: h,
    shoulderWidth: (m.get('shoulder_width') ?? h * 0.25) / 2,
    chestRadius: (m.get('chest') ?? h * 0.52) / (2 * Math.PI),
    waistRadius: (m.get('waist') ?? h * 0.45) / (2 * Math.PI),
    hipRadius: (m.get('hip') ?? h * 0.53) / (2 * Math.PI),
    neckRadius: (m.get('neck') ?? h * 0.10) / (2 * Math.PI),
    upperArmRadius: (m.get('upper_arm') ?? h * 0.19) / (2 * Math.PI),
    thighRadius: (m.get('thigh') ?? h * 0.29) / (2 * Math.PI),
    calfRadius: (m.get('calf') ?? h * 0.14) / (2 * Math.PI),
    torsoLength: m.get('torso_length') ?? h * 0.30,
    inseamLength: m.get('inseam') ?? h * 0.45,
    calfLength: m.get('calf') ?? h * 0.14,
    upperArmLength: m.get('upper_arm') ?? h * 0.19,
    forearmLength: m.get('forearm') ?? h * 0.16,
  };
}

export interface GarmentDimensions {
  chestRadius: number;
  waistRadius: number;
  hipRadius: number;
  shoulderWidth: number;
  length: number;
  sleeveLength: number;
  neckRadius: number;
  hemRadius: number;
}

export function extractGarmentDimensions(
  measurements: ProductMeasurement[],
): GarmentDimensions {
  const m = new Map(measurements.map((x) => [x.measurement_type, x.value_cm]));
  const chest = m.get('chest') ?? 100;
  const waist = m.get('waist') ?? chest * 0.9;
  const hip = m.get('hip') ?? chest * 1.05;
  return {
    chestRadius: chest / (2 * Math.PI),
    waistRadius: waist / (2 * Math.PI),
    hipRadius: hip / (2 * Math.PI),
    shoulderWidth: (m.get('shoulder') ?? chest * 0.42) / 2,
    length: m.get('length') ?? 70,
    sleeveLength: m.get('sleeve') ?? 20,
    neckRadius: (m.get('neck') ?? 40) / (2 * Math.PI),
    hemRadius: (m.get('hem') ?? chest) / (2 * Math.PI),
  };
}

export type FitZoneStatus = 'good' | 'tight' | 'loose';

export function areaResultToZone(result: FitAreaResult): FitZoneStatus {
  if (result === 'good') return 'good';
  if (result === 'too_tight' || result === 'slightly_tight') return 'tight';
  return 'loose';
}

export const FIT_ZONE_COLORS: Record<FitZoneStatus, number> = {
  good: 0x22c55e,
  tight: 0xef4444,
  loose: 0x3b82f6,
};
