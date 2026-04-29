import React, { useEffect, useState, useCallback } from 'react';
import { adminRemindersApi } from '../api/typed';

interface PendingReminder {
  id: string;
  title: string;
  description: string | null;
  reminder_type: string;
  scheduled_at: string;
  submitter_name: string;
  submitted_by: string;
  created_at: string;
}

const TYPE_LABEL: Record<string, string> = {
  exam:       'امتحان',
  assignment: 'واجب',
  course:     'محاضرة',
  other:      'أخرى',
};

const TYPE_COLOR: Record<string, string> = {
  exam:       'bg-red-100 text-red-700',
  assignment: 'bg-purple-100 text-purple-700',
  course:     'bg-blue-100 text-blue-700',
  other:      'bg-gray-100 text-gray-600',
};

export default function RemindersPage() {
  const [list, setList]         = useState<PendingReminder[]>([]);
  const [loading, setLoading]   = useState(true);
  const [acting, setActing]     = useState<string | null>(null);
  const [toast, setToast]       = useState<string | null>(null);
  const [tab, setTab]           = useState<'pending' | 'history'>('pending');
  const [history, setHistory]   = useState<any[]>([]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const fetchPending = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminRemindersApi.pending();
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const data = await adminRemindersApi.global();
      setHistory(Array.isArray(data) ? data.filter((r: any) => r.status !== 'pending') : []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchPending();
    fetchHistory();
  }, [fetchPending, fetchHistory]);

  const approve = async (id: string) => {
    setActing(id);
    try {
      await adminRemindersApi.approve(id);
      showToast('✅ تم الاعتماد بنجاح');
      fetchPending();
      fetchHistory();
    } catch {
      showToast('❌ حدث خطأ');
    } finally {
      setActing(null);
    }
  };

  const reject = async (id: string) => {
    setActing(id);
    try {
      await adminRemindersApi.reject(id);
      showToast('🚫 تم الرفض');
      fetchPending();
      fetchHistory();
    } catch {
      showToast('❌ حدث خطأ');
    } finally {
      setActing(null);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-6" dir="rtl">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">إدارة التذكيرات</h1>
          <p className="text-sm text-gray-500 mt-1">مراجعة وقبول التذكيرات العامة المُرسلة من الطلاب</p>
        </div>
        {list.length > 0 && (
          <span className="bg-amber-100 text-amber-800 text-sm font-bold px-4 py-1.5 rounded-full">
            {list.length} قيد المراجعة
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 pb-0">
        <button
          onClick={() => setTab('pending')}
          className={`px-5 py-2.5 text-sm font-semibold rounded-t-lg transition ${tab === 'pending' ? 'bg-white border border-b-white border-gray-200 text-amber-700 -mb-px' : 'text-gray-500 hover:text-gray-700'}`}
        >
          ⏳ قيد المراجعة {list.length > 0 && `(${list.length})`}
        </button>
        <button
          onClick={() => setTab('history')}
          className={`px-5 py-2.5 text-sm font-semibold rounded-t-lg transition ${tab === 'history' ? 'bg-white border border-b-white border-gray-200 text-green-700 -mb-px' : 'text-gray-500 hover:text-gray-700'}`}
        >
          📋 السجل
        </button>
      </div>

      {/* Pending Tab */}
      {tab === 'pending' && (
        loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full" />
          </div>
        ) : list.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-3">🎉</div>
            <p className="text-gray-500 font-medium">لا توجد تذكيرات تنتظر المراجعة</p>
          </div>
        ) : (
          <div className="space-y-3">
            {list.map(r => (
              <div key={r.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${TYPE_COLOR[r.reminder_type] || TYPE_COLOR.other}`}>
                        {TYPE_LABEL[r.reminder_type] || r.reminder_type}
                      </span>
                      <span className="text-xs text-gray-400">📅 {formatDate(r.scheduled_at)}</span>
                    </div>
                    <h3 className="text-gray-900 font-semibold text-base">{r.title}</h3>
                    {r.description && (
                      <p className="text-gray-500 text-sm mt-1">{r.description}</p>
                    )}
                    <div className="flex items-center gap-1 mt-2 text-xs text-gray-400">
                      <span>👤 بواسطة:</span>
                      <span className="font-medium text-gray-600">{r.submitter_name || 'مجهول'}</span>
                      <span className="mx-1">•</span>
                      <span>أُرسل {formatDate(r.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => approve(r.id)}
                      disabled={acting === r.id}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition disabled:opacity-50"
                    >
                      {acting === r.id ? '...' : '✓ قبول'}
                    </button>
                    <button
                      onClick={() => reject(r.id)}
                      disabled={acting === r.id}
                      className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 text-sm font-semibold rounded-xl transition disabled:opacity-50"
                    >
                      {acting === r.id ? '...' : '✕ رفض'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* History Tab */}
      {tab === 'history' && (
        history.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-400">لا يوجد سجل بعد</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <th className="px-4 py-3 text-right font-semibold">العنوان</th>
                  <th className="px-4 py-3 text-right font-semibold">النوع</th>
                  <th className="px-4 py-3 text-right font-semibold">مُقدَّم من</th>
                  <th className="px-4 py-3 text-right font-semibold">تاريخ الحدث</th>
                  <th className="px-4 py-3 text-right font-semibold">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {history.map((r: any) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3 text-gray-800 font-medium">{r.title}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${TYPE_COLOR[r.reminder_type] || TYPE_COLOR.other}`}>
                        {TYPE_LABEL[r.reminder_type] || r.reminder_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{r.submitter_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-400">{formatDate(r.scheduled_at)}</td>
                    <td className="px-4 py-3">
                      {r.status === 'approved' ? (
                        <span className="bg-green-100 text-green-700 text-xs font-bold px-2.5 py-0.5 rounded-full">معتمد</span>
                      ) : r.status === 'rejected' ? (
                        <span className="bg-red-100 text-red-700 text-xs font-bold px-2.5 py-0.5 rounded-full">مرفوض</span>
                      ) : (
                        <span className="bg-gray-100 text-gray-500 text-xs font-bold px-2.5 py-0.5 rounded-full">{r.status}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
