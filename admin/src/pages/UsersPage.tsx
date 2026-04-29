import React, { useEffect, useState, useCallback } from 'react';
import { adminUsersApi } from '../api/typed';

const FACULTY_LABELS: Record<string, string> = {
  sciences: 'العلوم', medicine: 'الطب', law: 'الحقوق',
  economics: 'الاقتصاد', arts: 'الآداب', engineering: 'الهندسة', islamic: 'الشريعة',
};

export default function UsersPage() {
  const [tab, setTab]         = useState<'all' | 'pending'>('pending');
  const [users, setUsers]     = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [query, setQuery]     = useState('');
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string>('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminUsersApi.list(page, query);
      setUsers(data);
    } catch (e: any) { console.error(e); }
    finally { setLoading(false); }
  }, [page, query]);

  const loadPending = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminUsersApi.pending();
      setPending(data);
    } catch (e: any) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (tab === 'all')     loadAll();
    else                   loadPending();
  }, [tab, loadAll, loadPending]);

  const handleBan = async (id: string, ban: boolean) => {
    if (!confirm(ban ? 'تعليق هذا الحساب؟' : 'رفع التعليق عن هذا الحساب؟')) return;
    setActionLoadingId(id);
    try {
      await adminUsersApi.ban(id, ban);
      showToast(ban ? '✅ تم تعليق الحساب' : '✅ تم رفع التعليق');
      loadAll();
    } catch (e: any) {
      showToast(e?.message || 'حدث خطأ');
      console.error('[users] ban failed', e);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleVerify = async (id: string) => {
    setActionLoadingId(id);
    try {
      await adminUsersApi.verify(id);
      showToast('✅ تم توثيق الحساب');
      loadAll();
    } catch (e: any) {
      showToast(e?.message || 'حدث خطأ');
      console.error('[users] verify failed', e);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleApprove = async (id: string) => {
    setActionLoadingId(id);
    try {
      await adminUsersApi.approve(id);
      showToast('✅ تم قبول الحساب');
      // Refresh both tabs data (in case user is visible in "all")
      await Promise.all([loadPending(), loadAll().catch(() => {})]);
    } catch (e: any) {
      showToast(e?.message || 'حدث خطأ');
      console.error('[users] approve failed', e);
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-5 py-3 rounded-2xl shadow-xl text-sm font-medium">
          {toast}
        </div>
      )}
      {/* Header + tabs */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">المستخدمون</h1>
        <div className="flex gap-2">
          <button
            onClick={() => { setTab('pending'); }}
            className={`px-4 py-2 rounded-xl text-sm font-medium border transition ${
              tab === 'pending'
                ? 'bg-yellow-500 text-white border-yellow-500'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            ⏳ في انتظار الموافقة
            {pending.length > 0 && tab !== 'pending' && (
              <span className="ml-2 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
                {pending.length}
              </span>
            )}
          </button>
          <button
            onClick={() => { setTab('all'); }}
            className={`px-4 py-2 rounded-xl text-sm font-medium border transition ${
              tab === 'all'
                ? 'bg-green-600 text-white border-green-600'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            👥 جميع المستخدمين
          </button>
        </div>
      </div>

      {/* ── PENDING TAB ── */}
      {tab === 'pending' && (
        <>
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-yellow-500" />
            </div>
          ) : pending.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 text-center">
              <div className="text-4xl mb-3">✅</div>
              <p className="text-gray-500">لا يوجد حسابات في انتظار الموافقة</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="bg-yellow-50 px-5 py-3 border-b border-yellow-100 text-right text-sm text-yellow-800 font-medium">
                {pending.length} حساب ينتظر موافقتك للدخول إلى التطبيق
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-right px-5 py-3 text-gray-500 font-medium">إجراء</th>
                    <th className="text-right px-5 py-3 text-gray-500 font-medium">تاريخ التسجيل</th>
                    <th className="text-right px-5 py-3 text-gray-500 font-medium">الكلية / السنة</th>
                    <th className="text-right px-5 py-3 text-gray-500 font-medium">المستخدم</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pending.map(u => (
                    <tr key={u.id} className="hover:bg-yellow-50 transition">
                      <td className="px-5 py-4">
                        <button
                          onClick={() => handleApprove(u.id)}
                          disabled={actionLoadingId === u.id}
                          className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium"
                        >
                          {actionLoadingId === u.id ? '...' : '✅ قبول'}
                        </button>
                      </td>
                      <td className="px-5 py-4 text-gray-400 text-xs">
                        {new Date(u.created_at).toLocaleDateString('ar-SA')}
                      </td>
                      <td className="px-5 py-4 text-gray-500 text-xs text-right">
                        {FACULTY_LABELS[u.faculty] || u.faculty}{u.filiere ? ` › ${u.filiere}` : ''} — س{u.year}
                      </td>
                      <td className="px-5 py-4">
                        <div className="text-right">
                          <div className="font-medium text-gray-900">{u.full_name}</div>
                          <div className="text-xs text-gray-400">{u.email}</div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── ALL USERS TAB ── */}
      {tab === 'all' && (
        <>
          <div className="mb-4">
            <input
              type="text"
              placeholder="بحث بالاسم أو البريد..."
              value={query}
              onChange={e => { setQuery(e.target.value); setPage(1); }}
              className="px-4 py-2 border border-gray-200 rounded-xl text-right text-sm w-64 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600" />
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-right px-5 py-3 text-gray-500 font-medium">إجراءات</th>
                    <th className="text-right px-5 py-3 text-gray-500 font-medium">رفع / تحميل</th>
                    <th className="text-right px-5 py-3 text-gray-500 font-medium">الكلية / السنة</th>
                    <th className="text-right px-5 py-3 text-gray-500 font-medium">الدور</th>
                    <th className="text-right px-5 py-3 text-gray-500 font-medium">الاسم</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {users.map(u => (
                    <tr key={u.id} className={`hover:bg-gray-50 transition ${u.is_banned ? 'opacity-50' : ''}`}>
                      <td className="px-5 py-4">
                        <div className="flex gap-2 flex-wrap">
                          {!u.is_approved && (
                            <button
                              onClick={() => handleApprove(u.id)}
                              disabled={actionLoadingId === u.id}
                              className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded-lg border border-green-200 hover:bg-green-100 font-medium"
                            >{actionLoadingId === u.id ? '...' : '✅ قبول'}</button>
                          )}
                          {!u.is_verified && (
                            <button
                              onClick={() => handleVerify(u.id)}
                              disabled={actionLoadingId === u.id}
                              className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded-lg border border-blue-200 hover:bg-blue-100"
                            >{actionLoadingId === u.id ? '...' : 'توثيق'}</button>
                          )}
                          <button
                            onClick={() => handleBan(u.id, !u.is_banned)}
                            disabled={actionLoadingId === u.id}
                            className={`px-2 py-1 text-xs rounded-lg border transition ${
                              u.is_banned
                                ? 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100'
                                : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                            }`}
                          >
                            {actionLoadingId === u.id ? '...' : (u.is_banned ? 'رفع التعليق' : 'تعليق')}
                          </button>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-gray-500 text-xs">
                        ⬆ {u.total_uploads} / ⬇ {u.total_downloads}
                      </td>
                      <td className="px-5 py-4 text-gray-500 text-xs text-right">
                        {FACULTY_LABELS[u.faculty] || u.faculty}{u.filiere ? ` › ${u.filiere}` : ''} — س{u.year}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          u.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                          u.role === 'moderator' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="text-right">
                          <div className="font-medium text-gray-900 flex items-center justify-end gap-2">
                            {u.is_verified  && <span className="text-green-500 text-xs">✓</span>}
                            {u.is_banned    && <span className="text-red-400 text-xs">🚫</span>}
                            {!u.is_approved && <span className="text-yellow-500 text-xs">⏳</span>}
                            {u.full_name}
                          </div>
                          <div className="text-xs text-gray-400">{u.email}</div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {users.length === 0 && (
                <div className="text-center py-12 text-gray-400">لا يوجد مستخدمون</div>
              )}
            </div>
          )}

          <div className="flex justify-center gap-2 mt-6">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm disabled:opacity-40">
              السابق
            </button>
            <span className="px-4 py-2 text-sm text-gray-500">صفحة {page}</span>
            <button onClick={() => setPage(p => p + 1)} disabled={users.length < 20}
              className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm disabled:opacity-40">
              التالي
            </button>
          </div>
        </>
      )}
    </div>
  );
}
