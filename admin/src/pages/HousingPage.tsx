import React, { useEffect, useState, useCallback } from 'react';
import { adminHousingApi } from '../api/typed';

interface HousingListing {
  id: string;
  user_id: string;
  poster_name: string;
  poster_email: string;
  title: string;
  title_ar?: string;
  type: 'studio' | 'chambre' | 'appartement' | 'colocation';
  price: number;
  area?: string;
  description?: string;
  phone?: string;
  whatsapp?: string;
  furnished: boolean;
  features: string[];
  status: 'pending' | 'approved' | 'rejected';
  reject_reason?: string;
  created_at: string;
}

const TYPE_LABELS: Record<string, string> = {
  studio: 'Studio', chambre: 'Chambre', appartement: 'Appartement', colocation: 'Colocation',
};
const TYPE_COLORS: Record<string, string> = {
  studio: 'bg-purple-100 text-purple-700', chambre: 'bg-blue-100 text-blue-700',
  appartement: 'bg-green-100 text-green-700', colocation: 'bg-orange-100 text-orange-700',
};
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  approved: 'bg-green-100 text-green-700 border-green-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
};
const STATUS_LABELS: Record<string, string> = {
  pending: '⏳ قيد المراجعة', approved: '✅ مقبول', rejected: '❌ مرفوض',
};

export default function HousingPage() {
  const [listings, setListings]   = useState<HousingListing[]>([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [selected, setSelected]   = useState<HousingListing | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [actioning, setActioning] = useState(false);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminHousingApi.list() as HousingListing[];
      setListings(data);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchListings(); }, [fetchListings]);

  const filtered = listings.filter(l => l.status === tab);

  const pending  = listings.filter(l => l.status === 'pending').length;
  const approved = listings.filter(l => l.status === 'approved').length;
  const rejected = listings.filter(l => l.status === 'rejected').length;

  const handleApprove = async (id: string) => {
    setActioning(true);
    try {
      await adminHousingApi.moderate(id, 'approve');
      await fetchListings();
      if (selected?.id === id) setSelected(null);
    } catch (e: any) { alert(e.message); }
    finally { setActioning(false); }
  };

  const handleReject = async (id: string) => {
    setActioning(true);
    try {
      await adminHousingApi.moderate(id, 'reject', rejectReason || undefined);
      setShowRejectBox(false);
      setRejectReason('');
      await fetchListings();
      if (selected?.id === id) setSelected(null);
    } catch (e: any) { alert(e.message); }
    finally { setActioning(false); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('حذف هذا الإعلان نهائياً؟')) return;
    setActioning(true);
    try {
      await adminHousingApi.delete(id);
      await fetchListings();
      if (selected?.id === id) setSelected(null);
    } catch (e: any) { alert(e.message); }
    finally { setActioning(false); }
  };

  return (
    <div className="p-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">سكن الطلاب 🏠</h1>
          <p className="text-sm text-gray-400 mt-0.5">{listings.length} إعلان إجمالاً</p>
        </div>
        <button
          onClick={fetchListings}
          className="flex items-center gap-2 text-sm border border-gray-200 px-3 py-1.5 rounded-xl hover:bg-gray-50 transition"
        >
          🔄 تحديث
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 mb-5">
        {([
          { key: 'pending',  label: 'قيد المراجعة', count: pending,  color: 'bg-yellow-500' },
          { key: 'approved', label: 'مقبولة',        count: approved, color: 'bg-green-500'  },
          { key: 'rejected', label: 'مرفوضة',        count: rejected, color: 'bg-red-500'    },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition ${
              tab === t.key
                ? 'bg-white border-gray-300 shadow-sm text-gray-900'
                : 'border-transparent text-gray-500 hover:bg-gray-100'
            }`}
          >
            {t.label}
            <span className={`${t.color} text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      <div className="flex gap-5">
        {/* List */}
        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-20 text-gray-400">جاري التحميل...</div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-2 text-gray-400">
                <span className="text-4xl">🏠</span>
                <p className="text-sm">لا توجد إعلانات</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {filtered.map(l => (
                  <div
                    key={l.id}
                    className={`p-4 cursor-pointer hover:bg-gray-50 transition ${selected?.id === l.id ? 'bg-teal-50 border-r-4 border-teal-500' : ''}`}
                    onClick={() => { setSelected(l); setShowRejectBox(false); }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${TYPE_COLORS[l.type] ?? ''}`}>
                            {TYPE_LABELS[l.type] ?? l.type}
                          </span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${STATUS_COLORS[l.status]}`}>
                            {STATUS_LABELS[l.status]}
                          </span>
                          {l.furnished && (
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">🪑 مفروش</span>
                          )}
                        </div>
                        <p className="font-semibold text-gray-900 text-sm truncate">{l.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {l.poster_name} · {l.area ?? '—'} · {l.price.toLocaleString()} أوقية/م
                        </p>
                      </div>
                      <p className="text-xs text-gray-400 flex-shrink-0">
                        {new Date(l.created_at).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="w-80 flex-shrink-0">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sticky top-4">
              <div className="flex items-start justify-between mb-4">
                <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
                <span className={`text-xs font-bold px-2 py-1 rounded-full border ${STATUS_COLORS[selected.status]}`}>
                  {STATUS_LABELS[selected.status]}
                </span>
              </div>

              {/* Info */}
              <h2 className="text-base font-bold text-gray-900 mb-1 text-right">{selected.title}</h2>
              {selected.title_ar && <p className="text-sm text-gray-500 mb-3 text-right">{selected.title_ar}</p>}

              <div className="space-y-2 mb-4 text-sm text-right">
                <div className="flex justify-between"><span className="text-gray-400">الناشر</span><span className="font-medium">{selected.poster_name}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">البريد</span><span className="font-medium text-xs">{selected.poster_email}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">النوع</span><span className="font-medium">{TYPE_LABELS[selected.type]}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">السعر</span><span className="font-bold text-teal-600">{selected.price.toLocaleString()} أوقية/م</span></div>
                <div className="flex justify-between"><span className="text-gray-400">المنطقة</span><span className="font-medium">{selected.area ?? '—'}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">الأثاث</span><span>{selected.furnished ? '🪑 مفروش' : '🚫 غير مفروش'}</span></div>
                {selected.phone    && <div className="flex justify-between"><span className="text-gray-400">الهاتف</span><span className="font-medium">{selected.phone}</span></div>}
                {selected.whatsapp && <div className="flex justify-between"><span className="text-gray-400">واتساب</span><span className="font-medium">{selected.whatsapp}</span></div>}
              </div>

              {selected.features.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs text-gray-400 mb-1 text-right">المميزات</p>
                  <div className="flex flex-wrap gap-1 justify-end">
                    {selected.features.map((f, i) => (
                      <span key={i} className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">{f}</span>
                    ))}
                  </div>
                </div>
              )}

              {selected.description && (
                <div className="mb-4">
                  <p className="text-xs text-gray-400 mb-1 text-right">الوصف</p>
                  <p className="text-xs text-gray-600 leading-relaxed text-right line-clamp-5">{selected.description}</p>
                </div>
              )}

              {selected.reject_reason && (
                <div className="mb-4 p-3 bg-red-50 rounded-xl border border-red-100">
                  <p className="text-xs font-semibold text-red-600 mb-1">سبب الرفض:</p>
                  <p className="text-xs text-red-500">{selected.reject_reason}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col gap-2 mt-4">
                {selected.status !== 'approved' && (
                  <button
                    onClick={() => handleApprove(selected.id)}
                    disabled={actioning}
                    className="w-full bg-green-600 hover:bg-green-700 text-white text-sm font-semibold py-2 rounded-xl transition disabled:opacity-50"
                  >
                    ✅ قبول
                  </button>
                )}
                {selected.status !== 'rejected' && !showRejectBox && (
                  <button
                    onClick={() => setShowRejectBox(true)}
                    disabled={actioning}
                    className="w-full border border-red-200 text-red-600 hover:bg-red-50 text-sm font-semibold py-2 rounded-xl transition disabled:opacity-50"
                  >
                    ❌ رفض
                  </button>
                )}
                {showRejectBox && (
                  <div className="flex flex-col gap-2">
                    <textarea
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)}
                      placeholder="سبب الرفض (اختياري)"
                      rows={2}
                      className="w-full border border-red-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-red-400 text-right resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleReject(selected.id)}
                        disabled={actioning}
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-2 rounded-xl transition disabled:opacity-50"
                      >
                        تأكيد الرفض
                      </button>
                      <button
                        onClick={() => { setShowRejectBox(false); setRejectReason(''); }}
                        className="px-3 text-gray-400 hover:text-gray-600 text-sm"
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                )}
                <button
                  onClick={() => handleDelete(selected.id)}
                  disabled={actioning}
                  className="w-full border border-gray-200 text-gray-500 hover:bg-gray-50 text-xs py-1.5 rounded-xl transition disabled:opacity-50"
                >
                  🗑️ حذف
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
