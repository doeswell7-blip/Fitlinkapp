import { useState, useEffect } from 'react';
import { getProductTwins, getProductMeasurements, createProductTwin, updateProductTwin } from '@/lib/data';
import { Card, Button, Input, Select, Badge, EmptyState } from '@/components/ui';
import type { ProductTwin, ProductMeasurement, ProductMeasurementType, FitType } from '@/lib/types';

interface ProductViewProps {
  orgId: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const PRODUCT_MEASUREMENT_LABELS: Record<string, string> = {
  chest: 'Chest', length: 'Length', shoulder: 'Shoulder', sleeve: 'Sleeve',
  waist: 'Waist', hip: 'Hip', neck: 'Neck', hem: 'Hem', cuff: 'Cuff',
  armpit: 'Armpit', back_length: 'Back Length',
  foot_length: 'Foot Length', foot_width: 'Foot Width',
  heel_width: 'Heel Width', insole_length: 'Insole Length', insole_width: 'Insole Width',
};

const GARMENT_TYPES = ['tshirt', 'shirt', 'jacket', 'pants', 'jeans', 'dress', 'skirt', 'shorts', 'coat', 'sweater', 'hoodie'];

export default function ProductView({ orgId, selectedId, onSelect }: ProductViewProps) {
  const [products, setProducts] = useState<ProductTwin[]>([]);
  const [measurements, setMeasurements] = useState<ProductMeasurement[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(selectedId);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [size, setSize] = useState('M');
  const [garmentType, setGarmentType] = useState('tshirt');
  const [fitType, setFitType] = useState<FitType>('regular');
  const [tolerance, setTolerance] = useState('1.0');
  const [formMeasurements, setFormMeasurements] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  useEffect(() => { loadProducts(); }, [orgId]);
  useEffect(() => { if (activeId) loadMeasurements(activeId); }, [activeId]);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const ps = await getProductTwins(orgId);
      setProducts(ps);
      if (ps.length > 0 && !activeId) setActiveId(ps[0].id);
    } catch (err) { console.error('Failed to load products:', err); }
    finally { setLoading(false); }
  };

  const loadMeasurements = async (id: string) => {
    try { setMeasurements(await getProductMeasurements(id)); }
    catch (err) { console.error('Failed to load measurements:', err); }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    const productMeasurements: ProductMeasurement[] = [];
    for (const [type, val] of Object.entries(formMeasurements)) {
      const num = parseFloat(val);
      if (!isNaN(num) && num > 0) {
        productMeasurements.push({
          product_twin_id: '',
          measurement_type: type as ProductMeasurementType,
          value_cm: num,
        });
      }
    }

    if (productMeasurements.length === 0) {
      alert('Please enter at least one garment measurement.');
      return;
    }

    try {
      const id = await createProductTwin(orgId, {
        product_name: name, sku: sku || undefined, size,
        garment_type: garmentType, fit_type: fitType,
        manufacturing_tolerance_cm: parseFloat(tolerance) || 1.0,
      }, productMeasurements);

      setName(''); setSku(''); setFormMeasurements({}); setShowForm(false);
      await loadProducts();
      setActiveId(id);
      onSelect(id);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create product');
    }
  };

  const activeProduct = products.find((p) => p.id === activeId);

  const startEditing = () => {
    if (!activeProduct) return;
    const values: Record<string, string> = { product_name: activeProduct.product_name, sku: activeProduct.sku ?? '', size: activeProduct.size, garment_type: activeProduct.garment_type ?? '', fit_type: activeProduct.fit_type, manufacturing_tolerance_cm: String(activeProduct.manufacturing_tolerance_cm) };
    measurements.forEach((m) => { values[m.measurement_type] = String(m.value_cm); });
    setEditValues(values);
    setEditing(true);
  };

  const saveEdits = async () => {
    if (!activeProduct) return;
    setSaving(true);
    try {
      const updatedMeasurements = measurements.map((m) => ({ ...m, value_cm: Number(editValues[m.measurement_type] ?? m.value_cm) })).filter((m) => Number.isFinite(m.value_cm) && m.value_cm > 0);
      await updateProductTwin(activeProduct.id, {
        product_name: editValues.product_name?.trim() || activeProduct.product_name,
        sku: editValues.sku?.trim() || null,
        size: editValues.size?.trim() || activeProduct.size,
        garment_type: editValues.garment_type?.trim() || null,
        fit_type: editValues.fit_type || activeProduct.fit_type,
        manufacturing_tolerance_cm: Number(editValues.manufacturing_tolerance_cm) || activeProduct.manufacturing_tolerance_cm,
        measurements: updatedMeasurements,
      });
      await loadProducts();
      await loadMeasurements(activeProduct.id);
      setEditing(false);
    } catch (err) { alert(err instanceof Error ? err.message : 'Failed to update product'); }
    finally { setSaving(false); }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-app border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-primary mb-1">Products</h2>
          <p className="text-secondary text-sm">Digital representations of physical garments</p>
        </div>
        <Button variant={showForm ? 'secondary' : 'primary'} onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'Add Product'}
        </Button>
      </div>

      {/* Create form */}
      {showForm && (
        <Card padding="lg">
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Product Name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Classic Cotton Tee" />
              <Input label="SKU (optional)" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="e.g. TEE-001" />
              <Input label="Size" value={size} onChange={(e) => setSize(e.target.value)} required placeholder="S, M, L, XL" />
              <Select label="Garment Type" value={garmentType} onChange={(e) => setGarmentType(e.target.value)}>
                {GARMENT_TYPES.map((g) => <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>)}
              </Select>
              <Select label="Fit Type" value={fitType} onChange={(e) => setFitType(e.target.value as FitType)}>
                <option value="slim">Slim</option>
                <option value="regular">Regular</option>
                <option value="relaxed">Relaxed</option>
                <option value="oversized">Oversized</option>
                <option value="custom">Custom</option>
              </Select>
              <Input label="Manufacturing Tolerance (cm)" type="number" step="0.1" value={tolerance} onChange={(e) => setTolerance(e.target.value)} />
            </div>

            <div>
              <label className="block text-sm font-medium text-secondary mb-2">Garment Measurements (cm)</label>
              <p className="text-tertiary text-xs mb-3">Enter the actual garment flat measurements for this size. At minimum, enter chest and length.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {['chest', 'length', 'shoulder', 'sleeve', 'waist', 'hip', 'neck', 'hem', 'cuff'].map((type) => (
                  <Input
                    key={type}
                    label={PRODUCT_MEASUREMENT_LABELS[type]}
                    type="number"
                    step="0.5"
                    value={formMeasurements[type] ?? ''}
                    onChange={(e) => setFormMeasurements({ ...formMeasurements, [type]: e.target.value })}
                    placeholder="cm"
                  />
                ))}
              </div>
            </div>

            <Button type="submit" size="lg" className="w-full">Create Product Twin</Button>
          </form>
        </Card>
      )}

      {products.length === 0 && !showForm ? (
        <Card>
          <EmptyState
            icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20 7l-8-4-8 4m16 0v10l-8 4m8-14l-8 4m0 0L4 7m8 4v10M4 7v10l8 4" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            title="No products yet"
            description="Add a garment with its measurements to create a Product Twin. You can then run fit predictions against your Body Profile."
            action={<Button onClick={() => setShowForm(true)}>Add Product</Button>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* List */}
          <div className="space-y-2">
            {products.map((p) => (
              <button
                key={p.id}
                onClick={() => { setActiveId(p.id); onSelect(p.id); }}
                className={`w-full text-left p-4 rounded-xl border transition-all ${
                  activeId === p.id ? 'bg-accent-subtle border-accent/30' : 'surface hover:border-app'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-primary text-sm font-medium">{p.product_name}</span>
                  <Badge variant="accent">{p.size}</Badge>
                </div>
                <div className="text-tertiary text-xs">
                  {p.garment_type ?? 'unknown'} · {p.fit_type} fit
                </div>
              </button>
            ))}
          </div>

          {/* Detail */}
          <div className="lg:col-span-2 space-y-4">
            {activeProduct && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Card padding="sm">
                    <div className="text-tertiary text-xs mb-1">Size</div>
                    <div className="text-primary text-lg font-semibold">{activeProduct.size}</div>
                  </Card>
                  <Card padding="sm">
                    <div className="text-tertiary text-xs mb-1">Fit Type</div>
                    <div className="text-primary text-lg font-semibold capitalize">{activeProduct.fit_type}</div>
                  </Card>
                  <Card padding="sm">
                    <div className="text-tertiary text-xs mb-1">Category</div>
                    <div className="text-primary text-sm font-medium capitalize">{activeProduct.category.replace('_', ' ')}</div>
                  </Card>
                  <Card padding="sm">
                    <div className="text-tertiary text-xs mb-1">Tolerance</div>
                    <div className="text-primary text-sm font-medium">±{activeProduct.manufacturing_tolerance_cm}cm</div>
                  </Card>
                </div>

                <Card padding="md">
                  <div className="flex items-center justify-between gap-3 mb-3"><div><h3 className="text-primary text-sm font-medium">Product details</h3><p className="text-tertiary text-xs">Edit measurements or metadata without creating a new Product Twin.</p></div>{!editing && <Button variant="secondary" size="sm" onClick={startEditing}>Edit</Button>}</div>
                  {editing && <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Input label="Product Name" value={editValues.product_name ?? ''} onChange={(e) => setEditValues({ ...editValues, product_name: e.target.value })} />
                      <Input label="SKU" value={editValues.sku ?? ''} onChange={(e) => setEditValues({ ...editValues, sku: e.target.value })} />
                      <Input label="Size" value={editValues.size ?? ''} onChange={(e) => setEditValues({ ...editValues, size: e.target.value })} />
                      <Input label="Garment Type" value={editValues.garment_type ?? ''} onChange={(e) => setEditValues({ ...editValues, garment_type: e.target.value })} />
                      <Select label="Fit Type" value={editValues.fit_type ?? 'regular'} onChange={(e) => setEditValues({ ...editValues, fit_type: e.target.value })}><option value="slim">Slim</option><option value="regular">Regular</option><option value="relaxed">Relaxed</option><option value="oversized">Oversized</option><option value="custom">Custom</option></Select>
                      <Input label="Tolerance (cm)" type="number" step="0.1" value={editValues.manufacturing_tolerance_cm ?? ''} onChange={(e) => setEditValues({ ...editValues, manufacturing_tolerance_cm: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{Object.keys(PRODUCT_MEASUREMENT_LABELS).map((type) => <Input key={type} label={PRODUCT_MEASUREMENT_LABELS[type]} type="number" step="0.5" value={editValues[type] ?? ''} onChange={(e) => setEditValues({ ...editValues, [type]: e.target.value })} />)}</div>
                    <div className="flex gap-2 justify-end"><Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button><Button size="sm" onClick={() => void saveEdits()} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button></div>
                  </div>}
                </Card>

                <Card padding="none" className="overflow-hidden">
                  <div className="px-5 py-3 border-b border-app">
                    <h3 className="text-primary text-sm font-medium">Garment Measurements</h3>
                  </div>
                  <div className="divide-y divide-app">
                    {measurements.length === 0 ? (
                      <div className="px-5 py-6 text-tertiary text-sm text-center">No measurements recorded</div>
                    ) : (
                      measurements.map((m) => (
                        <div key={m.measurement_type} className="flex items-center justify-between px-5 py-3">
                          <span className="text-secondary text-sm">{PRODUCT_MEASUREMENT_LABELS[m.measurement_type] ?? m.measurement_type}</span>
                          <span className="text-primary text-sm font-medium">{m.value_cm}cm</span>
                        </div>
                      ))
                    )}
                  </div>
                </Card>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
