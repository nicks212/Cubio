'use client';

import { useState } from 'react';
import { Box, Building2, Gem, CheckCircle2, AlertCircle } from 'lucide-react';
import { selectBusinessType } from './actions';
import { BusinessType } from '@/types/database';

const profiles = [
  {
    id: 'real_estate' as BusinessType,
    title: 'Real Estate Development Company',
    description: 'Manage projects, apartments, leads, and AI-powered sales automation',
    icon: Building2,
    color: 'bg-blue-500',
    features: ['Projects Management', 'Apartments Catalog', 'Lead Tracking', 'AI Sales Agent'],
  },
  {
    id: 'craft_shop' as BusinessType,
    title: 'Birthstone Crafts Shop',
    description: 'Manage product catalog, birthstone jewelry, and zodiac compatibility',
    icon: Gem,
    color: 'bg-purple-500',
    features: ['Product Catalog', 'Birthstone Management', 'Zodiac Compatibility', 'Inventory Tracking'],
  },
];

export default function OnboardingPage() {
  const [selected, setSelected] = useState<BusinessType | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSelect = (id: BusinessType) => {
    setSelected(id);
    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    if (!selected) return;
    setLoading(true);
    await selectBusinessType(selected);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-5xl">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center">
              <Box className="w-7 h-7 text-white" />
            </div>
            <span className="text-2xl font-bold">Cubio</span>
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-3">Select Your Business Profile</h1>
          <p className="text-muted-foreground">Choose the profile that best matches your business</p>
        </div>

        {!showConfirm ? (
          <div className="grid md:grid-cols-2 gap-6">
            {profiles.map((profile) => {
              const Icon = profile.icon;
              return (
                <button
                  key={profile.id}
                  onClick={() => handleSelect(profile.id)}
                  className="bg-white rounded-2xl border-2 border-slate-200 p-8 text-left hover:border-primary hover:shadow-xl transition-all group"
                >
                  <div className={`w-16 h-16 ${profile.color} rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                    <Icon className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-xl font-bold mb-3">{profile.title}</h3>
                  <p className="text-muted-foreground mb-6">{profile.description}</p>
                  <div className="space-y-2">
                    {profile.features.map((f) => (
                      <div key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                        {f}
                      </div>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-2xl border-2 border-slate-200 p-8">
              <div className="flex items-start gap-4 mb-6">
                <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-2">Confirm Your Selection</h3>
                  <p className="text-muted-foreground">
                    You&apos;ve selected:{' '}
                    <span className="font-semibold text-foreground">
                      {profiles.find(p => p.id === selected)?.title}
                    </span>
                  </p>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
                <p className="text-sm text-amber-900">
                  <strong>Important:</strong> Changing business type later may archive existing business data.
                  Please make sure you&apos;ve selected the correct business profile.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowConfirm(false); setSelected(null); }}
                  className="flex-1 px-6 py-3 bg-slate-100 text-foreground rounded-xl hover:bg-slate-200 transition-colors font-medium"
                >
                  Go Back
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={loading}
                  className="flex-1 px-6 py-3 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors font-medium disabled:opacity-50"
                >
                  {loading ? 'Saving...' : 'Yes, Confirm Selection'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
