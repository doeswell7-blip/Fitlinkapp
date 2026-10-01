import { useState, useEffect } from 'react';
import { getBodyTwins, getBodyMeasurements } from '@/lib/data';
import { BodyVisualization } from '@/components/BodyVisualization';
import { Card, Badge, Button, EmptyState } from '@/components/ui';
import type { BodyTwin, BodyMeasurement } from '@/lib/types';

interface BodyTwinViewProps {
  orgId: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const MEASUREMENT_LABELS: Record<string, string> = {
  height: 'Height',
  chest: 'Chest',
  waist: 'Waist',
  hip: 'Hip',
  shoulder_width: 'Shoulder Width',
  neck: 'Neck',
  upper_arm: 'Upper Arm',
  forearm: 'Forearm',
  wrist: 'Wrist',
  thigh: 'Thigh',
  knee: 'Knee',
  calf: 'Calf',
  ankle: 'Ankle',
  inseam: 'Inseam',
  outseam: 'Outseam',
  torso_length: 'Torso Length',
  sleeve_length: 'Sleeve Length',
};

const QUALITY_VARIANT: Record<string, 'success' | 'accent' | 'warning' | 'error' | 'neutral'> = {
  excellent: 'success',
  good: 'accent',
  fair: 'warning',
  poor: 'error',
  unknown: 'neutral',
};

const CONFIDENCE_LABELS: { threshold: number; label: string }[] = [
  { threshold: 0.65, label: 'High confidence' },
  { threshold: 0.45, label: 'Medium confidence' },
  { threshold: 0, label: 'Low confidence' },
];

function getConfidenceLabel(conf: number): string {
  return CONFIDENCE_LABELS.find((c) => conf >= c.threshold)?.label ?? 'Low confidence';
}

export default function BodyTwinView({ orgId, selectedId, onSelect }: BodyTwinViewProps) {
  const [bodyTwins, setBodyTwins] = useState<BodyTwin[]>([]);
  const [measurements, setMeasurements] = useState<BodyMeasurement[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(selectedId);

  useEffect(() => {
    loadBodyTwins();
  }, [orgId]);

  useEffect(() => {
    if (activeId) loadMeasurements(activeId);
  }, [activeId]);

  const loadBodyTwins = async () => {
    setLoading(true);
    try {
      const twins = await getBodyTwins(orgId);
      setBodyTwins(twins);
      if (twins.length > 0 && !activeId) setActiveId(twins[0].id);
    } catch (err) {
      console.error('Failed to load body twins:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMeasurements = async (id: string) => {
    try {
      const ms = await getBodyMeasurements(id);
      setMeasurements(ms);
    } catch (err) {
      console.error('Failed to load measurements:', err);
    }
  };

  const activeTwin = bodyTwins.find((t) => t.id === activeId);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-app border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (bodyTwins.length === 0) {
    return (
      <div>
        <h2 className="text-xl font-semibold text-primary mb-1">Body Profile</h2>
        <p className="text-secondary text-sm mb-6">Your saved digital body representations</p>
        <Card>
          <EmptyState
            icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-4 4 4 4 0 0 1-4-4V6a4 4 0 0 1 4-4zM6 22v-2a6 6 0 0 1 12 0v2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            title="No Body Profile yet"
            description="Create one by running a body scan with your phone camera. It takes about 2 minutes."
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-primary mb-1">Body Profile</h2>
        <p className="text-secondary text-sm">Your saved digital body representations</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* List */}
        <div className="space-y-2">
          {bodyTwins.map((twin) => (
            <button
              key={twin.id}
              onClick={() => { setActiveId(twin.id); onSelect(twin.id); }}
              className={`w-full text-left p-4 rounded-xl border transition-all ${
                activeId === twin.id
                  ? 'bg-accent-subtle border-accent/30'
                  : 'surface hover:border-app'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-primary text-sm font-medium">
                  {twin.height_cm ? `${twin.height_cm}cm` : 'Unknown height'}
                </span>
                <Badge variant={QUALITY_VARIANT[twin.scan_quality] ?? 'neutral'}>
                  {twin.scan_quality}
                </Badge>
              </div>
              <div className="text-tertiary text-xs">
                {new Date(twin.created_at).toLocaleDateString()} · {Math.round(twin.overall_confidence * 100)}% confidence
              </div>
            </button>
          ))}
        </div>

        {/* Detail */}
        <div className="lg:col-span-2 space-y-4">
          {activeTwin && (
            <>
              {/* 3D Visualization */}
              <Card padding="none" className="overflow-hidden">
                <div className="px-5 py-3 border-b border-app">
                  <h3 className="text-primary text-sm font-medium">3D Body Model</h3>
                  <p className="text-tertiary text-xs">Built from your actual measurements</p>
                </div>
                <div className="h-[400px]">
                  <BodyVisualization
                    measurements={measurements.map((m) => ({ measurement_type: m.measurement_type, value_cm: m.value_cm }))}
                    heightCm={activeTwin.height_cm}
                  />
                </div>
              </Card>

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card padding="sm">
                  <div className="text-tertiary text-xs mb-1">Confidence</div>
                  <div className="text-primary text-lg font-semibold">{Math.round(activeTwin.overall_confidence * 100)}%</div>
                  <div className="text-tertiary text-xs mt-0.5">{getConfidenceLabel(activeTwin.overall_confidence)}</div>
                </Card>
                <Card padding="sm">
                  <div className="text-tertiary text-xs mb-1">Scan Quality</div>
                  <div className="text-primary text-lg font-semibold capitalize">{activeTwin.scan_quality}</div>
                </Card>
                <Card padding="sm">
                  <div className="text-tertiary text-xs mb-1">Model</div>
                  <div className="text-primary text-sm font-mono">{activeTwin.model_version}</div>
                </Card>
                <Card padding="sm">
                  <div className="text-tertiary text-xs mb-1">Last Scanned</div>
                  <div className="text-primary text-sm">{new Date(activeTwin.created_at).toLocaleDateString()}</div>
                </Card>
              </div>

              {/* Measurements */}
              <Card padding="none" className="overflow-hidden">
                <div className="px-5 py-3 border-b border-app">
                  <h3 className="text-primary text-sm font-medium">Measurements</h3>
                  <p className="text-tertiary text-xs">Each measurement includes uncertainty and confidence</p>
                </div>
                <div className="divide-y divide-app">
                  {measurements.map((m) => {
                    const pct = Math.round(m.confidence * 100);
                    const confVariant: 'success' | 'warning' | 'error' = pct >= 65 ? 'success' : pct >= 45 ? 'warning' : 'error';
                    return (
                      <div key={m.measurement_type} className="flex items-center justify-between px-5 py-3">
                        <div>
                          <div className="text-primary text-sm">{MEASUREMENT_LABELS[m.measurement_type] ?? m.measurement_type}</div>
                          <div className="text-tertiary text-xs">±{m.uncertainty_cm}cm uncertainty</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="text-primary text-sm font-medium">{m.value_cm}cm</div>
                          </div>
                          <Badge variant={confVariant}>{pct}%</Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* Privacy controls */}
              <Card padding="md">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-primary text-sm font-medium">Privacy</h3>
                    <p className="text-tertiary text-xs mt-0.5">Your body data uses internal IDs, not personal identifiers.</p>
                  </div>
                  <Button variant="ghost" size="sm">Manage Data</Button>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
