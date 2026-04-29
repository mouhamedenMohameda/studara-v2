import React, { useEffect, useState, useCallback } from 'react';
import { adminJobsApi } from '../api/typed';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Job {
  id: string;
  title: string;
  company: string;
  location?: string;
  domain?: string;
  job_type: JobType;
  description?: string;
  requirements?: string;
  apply_url?: string;
  deadline?: string;
  is_active: boolean;
  created_at: string;
}

type JobType = 'stage' | 'cdi' | 'cdd' | 'freelance' | 'other';

// ─── Constants ────────────────────────────────────────────────────────────────

const JOB_TYPES: { value: JobType; label: string }[] = [
  { value: 'stage',     label: 'Stage' },
  { value: 'cdi',       label: 'CDI' },
  { value: 'cdd',       label: 'CDD' },
  { value: 'freelance', label: 'Freelance' },
  { value: 'other',     label: 'Autre' },
];

const TYPE_COLORS: Record<JobType, string> = {
  stage:     'bg-blue-100 text-blue-700',
  cdi:       'bg-green-100 text-green-700',
  cdd:       'bg-amber-100 text-amber-700',
  freelance: 'bg-purple-100 text-purple-700',
  other:     'bg-gray-100 text-gray-600',
};

const DOMAINS = [
  'informatique', 'electronique', 'genie-civil', 'mathematiques',
  'comptabilite', 'marketing', 'droit', 'medecine', 'autre',
];

const emptyForm = {
  title: '',
  company: '',
  location: '',
  domain: '',
  jobType: 'stage' as JobType,
  description: '',
  requirements: '',
  applyUrl: '',
  deadline: '',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function JobsPage() {
  // ── List state ───────────────────────────────────────────────────────────────
  const [jobs, setJobs]           = useState<Job[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(false);
  const [search, setSearch]       = useState('');
  const [domainFilter, setDomainFilter] = useState('');
  const [typeFilter, setTypeFilter]     = useState('');

  // ── Modal state ──────────────────────────────────────────────────────────────
  const [showModal, setShowModal] = useState(false);
  const [editJob,   setEditJob]   = useState<Job | null>(null);
  const [form, setForm]           = useState(emptyForm);
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState('');

  // ── Delete confirm ───────────────────────────────────────────────────────────
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ─── Fetch ─────────────────────────────────────────────────────────────────

  const fetchJobs = useCallback(async (pg = page) => {
    setLoading(true);
    try {
      const res = await adminJobsApi.list(pg, search, domainFilter, typeFilter);
      setJobs(res.data ?? []);
      setTotal(res.total ?? 0);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, search, domainFilter, typeFilter]);

  useEffect(() => {
    fetchJobs(1);
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, domainFilter, typeFilter]);

  useEffect(() => {
    fetchJobs(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // ─── Modal helpers ──────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditJob(null);
    setForm(emptyForm);
    setFormError('');
    setShowModal(true);
  };

  const openEdit = (job: Job) => {
    setEditJob(job);
    setForm({
      title:        job.title,
      company:      job.company,
      location:     job.location ?? '',
      domain:       job.domain ?? '',
      jobType:      job.job_type,
      description:  job.description ?? '',
      requirements: job.requirements ?? '',
      applyUrl:     job.apply_url ?? '',
      deadline:     job.deadline ? job.deadline.split('T')[0] : '',
    });
    setFormError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.company.trim()) {
      setFormError('العنوان والشركة مطلوبان');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const payload: Record<string, unknown> = {
        title:    form.title.trim(),
        company:  form.company.trim(),
        jobType:  form.jobType,
      };
      if (form.location.trim())     payload.location     = form.location.trim();
      if (form.domain.trim())       payload.domain       = form.domain.trim();
      if (form.description.trim())  payload.description  = form.description.trim();
      if (form.requirements.trim()) payload.requirements = form.requirements.trim();
      if (form.applyUrl.trim())     payload.applyUrl     = form.applyUrl.trim();
      if (form.deadline.trim())     payload.deadline     = form.deadline.trim();

      if (editJob) {
        await adminJobsApi.update(editJob.id, payload);
      } else {
        await adminJobsApi.create(payload);
      }
      setShowModal(false);
      fetchJobs(page);
    } catch (e: any) {
      setFormError(e.message ?? 'خطأ في الحفظ');
    } finally {
      setSaving(false);
    }
  };

  // ─── Toggle active ──────────────────────────────────────────────────────────

  const handleToggleActive = async (job: Job) => {
    try {
      await adminJobsApi.update(job.id, { isActive: !job.is_active });
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, is_active: !job.is_active } : j));
    } catch (e: any) {
      alert(e.message);
    }
  };

  // ─── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    try {
      await adminJobsApi.delete(id);
      setDeletingId(null);
      fetchJobs(page);
    } catch (e: any) {
      alert(e.message);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="p-6" dir="rtl">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">فرص العمل 💼</h1>
          <p className="text-sm text-gray-400 mt-0.5">{total} وظيفة إجمالاً</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition"
        >
          <span>➕</span> إضافة وظيفة
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-5 flex flex-wrap gap-3 items-center">
        {/* Search */}
        <input
          type="text"
          placeholder="بحث بالعنوان أو الشركة..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[180px] border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400 text-right"
        />
        {/* Domain filter */}
        <select
          value={domainFilter}
          onChange={e => setDomainFilter(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400 text-right bg-white"
        >
          <option value="">كل الميادين</option>
          {DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        {/* Type filter */}
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400 bg-white"
        >
          <option value="">كل الأنواع</option>
          {JOB_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        {(search || domainFilter || typeFilter) && (
          <button
            onClick={() => { setSearch(''); setDomainFilter(''); setTypeFilter(''); }}
            className="text-sm text-red-500 hover:text-red-700 px-2"
          >
            ✕ مسح الفلاتر
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">جاري التحميل...</div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2 text-gray-400">
            <span className="text-4xl">💼</span>
            <p className="text-sm">لا توجد وظائف</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-right font-semibold text-gray-500">العنوان</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-500">الشركة</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-500">الميدان</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-500">النوع</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-500">الحالة</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-500">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {jobs.map(job => (
                <tr key={job.id} className={`hover:bg-gray-50 transition ${!job.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-900">{job.title}</div>
                    {job.location && <div className="text-xs text-gray-400 mt-0.5">📍 {job.location}</div>}
                    {job.deadline && (
                      <div className="text-xs text-amber-600 mt-0.5">
                        ⏰ آخر أجل: {new Date(job.deadline).toLocaleDateString('ar-MR')}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{job.company}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{job.domain ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[job.job_type]}`}>
                      {JOB_TYPES.find(t => t.value === job.job_type)?.label ?? job.job_type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggleActive(job)}
                      className={`px-2 py-0.5 rounded-full text-xs font-medium transition cursor-pointer ${
                        job.is_active
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {job.is_active ? '✅ نشط' : '⏸ مخفي'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {job.apply_url && (
                        <a
                          href={job.apply_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:text-blue-700 text-xs"
                          title="فتح رابط التقديم"
                        >
                          🔗
                        </a>
                      )}
                      <button
                        onClick={() => openEdit(job)}
                        className="text-gray-400 hover:text-gray-700 text-xs px-2 py-1 rounded-lg hover:bg-gray-100 transition"
                      >
                        ✏️ تعديل
                      </button>
                      <button
                        onClick={() => setDeletingId(job.id)}
                        className="text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded-lg hover:bg-red-50 transition"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition"
            >
              ← السابق
            </button>
            <span className="text-sm text-gray-500">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition"
            >
              التالي →
            </button>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">
                {editJob ? 'تعديل الوظيفة' : 'إضافة وظيفة جديدة'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
            </div>

            {/* Form */}
            <div className="px-6 py-4 space-y-4">
              {formError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-sm text-red-700">
                  {formError}
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">عنوان الوظيفة *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="مطوّر واجهة أمامية"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400 text-right"
                />
              </div>

              {/* Company */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">الشركة *</label>
                <input
                  type="text"
                  value={form.company}
                  onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                  placeholder="شركة XYZ"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400 text-right"
                />
              </div>

              {/* Location + Domain (side by side) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">الموقع</label>
                  <input
                    type="text"
                    value={form.location}
                    onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                    placeholder="نواكشوط"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400 text-right"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">الميدان</label>
                  <select
                    value={form.domain}
                    onChange={e => setForm(f => ({ ...f, domain: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400 bg-white text-right"
                  >
                    <option value="">— اختر —</option>
                    {DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              {/* Job type */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">نوع التوظيف</label>
                <div className="flex flex-wrap gap-2">
                  {JOB_TYPES.map(t => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, jobType: t.value }))}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition ${
                        form.jobType === t.value
                          ? 'bg-green-600 text-white border-green-600'
                          : 'border-gray-200 text-gray-600 hover:border-green-300'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">الوصف</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={3}
                  placeholder="وصف الوظيفة والمهام..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400 text-right resize-none"
                />
              </div>

              {/* Requirements */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">المتطلبات</label>
                <textarea
                  value={form.requirements}
                  onChange={e => setForm(f => ({ ...f, requirements: e.target.value }))}
                  rows={2}
                  placeholder="المهارات والمؤهلات المطلوبة..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400 text-right resize-none"
                />
              </div>

              {/* Apply URL + Deadline */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">رابط التقديم</label>
                  <input
                    type="url"
                    value={form.applyUrl}
                    onChange={e => setForm(f => ({ ...f, applyUrl: e.target.value }))}
                    placeholder="https://..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">آخر أجل</label>
                  <input
                    type="date"
                    value={form.deadline}
                    onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400"
                  />
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex items-center gap-3 px-6 py-4 border-t border-gray-100">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold py-2.5 rounded-xl transition disabled:opacity-50"
              >
                {saving ? 'جاري الحفظ...' : editJob ? 'حفظ التعديلات' : 'إضافة الوظيفة'}
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 rounded-xl border border-gray-200 hover:bg-gray-50 transition"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deletingId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center" dir="rtl">
            <div className="text-4xl mb-3">🗑️</div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">حذف الوظيفة</h3>
            <p className="text-sm text-gray-500 mb-6">
              سيتم إخفاء هذه الوظيفة من التطبيق. هل أنت متأكد؟
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleDelete(deletingId)}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-2.5 rounded-xl transition"
              >
                نعم، احذف
              </button>
              <button
                onClick={() => setDeletingId(null)}
                className="flex-1 border border-gray-200 text-sm text-gray-600 py-2.5 rounded-xl hover:bg-gray-50 transition"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
