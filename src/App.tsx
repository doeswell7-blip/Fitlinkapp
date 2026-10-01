import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
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
  const [landingState, setLandingState] = useState<LandingState>('landing');
  const [view, setView] = useState<AppView>('dashboard');
  const [orgId, setOrgId] = useState<string | null>(null);
  const [selectedBodyTwinId, setSelectedBodyTwinId] = useState<string | null>(null);
  const [selectedProductTwinId, setSelectedProductTwinId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) setLandingState('app');
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        setSession(session);
        if (session) {
          setLandingState('app');
          try {
            const id = await ensureOrganization();
            setOrgId(id);
          } catch (e) {
            console.error('Failed to ensure organization:', e);
          }
        } else {
          setOrgId(null);
          setLandingState('landing');
        }
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setOrgId(null);
    setLandingState('landing');
    setView('dashboard');
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-app flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-app border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (landingState === 'landing' && !session) {
    return (
      <LandingPage
        onGetStarted={() => setLandingState('auth')}
        onSignIn={() => setLandingState('auth')}
      />
    );
  }

  if (landingState === 'auth' && !session) {
    return <AuthScreen />;
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
