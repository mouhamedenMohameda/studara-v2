import React, { useEffect, useState } from 'react';
import { adminDashboardApi } from '../api/typed';

interface Stats {
  totalUsers: number;
  totalResources: number;
  pendingModeration: number;
  totalReminders: number;
}

interface Analytics {
  newUsersJ7: number;
  newUsersJ30: number;
  activeUploaders7d: number;
  topResources: { title: string; faculty: string; downloads: number; likes: number; resource_type: string }[];
  facultyBreakdown: { faculty: string; count: string }[];
  uploadsByDay: { day: string; uploads: string }[];
}

const Card = ({ icon, label, value, color, sub }: { icon: string; label: string; value: number | string; color: string; sub?: string }) => (
  <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
    <div className="text-3xl mb-3">{icon}</div>
    <div className={`text-3xl font-bold ${color}`}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
    <div className="text-sm text-gray-500 mt-1">{label}</div>
    {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
  </div>
);

const FACULTY_LABELS: Record<string, string> = {
  sciences: 'العلوم', medicine: 'الطب', law: 'الحقوق',
  economics: 'الاقتصاد', arts: 'الآداب', engineering: 'الهندسة', islamic: 'الشريعة',
};

const TYPE_LABELS: Record<string, string> = {
  note: 'ملاحظات', past_exam: 'امتحانات', summary: 'ملخصات',
  exercise: 'تمارين', project: 'مشروع', presentation: 'عرض', video_course: 'فيديو',
};

export default function DashboardPage() {
  const [stats,     setStats]     = useState<Stats | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [error,     setError]     = useState('');

  useEffect(() => {
    Promise.all([adminDashboardApi.stats(), adminDashboardApi.analytics()])
      .then(([s, a]) => { setStats(s as Stats); setAnalytics(a as Analytics); })
      .catch(e => setError(e.message));
  }, []);

  const maxUploads = analytics
    ? Math.max(...analytics.uploadsByDay.map(d => parseInt(d.uploads)), 1)
    : 1;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6 text-right">لوحة التحكم</h1>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-right">
          {error}
        </div>
      )}

      {!stats ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600 ml-3" />
          <span>جارٍ التحميل...</span>
        </div>
      ) : (
        <>
          {/* ── KPI cards ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
            <Card icon="👥" label="إجمالي المستخدمين"   value={stats.totalUsers}              color="text-blue-600" />
            <Card icon="🆕" label="مستخدمون جدد (7 أيام)"  value={analytics?.newUsersJ7 ?? '—'}   color="text-indigo-600" />
            <Card icon="📅" label="مستخدمون جدد (30 يوم)" value={analytics?.newUsersJ30 ?? '—'}  color="text-sky-600" />
            <Card icon="📚" label="الموارد المنشورة"    value={stats.totalResources}           color="text-green-600" />
            <Card icon="⏳" label="بانتظار المراجعة"   value={stats.pendingModeration}        color="text-amber-600" />
            <Card icon="✏️" label="رافعون نشطون (7 أيام)" value={analytics?.activeUploaders7d ?? '—'} color="text-teal-600" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* ── Uploads per day sparkline ─────────────────────────── */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-base font-bold text-gray-800 text-right mb-4">📈 الرفع اليومي (14 يوماً)</h2>
              {analytics?.uploadsByDay.length ? (
                <div className="flex items-end gap-1 h-24" dir="ltr">
                  {analytics.uploadsByDay.map((d) => {
                    const pct = Math.round((parseInt(d.uploads) / maxUploads) * 100);
                    const label = new Date(d.day).toLocaleDateString('ar', { month: 'short', day: 'numeric' });
                    return (
                      <div key={d.day} className="flex flex-col items-center flex-1 gap-1" title={`${label}: ${d.uploads}`}>
                        <div
                          className="w-full bg-green-500 rounded-t"
                          style={{ height: `${Math.max(pct, 4)}%` }}
                        />
                        <span className="text-gray-400" style={{ fontSize: 8 }}>{new Date(d.day).getDate()}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-gray-400 text-sm text-center py-8">لا توجد بيانات</p>
              )}
            </div>

            {/* ── Faculty breakdown ─────────────────────────────────── */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-base font-bold text-gray-800 text-right mb-4">🎓 الموارد حسب الكلية</h2>
              {analytics?.facultyBreakdown.length ? (
                <div className="flex flex-col gap-2">
                  {analytics.facultyBreakdown.map((f) => {
                    const total = analytics.facultyBreakdown.reduce((s, x) => s + parseInt(x.count), 0);
                    const pct   = Math.round((parseInt(f.count) / total) * 100);
                    return (
                      <div key={f.faculty}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-500">{pct}%</span>
                          <span className="font-medium text-gray-700">{FACULTY_LABELS[f.faculty] ?? f.faculty}</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div className="bg-green-500 h-2 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-gray-400 text-sm text-center py-8">لا توجد بيانات</p>
              )}
            </div>
          </div>

          {/* ── Top Resources table ──────────────────────────────────── */}
          {analytics?.topResources.length ? (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-8">
              <h2 className="text-base font-bold text-gray-800 text-right mb-4">🏆 أكثر الموارد تحميلاً</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" dir="rtl">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-100">
                      <th className="py-2 text-right font-semibold">#</th>
                      <th className="py-2 text-right font-semibold">العنوان</th>
                      <th className="py-2 text-right font-semibold">الكلية</th>
                      <th className="py-2 text-right font-semibold">النوع</th>
                      <th className="py-2 text-right font-semibold">تحميلات</th>
                      <th className="py-2 text-right font-semibold">إعجابات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.topResources.map((r, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 text-gray-400">{i + 1}</td>
                        <td className="py-2 font-medium text-gray-800 max-w-xs truncate">{r.title}</td>
                        <td className="py-2 text-gray-500">{FACULTY_LABELS[r.faculty] ?? r.faculty}</td>
                        <td className="py-2">
                          <span className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700">
                            {TYPE_LABELS[r.resource_type] ?? r.resource_type}
                          </span>
                        </td>
                        <td className="py-2 font-bold text-green-600">{r.downloads.toLocaleString()}</td>
                        <td className="py-2 text-gray-500">{r.likes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {/* ── Quick links ──────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-lg font-bold text-gray-900 text-right mb-4">⚡ روابط سريعة</h2>
            <div className="flex flex-wrap gap-3 justify-end">
              <a href="/resources?status=pending" className="px-4 py-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-sm font-medium hover:bg-amber-100 transition">
                {stats.pendingModeration} موارد بانتظار المراجعة
              </a>
              <a href="/users" className="px-4 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-sm font-medium hover:bg-blue-100 transition">
                إدارة المستخدمين
              </a>
              <a href="/jobs" className="px-4 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg text-sm font-medium hover:bg-green-100 transition">
                إدارة الوظائف
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
