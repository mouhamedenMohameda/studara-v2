/**
 * AIChatUsagePage — Admin panel
 *
 * Dashboard showing:
 *  - Summary stats (total credits, users, estimated cost)
 *  - Daily activity chart (last 7/14/30 days)
 *  - Per-user credit leaderboard
 *  - Model cost breakdown reference
 */

import React, { useEffect, useState, useCallback } from 'react';
import { adminAiUsageApi } from '../api/typed';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DailyStat {
  date: string;
  total_credits: number;
  active_users: number;
}

interface UserStat {
  id: string;
  email: string;
  full_name: string;
  total_credits: number;
  active_days: number;
  last_active: string;
}

interface Summary {
  total_users: number;
  total_credits: number;
  avg_credits_per_user_day: number;
  estimated_cost_usd: number;
  period_days: number;
}

interface StatsResponse {
  summary: Summary;
  daily: DailyStat[];
  perUser: UserStat[];
  routing?: null | {
    daily: Array<{ date: string; route_tier: string; requests: number }>;
    summary: Array<{ route_tier: string; requests: number; avg_complexity: number | null; avg_words: number | null }>;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
const fmtCost = (usd: number) => `$${usd.toFixed(2)}`;

function routeTierLabel(t: string) {
  const key = (t || '').toLowerCase();
  if (key === 'vip') return { label: 'VIP', emoji: '👑', color: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200' };
  if (key === 'pro') return { label: 'Pro', emoji: '💠', color: 'bg-sky-100 text-sky-800 border-sky-200' };
  if (key === 'premium_strong') return { label: 'Premium+', emoji: '💎', color: 'bg-purple-100 text-purple-800 border-purple-200' };
  if (key === 'premium_light') return { label: 'Premium', emoji: '✨', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' };
  return { label: 'Standard', emoji: '⚡', color: 'bg-gray-100 text-gray-700 border-gray-200' };
}

// ─── Simple bar chart ────────────────────────────────────────────────────────

function BarChart({ data, maxVal }: { data: DailyStat[]; maxVal: number }) {
  if (!data.length) return <p className="text-gray-400 text-sm text-center py-4">Aucune donnée</p>;
  return (
    <div className="flex items-end gap-1 h-32 w-full">
      {data.map(d => {
        const pct = maxVal > 0 ? (d.total_credits / maxVal) * 100 : 0;
        return (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
            <div
              className="w-full rounded-t bg-violet-500 transition-all duration-200 group-hover:bg-violet-400 min-h-[2px]"
              style={{ height: `${Math.max(pct, 1)}%` }}
            />
            {/* Tooltip */}
            <div className="absolute bottom-full mb-1 hidden group-hover:block z-10 bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap pointer-events-none">
              {fmtDate(d.date)}<br />
              ⚡ {d.total_credits} crédits<br />
              👥 {d.active_users} users
            </div>
            <span className="text-[9px] text-gray-400 rotate-45 origin-left mt-1 hidden sm:block">
              {fmtDate(d.date)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AIChatUsagePage() {
  const [days, setDays]   = useState(7);
  const [data, setData]   = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminAiUsageApi.usageStats(days) as StatsResponse;
      setData(res);
    } catch (e: any) {
      setError(e.message ?? 'Erreur');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const maxCredits = data ? Math.max(...data.daily.map(d => d.total_credits), 1) : 1;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900">🤖 Utilisation IA — Ara Chat</h1>
          <p className="text-gray-500 text-sm mt-1">Crédits consommés · Coût estimé · Activité par utilisateur</p>
        </div>
        <div className="flex gap-2">
          {[7, 14, 30].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-4 py-2 rounded-lg text-sm font-700 transition-colors ${
                days === d
                  ? 'bg-violet-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {d}j
            </button>
          ))}
          <button
            onClick={load}
            className="px-4 py-2 rounded-lg text-sm font-bold bg-gray-100 text-gray-600 hover:bg-gray-200"
          >
            🔄
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-violet-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : data && (
        <>
          {/* ── Summary Cards ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                label: 'Utilisateurs actifs',
                value: data.summary.total_users,
                icon: '👥',
                color: 'bg-blue-50 border-blue-200',
                textColor: 'text-blue-700',
              },
              {
                label: 'Crédits consommés',
                value: data.summary.total_credits?.toLocaleString(),
                icon: '⚡',
                color: 'bg-violet-50 border-violet-200',
                textColor: 'text-violet-700',
              },
              {
                label: 'Coût estimé',
                value: fmtCost(data.summary.estimated_cost_usd ?? 0),
                icon: '💵',
                color: 'bg-green-50 border-green-200',
                textColor: 'text-green-700',
              },
              {
                label: 'Moy. crédits/user/jour',
                value: Math.round(data.summary.avg_credits_per_user_day ?? 0),
                icon: '📊',
                color: 'bg-orange-50 border-orange-200',
                textColor: 'text-orange-700',
              },
            ].map(card => (
              <div key={card.label} className={`rounded-2xl border p-5 ${card.color}`}>
                <p className="text-2xl mb-1">{card.icon}</p>
                <p className={`text-3xl font-black ${card.textColor}`}>{card.value}</p>
                <p className="text-sm text-gray-500 mt-1">{card.label}</p>
                <p className="text-xs text-gray-400">sur {days} jours</p>
              </div>
            ))}
          </div>

          {/* ── Daily chart ─────────────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h2 className="text-base font-bold text-gray-800 mb-4">📈 Crédits par jour</h2>
            <BarChart data={data.daily} maxVal={maxCredits} />
          </div>

          {/* ── Routing tiers (no model leakage) ───────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-base font-bold text-gray-800">🧭 Routage IA (tiers)</h2>
                <p className="text-xs text-gray-400 mt-1">
                  Affiche uniquement le niveau de routage (standard/premium/pro/vip). Aucun modèle n’est exposé.
                </p>
              </div>
              {!data.routing && (
                <span className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                  Routing DB désactivé
                </span>
              )}
            </div>

            {!data.routing ? (
              <div className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-xl p-4">
                Active `AI_ROUTING_LOG_DB=true` côté API pour voir les stats de routage ici.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  {data.routing.summary.map((s) => {
                    const cfg = routeTierLabel(s.route_tier);
                    return (
                      <div key={s.route_tier} className={`rounded-xl border p-4 ${cfg.color}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-lg">{cfg.emoji}</span>
                          <span className="text-xs opacity-70">{days}j</span>
                        </div>
                        <div className="mt-2 text-2xl font-black">{s.requests}</div>
                        <div className="mt-1 text-xs font-semibold">{cfg.label}</div>
                        <div className="mt-2 text-[11px] opacity-70">
                          avg score: {typeof s.avg_complexity === 'number' ? s.avg_complexity.toFixed(2) : '—'} · avg words: {typeof s.avg_words === 'number' ? Math.round(s.avg_words) : '—'}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm border border-gray-200 rounded-xl overflow-hidden">
                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                      <tr>
                        <th className="px-4 py-3 text-left">Date</th>
                        <th className="px-4 py-3 text-left">Tier</th>
                        <th className="px-4 py-3 text-center">Requêtes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.routing.daily.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-6 text-center text-gray-400">Aucune donnée routing</td>
                        </tr>
                      ) : data.routing.daily.slice(-40).map((r, idx) => {
                        const cfg = routeTierLabel(r.route_tier);
                        return (
                          <tr key={`${r.date}-${r.route_tier}-${idx}`} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-gray-700">{fmtDate(r.date)}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs border ${cfg.color}`}>
                                {cfg.emoji} {cfg.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center font-semibold text-gray-800">{r.requests}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* ── Per-user table ───────────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-800">👤 Top utilisateurs ({data.perUser.length})</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">#</th>
                    <th className="px-4 py-3 text-left">Utilisateur</th>
                    <th className="px-4 py-3 text-center">Crédits total</th>
                    <th className="px-4 py-3 text-center">Jours actifs</th>
                    <th className="px-4 py-3 text-center">Moy/jour</th>
                    <th className="px-4 py-3 text-center">Coût estimé</th>
                    <th className="px-4 py-3 text-center">Dernière activité</th>
                    <th className="px-4 py-3 text-center">Utilisation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.perUser.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                        Aucune activité sur cette période
                      </td>
                    </tr>
                  ) : data.perUser.map((u, i) => {
                    const avgPerDay = u.active_days > 0 ? Math.round(u.total_credits / u.active_days) : 0;
                    const costUsd = +(u.total_credits * 0.002).toFixed(3);
                    const usagePct = Math.min(100, Math.round((avgPerDay / 150) * 100));
                    const usageColor =
                      usagePct > 80 ? 'bg-red-500' :
                      usagePct > 50 ? 'bg-orange-500' : 'bg-green-500';
                    return (
                      <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-gray-400 font-bold">{i + 1}</td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-gray-900">{u.full_name}</p>
                          <p className="text-gray-400 text-xs">{u.email}</p>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-bold text-violet-700">⚡ {u.total_credits}</span>
                        </td>
                        <td className="px-4 py-3 text-center text-gray-600">{u.active_days}j</td>
                        <td className="px-4 py-3 text-center text-gray-600">{avgPerDay}</td>
                        <td className="px-4 py-3 text-center text-green-700 font-semibold">${costUsd}</td>
                        <td className="px-4 py-3 text-center text-gray-400 text-xs">
                          {fmtDate(u.last_active)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-100 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full ${usageColor}`}
                                style={{ width: `${usagePct}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-500 w-10 text-right">{usagePct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
