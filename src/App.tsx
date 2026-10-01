import { useState, useEffect, useCallback } from 'react';
import { supabase, supabaseConfigError } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';
import { useTheme, ThemeToggle } from '@/components/ThemeToggle';
import AuthScreen from '@/components/AuthScreen';
import LandingPage from '@/components/LandingPage';
import ScanView from '@/components/ScanView';
import BodyTwinView from '@/components/BodyTwinView';
import ProductView from '@/components/ProductView';
import FitResultView from '@/components/FitResultView';
import Dashboard from '@/components/Dashboard';
import { ensureOrganization } from '@/lib/data';

export type AppView = 'dashboard' | 'scan' | 'body-twin' | 'product' | 'fit';
type LandingState = 'landing' | 'auth' | 'app';

function App() {
  const { theme, toggleTheme } = useTheme();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [orgLoading, setOrgLoading] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);
  const [landingState, setLandingState] = useState<LandingState>('landing');
  const [view, setView] = useState<AppView>('dashboard');
  const [orgId, setOrgId] = useState<string | null>(null);
  const [selectedBodyTwinId, setSelectedBodyTwinId] = useState<string | null>(null);
  const [selectedProductTwinId, setSelectedProductTwinId] = useState<string | null>(null);

  const loadOrganization = useCallback(async () => {
    setOrgLoading(true);
    setOrgError(null);
    try {
      const id = await ensureOrganization();
      setOrgId(id);
    } catch (error) {
      console.error('Failed to load organization:', error);
      setOrgId(null);
      setOrgError(error instanceof Error ? error.message : 'Unable to load your workspace.');
    } finally {
      setOrgLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!mounted) return;
        setSession(data.session);
        if (data.session) {
          setLandingState('app');
          await loadOrganization();
        }
      } catch (error) {
        console.error('Auth bootstrap failed:', error);
        if (mounted) {
          setSession(null);
          setLandingState('landing');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    bootstrap();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);

      if (!nextSession) {
        setOrgId(null);
        setOrgError(null);
        setLandingState('landing');
        setView('dashboard');
        setSelectedBodyTwinId(null);
        setSelectedProductTwinId(null);
        return;
      }

      setLandingState('app');
      if (event === 'SIGNED_IN') {
        void loadOrganization();
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadOrganization]);

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setOrgId(null);
    setLandingState('landing');
    setView('dashboard');
    setSelectedBodyTwinId(null);
    setSelectedProductTwinId(null);
  }, []);

  if (supabaseConfigError) {
    return (
      <div className="min-h-screen bg-app flex items-center justify-center px-4">
        <div className="w-full max-w-lg surface rounded-2xl p-6 border border-error/30">
          <h1 className="text-primary text-lg font-semibold">Fit Infrastructure needs configuration</h1>
          <p className="text-secondary text-sm mt-2">{supabaseConfigError}</p>
          <p className="text-tertiary text-xs mt-3">This diagnostic screen is intentional: the app will never silently render a blank page because an environment variable is missing.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="min-h-screen bg-app flex items-center justify-center"><div className="w-6 h-6 border-2 border-app border-t-accent rounded-full animate-spin" /></div>;
  }

  if (landingState === 'landing' && !session) {
    return <LandingPage onGetStarted={() => setLandingState('auth')} onSignIn={() => setLandingState('auth')} />;
  }

  if (landingState === 'auth' && !session) {
    return <AuthScreen />;
  }

  if (session && orgLoading && !orgId) {
    return <div className="min-h-screen bg-app flex items-center justify-center px-4"><div className="w-full max-w-md surface rounded-2xl p-6 text-center"><div className="mx-auto mb-4 w-8 h-8 border-2 border-app border-t-accent rounded-full animate-spin" /><h2 className="text-primary font-semibold">Loading your workspace</h2><p className="text-secondary text-sm mt-2">Preparing your body and product data.</p></div></div>;
  }

  if (session && !orgId) {
    return <div className="min-h-screen bg-app flex items-center justify-center px-4"><div className="w-full max-w-md surface rounded-2xl p-6"><h2 className="text-primary font-semibold text-lg">Workspace unavailable</h2><p className="text-secondary text-sm mt-2">{orgError ?? 'We could not load your workspace.'}</p><button onClick={() => void loadOrganization()} disabled={orgLoading} className="mt-5 w-full rounded-lg bg-accent text-white px-4 py-2.5 text-sm font-medium disabled:opacity-50">{orgLoading ? 'Retrying…' : 'Retry'}</button></div></div>;
  }

  const navItems: { key: AppView; label: string; icon: string }[] = [
    { key: 'dashboard', label: 'Dashboard', icon: 'grid' },
    { key: 'scan', label: 'New Scan', icon: 'scan' },
    { key: 'body-twin', label: 'Body Profile', icon: 'body' },
    { key: 'product', label: 'Products', icon: 'product' },
    { key: 'fit', label: 'Fit Prediction', icon: 'fit' },
  ];

  return (
    <div className="min-h-screen bg-app theme-transition">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-elevated/80 backdrop-blur-md border-b border-app">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 2v20M5 6l14 12M5 18L19 6" strokeLinecap="round" />
                </svg>
              </div>
              <div className="hidden sm:block">
                <h1 className="text-primary font-semibold text-sm tracking-tight">Fit Infrastructure</h1>
                <p className="text-tertiary text-xs">Body-Product Compatibility</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
              <span className="text-tertiary text-xs hidden md:block">{session?.user?.email}</span>
              <button
                onClick={handleSignOut}
                className="text-secondary hover:text-primary text-xs transition-colors px-3 py-1.5 rounded-lg surface-secondary hover:opacity-80"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Nav */}
      <nav className="border-b border-app bg-elevated/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-1 overflow-x-auto">
            {navItems.map((item) => (
              <button
                key={item.key}
                onClick={() => setView(item.key)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
                  view === item.key
                    ? 'text-accent border-accent'
                    : 'text-secondary border-transparent hover:text-primary hover:border-app'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {view === 'dashboard' && orgId && (
          <Dashboard orgId={orgId} onNavigate={setView} />
        )}
        {view === 'scan' && orgId && (
          <ScanView
            orgId={orgId}
            onBodyTwinCreated={(id) => {
              setSelectedBodyTwinId(id);
              setView('body-twin');
            }}
          />
        )}
        {view === 'body-twin' && orgId && (
          <BodyTwinView
            orgId={orgId}
            selectedId={selectedBodyTwinId}
            onSelect={setSelectedBodyTwinId}
          />
        )}
        {view === 'product' && orgId && (
          <ProductView
            orgId={orgId}
            selectedId={selectedProductTwinId}
            onSelect={setSelectedProductTwinId}
          />
        )}
        {view === 'fit' && orgId && (
          <FitResultView
            orgId={orgId}
            selectedBodyTwinId={selectedBodyTwinId}
            selectedProductTwinId={selectedProductTwinId}
            onSelectBodyTwin={setSelectedBodyTwinId}
            onSelectProductTwin={setSelectedProductTwinId}
          />
        )}
      </main>
    </div>
  );
}

export default App;
