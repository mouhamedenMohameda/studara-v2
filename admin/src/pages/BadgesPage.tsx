import React, { useState } from 'react';
import { adminBadgesApi } from '../api/typed';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface Badge {
  id: string;
  slug: string;
  name_fr: string;
  name_ar: string;
  emoji: string;
  color: string;
  condition_type: string;
  threshold: number;
  xp_reward: number;
  description_fr?: string;
  is_active: boolean;
  created_at: string;
  earned_count?: number;
}

const CONDITION_TYPES = [
  { value: 'uploads_count',  label: 'Nombre de partages' },
  { value: 'streak_days',    label: 'Jours de suite (streak)' },
  { value: 'xp_total',      label: 'XP total accumulé' },
  { value: 'cards_reviewed', label: 'Cartes flashcard révisées' },
];

const DEFAULT_COLORS = ['#8B5CF6', '#6366F1', '#EF4444', '#F97316', '#F59E0B', '#06B6D4', '#0EA5E9', '#059669'];

const EMPTY_FORM = {
  slug: '', name_fr: '', name_ar: '', emoji: '🏅',
  color: '#F59E0B', condition_type: 'uploads_count', threshold: 1, xp_reward: 50,
  description_fr: '',
};

export default function BadgesPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const { data: badges = [], isLoading } = useQuery<Badge[]>({
    queryKey: ['admin-badges'],
    queryFn:  () => adminBadgesApi.list() as any,
    staleTime: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminBadgesApi.delete(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['admin-badges'] }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => adminBadgesApi.toggle(id, active),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['admin-badges'] }),
  });

  const handleSave = async () => {
    setError('');
    if (!form.slug.trim() || !form.name_fr.trim() || !form.name_ar.trim()) {
      setError('slug, name_fr et name_ar sont obligatoires');
      return;
    }
    setSaving(true);
    try {
      await adminBadgesApi.create(form as any);
      qc.invalidateQueries({ queryKey: ['admin-badges'] });
      setShowForm(false);
      setForm(EMPTY_FORM);
    } catch (e: any) {
      setError(e.message || 'Erreur serveur');
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof typeof form, label: string, type = 'text') => (
    <div key={key}>
      <label className="block text-xs font-semibold text-gray-500 mb-1">{label}</label>
      <input
        type={type}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        value={String(form[key])}
        onChange={e => setForm(prev => ({ ...prev, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
      />
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🏅 Badges</h1>
          <p className="text-sm text-gray-500 mt-1">{badges.length} badges définis</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
        >
          {showForm ? '✕ Fermer' : '+ Nouveau badge'}
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
          <h2 className="text-base font-bold text-gray-800 mb-4">Créer un badge</h2>
          {error && <div className="text-red-600 text-sm bg-red-50 rounded-lg px-4 py-2 mb-4">{error}</div>}
          <div className="grid grid-cols-2 gap-4">
            {field('slug',        'Slug (unique, ex: first_upload)')}
            {field('emoji',       'Emoji')}
            {field('name_fr',     'Nom (FR)')}
            {field('name_ar',     'Nom (AR)')}
            {field('description_fr', 'Description (FR)')}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Condition</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                value={form.condition_type}
                onChange={e => setForm(prev => ({ ...prev, condition_type: e.target.value }))}
              >
                {CONDITION_TYPES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            {field('threshold', 'Seuil (valeur)', 'number')}
            {field('xp_reward', 'Récompense XP',  'number')}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Couleur</label>
              <div className="flex gap-2 flex-wrap mt-1">
                {DEFAULT_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setForm(prev => ({ ...prev, color: c }))}
                    style={{ backgroundColor: c }}
                    className={`w-7 h-7 rounded-full transition-transform ${form.color === c ? 'scale-125 ring-2 ring-offset-1 ring-gray-400' : ''}`}
                  />
                ))}
                <input
                  type="color"
                  value={form.color}
                  onChange={e => setForm(prev => ({ ...prev, color: e.target.value }))}
                  className="w-7 h-7 rounded-full border-0 cursor-pointer"
                  title="Couleur personnalisée"
                />
              </div>
            </div>
          </div>
          <div className="mt-5 flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-xl text-sm font-semibold disabled:opacity-60 transition-colors"
            >
              {saving ? 'Enregistrement...' : '✓ Enregistrer'}
            </button>
            <button
              onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setError(''); }}
              className="border border-gray-200 text-gray-600 px-6 py-2 rounded-xl text-sm font-semibold"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Badges Grid */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Chargement...</div>
      ) : badges.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-3">🏅</div>
          <p>Aucun badge défini</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {badges.map((badge: Badge) => (
            <div
              key={badge.id}
              className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col gap-3 ${!badge.is_active ? 'opacity-50' : ''}`}
            >
              {/* Top */}
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                  style={{ backgroundColor: badge.color + '22' }}
                >
                  {badge.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 text-sm truncate">{badge.name_fr}</p>
                  <p className="text-gray-500 text-xs truncate">{badge.name_ar}</p>
                  <p className="text-gray-400 text-xs mt-0.5 font-mono">{badge.slug}</p>
                </div>
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: badge.color }}
                />
              </div>

              {/* Meta */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-gray-50 rounded-lg p-2">
                  <p className="text-xs font-bold text-gray-700">
                    {CONDITION_TYPES.find(c => c.value === badge.condition_type)?.label.split(' ')[0] ?? badge.condition_type}
                  </p>
                  <p className="text-xs text-gray-500">condition</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2">
                  <p className="text-xs font-bold text-gray-700">{badge.threshold}</p>
                  <p className="text-xs text-gray-500">seuil</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-2">
                  <p className="text-xs font-bold text-amber-700">+{badge.xp_reward} XP</p>
                  <p className="text-xs text-gray-500">récompense</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1 border-t border-gray-100">
                <button
                  onClick={() => toggleMutation.mutate({ id: badge.id, active: !badge.is_active })}
                  className={`flex-1 text-xs font-semibold py-1.5 rounded-lg transition-colors ${
                    badge.is_active
                      ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      : 'bg-green-50 text-green-700 hover:bg-green-100'
                  }`}
                >
                  {badge.is_active ? '⏸ Désactiver' : '▶ Activer'}
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`Supprimer le badge "${badge.name_fr}" ?`)) {
                      deleteMutation.mutate(badge.id);
                    }
                  }}
                  className="text-xs font-semibold py-1.5 px-3 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                >
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
