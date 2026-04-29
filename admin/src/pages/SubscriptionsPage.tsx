/**
 * SubscriptionsPage — Admin
 *
 * Chercher un utilisateur → voir son abonnement actuel → octroyer / révoquer.
 */

import React, { useState, useCallback } from 'react';
import {
  adminUsersApi,
  adminSubscriptionsApi,
  type AdminUserRow,
  type AdminLegacySubscriptionInfo,
  type AdminCatalogSubscriptionBundle,
} from '../api/typed';

// ─── Plans prédéfinis ─────────────────────────────────────────────────────────
const PLANS = [
  { id: 'launch',  label: '🚀 Offre Lancement (3 mois)',  days: 90,  price: '290 MRU' },
  { id: 'student', label: '🎓 Étudiant (1 mois)',          days: 30,  price: '490 MRU' },
  { id: 'pro',     label: '⚡ Pro (1 mois)',               days: 30,  price: '890 MRU' },
  { id: 'annual',  label: '👑 Annuel (12 mois)',           days: 365, price: '3 900 MRU' },
  { id: 'custom',  label: '✏️ Durée personnalisée',        days: 0,   price: '—' },
];

/** Plans `user_subscriptions` (migration 029) — distinct des offres legacy ci-dessus */
const CATALOG_PLANS = [
  { code: 'essential', label: 'Studara Essentiel — 150 MRU/mois' },
  { code: 'course_pdf', label: 'Studara Cours & PDF — 250 MRU/mois' },
  { code: 'march_plus', label: 'March Plus — (alias) Studara Cours & PDF' },
  { code: 'elite_pass_7d', label: 'Studara Elite Pass Hebdo — 349 MRU / 7 jours' },
  { code: 'elite_monthly', label: 'Studara Elite Mensuel — 1000 MRU/mois' },
] as const;

type SubInfo = AdminLegacySubscriptionInfo;

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function StatusBadge({ status }: { status: SubInfo['status'] }) {
  const cfg: Record<string, { bg: string; label: string }> = {
    active:  { bg: 'bg-green-100 text-green-800',  label: '✅ Actif' },
    trial:   { bg: 'bg-blue-100 text-blue-800',    label: '🕐 Essai' },
    expired: { bg: 'bg-red-100 text-red-800',      label: '❌ Expiré' },
  };
  const { bg, label } = cfg[status] ?? cfg.expired;
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${bg}`}>{label}</span>;
}

export default function SubscriptionsPage() {
  const [query, setQuery]           = useState('');
  const [users, setUsers]           = useState<AdminUserRow[]>([]);
  const [searching, setSearching]   = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUserRow | null>(null);
  const [subInfo, setSubInfo]       = useState<SubInfo | null>(null);
  const [loadingSub, setLoadingSub] = useState(false);

  // Form state
  const [selectedPlan, setSelectedPlan] = useState(PLANS[0].id);
  const [customDays, setCustomDays]     = useState(30);
  const [note, setNote]                 = useState('');
  const [submitting, setSubmitting]     = useState(false);
  const [message, setMessage]           = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [catalogBundle, setCatalogBundle] = useState<AdminCatalogSubscriptionBundle | null>(null);
  const [catalogPlanCode, setCatalogPlanCode] = useState<string>(CATALOG_PLANS[0].code);
  const [catalogPeriodDays, setCatalogPeriodDays] = useState(30);

  // ── Recherche utilisateurs ──────────────────────────────────────────────────
  const searchUsers = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      setUsers(await adminUsersApi.list(1, query));
    } catch {
      setUsers([]);
    } finally {
      setSearching(false);
    }
  }, [query]);

  // ── Sélectionner un utilisateur ────────────────────────────────────────────
  const selectUser = useCallback(async (u: AdminUserRow) => {
    setSelectedUser(u);
    setSubInfo(null);
    setCatalogBundle(null);
    setMessage(null);
    setLoadingSub(true);
    try {
      const [data, cat] = await Promise.all([
        adminSubscriptionsApi.getUserSubscription(u.id).catch(() => null),
        adminSubscriptionsApi.getUserCatalogSubscription(u.id).catch(() => null),
      ]);
      setSubInfo(data);
      setCatalogBundle(cat);
    } catch {
      setSubInfo(null);
      setCatalogBundle(null);
    } finally {
      setLoadingSub(false);
    }
  }, []);

  // ── Octroyer l'abonnement ──────────────────────────────────────────────────
  const grantSubscription = async () => {
    if (!selectedUser) return;
    const plan = PLANS.find(p => p.id === selectedPlan)!;
    const days = plan.id === 'custom' ? customDays : plan.days;
    if (!days || days < 1) { setMessage({ type: 'err', text: 'Durée invalide' }); return; }

    setSubmitting(true);
    setMessage(null);
    try {
      await adminSubscriptionsApi.grantSubscription(selectedUser.id, { duration_days: days, plan: plan.label, note });
      setMessage({ type: 'ok', text: `✅ Abonnement "${plan.label}" accordé pour ${days} jours.` });
      // Refresh sub info
      const data = await adminSubscriptionsApi.getUserSubscription(selectedUser.id);
      setSubInfo(data);
      setNote('');
    } catch (e: any) {
      setMessage({ type: 'err', text: e.message ?? 'Erreur' });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Révoquer ──────────────────────────────────────────────────────────────
  const grantCatalogSubscription = async () => {
    if (!selectedUser) return;
    setSubmitting(true);
    setMessage(null);
    try {
      await adminSubscriptionsApi.grantCatalogPlan(selectedUser.id, {
        planCode: catalogPlanCode,
        periodDays: catalogPeriodDays,
        note: note || undefined,
      });
      setMessage({ type: 'ok', text: `✅ Plan catalogue « ${catalogPlanCode} » activé (${catalogPeriodDays} j).` });
      const cat = await adminSubscriptionsApi.getUserCatalogSubscription(selectedUser.id);
      setCatalogBundle(cat);
      setNote('');
    } catch (e: any) {
      setMessage({ type: 'err', text: e.message ?? 'Erreur catalogue' });
    } finally {
      setSubmitting(false);
    }
  };

  const revokeSubscription = async () => {
    if (!selectedUser) return;
    if (!confirm(`Révoquer l'abonnement de ${selectedUser.full_name} ?`)) return;
    setSubmitting(true);
    try {
      await adminSubscriptionsApi.revokeSubscription(selectedUser.id);
      setMessage({ type: 'ok', text: '⚠️ Abonnement révoqué (retour à la période d\'essai).' });
      const data = await adminSubscriptionsApi.getUserSubscription(selectedUser.id);
      setSubInfo(data);
    } catch (e: any) {
      setMessage({ type: 'err', text: e.message ?? 'Erreur' });
    } finally {
      setSubmitting(false);
    }
  };

  const activePlan = PLANS.find(p => p.id === selectedPlan)!;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">🎟️ Gestion des abonnements</h1>

      {/* ── Recherche ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-700 mb-4">Rechercher un utilisateur</h2>
        <div className="flex gap-3">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && searchUsers()}
            placeholder="Nom, email ou ID…"
            className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <button
            onClick={searchUsers}
            disabled={searching}
            className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            {searching ? '…' : 'Rechercher'}
          </button>
        </div>

        {/* Résultats */}
        {users.length > 0 && (
          <div className="mt-4 divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
            {users.map(u => (
              <button
                key={u.id}
                onClick={() => selectUser(u)}
                className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-indigo-50 transition ${selectedUser?.id === u.id ? 'bg-indigo-50' : 'bg-white'}`}
              >
                <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm">
                  {u.full_name?.[0]?.toUpperCase() ?? '?'}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{u.full_name}</p>
                  <p className="text-xs text-gray-500">{u.email}</p>
                </div>
                <span className="ml-auto text-xs text-gray-400 capitalize">{u.role}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Abonnement actuel ── */}
      {selectedUser && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-11 h-11 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-lg">
              {selectedUser.full_name?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div>
              <p className="font-semibold text-gray-900">{selectedUser.full_name}</p>
              <p className="text-sm text-gray-500">{selectedUser.email}</p>
            </div>
          </div>

          {loadingSub ? (
            <p className="text-sm text-gray-400 animate-pulse">Chargement…</p>
          ) : subInfo ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">Statut</p>
                <StatusBadge status={subInfo.status} />
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">Fin essai</p>
                <p className="text-sm font-medium text-gray-800">{fmt(subInfo.trial_ends_at)}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">Payé jusqu'au</p>
                <p className="text-sm font-medium text-gray-800">{fmt(subInfo.paid_until)}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">Accès jusqu'au</p>
                <p className="text-sm font-medium text-gray-800">{fmt(subInfo.effective_until)}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">Jours bonus</p>
                <p className="text-sm font-medium text-gray-800">+{subInfo.bonus_days} j</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center col-span-2">
                <p className="text-xs text-gray-500 mb-1">Fichiers approuvés</p>
                <p className="text-sm font-medium text-gray-800">{subInfo.accepted_uploads_count}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-red-500 mb-4">Aucune info d'abonnement trouvée.</p>
          )}

          {/* ── Catalogue entitlements (user_subscriptions) ── */}
          <div className="border-t border-teal-100 pt-5 mt-5 space-y-3 bg-teal-50/40 -mx-2 px-2 py-4 rounded-xl">
            <h3 className="font-semibold text-teal-900">Nouveau catalogue (plans + quotas)</h3>
            {catalogBundle?.catalog ? (
              <div className="text-sm text-gray-700 space-y-1">
                <p>
                  <span className="text-gray-500">Plan :</span>{' '}
                  <strong>{String((catalogBundle.catalog as { planNameFr?: string }).planNameFr ?? '—')}</strong>
                  {' '}(
                  <code className="text-xs bg-white px-1 rounded">
                    {String((catalogBundle.catalog as { planCode?: string }).planCode ?? '—')}
                  </code>
                  ) · statut :{' '}
                  <strong>{String((catalogBundle.catalog as { status?: string }).status ?? '—')}</strong>
                </p>
                <p className="text-gray-500">
                  Fin période :{' '}
                  {fmt(String((catalogBundle.catalog as { currentPeriodEndAt?: string | null }).currentPeriodEndAt ?? null))}
                </p>
                {catalogBundle.usage?.counters && catalogBundle.usage.counters.length > 0 && (
                  <ul className="list-disc list-inside text-xs text-gray-600 mt-2">
                    {catalogBundle.usage.counters.map(c => (
                      <li key={c.counterKey}>
                        {c.counterKey} : {c.remainingTotal} / {c.limitTotal}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500">Chargement catalogue impossible ou vide.</p>
            )}
            <div className="flex flex-wrap gap-2 items-end">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Plan catalogue</label>
                <select
                  value={catalogPlanCode}
                  onChange={e => setCatalogPlanCode(e.target.value)}
                  className="border border-teal-200 rounded-lg px-2 py-2 text-sm bg-white"
                >
                  {CATALOG_PLANS.map(p => (
                    <option key={p.code} value={p.code}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Jours</label>
                <input
                  type="number"
                  min={1}
                  max={3650}
                  value={catalogPeriodDays}
                  onChange={e => setCatalogPeriodDays(Number(e.target.value))}
                  className="w-24 border border-teal-200 rounded-lg px-2 py-2 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={grantCatalogSubscription}
                disabled={submitting}
                className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
              >
                Activer ce plan (catalogue)
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Ceci crée une ligne dans <code>user_subscriptions</code> (distinct de l’ancien <code>subscriptions.paid_until</code>).
            </p>
          </div>

          {/* ── Formulaire octroi ── */}
          <div className="border-t border-gray-100 pt-5 space-y-4">
            <h3 className="font-semibold text-gray-800">Octroyer un abonnement (legacy)</h3>

            {/* Sélecteur de plan */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PLANS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPlan(p.id)}
                  className={`text-left px-4 py-3 rounded-xl border-2 transition ${
                    selectedPlan === p.id
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-100 bg-gray-50 hover:border-gray-300'
                  }`}
                >
                  <p className="text-sm font-medium text-gray-900">{p.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {p.id !== 'custom' ? `${p.days} jours · ${p.price}` : 'Entrer manuellement'}
                  </p>
                </button>
              ))}
            </div>

            {/* Durée custom */}
            {selectedPlan === 'custom' && (
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-600">Nombre de jours :</label>
                <input
                  type="number"
                  min={1}
                  max={3650}
                  value={customDays}
                  onChange={e => setCustomDays(Number(e.target.value))}
                  className="w-28 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
            )}

            {/* Note interne */}
            <div>
              <label className="block text-sm text-gray-600 mb-1">Note interne (optionnel)</label>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Ex: Paiement CCP reçu le 19/04/2026"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>

            {/* Résumé */}
            <div className="bg-indigo-50 rounded-xl px-4 py-3 text-sm text-indigo-800">
              <span className="font-medium">Résumé :</span> Octroyer{' '}
              <strong>
                {activePlan.id === 'custom' ? customDays : activePlan.days} jours
              </strong>{' '}
              ({activePlan.label}) à <strong>{selectedUser.full_name}</strong>
            </div>

            {/* Message retour */}
            {message && (
              <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
                message.type === 'ok'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-red-100 text-red-800'
              }`}>
                {message.text}
              </div>
            )}

            {/* Boutons */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={grantSubscription}
                disabled={submitting}
                className="flex-1 bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition"
              >
                {submitting ? '…' : '✅ Octroyer l\'abonnement'}
              </button>
              {subInfo?.status === 'active' && (
                <button
                  onClick={revokeSubscription}
                  disabled={submitting}
                  className="bg-red-50 text-red-700 border border-red-200 px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-red-100 disabled:opacity-50 transition"
                >
                  Révoquer
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
