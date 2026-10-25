import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../lib/store';
import { SectionTitle } from '../components/Layout';

const tiers = [
  { name: 'Free', badge: 'badge-slate', price: '$0', period: 'forever', cta: 'Get Started', accent: 'slate', description: 'Perfect for testing and small projects', features: [{ text: '5,000 requests/day', included: true }, { text: '5 API keys', included: true }, { text: 'Village search endpoint', included: true }, { text: 'Basic autocomplete', included: true }, { text: 'Community support', included: true }, { text: 'Rate limit: 100 req/min', included: true }, { text: 'Sub-district hierarchy data', included: false }, { text: 'Priority support', included: false }, { text: 'Custom SLA', included: false }] },
  { name: 'Premium', badge: 'badge-emerald', price: '$49', period: '/month', cta: 'Upgrade to Premium', accent: 'emerald', popular: true, description: 'For production apps needing full coverage', features: [{ text: '50,000 requests/day', included: true }, { text: '25 API keys', included: true }, { text: 'All search endpoints', included: true }, { text: 'Advanced autocomplete', included: true }, { text: 'Priority support', included: true }, { text: 'Rate limit: 500 req/min', included: true }, { text: 'Full hierarchy data', included: true }, { text: 'Usage analytics', included: true }, { text: 'Custom SLA', included: false }] },
  { name: 'Pro', badge: 'badge-cyan', price: '$199', period: '/month', cta: 'Upgrade to Pro', accent: 'cyan', description: 'High volume with premium support', features: [{ text: '300,000 requests/day', included: true }, { text: '100 API keys', included: true }, { text: 'All endpoints', included: true }, { text: 'Advanced autocomplete', included: true }, { text: 'Dedicated support', included: true }, { text: 'Rate limit: 2,000 req/min', included: true }, { text: 'Full hierarchy data', included: true }, { text: 'Advanced analytics', included: true }, { text: '99.9% SLA', included: true }] },
  { name: 'Unlimited', badge: 'badge-violet', price: '$499', period: '/month', cta: 'Contact Sales', accent: 'violet', description: 'Enterprise-grade for maximum performance', features: [{ text: '1,000,000 requests/day', included: true }, { text: 'Unlimited API keys', included: true }, { text: 'All endpoints', included: true }, { text: 'Advanced autocomplete', included: true }, { text: 'Dedicated engineer', included: true }, { text: 'Rate limit: 5,000 req/min', included: true }, { text: 'Full hierarchy data', included: true }, { text: 'Custom analytics dashboard', included: true }, { text: 'Custom SLA & contract', included: true }] },
];

const accentTop: Record<string, string> = { slate: 'border-t-[var(--border)]', emerald: 'border-t-[var(--accent-emerald)]', cyan: 'border-t-[var(--accent)]', violet: 'border-t-[var(--accent-violet)]' };

export default function PricingPage() {
  const navigate = useNavigate();
  const { user } = useAppStore();
  const handleCTA = (_tier?: string) => { if (user) navigate('/portal'); else navigate('/login'); };

  return (
    <>
      <SectionTitle eyebrow="Pricing" title="Simple, transparent pricing" description="Start free and scale as you grow. All plans include access to village-level geographic data." />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiers.map(tier => (
          <div key={tier.name} className={`editorial-card flex flex-col p-5 border-t-2 ${accentTop[tier.accent]} ${tier.popular ? 'ring-1 ring-[var(--accent-border)]' : ''}`}>
            {tier.popular && <span style={{ fontFamily: 'var(--font-mono)' }} className="mb-3 inline-flex self-start rounded-[4px] bg-[var(--accent-soft)] border border-[var(--accent-border)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">Most Popular</span>}
            <div className="mb-4">
              <span className={`badge ${tier.badge}`}>{tier.name}</span>
              <div className="mt-3 flex items-baseline gap-1">
                <span style={{ fontFamily: 'var(--font-display)' }} className="text-[30px] font-bold tracking-[-0.02em] text-[var(--text-primary)]">{tier.price}</span>
                {tier.period && <span style={{ fontFamily: 'var(--font-mono)' }} className="text-xs text-[var(--text-muted)]">{tier.period}</span>}
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-secondary)]">{tier.description}</p>
            </div>
            <div className="h-px w-full bg-[var(--border)] mb-4" />
            <ul className="mb-6 flex-1 space-y-2.5">
              {tier.features.map(f => (
                <li key={f.text} className={`flex items-start gap-2 text-sm ${f.included ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)] line-through decoration-[var(--border)]'}`}>
                  <span className={`mt-0.5 text-[11px] ${f.included ? 'text-[var(--accent-emerald)]' : 'text-[var(--text-muted)]'}`}>{f.included ? '✓' : '—'}</span>{f.text}
                </li>
              ))}
            </ul>
            <button onClick={() => handleCTA(tier.name)} className={`${tier.accent === 'emerald' ? 'btn-emerald' : tier.accent === 'slate' ? 'btn-ghost' : 'btn-primary'} w-full mt-auto text-sm`}>{tier.cta}</button>
          </div>
        ))}
      </div>

      <div className="editorial-card p-6 text-center">
        <h3 style={{ fontFamily: 'var(--font-display)' }} className="text-[18px] font-bold text-[var(--text-primary)]">Need a custom solution?</h3>
        <p className="mt-2 text-sm text-[var(--text-secondary)] max-w-[560px] mx-auto leading-relaxed">We offer tailored plans for government agencies, research institutions, and large enterprises with dedicated support.</p>
        <button onClick={() => navigate(user ? '/portal' : '/login')} className="btn-primary mt-4">Contact Sales</button>
      </div>
    </>
  );
}
