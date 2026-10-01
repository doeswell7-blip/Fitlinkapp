import { StrictMode, Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Fit Infrastructure runtime error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-app flex items-center justify-center px-4">
          <div className="w-full max-w-2xl surface rounded-2xl p-6 border border-error/30">
            <h1 className="text-primary text-lg font-semibold">The app hit a runtime error</h1>
            <p className="text-secondary text-sm mt-2">The blank screen has been replaced with a diagnostic so the failure is visible.</p>
            <pre className="mt-4 p-3 rounded-lg bg-secondary text-error text-xs overflow-auto whitespace-pre-wrap">{this.state.error.message}</pre>
            <button className="mt-4 rounded-lg bg-accent text-white px-4 py-2 text-sm" onClick={() => window.location.reload()}>Reload app</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>
);
