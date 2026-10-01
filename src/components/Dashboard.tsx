import { useState, useEffect } from 'react';
import { getBodyTwins, getProductTwins, getEvents } from '@/lib/data';
import { Card, Button, EmptyState } from '@/components/ui';
import type { AppView } from '@/App';

interface DashboardProps {
  orgId: string;
  onNavigate: (view: AppView) => void;
}

interface EventRow {
  id: string;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
  payload: Record<string, unknown>;
}

const EVENT_LABELS: Record<string, string> = {
  'scan.created': 'Scan started',
  'scan.processing': 'Scan processing',
  'scan.completed': 'Scan completed',
  'scan.failed': 'Scan failed',
  'body_twin.created': 'Body Twin created',
  'product.created': 'Product created',
  'fit.predicted': 'Fit prediction run',
  'fit.feedback_received': 'Fit feedback received',
};

export default function Dashboard({ orgId, onNavigate }: DashboardProps) {
  const [bodyTwinCount, setBodyTwinCount] = useState(0);
  const [productCount, setProductCount] = useState(0);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [orgId]);

  const load = async () => {
    setLoading(true);
    try {
      const [twins, products, evts] = await Promise.all([
        getBodyTwins(orgId),
        getProductTwins(orgId),
        getEvents(orgId, 20) as Promise<EventRow[]>,
      ]);
      setBodyTwinCount(twins.length);
      setProductCount(products.length);
      setEvents(evts);
    } catch (err) { console.error('Failed to load dashboard:', err); }
    finally { setLoading(false); }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-app border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  const stats = [
    { label: 'Body Profiles', value: bodyTwinCount, color: 'text-accent', action: () => onNavigate('body-twin') },
    { label: 'Product Twins', value: productCount, color: 'text-accent', action: () => onNavigate('product') },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-primary mb-1">Dashboard</h2>
        <p className="text-secondary text-sm">Overview of your fit infrastructure data</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <button key={stat.label} onClick={stat.action} className="text-left">
            <Card padding="md" className="hover:border-accent/30 transition-colors">
              <div className={`text-3xl font-bold ${stat.color} mb-1`}>{stat.value}</div>
              <div className="text-tertiary text-sm">{stat.label}</div>
            </Card>
          </button>
        ))}
        <button onClick={() => onNavigate('scan')}>
          <Card padding="md" className="hover:border-accent/30 transition-colors h-full">
            <div className="text-3xl font-bold text-accent mb-1">+</div>
            <div className="text-tertiary text-sm">New Scan</div>
          </Card>
        </button>
        <button onClick={() => onNavigate('fit')}>
          <Card padding="md" className="hover:border-accent/30 transition-colors h-full">
            <div className="text-3xl font-bold text-accent mb-1">{'\u2192'}</div>
            <div className="text-tertiary text-sm">Run Fit Prediction</div>
          </Card>
        </button>
      </div>

      {/* Quick start */}
      {bodyTwinCount === 0 && productCount === 0 && (
        <Card padding="lg">
          <EmptyState
            icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><path d="M12 8v8M8 12h8" strokeLinecap="round" /></svg>}
            title="Welcome to Fit Infrastructure"
            description="Start by creating a Body Profile with a phone camera scan, then add a garment to run your first fit prediction."
            action={<Button onClick={() => onNavigate('scan')}>Start Body Scan</Button>}
          />
        </Card>
      )}

      {/* Event log */}
      <Card padding="none" className="overflow-hidden">
        <div className="px-5 py-3 border-b border-app">
          <h3 className="text-primary text-sm font-medium">Activity Log</h3>
          <p className="text-tertiary text-xs">Real events from the database</p>
        </div>
        {events.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-tertiary text-sm mb-1">No activity yet.</p>
            <p className="text-tertiary text-xs">Run a scan or create a product to see events here.</p>
          </div>
        ) : (
          <div className="divide-y divide-app">
            {events.map((evt) => (
              <div key={evt.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                  <div>
                    <div className="text-primary text-sm">{EVENT_LABELS[evt.event_type] ?? evt.event_type}</div>
                    <div className="text-tertiary text-xs">{new Date(evt.created_at).toLocaleString()}</div>
                  </div>
                </div>
                <div className="text-tertiary text-xs font-mono hidden sm:block">
                  {evt.entity_type ? `${evt.entity_type}:${String(evt.entity_id ?? '').slice(0, 8)}` : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
