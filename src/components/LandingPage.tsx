import { Button } from '@/components/ui';

interface LandingPageProps {
  onGetStarted: () => void;
  onSignIn: () => void;
}

const AUDIENCES = [
  {
    title: 'For Shoppers',
    description: 'Create a digital body profile with your phone camera. Know your size before you buy.',
    icon: 'person',
  },
  {
    title: 'For Brands',
    description: 'Add fit prediction to your product pages. Reduce sizing uncertainty and returns.',
    icon: 'store',
  },
  {
    title: 'For Developers',
    description: 'Build physical-product compatibility into your commerce stack with a simple API.',
    icon: 'code',
  },
  {
    title: 'For Manufacturers',
    description: 'Understand how your products fit real bodies. Identify sizing problems from real data.',
    icon: 'factory',
  },
];

const FLOW = [
  { step: 'Person', detail: 'Phone camera body scan' },
  { step: 'Body Twin', detail: 'Digital body representation' },
  { step: 'Product Twin', detail: 'Digital garment model' },
  { step: 'Fit', detail: 'Compatibility prediction' },
];

export default function LandingPage({ onGetStarted, onSignIn }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-app">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-elevated/80 backdrop-blur-md border-b border-app">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 2v20M5 6l14 12M5 18L19 6" strokeLinecap="round" />
              </svg>
            </div>
            <span className="text-primary font-semibold text-sm tracking-tight">Fit Infrastructure</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onSignIn}>Sign In</Button>
            <Button size="sm" onClick={onGetStarted}>Get Started</Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-subtle border border-accent/20 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            <span className="text-accent text-xs font-medium">Physical-Product Compatibility Infrastructure</span>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-primary tracking-tight leading-[1.1] mb-6">
            Infrastructure for understanding how physical products fit real people.
          </h1>
          <p className="text-secondary text-lg leading-relaxed mb-8 max-w-2xl">
            A standardized digital representation of a person's body, a standardized representation of a physical product, and a compatibility engine that calculates how the two fit together. Clothing is the first market.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button size="lg" onClick={onGetStarted}>Create Body Profile</Button>
            <Button variant="secondary" size="lg" onClick={onSignIn}>Sign In</Button>
          </div>
        </div>
      </section>

      {/* Flow diagram */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {FLOW.map((item, i) => (
            <div key={item.step} className="relative">
              <div className="surface rounded-xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-6 h-6 rounded-full bg-accent-subtle text-accent text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="text-primary font-semibold text-sm">{item.step}</span>
                </div>
                <p className="text-tertiary text-xs">{item.detail}</p>
              </div>
              {i < FLOW.length - 1 && (
                <div className="hidden lg:flex absolute top-1/2 -right-2.5 -translate-y-1/2 text-tertiary z-10">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Audiences */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <h2 className="text-2xl font-bold text-primary mb-2">Built for every participant in physical commerce</h2>
        <p className="text-secondary text-sm mb-8">The same infrastructure serves shoppers, brands, developers, and manufacturers.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {AUDIENCES.map((aud) => (
            <div key={aud.title} className="surface rounded-xl p-5">
              <h3 className="text-primary font-semibold text-sm mb-1.5">{aud.title}</h3>
              <p className="text-secondary text-xs leading-relaxed">{aud.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Technology section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="surface rounded-2xl p-8 lg:p-12">
          <h2 className="text-2xl font-bold text-primary mb-4">The technology</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div>
                <h3 className="text-primary font-semibold text-sm mb-1">Body Scanning</h3>
                <p className="text-secondary text-sm leading-relaxed">Phone camera guided capture with real-time pose estimation, lighting validation, and framing guidance. Produces a 3D body model with measurements and confidence.</p>
              </div>
              <div>
                <h3 className="text-primary font-semibold text-sm mb-1">Body Twin</h3>
                <p className="text-secondary text-sm leading-relaxed">A persistent digital body representation containing 3D geometry, shape parameters, measurements with uncertainty, and scan quality metadata.</p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <h3 className="text-primary font-semibold text-sm mb-1">Product Twin</h3>
                <p className="text-secondary text-sm leading-relaxed">A standardized digital product model with garment measurements, material properties, fit type, and manufacturing tolerances.</p>
              </div>
              <div>
                <h3 className="text-primary font-semibold text-sm mb-1">Fit Engine</h3>
                <p className="text-secondary text-sm leading-relaxed">Geometric comparison of body and product twins. Returns recommended size, area-by-area fit results, confidence, and explanations.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-primary mb-3">Start with a body scan</h2>
          <p className="text-secondary text-sm mb-6 max-w-md mx-auto">Create your digital body profile in minutes using your phone camera.</p>
          <Button size="lg" onClick={onGetStarted}>Get Started</Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-app">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-accent flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 2v20M5 6l14 12M5 18L19 6" strokeLinecap="round" />
                </svg>
              </div>
              <span className="text-tertiary text-xs">Fit Infrastructure — Physical-product compatibility platform</span>
            </div>
            <p className="text-tertiary text-xs">Your body data is encrypted, private, and deletable.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
