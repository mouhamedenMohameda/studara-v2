import React, { useEffect, useMemo, useState } from 'react';
import { featureFlagsApi, type AppFeature, type PremiumFeature } from '../api/typed';

function ToggleRow({
  title,
  subtitle,
  checked,
  onChange,
}: {
  title: string;
  subtitle?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-gray-100">
      <div className="text-right">
        <div className="font-semibold text-gray-900">{title}</div>
        {subtitle ? <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div> : null}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`w-14 h-8 rounded-full transition relative ${checked ? 'bg-green-600' : 'bg-gray-300'}`}
        aria-label="toggle"
      >
        <span
          className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow transition ${
            checked ? 'right-1' : 'right-7'
          }`}
        />
      </button>
    </div>
  );
}

export default function FeatureFlagsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [appFeatures, setAppFeatures] = useState<AppFeature[]>([]);
  const [premiumFeatures, setPremiumFeatures] = useState<PremiumFeature[]>([]);

  const load = async () => {
    setError('');
    setLoading(true);
    try {
      const [app, prem] = await Promise.all([
        featureFlagsApi.adminAppFeatures(),
        featureFlagsApi.adminPremiumFeatures(),
      ]);
      setAppFeatures(Array.isArray(app) ? app : []);
      setPremiumFeatures(Array.isArray(prem) ? prem : []);
    } catch (e: any) {
      setError(e.message || 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const appSorted = useMemo(
    () => [...appFeatures].sort((a, b) => a.key.localeCompare(b.key)),
    [appFeatures],
  );
  const premSorted = useMemo(
    () => [...premiumFeatures].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.key.localeCompare(b.key)),
    [premiumFeatures],
  );

  const setApp = async (key: string, next: boolean) => {
    setAppFeatures((prev) => prev.map((f) => (f.key === key ? { ...f, is_active: next } : f)));
    try {
      await featureFlagsApi.setAdminAppFeature(key, next);
    } catch (e: any) {
      await load();
      alert(e.message || 'Erreur');
    }
  };

  const setPremium = async (key: string, next: boolean) => {
    setPremiumFeatures((prev) => prev.map((f) => (f.key === key ? { ...f, is_active: next } : f)));
    try {
      await featureFlagsApi.setAdminPremiumFeature(key, next);
    } catch (e: any) {
      await load();
      alert(e.message || 'Erreur');
    }
  };

  const disableAll = async () => {
    if (!confirm('Désactiver TOUTES les fonctionnalités ?')) return;
    try {
      await Promise.all([featureFlagsApi.disableAllAppFeatures(), featureFlagsApi.disableAllPremiumFeatures()]);
      await load();
    } catch (e: any) {
      alert(e.message || 'Erreur');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="text-right">
          <h1 className="text-2xl font-bold text-gray-900">Feature flags</h1>
          <div className="text-sm text-gray-500 mt-1">تفعيل/تعطيل أي ميزة في التطبيق + عرض "قريباً"</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="px-4 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-sm font-semibold"
          >
            تحديث
          </button>
          <button
            onClick={disableAll}
            className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold"
          >
            تعطيل الكل
          </button>
        </div>
      </div>

      {error ? (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-right">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600 ml-3" />
          <span>جارٍ التحميل...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-right">
                <div className="font-bold text-gray-900">وظائف التطبيق (Home)</div>
                <div className="text-xs text-gray-500">تعطيل أي tile → يظهر "قريباً" في التطبيق</div>
              </div>
              <div className="text-lg">🧩</div>
            </div>
            <div>
              {appSorted.map((f) => (
                <ToggleRow
                  key={f.key}
                  title={f.label || f.key}
                  subtitle={f.key}
                  checked={!!f.is_active}
                  onChange={(next) => setApp(f.key, next)}
                />
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-right">
                <div className="font-bold text-gray-900">Features PAYG / Premium</div>
                <div className="text-xs text-gray-500">is_active=false → لا يمكن الاستخدام + يظهر "bientôt"</div>
              </div>
              <div className="text-lg">💳</div>
            </div>
            <div>
              {premSorted.map((f) => (
                <ToggleRow
                  key={f.key}
                  title={(f.label_ar || f.label_fr || f.key) as string}
                  subtitle={f.key}
                  checked={!!f.is_active}
                  onChange={(next) => setPremium(f.key, next)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

