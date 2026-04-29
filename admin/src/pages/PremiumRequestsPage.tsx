/**
 * PremiumRequestsPage
 *
 * Admin panel page to manage per-feature premium subscription requests.
 * Users submit a payment screenshot from a Mauritanian bank app.
 * Admin can: view the screenshot, approve (→ grants access instantly) or reject.
 */

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { getToken } from '../api/client';
import { adminPremiumRequestsApi } from '../api/typed';

// Fetch an authenticated image and return a blob URL
function useAuthImage(url: string | null) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!url) return;
    let revoked = false;
    const token = getToken() || localStorage.getItem('admin_token');
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.blob() : Promise.reject())
      .then(blob => {
        if (!revoked) setBlobUrl(URL.createObjectURL(blob));
      })
      .catch(() => setBlobUrl(null));
    return () => { revoked = true; };
  }, [url]);
  return blobUrl;
}
import { api } from '../api/client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FeatureRequest {
  id:              string;
  feature_key:     string;
  label_ar:        string;
  label_fr:        string;
  bank_name:       string;
  screenshot_url:  string;
  amount_paid_mru: number | null;
  note:            string | null;
  status:          'pending' | 'approved' | 'rejected';
  admin_note:      string | null;
  created_at:      string;
  reviewed_at:     string | null;
  user_id:         string;
  full_name:       string;
  email:           string;
  price_mru:       number;
  duration_days:   number;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

const apiGetRequests = (status: string, page: number) =>
  adminPremiumRequestsApi.list(status, page);

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: FeatureRequest['status'] }) {
  const cfg = {
    pending:  { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'قيد الانتظار' },
    approved: { bg: 'bg-green-100',  text: 'text-green-800',  label: 'مقبول'        },
    rejected: { bg: 'bg-red-100',    text: 'text-red-800',    label: 'مرفوض'        },
  }[status];

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      {status === 'pending' ? '⏳' : status === 'approved' ? '✅' : '❌'} {cfg.label}
    </span>
  );
}

// ─── Authenticated image component ───────────────────────────────────────────

function AuthImg({ src, alt, className, style }: { src: string; alt: string; className?: string; style?: React.CSSProperties }) {
  const blobUrl = useAuthImage(src);
  if (!blobUrl) return (
    <div className={className} style={{ ...style, background: '#1e1b4b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  return <img src={blobUrl} alt={alt} className={className} style={style} />;
}

// ─── Screenshot lightbox ──────────────────────────────────────────────────────

function ScreenshotModal({ url, onClose, userName }: { url: string; onClose: () => void; userName?: string }) {
  const [zoom, setZoom]     = useState(1);
  const [loaded, setLoaded] = useState(false);
  const imgRef              = useRef<HTMLImageElement>(null);
  const blobUrl             = useAuthImage(url);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.min(4, Math.max(0.5, z - e.deltaY * 0.001)));
  };

  const download = () => {
    const a = document.createElement('a');
    a.href     = blobUrl || url;
    a.download = `receipt-${Date.now()}.jpg`;
    a.target   = '_blank';
    a.click();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'rgba(5,5,15,0.94)', backdropFilter: 'blur(12px)' }}
    >
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-6 py-4 z-10 flex-shrink-0"
           style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-500/20 flex items-center justify-center text-lg">📸</div>
          <div>
            <p className="text-white font-semibold text-sm">إيصال الدفع</p>
            {userName && <p className="text-gray-400 text-xs">{userName}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <div className="flex items-center gap-1 bg-white/10 rounded-xl px-3 py-1.5">
            <button onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
                    className="text-white/70 hover:text-white text-lg font-light w-6 h-6 flex items-center justify-center transition-colors">−</button>
            <span className="text-white/60 text-xs w-12 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(4, z + 0.25))}
                    className="text-white/70 hover:text-white text-lg font-light w-6 h-6 flex items-center justify-center transition-colors">+</button>
          </div>

          <button onClick={() => setZoom(1)}
                  className="bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1.5 rounded-xl transition-colors">
            إعادة ضبط
          </button>

          <button onClick={download}
                  className="bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            تحميل
          </button>

          <button onClick={onClose}
                  className="w-9 h-9 rounded-xl bg-white/10 hover:bg-red-500/30 text-white hover:text-red-300 flex items-center justify-center transition-colors text-lg">
            ✕
          </button>
        </div>
      </div>

      {/* ── Image area ── */}
      <div
        className="flex-1 overflow-auto flex items-center justify-center p-8 cursor-zoom-in"
        onWheel={handleWheel}
        onClick={onClose}
      >
        {/* Phone frame */}
        <div
          className="relative transition-transform duration-150"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Subtle phone bezel */}
          <div className="rounded-[2.5rem] p-2"
               style={{ background: 'linear-gradient(145deg,#2a2a3e,#1a1a2e)', boxShadow: '0 30px 80px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.1)' }}>
            {/* Notch */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 w-20 h-4 bg-black/60 rounded-full z-10" />

            {/* Screen */}
            <div className="rounded-[2rem] overflow-hidden"
                 style={{ background: '#000', minWidth: 280, maxWidth: 380 }}>
              {!loaded && (
                <div className="w-72 h-[520px] flex items-center justify-center bg-gray-900">
                  <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              <img
                ref={imgRef}
                src={blobUrl || undefined}
                alt="Payment receipt"
                onLoad={() => setLoaded(true)}
                className="block max-w-[380px] w-full"
                style={{ display: loaded ? 'block' : 'none', maxHeight: '75vh', objectFit: 'contain' }}
              />
            </div>
          </div>

          {/* Home indicator */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-24 h-1 bg-white/20 rounded-full" />
        </div>
      </div>

      {/* ── Bottom hint ── */}
      <div className="flex-shrink-0 pb-4 flex justify-center">
        <p className="text-white/30 text-xs">اضغط خارج الصورة أو Esc للإغلاق • استخدم عجلة الفأرة للتكبير</p>
      </div>
    </div>
  );
}

// ─── Action modal (approve / reject) ─────────────────────────────────────────

function ActionModal({
  request,
  action,
  onConfirm,
  onClose,
  loading,
}: {
  request:   FeatureRequest;
  action:    'approve' | 'reject';
  onConfirm: (note: string) => void;
  onClose:   () => void;
  loading:   boolean;
}) {
  const [note, setNote] = useState('');
  const isApprove = action === 'approve';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className={`px-5 py-4 ${isApprove ? 'bg-green-50 border-b border-green-100' : 'bg-red-50 border-b border-red-100'}`}>
          <h3 className={`font-bold text-lg ${isApprove ? 'text-green-800' : 'text-red-800'}`}>
            {isApprove ? '✅ قبول الطلب' : '❌ رفض الطلب'}
          </h3>
          <p className="text-sm text-gray-500 mt-0.5">
            {request.full_name} — {request.label_ar}
          </p>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {isApprove && (
            <div className="bg-green-50 rounded-xl p-3 text-sm text-green-700 border border-green-200">
              ✔ سيتم إضافة <strong>{(request.amount_paid_mru ?? request.price_mru ?? 0).toLocaleString()} أوقية</strong> إلى محفظة المستخدم فور القبول، ويمكنه الاستخدام فوراً.
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {isApprove ? 'ملاحظة للمستخدم (اختياري)' : 'سبب الرفض (مطلوب)'}
            </label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={3}
              placeholder={isApprove ? 'تم التحقق من الدفع...' : 'الإيصال غير واضح / المبلغ غير مطابق...'}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium disabled:opacity-50"
          >
            إلغاء
          </button>
          <button
            onClick={() => onConfirm(note)}
            disabled={loading || (!isApprove && !note.trim())}
            className={`px-5 py-2 text-sm font-semibold text-white rounded-xl disabled:opacity-50 transition-colors ${
              isApprove
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {loading ? '...' : isApprove ? 'قبول وتفعيل' : 'رفض'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Request card ─────────────────────────────────────────────────────────────

function RequestCard({
  req,
  onApprove,
  onReject,
  onViewScreenshot,
}: {
  req:               FeatureRequest;
  onApprove:         (r: FeatureRequest) => void;
  onReject:          (r: FeatureRequest) => void;
  onViewScreenshot:  (url: string, user?: string) => void;
}) {
  const date = new Date(req.created_at).toLocaleString('ar-MR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      {/* Top bar: user + status */}
      <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">{req.full_name}</p>
          <p className="text-xs text-gray-400 truncate">{req.email}</p>
        </div>
        <StatusBadge status={req.status} />
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-3">
        {/* Feature */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center text-lg">
            {req.feature_key === 'whisper_studio' ? '🎙️' : req.feature_key === 'ai_flashcards' ? '🃏' : '📖'}
          </div>
          <div>
            <p className="font-medium text-gray-900 text-sm">{req.label_ar}</p>
            <p className="text-xs text-gray-400">{req.label_fr}</p>
          </div>
        </div>

        {/* Bank + Amount */}
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full font-medium">
            🏦 {req.bank_name}
          </span>
          {req.amount_paid_mru && (
            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full font-medium">
              💰 {req.amount_paid_mru.toLocaleString()} أوقية
            </span>
          )}
          <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full">
            🕐 {date}
          </span>
        </div>

        {/* User note */}
        {req.note && (
          <div className="bg-gray-50 rounded-xl px-3 py-2 text-sm text-gray-600 italic">
            "{req.note}"
          </div>
        )}

        {/* Screenshot preview — phone-style thumbnail */}
        <button
          onClick={() => onViewScreenshot(req.screenshot_url, req.full_name)}
          className="w-full group relative rounded-2xl overflow-hidden transition-all hover:scale-[1.01]"
          style={{ background: 'linear-gradient(135deg,#1e1b4b,#312e81)', boxShadow: '0 4px 20px rgba(79,70,229,0.25)' }}
        >
          {/* Phone frame hint */}
          <div className="relative mx-auto my-3" style={{ width: 110 }}>
            <div className="rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl"
                 style={{ background: '#000' }}>
              <AuthImg
                src={req.screenshot_url}
                alt="Payment"
                className="w-full object-cover"
                style={{ height: 120 }}
              />
            </div>
            {/* Home bar */}
            <div className="mx-auto mt-1 w-8 h-0.5 rounded-full bg-white/30" />
          </div>

          {/* Overlay on hover */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
               style={{ background: 'rgba(79,70,229,0.5)', backdropFilter: 'blur(2px)' }}>
            <div className="flex flex-col items-center gap-1">
              <svg className="w-7 h-7 text-white drop-shadow" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0015.803 15.803z"/>
              </svg>
              <span className="text-white text-xs font-semibold">عرض الإيصال</span>
            </div>
          </div>

          {/* Bottom label */}
          <div className="pb-2 flex justify-center">
            <span className="text-white/50 text-[10px]">اضغط لعرض بالحجم الكامل</span>
          </div>
        </button>

        {/* Admin note (if reviewed) */}
        {req.admin_note && (
          <div className={`rounded-xl px-3 py-2 text-xs ${
            req.status === 'approved' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            <strong>ملاحظة الإدارة: </strong>{req.admin_note}
          </div>
        )}
      </div>

      {/* Actions (only for pending) */}
      {req.status === 'pending' && (
        <div className="px-5 pb-4 flex gap-2">
          <button
            onClick={() => onApprove(req)}
            className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            ✅ قبول وتفعيل
          </button>
          <button
            onClick={() => onReject(req)}
            className="flex-1 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 text-sm font-semibold rounded-xl transition-colors"
          >
            ❌ رفض
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Pricing config panel ─────────────────────────────────────────────────────

interface FeaturePricing {
  key:               string;
  label_ar:          string;
  label_fr:          string;
  billing_unit:      string;
  cost_per_unit_mru: number;
  min_recharge_mru:  number;
}

const BILLING_UNIT_LABELS: Record<string, string> = {
  per_use:       'لكل استخدام',
  per_minute:    'لكل دقيقة',
  per_card:      'لكل بطاقة',
  per_100_chars: 'لكل 100 حرف',
};

const FEATURE_ICONS: Record<string, string> = {
  whisper_studio: '🎙️',
  ai_flashcards:  '🃏',
  ai_course:      '📖',
};

// Important: do not display internal model/provider names or costs in the UI.
const TRANSCRIPTION_MODEL_META: Record<string, { label: string; badge: string; color: string }> = {
  'gpt-4o-transcribe':      { label: 'Transcription (Standard)', badge: '⭐', color: '#6366F1' },
  'gpt-4o-mini-transcribe': { label: 'Transcription (Eco)',      badge: '⚡', color: '#8B5CF6' },
  'groq-whisper':           { label: 'Transcription (Rapide)',   badge: '🔊', color: '#10B981' },
  'google-chirp':           { label: 'Transcription (Qualité)',  badge: '🔵', color: '#0EA5E9' },
};

const ENHANCEMENT_MODEL_META: Record<string, { label: string; badge: string; color: string }> = {
  'gpt-4o':       { label: 'Amélioration (Standard)', badge: '⭐', color: '#6366F1' },
  'gpt-4o-mini':  { label: 'Amélioration (Eco)',      badge: '⚡', color: '#8B5CF6' },
  'groq-llama':   { label: 'Amélioration (Rapide)',   badge: '🦙', color: '#10B981' },
  'gemini-flash': { label: 'Amélioration (Pro)',      badge: '💎', color: '#F59E0B' },
};

const CHAT_MODEL_META: Record<string, { label: string; badge: string; color: string }> = {
  'ara':      { label: 'Chat (Premium)',  badge: '🧠', color: '#7C3AED' },
  'deepseek': { label: 'Chat (Standard)', badge: '🔷', color: '#2563EB' },
  'gpt':      { label: 'Chat (Eco)',      badge: '⚡', color: '#10B981' },
};

function WhisperModelPricingPanel() {
  const [prices, setPrices]   = useState<Record<string, number>>({});
  const [edits, setEdits]     = useState<Record<string, number>>({});
  const [saving, setSaving]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast]     = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/v1/voice-notes/model-pricing', {
        headers: { Authorization: `Bearer ${getToken() || localStorage.getItem('admin_token')}` },
      });
      const data = await r.json();
      const flat: Record<string, number> = {};
      for (const [k, v] of Object.entries(data.transcription ?? {})) flat[k] = (v as any).pricePerMinMru;
      for (const [k, v] of Object.entries(data.enhancement   ?? {})) flat[k] = (v as any).pricePerActionMru;
      setPrices(flat);
      setEdits(flat);
    } catch { showToast('❌ فشل تحميل أسعار النماذج'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const save = async (key: string) => {
    setSaving(key);
    try {
      const r = await fetch('/api/v1/voice-notes/admin/model-pricing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() || localStorage.getItem('admin_token')}` },
        body: JSON.stringify({ [key]: edits[key] }),
      });
      if (!r.ok) throw new Error();
      setPrices(prev => ({ ...prev, [key]: edits[key] }));
      showToast(`✅ تم حفظ سعر ${TRANSCRIPTION_MODEL_META[key]?.label ?? ENHANCEMENT_MODEL_META[key]?.label ?? key}`);
    } catch { showToast('❌ فشل الحفظ'); }
    finally { setSaving(null); }
  };

  const renderModelRow = (key: string, meta: { label: string; badge: string; color: string }, unit: string) => {
    const isDirty = edits[key] !== prices[key];
    return (
      <div key={key} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
        <span className="text-sm w-5 text-center">{meta.badge}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-700">{meta.label}</p>
          <p className="text-[10px] text-gray-400">{key} · {unit}</p>
        </div>
        <div className="relative">
          <input
            type="number" min={0} step={0.05}
            value={edits[key] ?? 0}
            onChange={e => setEdits(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
            className="w-24 text-sm border rounded-lg px-2 py-1 pr-10 focus:outline-none focus:ring-2 focus:ring-indigo-400 text-right"
            style={{ borderColor: isDirty ? meta.color : undefined }}
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">MRU</span>
        </div>
        <button
          onClick={() => save(key)}
          disabled={!isDirty || saving === key}
          className="px-3 py-1 text-xs font-semibold rounded-lg transition-colors disabled:opacity-40 text-white"
          style={{ backgroundColor: meta.color }}
        >
          {saving === key ? '...' : 'حفظ'}
        </button>
      </div>
    );
  };

  if (loading) return (
    <div className="flex justify-center py-3">
      <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="mt-3 border-t border-indigo-100 pt-3">
      {toast && (
        <div className="text-xs text-center py-1.5 px-3 rounded-xl bg-gray-800 text-white font-medium mb-2">{toast}</div>
      )}
      <p className="text-[11px] font-semibold text-indigo-500 uppercase tracking-wide mb-2">🎙️ تسعير التفريغ — لكل دقيقة</p>
      {Object.entries(TRANSCRIPTION_MODEL_META).map(([k, m]) => renderModelRow(k, m, 'أوقية / دقيقة'))}
      <p className="text-[11px] font-semibold text-indigo-500 uppercase tracking-wide mt-3 mb-2">🤖 تسعير المعالجة بالذكاء الاصطناعي — لكل عملية</p>
      {Object.entries(ENHANCEMENT_MODEL_META).map(([k, m]) => renderModelRow(k, m, 'أوقية / عملية'))}
    </div>
  );
}

// ─── AI Chat Model Pricing Panel ─────────────────────────────────────────────

interface AiModelConfig {
  model_id: string;
  display_name: string;
  credit_cost: number;
  max_context_messages: number;
  max_output_tokens: number;
  daily_quota: number;
  is_enabled: boolean;
}

function AiChatModelPricingPanel() {
  const [models, setModels]   = useState<AiModelConfig[]>([]);
  const [edits, setEdits]     = useState<Record<string, Partial<AiModelConfig>>>({});
  const [saving, setSaving]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast]     = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/v1/admin/ai/model-config', {
        headers: { Authorization: `Bearer ${getToken() || localStorage.getItem('admin_token')}` },
      });
      const data = await r.json();
      if (Array.isArray(data)) {
        setModels(data);
        const init: Record<string, Partial<AiModelConfig>> = {};
        for (const m of data) init[m.model_id] = { ...m };
        setEdits(init);
      }
    } catch { showToast('❌ فشل تحميل إعدادات نماذج Ara'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const save = async (modelId: string) => {
    setSaving(modelId);
    try {
      const body = edits[modelId] ?? {};
      const r = await fetch(`/api/v1/admin/ai/model-config/${modelId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() || localStorage.getItem('admin_token')}` },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error();
      showToast(`✅ تم حفظ إعدادات ${CHAT_MODEL_META[modelId]?.label ?? modelId}`);
      load();
    } catch { showToast('❌ فشل الحفظ'); }
    finally { setSaving(null); }
  };

  if (loading) return (
    <div className="flex justify-center py-4">
      <div className="w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="mt-3 border-t border-purple-100 pt-3 space-y-3">
      {toast && (
        <div className="text-xs text-center py-1.5 px-3 rounded-xl bg-gray-800 text-white font-medium">{toast}</div>
      )}
      <p className="text-[11px] font-semibold text-purple-500 uppercase tracking-wide">🤖 تسعير نماذج Ara AI Chat — لكل رسالة</p>

      {models.map(model => {
        const meta = CHAT_MODEL_META[model.model_id] ?? { label: model.model_id, badge: '🤖', color: '#6B7280' };
        const edit = edits[model.model_id] ?? model;
        const isDirty = JSON.stringify(edit) !== JSON.stringify(model);

        return (
          <div key={model.model_id} className="bg-white rounded-xl border border-gray-100 p-4">
            {/* Header */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">{meta.badge}</span>
              <div className="flex-1">
                <p className="text-sm font-bold" style={{ color: meta.color }}>{meta.label}</p>
                <p className="text-[10px] text-gray-400">{model.model_id}</p>
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={edit.is_enabled ?? model.is_enabled}
                  onChange={e => setEdits(prev => ({ ...prev, [model.model_id]: { ...prev[model.model_id], is_enabled: e.target.checked } }))}
                  className="w-4 h-4 accent-purple-600"
                />
                <span className="text-xs text-gray-500">مفعّل</span>
              </label>
            </div>

            {/* Fields */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              {[
                { key: 'credit_cost',           label: 'تكلفة الرسالة (نقطة)',   min: 1, max: 100,  step: 1 },
                { key: 'daily_quota',            label: 'الحصة اليومية (نقطة)',   min: 10, max: 9999, step: 10 },
                { key: 'max_context_messages',   label: 'سياق الرسائل',           min: 2,  max: 50,   step: 1 },
                { key: 'max_output_tokens',      label: 'حد الإجابة (token)',      min: 200, max: 4096, step: 100 },
              ].map(({ key, label, min, max, step }) => (
                <div key={key}>
                  <label className="block text-[10px] text-gray-500 mb-1">{label}</label>
                  <input
                    type="number" min={min} max={max} step={step}
                    value={(edit as any)[key] ?? (model as any)[key]}
                    onChange={e => setEdits(prev => ({
                      ...prev,
                      [model.model_id]: { ...prev[model.model_id], [key]: parseInt(e.target.value) || 0 },
                    }))}
                    className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 text-center"
                    style={{ '--tw-ring-color': meta.color } as any}
                  />
                </div>
              ))}
            </div>

            <button
              onClick={() => save(model.model_id)}
              disabled={!isDirty || saving === model.model_id}
              className="w-full py-1.5 text-xs font-semibold rounded-lg text-white transition disabled:opacity-40"
              style={{ backgroundColor: meta.color }}
            >
              {saving === model.model_id ? '...' : 'حفظ التغييرات'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function PricingConfigPanel() {
  const [open,    setOpen]    = useState(false);
  const [pricing, setPricing] = useState<FeaturePricing[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving,  setSaving]  = useState<string | null>(null);
  const [edits,   setEdits]   = useState<Record<string, Partial<FeaturePricing>>>({});
  const [toast,   setToast]   = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/v1/billing/admin/pricing', {
        headers: { Authorization: `Bearer ${getToken() || localStorage.getItem('admin_token')}` },
      });
      const data = await r.json();
      if (Array.isArray(data)) {
        setPricing(data);
        // Initialize edits with current values
        const init: Record<string, Partial<FeaturePricing>> = {};
        for (const f of data) init[f.key] = { cost_per_unit_mru: f.cost_per_unit_mru, billing_unit: f.billing_unit };
        setEdits(init);
      }
    } catch {
      showToast('❌ فشل تحميل إعدادات التسعير');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && pricing.length === 0) load();
  }, [open]);

  const save = async (key: string) => {
    setSaving(key);
    try {
      const body = edits[key] ?? {};
      const r = await fetch(`/api/v1/billing/admin/pricing/${key}`, {
        method:  'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${getToken() || localStorage.getItem('admin_token')}`,
        },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error();
      showToast(`✅ تم حفظ سعر ${key}`);
      load();
    } catch {
      showToast('❌ فشل الحفظ، حاول مرة أخرى');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="mb-6 rounded-2xl border border-indigo-100 bg-indigo-50/40 overflow-hidden">
      {/* Toggle header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-indigo-50/60 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">⚙️</span>
          <div>
            <p className="font-semibold text-indigo-900 text-sm">إعدادات التسعير</p>
            <p className="text-xs text-indigo-400">تحديد تكلفة كل عملية ذكاء اصطناعي بالأوقية</p>
          </div>
        </div>
        <span className="text-indigo-400 text-lg transition-transform" style={{ transform: open ? 'rotate(180deg)' : '' }}>▾</span>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-3">
          {loading ? (
            <div className="flex justify-center py-6">
              <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {toast && (
                <div className="text-xs text-center py-2 px-3 rounded-xl bg-gray-800 text-white font-medium">{toast}</div>
              )}
              {pricing.map(f => {
                const edit = edits[f.key] ?? {};
                const isDirty = edit.cost_per_unit_mru !== f.cost_per_unit_mru || edit.billing_unit !== f.billing_unit;
                return (
                  <div key={f.key} className="bg-white rounded-xl border border-gray-100 p-4 flex flex-wrap gap-4 items-end">
                    {/* Feature name */}
                    <div className="flex items-center gap-2 min-w-[140px]">
                      <span className="text-xl">{FEATURE_ICONS[f.key] ?? '✨'}</span>
                      <div>
                        <p className="font-semibold text-gray-800 text-sm">{f.label_ar || f.key}</p>
                        <p className="text-[11px] text-gray-400">{f.key}</p>
                      </div>
                    </div>

                    {/* Billing unit select */}
                    <div className="flex-1 min-w-[150px]">
                      <label className="block text-xs text-gray-500 mb-1">وحدة الفوترة</label>
                      <select
                        value={edit.billing_unit ?? f.billing_unit}
                        onChange={e => setEdits(prev => ({ ...prev, [f.key]: { ...prev[f.key], billing_unit: e.target.value } }))}
                        className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      >
                        {Object.entries(BILLING_UNIT_LABELS).map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Cost input */}
                    <div className="flex-1 min-w-[120px]">
                      <label className="block text-xs text-gray-500 mb-1">التكلفة (أوقية)</label>
                      <div className="relative">
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          value={edit.cost_per_unit_mru ?? f.cost_per_unit_mru}
                          onChange={e => setEdits(prev => ({ ...prev, [f.key]: { ...prev[f.key], cost_per_unit_mru: parseFloat(e.target.value) } }))}
                          className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">MRU</span>
                      </div>
                    </div>

                    {/* Save button */}
                    <button
                      onClick={() => save(f.key)}
                      disabled={!isDirty || saving === f.key}
                      className="px-4 py-1.5 text-sm font-semibold rounded-lg transition-colors disabled:opacity-40 bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                      {saving === f.key ? '...' : 'حفظ'}
                    </button>
                    {/* Per-model pricing sub-panel — only for whisper_studio */}
                    {f.key === 'whisper_studio' && (
                      <div className="w-full">
                        <WhisperModelPricingPanel />
                      </div>
                    )}
                  </div>
                );
              })}
              {pricing.length === 0 && (
                <p className="text-center text-sm text-gray-400 py-4">لا توجد ميزات في قاعدة البيانات</p>
              )}

              {/* AI Chat Model Config — always shown */}
              <div className="bg-white rounded-xl border border-purple-100 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">🤖</span>
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">نماذج Ara AI Chat</p>
                    <p className="text-[11px] text-gray-400">tiers: eco · standard · premium</p>
                  </div>
                </div>
                <AiChatModelPricingPanel />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PremiumRequestsPage() {
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [page,         setPage]         = useState(1);
  const [requests,     setRequests]     = useState<FeatureRequest[]>([]);
  const [total,        setTotal]        = useState(0);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');

  const [screenshotUrl,  setScreenshotUrl]  = useState<string | null>(null);
  const [screenshotUser, setScreenshotUser] = useState<string | undefined>(undefined);
  const [actionTarget,   setActionTarget]   = useState<FeatureRequest | null>(null);
  const [actionType,    setActionType]    = useState<'approve' | 'reject'>('approve');
  const [actionLoading, setActionLoading] = useState(false);
  const [toast,         setToast]         = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/v1/billing/feature-requests?status=${statusFilter}&page=${page}&limit=20`,
        { headers: { Authorization: `Bearer ${getToken() || localStorage.getItem('admin_token')}` } },
      );
      if (!res.ok) throw new Error();
      const data = await res.json();
      setRequests(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setError('فشل تحميل الطلبات');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => { load(); }, [load]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleConfirm = async (note: string) => {
    if (!actionTarget) return;
    setActionLoading(true);
    try {
      if (actionType === 'approve') {
        await adminPremiumRequestsApi.approve(actionTarget.id, note);
        showToast('✅ تم قبول الطلب وتفعيل الوصول');
      } else {
        await adminPremiumRequestsApi.reject(actionTarget.id, note);
        showToast('❌ تم رفض الطلب');
      }
      setActionTarget(null);
      load();
    } catch (e: unknown) {
      const status = (e as any)?.status;
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === 'string'
            ? e
            : JSON.stringify(e);
      // Surface the real error (helps diagnose server/proxy/token issues)
      const full = `${status ? `HTTP ${status} — ` : ''}${msg || ''}`.trim();
      showToast(full && full.length < 220 ? full : 'حدث خطأ، حاول مرة أخرى');
      // eslint-disable-next-line no-console
      console.error('[premium-requests] action failed', e);
    } finally {
      setActionLoading(false);
    }
  };

  const totalPages = Math.ceil(total / 20);

  const visibleRequests = useMemo(
    () => requests.filter(r => r.feature_key !== 'ara_chat'),
    [requests],
  );

  return (
    <div className="p-6 max-w-5xl mx-auto" dir="rtl">
      {/* Toast */}
      {toast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-5 py-3 rounded-2xl shadow-xl text-sm font-medium animate-pulse">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">💎 طلبات الاشتراك المدفوع</h1>
          <p className="text-sm text-gray-400 mt-0.5">مراجعة إيصالات الدفع والموافقة على الوصول للميزات</p>
        </div>
        <button
          onClick={load}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-xl transition-colors"
        >
          🔄 تحديث
        </button>
      </div>

      {/* Pricing config panel */}
      <PricingConfigPanel />

      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <strong>Chat Studara+ :</strong> les demandes <code className="text-xs bg-amber-100 px-1 rounded">ara_chat</code> (Ara
        Premium par capture) ne sont plus proposées côté app — abonnement catalogue uniquement (migration 031). Les lignes
        historiques restent en base mais sont masquées ici.
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
        {(['pending', 'approved', 'rejected'] as const).map(s => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              statusFilter === s
                ? 'bg-white shadow text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {s === 'pending' ? '⏳ قيد الانتظار' : s === 'approved' ? '✅ مقبول' : '❌ مرفوض'}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-purple-600 rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-16 text-red-500">{error}</div>
      ) : visibleRequests.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-5xl mb-3">📭</div>
          <p className="text-gray-400">لا توجد طلبات {statusFilter === 'pending' ? 'قيد الانتظار' : statusFilter === 'approved' ? 'مقبولة' : 'مرفوضة'}</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-400 mb-4">
            {visibleRequests.length} طلب معروض
            {requests.length !== visibleRequests.length ? ` (${requests.length - visibleRequests.length} ara_chat مخفي)` : ''}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {visibleRequests.map(req => (
              <RequestCard
                key={req.id}
                req={req}
                onApprove={r => { setActionTarget(r); setActionType('approve'); }}
                onReject={r  => { setActionTarget(r); setActionType('reject');  }}
                onViewScreenshot={(url, user) => { setScreenshotUrl(url); setScreenshotUser(user); }}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-8">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 text-sm bg-white border border-gray-200 rounded-xl disabled:opacity-40 hover:bg-gray-50"
              >
                السابق
              </button>
              <span className="text-sm text-gray-500">{page} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 text-sm bg-white border border-gray-200 rounded-xl disabled:opacity-40 hover:bg-gray-50"
              >
                التالي
              </button>
            </div>
          )}
        </>
      )}

      {/* Screenshot modal */}
      {screenshotUrl && (
        <ScreenshotModal url={screenshotUrl} userName={screenshotUser} onClose={() => { setScreenshotUrl(null); setScreenshotUser(undefined); }} />
      )}

      {/* Approve / Reject modal */}
      {actionTarget && (
        <ActionModal
          request={actionTarget}
          action={actionType}
          onConfirm={handleConfirm}
          onClose={() => setActionTarget(null)}
          loading={actionLoading}
        />
      )}
    </div>
  );
}
