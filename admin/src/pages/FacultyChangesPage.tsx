import React, { useEffect, useState, useCallback } from 'react';
import { adminFacultyChangesApi } from '../api/typed';

interface FacultyChangeRequest {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  current_faculty: string;
  current_university: string;
  current_year: number;
  new_faculty: string | null;
  new_university: string | null;
  new_year: number | null;
  current_filiere: string | null;
  new_filiere: string | null;
  status: 'pending' | 'approved' | 'rejected';
  admin_note: string | null;
  created_at: string;
}

const STATUS_TABS = [
  { key: 'pending',  label: 'معلّق',   color: 'text-yellow-700 bg-yellow-50 border-yellow-200' },
  { key: 'approved', label: 'موافق',   color: 'text-green-700  bg-green-50  border-green-200'  },
  { key: 'rejected', label: 'مرفوض',  color: 'text-red-700    bg-red-50    border-red-200'     },
];

export default function FacultyChangesPage() {
  const [tab,      setTab]      = useState('pending');
  const [requests, setRequests] = useState<FacultyChangeRequest[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminFacultyChangesApi.list(tab);
      setRequests(data);
    } catch (e: any) { console.error(e); }
    finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (id: string) => {
    if (!confirm('الموافقة على هذا التغيير؟ سيتم تحديث بيانات المستخدم فوراً.')) return;
    try {
      await adminFacultyChangesApi.approve(id);
      setRequests(r => r.filter(x => x.id !== id));
    } catch (e: any) { alert(e.message); }
  };

  const handleRejectSubmit = async () => {
    if (!rejectId) return;
    try {
      await adminFacultyChangesApi.reject(rejectId, noteText.trim() || undefined);
      setRequests(r => r.filter(x => x.id !== rejectId));
      setRejectId(null);
      setNoteText('');
    } catch (e: any) { alert(e.message); }
  };

  const diff = (label: string, current: string | number | null, next: string | number | null) => {
    if (!next) return null;
    return (
      <span className="text-xs">
        <span className="font-medium text-gray-600">{label}: </span>
        <span className="line-through text-red-400">{current ?? '—'}</span>
        <span className="mx-1 text-gray-400">→</span>
        <span className="font-semibold text-green-700">{next}</span>
      </span>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">طلبات تغيير التخصص</h1>
        <button onClick={load} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
          🔄 تحديث
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        {STATUS_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 text-sm font-semibold rounded-full border transition ${
              tab === t.key ? t.color : 'text-gray-500 bg-white border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <div className="text-center py-16 text-gray-400">جارٍ التحميل…</div>}

      {!loading && requests.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">✅</div>
          <p>لا توجد طلبات في هذه الفئة</p>
        </div>
      )}

      {!loading && requests.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-5 py-3 text-right">المستخدم</th>
                <th className="px-5 py-3 text-right">التغييرات المطلوبة</th>
                <th className="px-5 py-3 text-right">تاريخ الطلب</th>
                {tab === 'pending' && <th className="px-5 py-3 text-center">الإجراء</th>}
                {tab === 'rejected' && <th className="px-5 py-3 text-right">السبب</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {requests.map(r => (
                <tr key={r.id} className="hover:bg-gray-50 transition">
                  <td className="px-5 py-4">
                    <div className="font-medium text-gray-900">{r.full_name}</div>
                    <div className="text-gray-400 font-mono text-xs">{r.email}</div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-col gap-1">
                      {diff('الجامعة', r.current_university, r.new_university)}
                      {diff('الكلية', r.current_faculty, r.new_faculty)}
                      {diff('الفيلير', r.current_filiere, r.new_filiere)}
                      {diff('السنة', r.current_year, r.new_year)}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-gray-400 text-xs">
                    {new Date(r.created_at).toLocaleString('ar-EG')}
                  </td>
                  {tab === 'pending' && (
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleApprove(r.id)}
                          className="px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 transition"
                        >
                          ✅ موافقة
                        </button>
                        <button
                          onClick={() => { setRejectId(r.id); setNoteText(''); }}
                          className="px-3 py-1.5 bg-red-100 text-red-600 text-xs font-semibold rounded-lg hover:bg-red-200 transition"
                        >
                          ❌ رفض
                        </button>
                      </div>
                    </td>
                  )}
                  {tab === 'rejected' && (
                    <td className="px-5 py-4 text-xs text-gray-500 italic">{r.admin_note ?? '—'}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Reject Modal */}
      {rejectId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-96" dir="rtl">
            <h2 className="text-lg font-bold text-gray-900 mb-4">رفض الطلب</h2>
            <label className="block text-sm text-gray-600 mb-1">سبب الرفض (اختياري)</label>
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="مثال: بيانات غير صحيحة"
              className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-300"
              rows={3}
            />
            <div className="flex gap-2 mt-4 justify-end">
              <button
                onClick={() => setRejectId(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition"
              >
                إلغاء
              </button>
              <button
                onClick={handleRejectSubmit}
                className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition"
              >
                تأكيد الرفض
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
