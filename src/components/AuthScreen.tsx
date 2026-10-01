import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button, Input } from '@/components/ui';

export default function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-app flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-accent mb-4">
            <svg viewBox="0 0 24 24" className="w-8 h-8 text-white" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 2v20M5 6l14 12M5 18L19 6" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-primary">Fit Infrastructure</h1>
          <p className="text-tertiary text-sm mt-1">Body-Product Compatibility Platform</p>
        </div>

        {/* Auth Card */}
        <div className="surface rounded-2xl p-8 shadow-lg">
          <div className="flex gap-1 mb-6 p-1 bg-secondary rounded-lg">
            <button
              onClick={() => setMode('signin')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                mode === 'signin' ? 'bg-accent text-white' : 'text-secondary hover:text-primary'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setMode('signup')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                mode === 'signup' ? 'bg-accent text-white' : 'text-secondary hover:text-primary'
              }`}
            >
              Create Account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              id="email"
              type="email"
              label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
            />
            <Input
              id="password"
              type="password"
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="At least 6 characters"
            />

            {error && (
              <div className="bg-error-subtle border border-error/20 rounded-lg p-3 text-error text-sm">
                {error}
              </div>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? 'Please wait...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
            </Button>
          </form>
        </div>

        <p className="text-center text-tertiary text-xs mt-6">
          Your body data is encrypted and private. We use internal IDs, not personal identifiers.
        </p>
      </div>
    </div>
  );
}
