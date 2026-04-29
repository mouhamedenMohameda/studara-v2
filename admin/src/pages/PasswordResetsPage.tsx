import React, { useEffect, useState, useCallback } from 'react';
import { adminPasswordResetsApi } from '../api/typed';

interface ResetRequest {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  created_at: string;
}

export default function PasswordResetsPage() {
  const [requests, setRequests] = useState<ResetRequest[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [deprecated] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminPasswordResetsApi.list();
      setRequests(data);
    } catch (e: any) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (id: string) => {
    alert('تم إيقاف الموافقة اليدوية على إعادة تعيين كلمة المرور. استخدم "الموافقة من جهاز موثوق" داخل التطبيق.');
  };

  const handleReject = async (id: string) => {
    alert('تم إيقاف الرفض اليدوي. الطلبات تُدار الآن داخل التطبيق (جهاز موثوق).');
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">طلبات إعادة كلمة المرور</h1>
        <button
          onClick={load}
          className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          🔄 تحديث
        </button>
      </div>

      {deprecated && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900">
          <div className="font-bold mb-1">ℹ️ تم إيقاف هذا النظام</div>
          <div className="text-sm leading-6">
            تمت ترقية إعادة تعيين كلمة المرور إلى نظام أكثر أماناً: <b>الموافقة من جهاز موثوق</b>.
            هذه الصفحة أصبحت للمتابعة فقط (read-only).
          </div>
        </div>
      )}

      {loading && (
        <div className="text-center py-16 text-gray-400">جارٍ التحميل…</div>
      )}

      {!loading && requests.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">✅</div>
          <p>لا توجد طلبات معلّقة</p>
        </div>
      )}

      {!loading && requests.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-5 py-3 text-right">المستخدم</th>
                <th className="px-5 py-3 text-right">البريد الإلكتروني</th>
                <th className="px-5 py-3 text-right">تاريخ الطلب</th>
                <th className="px-5 py-3 text-center">الإجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {requests.map(r => (
                <tr key={r.id} className="hover:bg-gray-50 transition">
                  <td className="px-5 py-4 font-medium text-gray-900">{r.full_name}</td>
                  <td className="px-5 py-4 text-gray-500 font-mono text-xs">{r.email}</td>
                  <td className="px-5 py-4 text-gray-400 text-xs">
                    {new Date(r.created_at).toLocaleString('ar-EG')}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleApprove(r.id)}
                        className="px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 transition"
                      >
                        ✅ موافقة
                      </button>
                      <button
                        onClick={() => handleReject(r.id)}
                        className="px-3 py-1.5 bg-red-100 text-red-600 text-xs font-semibold rounded-lg hover:bg-red-200 transition"
                      >
                        ❌ رفض
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
