import { useState, useEffect } from 'react';
import { getBodyTwins, getBodyMeasurements, getProductTwins, getProductMeasurements, saveFitPrediction, getFitPredictions, saveFitFeedback } from '@/lib/data';
import { predictFit, compareSizes, type SizeComparison } from '@/lib/fit-engine';
import { Card, Button, Select, Badge, EmptyState } from '@/components/ui';
import type { BodyTwin, BodyMeasurement, ProductTwin, ProductMeasurement, FitType, FitAreaResult, FitPredictionRecord } from '@/lib/types';

interface FitResultViewProps {
  orgId: string;
  selectedBodyTwinId: string | null;
  selectedProductTwinId: string | null;
  onSelectBodyTwin: (id: string) => void;
  onSelectProductTwin: (id: string) => void;
}

const AREA_LABELS: Record<string, string> = {
  chest: 'Chest',
  waist: 'Waist',
  hip: 'Hip',
  shoulder: 'Shoulder',
  length: 'Length',
  sleeve: 'Sleeve',
  neck: 'Neck',
};

const FIT_RESULT_CONFIG: Record<FitAreaResult, { variant: 'success' | 'warning' | 'error'; label: string; barWidth: number; barOffset: number }> = {
  good: { variant: 'success', label: 'Good', barWidth: 40, barOffset: 30 },
  slightly_tight: { variant: 'warning', label: 'Slightly tight', barWidth: 30, barOffset: 10 },
  slightly_loose: { variant: 'warning', label: 'Slightly loose', barWidth: 30, barOffset: 60 },
  too_tight: { variant: 'error', label: 'Too tight', barWidth: 25, barOffset: 0 },
  too_loose: { variant: 'error', label: 'Too loose', barWidth: 25, barOffset: 75 },
};

function FitBar({ result }: { result: FitAreaResult }) {
  const config = FIT_RESULT_CONFIG[result];
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden relative">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            config.variant === 'success' ? 'bg-success' :
            config.variant === 'warning' ? 'bg-warning' : 'bg-error'
          }`}
          style={{ width: `${config.barWidth}%`, marginLeft: `${config.barOffset}%` }}
        />
      </div>
    </div>
  );
}

export default function FitResultView({
  orgId,
  selectedBodyTwinId,
  selectedProductTwinId,
  onSelectBodyTwin,
  onSelectProductTwin,
}: FitResultViewProps) {
  const [bodyTwins, setBodyTwins] = useState<BodyTwin[]>([]);
  const [products, setProducts] = useState<ProductTwin[]>([]);
  const [bodyMeasurements, setBodyMeasurements] = useState<BodyMeasurement[]>([]);
  const [productMeasurements, setProductMeasurements] = useState<ProductMeasurement[]>([]);
  const [loading, setLoading] = useState(true);
  const [fitPreference, setFitPreference] = useState<'tight' | 'regular' | 'loose'>('regular');
  const [comparison, setComparison] = useState<SizeComparison[] | null>(null);
  const [savedPredictionId, setSavedPredictionId] = useState<string | null>(null);
  const [predicting, setPredicting] = useState(false);
  const [history, setHistory] = useState<FitPredictionRecord[]>([]);
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const [bodyId, setBodyId] = useState(selectedBodyTwinId);
  const [productId, setProductId] = useState(selectedProductTwinId);

  useEffect(() => { loadData(); }, [orgId]);
  useEffect(() => { if (bodyId) loadBodyMeasurements(bodyId); }, [bodyId]);
  useEffect(() => { if (productId) loadProductMeasurements(productId); }, [productId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [twins, prods, predictions] = await Promise.all([getBodyTwins(orgId), getProductTwins(orgId), getFitPredictions(orgId, 20)]);
      setBodyTwins(twins);
      setProducts(prods);
      setHistory(predictions);
      if (twins.length > 0 && !bodyId) setBodyId(twins[0].id);
      if (prods.length > 0 && !productId) setProductId(prods[0].id);
    } catch (err) { console.error('Failed to load data:', err); }
    finally { setLoading(false); }
  };

  const loadBodyMeasurements = async (id: string) => {
    try { setBodyMeasurements(await getBodyMeasurements(id)); }
    catch (err) { console.error(err); }
  };

  const loadProductMeasurements = async (id: string) => {
    try { setProductMeasurements(await getProductMeasurements(id)); }
    catch (err) { console.error(err); }
  };

  const activeProduct = products.find((p) => p.id === productId);

  const submitFeedback = async (outcome: 'kept' | 'exchanged' | 'returned') => {
    if (!savedPredictionId) return;
    setFeedbackSaving(true);
    setFeedbackMessage(null);
    try {
      await saveFitFeedback(savedPredictionId, outcome);
      setFeedbackMessage('Feedback recorded: ' + outcome + '.');
      setHistory(await getFitPredictions(orgId, 20));
    } catch (err) { setFeedbackMessage(err instanceof Error ? err.message : 'Unable to save feedback'); }
    finally { setFeedbackSaving(false); }
  };

  const runFitPrediction = async () => {
    if (!bodyId || !productId || !activeProduct) return;
    if (bodyMeasurements.length === 0 || productMeasurements.length === 0) return;

    setPredicting(true);
    setComparison(null);

    await new Promise((r) => setTimeout(r, 800));

    const sameTypeProducts = products.filter(
      (p) => p.product_name === activeProduct.product_name && p.garment_type === activeProduct.garment_type,
    );

    let results: SizeComparison[];

    if (sameTypeProducts.length > 1) {
      const sizes = await Promise.all(
        sameTypeProducts.map(async (p) => {
          const ms = p.id === productId ? productMeasurements : await getProductMeasurements(p.id);
          return {
            size: p.size,
            productMeasurements: ms,
            fitType: p.fit_type as FitType,
            manufacturingToleranceCm: p.manufacturing_tolerance_cm,
          };
        }),
      );
      results = compareSizes(bodyMeasurements, sizes, fitPreference);
    } else {
      const result = predictFit({
        bodyMeasurements,
        productMeasurements,
        productFitType: activeProduct.fit_type as FitType,
        manufacturingToleranceCm: activeProduct.manufacturing_tolerance_cm,
        fitPreference,
        size: activeProduct.size,
      });
      results = [{ size: activeProduct.size, result }];
    }

    setComparison(results);
    setSavedPredictionId(null);

    const best = results[0];
    try {
      const id = await saveFitPrediction(orgId, bodyId, productId, best.result, fitPreference, 'standing');
      setSavedPredictionId(id);
    } catch (err) { console.error('Failed to save prediction:', err); }
    finally { setPredicting(false); }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-app border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (bodyTwins.length === 0 || products.length === 0) {
    return (
      <div>
        <h2 className="text-xl font-semibold text-primary mb-1">Fit Prediction</h2>
        <p className="text-secondary text-sm mb-6">Compare a Body Twin against a Product Twin to predict fit</p>
        <Card>
          <EmptyState
            icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            title={bodyTwins.length === 0 ? 'No Body Profile yet' : 'No Products yet'}
            description={bodyTwins.length === 0 ? 'Create a Body Profile by running a scan first.' : 'Add a garment to create a Product Twin first.'}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-primary mb-1">Fit Prediction</h2>
        <p className="text-secondary text-sm">Compare a Body Twin against a Product Twin to predict fit</p>
      </div>

      {/* Selectors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Body Profile"
          value={bodyId ?? ''}
          onChange={(e) => { setBodyId(e.target.value); onSelectBodyTwin(e.target.value); }}
        >
          {bodyTwins.map((t) => (
            <option key={t.id} value={t.id}>
              {t.height_cm ? `${t.height_cm}cm` : 'Unknown'} · {Math.round(t.overall_confidence * 100)}% confidence
            </option>
          ))}
        </Select>
        <Select
          label="Product"
          value={productId ?? ''}
          onChange={(e) => { setProductId(e.target.value); onSelectProductTwin(e.target.value); }}
        >
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.product_name} · Size {p.size} · {p.fit_type}
            </option>
          ))}
        </Select>
      </div>

      {/* Fit preference */}
      <div>
        <label className="block text-sm font-medium text-secondary mb-2">Fit Preference</label>
        <div className="flex gap-2">
          {(['tight', 'regular', 'loose'] as const).map((pref) => (
            <button
              key={pref}
              onClick={() => setFitPreference(pref)}
              className={`px-4 py-2 text-sm font-medium rounded-lg capitalize transition-all ${
                fitPreference === pref
                  ? 'bg-accent text-white'
                  : 'surface-secondary text-secondary hover:text-primary'
              }`}
            >
              {pref}
            </button>
          ))}
        </div>
      </div>

      <Button
        size="lg"
        className="w-full"
        onClick={runFitPrediction}
        disabled={!bodyId || !productId || bodyMeasurements.length === 0 || productMeasurements.length === 0 || predicting}
      >
        {predicting ? 'Comparing your body profile with this product...' : 'Check My Fit'}
      </Button>

      {/* Predicting state */}
      {predicting && (
        <div className="flex flex-col items-center py-8">
          <div className="w-8 h-8 border-2 border-app border-t-accent rounded-full animate-spin mb-3" />
          <p className="text-secondary text-sm">Comparing body geometry with product geometry...</p>
        </div>
      )}

      {savedPredictionId && comparison && (
        <Card padding="md">
          <div className="flex items-center justify-between gap-3 mb-3"><div><h3 className="text-primary text-sm font-medium">Real-world feedback</h3><p className="text-tertiary text-xs">Tell the system what happened so the fit record stays useful.</p></div></div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={feedbackSaving} onClick={() => void submitFeedback('kept')}>Kept it</Button>
            <Button size="sm" variant="secondary" disabled={feedbackSaving} onClick={() => void submitFeedback('exchanged')}>Exchanged</Button>
            <Button size="sm" variant="secondary" disabled={feedbackSaving} onClick={() => void submitFeedback('returned')}>Returned</Button>
          </div>
          {feedbackMessage && <p className="text-tertiary text-xs mt-2">{feedbackMessage}</p>}
        </Card>
      )}

      {history.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <div className="px-5 py-3 border-b border-app"><h3 className="text-primary text-sm font-medium">Prediction history</h3><p className="text-tertiary text-xs">Saved predictions from this workspace.</p></div>
          <div className="divide-y divide-app">
            {history.map((p) => {
              const body = bodyTwins.find((b) => b.id === p.body_twin_id);
              const product = products.find((x) => x.id === p.product_twin_id);
              return <button key={p.id} onClick={() => { setBodyId(p.body_twin_id); setProductId(p.product_twin_id); }} className="w-full text-left px-5 py-3 hover:bg-secondary/50 transition-colors"><div className="flex items-center justify-between gap-3"><div><div className="text-primary text-sm">{product?.product_name ?? 'Product'} · Size {p.recommended_size ?? 'No recommendation'}</div><div className="text-tertiary text-xs">{body?.height_cm ? String(body.height_cm) + 'cm' : 'Body profile'} · {new Date(p.created_at).toLocaleString()}</div></div><Badge variant={p.confidence >= 0.65 ? 'success' : p.confidence >= 0.45 ? 'warning' : 'error'}>{Math.round(p.confidence * 100)}%</Badge></div></button>;
            })}
          </div>
        </Card>
      )}

      {/* Results */}
      {comparison && comparison.length > 0 && (
        <div className="space-y-4">
          {savedPredictionId && (
            <div className="flex items-center gap-2 text-success text-xs">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Prediction saved to database
            </div>
          )}

          {comparison.map((item, idx) => {
            const isBest = idx === 0;
            const config = FIT_RESULT_CONFIG;
            const areaCount = Object.keys(item.result.area_results).length;
            const goodCount = Object.values(item.result.area_results).filter((r) => r === 'good').length;

            return (
              <Card key={item.size} padding="lg" className={isBest ? 'border-accent/30 bg-accent-subtle/30' : ''}>
                {/* Size header */}
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <span className={`text-3xl font-bold ${isBest ? 'text-accent' : 'text-primary'}`}>{item.size}</span>
                    {isBest && item.result.recommended_size && (
                      <Badge variant="accent">Recommended</Badge>
                    )}
                  </div>
                  <div className="text-right">
                    <div className={`text-2xl font-bold ${isBest ? 'text-accent' : 'text-primary'}`}>
                      {Math.round(item.result.confidence * 100)}%
                    </div>
                    <div className="text-tertiary text-xs">confidence</div>
                  </div>
                </div>

                {/* Fit summary */}
                {isBest && (
                  <p className="text-secondary text-sm mb-4">
                    {goodCount === areaCount
                      ? `Size ${item.size} provides a good fit across all measured areas.`
                      : `Size ${item.size} is the best option, with ${goodCount} of ${areaCount} areas fitting well.`}
                  </p>
                )}

                {/* Area results with visual bars */}
                <div className="space-y-3 mb-4">
                  {Object.entries(item.result.area_results).map(([area, result]) => {
                    const cfg = config[result];
                    return (
                      <div key={area} className="flex items-center gap-3">
                        <div className="w-20 text-tertiary text-xs">{AREA_LABELS[area] ?? area}</div>
                        <div className="flex-1"><FitBar result={result} /></div>
                        <div className="w-28 text-right">
                          <Badge variant={cfg.variant}>{cfg.label}</Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Explanation */}
                <div className="border-t border-app pt-4 space-y-1">
                  {item.result.explanation.map((line, i) => (
                    <p key={i} className="text-tertiary text-xs">{line}</p>
                  ))}
                </div>

                {/* Warnings */}
                {item.result.warnings.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {item.result.warnings.map((w, i) => (
                      <div key={i} className="flex items-start gap-2 bg-warning-subtle border border-warning/20 rounded-lg px-3 py-2">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-warning flex-shrink-0 mt-0.5">
                          <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <p className="text-warning text-xs">{w}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
