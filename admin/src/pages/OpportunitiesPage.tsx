import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  adminOpportunitiesApi,
  type AdminOpportunityRow,
  type OpportunityStatus,
  type OpportunityType,
  type AdminOpportunitiesScrapeJob,
  type AdminOpportunitiesListFilters,
} from '../api/typed';

const STATUS_COLORS: Record<OpportunityStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  approved: 'bg-green-100 text-green-700 border-green-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
};

const STATUS_LABELS: Record<OpportunityStatus, string> = {
  pending: '⏳ قيد المراجعة',
  approved: '✅ مقبول',
  rejected: '❌ مرفوض',
};

const TYPE_LABELS: Record<OpportunityType, string> = {
  program: '📚 Formation',
  scholarship: '🎓 منحة',
  exchange: '✈️ تبادل',
  internship: '💼 تدريب',
  fellowship: '🏅 Fellowship',
  grant: '💰 تمويل',
  summer_school: '☀️ مدرسة صيفية',
  other: '📌 أخرى',
};

const emptyForm = {
  title: '',
  opportunityType: 'program' as OpportunityType,
  providerName: '',
  hostCountry: '',
  hostCity: '',
  hostInstitution: '',
  benefits: '',
  hasScholarship: false,
  scholarshipDetails: '',
  eligibility: '',
  description: '',
  applyUrl: '',
  officialUrl: '',
  sourceName: '',
  sourceUrl: '',
  deadline: '',
};

export default function OpportunitiesPage() {
  const [status, setStatus] = useState<OpportunityStatus>('pending');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState<AdminOpportunitiesListFilters>({ search: '' });
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<AdminOpportunityRow[]>([]);

  const [selected, setSelected] = useState<AdminOpportunityRow | null>(null);
  const [actioning, setActioning] = useState(false);
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // ── Bulk selection ─────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<AdminOpportunityRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState(emptyForm);

  // ── Scraper job state ──────────────────────────────────────────────────────
  const [scrapeJobId, setScrapeJobId] = useState<string | null>(null);
  const [scrapeJob, setScrapeJob] = useState<AdminOpportunitiesScrapeJob | null>(null);
  const [showScrapeModal, setShowScrapeModal] = useState(false);
  const [scraping, setScraping] = useState(false);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / 20)), [total]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminOpportunitiesApi.list(status, page, activeFilters);
      setItems(res.data ?? []);
      setTotal(res.total ?? 0);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [status, page, activeFilters]);

  useEffect(() => { load(); }, [load]);

  // Reset bulk selection when tab/filter/page changes
  useEffect(() => {
    setSelectedIds(new Set());
    setSelected(null);
    setShowRejectBox(false);
  }, [status, page, activeFilters]);

  // Poll scraper job when opened
  useEffect(() => {
    if (!showScrapeModal || !scrapeJobId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const j = await adminOpportunitiesApi.scrapeJob(scrapeJobId);
        if (!cancelled) setScrapeJob(j);
        if (!cancelled && (j?.status === 'done' || j?.status === 'error' || j?.status === 'stopped')) {
          setScraping(false);
          await load();
        }
      } catch {
        // ignore
      }
    };
    tick();
    const t = setInterval(tick, 1200);
    return () => { cancelled = true; clearInterval(t); };
  }, [showScrapeModal, scrapeJobId, load]);

  const openCreate = () => {
    setEditItem(null);
    setForm(emptyForm);
    setFormError('');
    setShowModal(true);
  };

  const openEdit = (it: AdminOpportunityRow) => {
    setEditItem(it);
    setForm({
      title: it.title ?? '',
      opportunityType: (it.opportunity_type ?? 'other') as OpportunityType,
      providerName: it.provider_name ?? '',
      hostCountry: it.host_country ?? '',
      hostCity: it.host_city ?? '',
      hostInstitution: it.host_institution ?? '',
      benefits: it.benefits ?? '',
      hasScholarship: !!it.has_scholarship,
      scholarshipDetails: it.scholarship_details ?? '',
      eligibility: it.eligibility ?? '',
      description: it.description ?? '',
      applyUrl: it.apply_url ?? '',
      officialUrl: it.official_url ?? '',
      sourceName: it.source_name ?? '',
      sourceUrl: it.source_url ?? '',
      deadline: it.deadline ? String(it.deadline).split('T')[0] : '',
    });
    setFormError('');
    setShowModal(true);
  };

  const handleApprove = async (id: string) => {
    setActioning(true);
    try {
      await adminOpportunitiesApi.moderate(id, 'approve');
      await load();
      if (selected?.id === id) setSelected(null);
    } catch (e: any) { alert(e.message); }
    finally { setActioning(false); }
  };

  const handleReject = async (id: string) => {
    setActioning(true);
    try {
      await adminOpportunitiesApi.moderate(id, 'reject', rejectReason || undefined);
      setShowRejectBox(false);
      setRejectReason('');
      await load();
      if (selected?.id === id) setSelected(null);
    } catch (e: any) { alert(e.message); }
    finally { setActioning(false); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('حذف نهائي: سيتم حذف هذه الفرصة من قاعدة البيانات نهائياً. هل أنت متأكد؟')) return;
    setActioning(true);
    try {
      await adminOpportunitiesApi.delete(id);
      await load();
      if (selected?.id === id) setSelected(null);
    } catch (e: any) { alert(e.message); }
    finally { setActioning(false); }
  };

  const bulkCount = selectedIds.size;
  const allVisibleSelected = items.length > 0 && items.every(it => selectedIds.has(it.id));

  const toggleRow = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const it of items) next.delete(it.id);
      } else {
        for (const it of items) next.add(it.id);
      }
      return next;
    });
  };

  const bulkHideSelected = async () => {
    if (bulkCount === 0) return;
    if (!window.confirm(`إخفاء ${bulkCount} عنصر/عناصر؟`)) return;
    setActioning(true);
    try {
      const ids = Array.from(selectedIds);
      await adminOpportunitiesApi.bulkHide({ ids });
      setSelectedIds(new Set());
      await load();
      if (selected && ids.includes(selected.id)) setSelected(null);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setActioning(false);
    }
  };

  const bulkHideAllInTab = async () => {
    const msg =
      activeFilters.search?.trim()
        ? `إخفاء كل العناصر في هذا التبويب (مع البحث الحالي)؟`
        : `إخفاء كل العناصر في هذا التبويب؟`;
    if (!window.confirm(msg)) return;
    setActioning(true);
    try {
      await adminOpportunitiesApi.bulkHide({ status, search: activeFilters.search?.trim() || undefined });
      setSelectedIds(new Set());
      await load();
      setSelected(null);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setActioning(false);
    }
  };

  const bulkDeleteSelected = async () => {
    if (bulkCount === 0) return;
    if (!window.confirm(`حذف نهائي: حذف ${bulkCount} عنصر/عناصر نهائياً؟`)) return;
    setActioning(true);
    try {
      const ids = Array.from(selectedIds);
      await adminOpportunitiesApi.bulkDelete({ ids });
      setSelectedIds(new Set());
      await load();
      if (selected && ids.includes(selected.id)) setSelected(null);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setActioning(false);
    }
  };

  const bulkDeleteAllInTab = async () => {
    const msg =
      activeFilters.search?.trim()
        ? `حذف نهائي: حذف كل العناصر في هذا التبويب (مع البحث الحالي)؟`
        : `حذف نهائي: حذف كل العناصر في هذا التبويب؟`;
    if (!window.confirm(msg)) return;
    setActioning(true);
    try {
      await adminOpportunitiesApi.bulkDelete({ status, search: activeFilters.search?.trim() || undefined });
      setSelectedIds(new Set());
      await load();
      setSelected(null);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setActioning(false);
    }
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      setFormError('العنوان مطلوب');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        opportunityType: form.opportunityType,
      };
      if (form.providerName.trim()) payload.providerName = form.providerName.trim();
      if (form.hostCountry.trim()) payload.hostCountry = form.hostCountry.trim();
      if (form.hostCity.trim()) payload.hostCity = form.hostCity.trim();
      if (form.hostInstitution.trim()) payload.hostInstitution = form.hostInstitution.trim();
      if (form.benefits.trim()) payload.benefits = form.benefits.trim();
      payload.hasScholarship = !!form.hasScholarship;
      if (form.scholarshipDetails.trim()) payload.scholarshipDetails = form.scholarshipDetails.trim();
      if (form.eligibility.trim()) payload.eligibility = form.eligibility.trim();
      if (form.description.trim()) payload.description = form.description.trim();
      if (form.applyUrl.trim()) payload.applyUrl = form.applyUrl.trim();
      if (form.officialUrl.trim()) payload.officialUrl = form.officialUrl.trim();
      if (form.sourceName.trim()) payload.sourceName = form.sourceName.trim();
      if (form.sourceUrl.trim()) payload.sourceUrl = form.sourceUrl.trim();
      if (form.deadline.trim()) payload.deadline = form.deadline.trim();

      if (editItem) {
        await adminOpportunitiesApi.update(editItem.id, payload);
      } else {
        await adminOpportunitiesApi.create(payload);
      }

      setShowModal(false);
      await load();
    } catch (e: any) {
      setFormError(e.message ?? 'خطأ في الحفظ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">الفرص الدراسية 🎓</h1>
          <p className="text-sm text-gray-400 mt-0.5">{total} فرصة</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              setShowScrapeModal(true);
              setScraping(true);
              try {
                const { jobId } = await adminOpportunitiesApi.scrapeStart();
                setScrapeJobId(jobId);
              } catch (e: any) {
                setScraping(false);
                alert(e.message);
              }
            }}
            className="flex items-center gap-2 border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-semibold px-4 py-2 rounded-xl transition"
            title="Scrape all configured sources"
          >
            🕷️ Scraper
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition"
          >
            ➕ إضافة فرصة
          </button>
        </div>
      </div>

      {/* Tabs + Search */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-5 flex flex-wrap gap-3 items-center">
        <div className="flex gap-2">
          {(['pending', 'approved', 'rejected'] as OpportunityStatus[]).map(s => (
            <button
              key={s}
              onClick={() => { setStatus(s); setPage(1); setSelected(null); }}
              className={`px-4 py-2 rounded-xl text-sm font-semibold border transition ${
                status === s ? 'bg-white border-gray-300 shadow-sm text-gray-900' : 'border-transparent text-gray-500 hover:bg-gray-50'
              }`}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <input
          type="text"
          placeholder="بحث بالعنوان/الجهة/البلد..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { setActiveFilters(f => ({ ...f, search: search.trim() })); setPage(1); } }}
          className="min-w-[240px] border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400 text-right"
        />
        <button
          onClick={() => { setActiveFilters(f => ({ ...f, search: search.trim() })); setPage(1); }}
          className="text-sm border border-gray-200 px-3 py-2 rounded-xl hover:bg-gray-50 transition"
        >
          🔎 بحث
        </button>
        {(search || activeFilters.search) && (
          <button
            onClick={() => {
              setSearch('');
              setActiveFilters({
                search: '',
                type: '',
                level: '',
                institution: '',
                city: '',
                country: '',
                hasScholarship: 'all',
                availability: 'all',
                deadlineYear: '',
                active: 'all',
              });
              setPage(1);
            }}
            className="text-sm text-red-500 hover:text-red-700 px-2"
          >
            ✕ مسح
          </button>
        )}

        {/* Filters */}
        <select
          value={activeFilters.availability ?? 'all'}
          onChange={(e) => { setActiveFilters(f => ({ ...f, availability: e.target.value as any })); setPage(1); }}
          className="text-sm border border-gray-200 px-3 py-2 rounded-xl bg-white"
          title="Disponibilité"
        >
          <option value="all">الكل</option>
          <option value="available">✅ متاح</option>
          <option value="expired">⏰ منتهي</option>
        </select>
        <select
          value={activeFilters.hasScholarship ?? 'all'}
          onChange={(e) => { setActiveFilters(f => ({ ...f, hasScholarship: e.target.value as any })); setPage(1); }}
          className="text-sm border border-gray-200 px-3 py-2 rounded-xl bg-white"
          title="Bourse"
        >
          <option value="all">Bourse: الكل</option>
          <option value="true">Bourse: نعم</option>
          <option value="false">Bourse: لا</option>
        </select>
        <input
          type="text"
          placeholder="Niveau (ex: M2, L3...)"
          value={activeFilters.level ?? ''}
          onChange={(e) => { setActiveFilters(f => ({ ...f, level: e.target.value })); setPage(1); }}
          className="min-w-[140px] border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400"
          dir="ltr"
        />
        <input
          type="text"
          placeholder="Spécialité/Institution"
          value={activeFilters.institution ?? ''}
          onChange={(e) => { setActiveFilters(f => ({ ...f, institution: e.target.value })); setPage(1); }}
          className="min-w-[180px] border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400 text-right"
        />
        <input
          type="text"
          placeholder="Année deadline (YYYY)"
          value={activeFilters.deadlineYear ?? ''}
          onChange={(e) => { setActiveFilters(f => ({ ...f, deadlineYear: e.target.value.replace(/[^\d]/g, '').slice(0, 4) })); setPage(1); }}
          className="min-w-[150px] border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400"
          dir="ltr"
        />

        {/* Bulk actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleSelectAllVisible}
            disabled={items.length === 0}
            className="text-sm border border-gray-200 px-3 py-2 rounded-xl hover:bg-gray-50 transition disabled:opacity-50"
            title="تحديد/إلغاء تحديد كل العناصر في الصفحة"
          >
            ☑️ {allVisibleSelected ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
          </button>
          <button
            onClick={bulkHideSelected}
            disabled={bulkCount === 0 || actioning}
            className="text-sm border border-red-200 text-red-700 bg-red-50 px-3 py-2 rounded-xl hover:bg-red-100 transition disabled:opacity-50"
            title="إخفاء العناصر المحددة"
          >
            🗑️ إخفاء المحدد ({bulkCount})
          </button>
          <button
            onClick={bulkDeleteSelected}
            disabled={bulkCount === 0 || actioning}
            className="text-sm border border-red-300 text-white bg-red-600 px-3 py-2 rounded-xl hover:bg-red-700 transition disabled:opacity-50"
            title="حذف العناصر المحددة نهائياً"
          >
            🧨 حذف المحدد ({bulkCount})
          </button>
          <button
            onClick={bulkHideAllInTab}
            disabled={total === 0 || actioning}
            className="text-sm border border-gray-200 px-3 py-2 rounded-xl hover:bg-gray-50 transition disabled:opacity-50"
            title="إخفاء كل العناصر في هذا التبويب"
          >
            🧹 إخفاء الكل
          </button>
          <button
            onClick={bulkDeleteAllInTab}
            disabled={total === 0 || actioning}
            className="text-sm border border-red-300 text-white bg-red-600 px-3 py-2 rounded-xl hover:bg-red-700 transition disabled:opacity-50"
            title="حذف كل العناصر في هذا التبويب نهائياً"
          >
            🧨 حذف الكل
          </button>
        </div>
      </div>

      <div className="flex gap-5">
        {/* List */}
        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-20 text-gray-400">جاري التحميل...</div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-2 text-gray-400">
                <span className="text-4xl">🎓</span>
                <p className="text-sm">لا توجد فرص</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {items.map(it => (
                  <div
                    key={it.id}
                    className={`p-4 cursor-pointer hover:bg-gray-50 transition ${selected?.id === it.id ? 'bg-teal-50 border-r-4 border-teal-500' : ''}`}
                    onClick={() => { setSelected(it); setShowRejectBox(false); }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="pt-1">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(it.id)}
                          onChange={(e) => { e.stopPropagation(); toggleRow(it.id); }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4"
                          title="تحديد"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                            {TYPE_LABELS[it.opportunity_type] ?? it.opportunity_type}
                          </span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${STATUS_COLORS[it.status]}`}>
                            {STATUS_LABELS[it.status]}
                          </span>
                          {!it.is_active && (
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">⏸ مخفي</span>
                          )}
                        </div>
                        <p className="font-semibold text-gray-900 text-sm truncate">{it.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {(it.provider_name ?? '—')}{it.host_country ? ` · ${it.host_country}` : ''}{it.deadline ? ` · ⏰ ${new Date(it.deadline).toLocaleDateString('fr-FR')}` : ''}
                        </p>
                    {it.has_scholarship ? (
                      <p className="text-xs text-emerald-700 mt-1">💰 Bourse: Oui</p>
                    ) : (
                      <p className="text-xs text-gray-400 mt-1">💰 Bourse: Non</p>
                    )}
                      </div>
                      <p className="text-xs text-gray-400 flex-shrink-0">
                        {new Date(it.created_at).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

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
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="w-96 flex-shrink-0">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sticky top-4">
              <div className="flex items-start justify-between mb-4">
                <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
                <span className={`text-xs font-bold px-2 py-1 rounded-full border ${STATUS_COLORS[selected.status]}`}>
                  {STATUS_LABELS[selected.status]}
                </span>
              </div>

              <h2 className="text-base font-bold text-gray-900 mb-2 text-right">{selected.title}</h2>

              <div className="space-y-2 mb-4 text-sm text-right">
                <div className="flex justify-between"><span className="text-gray-400">النوع</span><span className="font-medium">{TYPE_LABELS[selected.opportunity_type] ?? selected.opportunity_type}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">الجهة</span><span className="font-medium">{selected.provider_name ?? '—'}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">البلد</span><span className="font-medium">{selected.host_country ?? '—'}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">المدينة</span><span className="font-medium">{selected.host_city ?? '—'}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">المؤسسة</span><span className="font-medium">{selected.host_institution ?? '—'}</span></div>
                {selected.deadline && <div className="flex justify-between"><span className="text-gray-400">آخر أجل</span><span className="font-medium">{new Date(selected.deadline).toLocaleDateString('fr-FR')}</span></div>}
              </div>

              {(selected.apply_url || selected.official_url || selected.source_url) && (
                <div className="mb-4 flex flex-wrap gap-2 justify-end">
                  {selected.apply_url && (
                    <a href={selected.apply_url} target="_blank" rel="noreferrer" className="text-xs px-3 py-1.5 rounded-xl border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100">
                      🔗 التقديم
                    </a>
                  )}
                  {selected.official_url && (
                    <a href={selected.official_url} target="_blank" rel="noreferrer" className="text-xs px-3 py-1.5 rounded-xl border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100">
                      ✅ المصدر الرسمي
                    </a>
                  )}
                  {selected.source_url && (
                    <a href={selected.source_url} target="_blank" rel="noreferrer" className="text-xs px-3 py-1.5 rounded-xl border border-gray-200 text-gray-700 bg-gray-50 hover:bg-gray-100">
                      🧾 صفحة الاستخراج
                    </a>
                  )}
                </div>
              )}

              <div className="mb-3">
                <p className="text-xs text-gray-400 mb-1 text-right">هل توجد منحة؟</p>
                <p className={`text-sm font-bold text-right ${selected.has_scholarship ? 'text-emerald-700' : 'text-gray-500'}`}>
                  {selected.has_scholarship ? '✅ نعم' : '— لا'}
                </p>
                {selected.has_scholarship && selected.scholarship_details && (
                  <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap text-right">{selected.scholarship_details}</p>
                )}
              </div>

              {selected.benefits && (
                <div className="mb-3">
                  <p className="text-xs text-gray-400 mb-1 text-right">التمويل</p>
                  <p className="text-xs text-gray-700 leading-relaxed text-right whitespace-pre-wrap">{selected.benefits}</p>
                </div>
              )}

              {selected.eligibility && (
                <div className="mb-3">
                  <p className="text-xs text-gray-400 mb-1 text-right">الشروط</p>
                  <p className="text-xs text-gray-700 leading-relaxed text-right whitespace-pre-wrap">{selected.eligibility}</p>
                </div>
              )}

              {selected.description && (
                <div className="mb-3">
                  <p className="text-xs text-gray-400 mb-1 text-right">الوصف</p>
                  <p className="text-xs text-gray-700 leading-relaxed text-right whitespace-pre-wrap line-clamp-6">{selected.description}</p>
                </div>
              )}

              {selected.reject_reason && (
                <div className="mb-4 p-3 bg-red-50 rounded-xl border border-red-100">
                  <p className="text-xs font-semibold text-red-600 mb-1">سبب الرفض:</p>
                  <p className="text-xs text-red-500 whitespace-pre-wrap">{selected.reject_reason}</p>
                </div>
              )}

              <div className="flex flex-col gap-2 mt-4">
                <button
                  onClick={() => openEdit(selected)}
                  className="w-full border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-semibold py-2 rounded-xl transition"
                >
                  ✏️ تعديل
                </button>

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
                  className="w-full bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-2 rounded-xl transition disabled:opacity-50"
                >
                  🧨 حذف نهائي
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">
                {editItem ? 'تعديل الفرصة' : 'إضافة فرصة جديدة'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
            </div>

            <div className="px-6 py-4 space-y-4">
              {formError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-sm text-red-700">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">العنوان *</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400 text-right"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">النوع</label>
                  <select
                    value={form.opportunityType}
                    onChange={e => setForm(f => ({ ...f, opportunityType: e.target.value as OpportunityType }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400 bg-white text-right"
                  >
                    {(Object.keys(TYPE_LABELS) as OpportunityType[]).map(k => (
                      <option key={k} value={k}>{TYPE_LABELS[k]}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">الجهة (Provider)</label>
                  <input
                    type="text"
                    value={form.providerName}
                    onChange={e => setForm(f => ({ ...f, providerName: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400 text-right"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">المؤسسة (Host)</label>
                  <input
                    type="text"
                    value={form.hostInstitution}
                    onChange={e => setForm(f => ({ ...f, hostInstitution: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400 text-right"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">البلد</label>
                  <input
                    type="text"
                    value={form.hostCountry}
                    onChange={e => setForm(f => ({ ...f, hostCountry: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400 text-right"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">المدينة</label>
                  <input
                    type="text"
                    value={form.hostCity}
                    onChange={e => setForm(f => ({ ...f, hostCity: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400 text-right"
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">رابط التقديم</label>
                  <input
                    type="url"
                    value={form.applyUrl}
                    onChange={e => setForm(f => ({ ...f, applyUrl: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">الرابط الرسمي</label>
                  <input
                    type="url"
                    value={form.officialUrl}
                    onChange={e => setForm(f => ({ ...f, officialUrl: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">اسم المصدر</label>
                  <input
                    type="text"
                    value={form.sourceName}
                    onChange={e => setForm(f => ({ ...f, sourceName: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400 text-right"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">رابط المصدر</label>
                  <input
                    type="url"
                    value={form.sourceUrl}
                    onChange={e => setForm(f => ({ ...f, sourceUrl: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400"
                    dir="ltr"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">التمويل (Benefits)</label>
                <textarea
                  value={form.benefits}
                  onChange={e => setForm(f => ({ ...f, benefits: e.target.value }))}
                  rows={2}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400 text-right resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 items-center">
                <label className="flex items-center gap-2 text-sm text-gray-700 justify-end">
                  <span className="text-xs font-semibold text-gray-500">يوجد تمويل/منحة؟</span>
                  <input
                    type="checkbox"
                    checked={form.hasScholarship}
                    onChange={e => setForm(f => ({ ...f, hasScholarship: e.target.checked }))}
                    className="w-4 h-4"
                  />
                </label>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">تفاصيل المنحة (اختياري)</label>
                  <input
                    type="text"
                    value={form.scholarshipDetails}
                    onChange={e => setForm(f => ({ ...f, scholarshipDetails: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400 text-right"
                    placeholder="Full/partial, montant, lien..."
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">الشروط (Eligibility)</label>
                <textarea
                  value={form.eligibility}
                  onChange={e => setForm(f => ({ ...f, eligibility: e.target.value }))}
                  rows={2}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400 text-right resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">الوصف</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400 text-right resize-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 px-6 py-4 border-t border-gray-100">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold py-2.5 rounded-xl transition disabled:opacity-50"
              >
                {saving ? 'جاري الحفظ...' : editItem ? 'حفظ التعديلات' : 'إضافة الفرصة'}
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

      {/* Scraper Modal */}
      {showScrapeModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">🕷️ Scraping</h2>
              <button
                onClick={() => { setShowScrapeModal(false); }}
                className="text-gray-400 hover:text-gray-700 text-xl leading-none"
              >
                ✕
              </button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  {scrapeJobId ? <span>Job: <span className="font-mono">{scrapeJobId}</span></span> : 'Job en cours...'}
                </div>
                <span className={`text-xs font-bold px-2 py-1 rounded-full border ${
                  scrapeJob?.status === 'running' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                  scrapeJob?.status === 'done' ? 'bg-green-50 text-green-700 border-green-200' :
                  scrapeJob?.status === 'error' ? 'bg-red-50 text-red-700 border-red-200' :
                  'bg-gray-50 text-gray-600 border-gray-200'
                }`}>
                  {scrapeJob?.status || (scraping ? 'running' : 'pending')}
                </span>
              </div>

              {scrapeJob?.summary && (
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { k: 'sources', label: 'Sources', v: scrapeJob.summary.sources },
                    { k: 'fetched', label: 'Fetched', v: scrapeJob.summary.fetched },
                    { k: 'inserted', label: 'Inserted', v: scrapeJob.summary.inserted },
                    { k: 'duplicates', label: 'Dup', v: scrapeJob.summary.duplicates },
                    { k: 'failed', label: 'Failed', v: scrapeJob.summary.failed },
                  ].map(x => (
                    <div key={x.k} className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-center">
                      <div className="text-lg font-extrabold text-gray-900">{x.v ?? 0}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{x.label}</div>
                    </div>
                  ))}
                </div>
              )}

              <div className="bg-gray-900 rounded-xl p-3 h-72 overflow-y-auto font-mono text-xs text-green-300 space-y-0.5" dir="ltr">
                {(scrapeJob?.logs ?? []).length === 0 ? (
                  <div className="text-gray-500 text-center pt-8">En attente des logs...</div>
                ) : (scrapeJob?.logs ?? []).map((line: string, i: number) => (
                  <div key={i} className={
                    line.includes('❌') ? 'text-red-300' :
                    line.includes('⚠️') ? 'text-amber-300' :
                    line.includes('✅') ? 'text-green-300' :
                    'text-gray-300'
                  }>{line}</div>
                ))}
              </div>

              {scrapeJob?.error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-sm text-red-700">
                  {scrapeJob.error}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
              <button
                onClick={async () => { await load(); }}
                className="text-sm border border-gray-200 px-3 py-2 rounded-xl hover:bg-gray-50 transition"
              >
                🔄 تحديث القائمة
              </button>
              <button
                onClick={() => setShowScrapeModal(false)}
                className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 rounded-xl border border-gray-200 hover:bg-gray-50 transition"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

