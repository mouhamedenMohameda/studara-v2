import React, { useEffect, useRef, useState } from 'react';
import { adminResourcesApi } from '../api/typed';

const TYPE_LABELS: Record<string, string> = {
  note: 'ملاحظات', past_exam: 'امتحان سابق', summary: 'ملخص',
  exercise: 'تمارين', project: 'مشروع', presentation: 'عرض تقديمي',
};

const FACULTIES = [
  { value: 'sciences',    label: 'كلية العلوم والتقنيات' },
  { value: 'law',         label: 'كلية الحقوق' },
  { value: 'medicine',    label: 'كلية الطب' },
  { value: 'engineering', label: 'المدرسة العليا للهندسة' },
  { value: 'letters',     label: 'كلية الآداب' },
  { value: 'economics',   label: 'كلية الاقتصاد' },
];

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

const emptyForm = {
  title: '', titleAr: '', subject: '', description: '',
  resourceType: 'summary', faculty: 'sciences',
  university: 'una', year: '1',
};

export default function ResourcesPage() {
  // ── list state ──────────────────────────────────────────────────────────────
  const [tab, setTab]       = useState<'upload' | 'list' | 'import'>('list');
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [resources, setResources] = useState<any[]>([]);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(1);
  const [loading, setLoading] = useState(false);
  const [rejecting, setRejecting]   = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [previewResource, setPreviewResource] = useState<any | null>(null);

  // ── import / bulk-scrape state ───────────────────────────────────────────────
  const [startNum, setStartNum] = useState('29000');
  const [endNum,   setEndNum]   = useState('35000');
  const [scrape,   setScrape]   = useState<any>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchScrapeStatus = async () => {
    try { setScrape(await adminResourcesApi.bulkScrapeStatus()); } catch { /* ignore */ }
  };

  useEffect(() => {
    if (tab !== 'import') {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    fetchScrapeStatus();
    pollRef.current = setInterval(fetchScrapeStatus, 2000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const handleBulkStart = async () => {
    const s = parseInt(startNum), e = parseInt(endNum);
    if (isNaN(s) || isNaN(e) || s >= e) { alert('Plage invalide'); return; }
    try { await adminResourcesApi.bulkScrapeStart(s, e); await fetchScrapeStatus(); }
    catch (err: any) { alert(err.message); }
  };
  const handleBulkStop = async () => {
    try { await adminResourcesApi.bulkScrapeStop(); await fetchScrapeStatus(); } catch { /* ignore */ }
  };

  // ── upload state ─────────────────────────────────────────────────────────────
  const [form, setForm]     = useState(emptyForm);
  const [file, setFile]     = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminResourcesApi.list(status, page);
      setResources(data.data);
      setTotal(data.total);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [status, page]);

  const handleModerate = async (id: string, action: 'approve' | 'reject', reason?: string) => {
    try {
      await adminResourcesApi.moderate(id, action, reason);
      setRejecting(null); setRejectReason(''); load();
    } catch (e: any) { alert(e.message); }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`حذف "${title}"؟`)) return;
    try { await adminResourcesApi.delete(id); load(); }
    catch (e: any) { alert(e.message); }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) { setUploadMsg({ ok: false, text: 'يرجى اختيار ملف PDF' }); return; }
    if (!form.title && !form.titleAr) { setUploadMsg({ ok: false, text: 'يرجى إدخال عنوان الملف' }); return; }
    if (!form.subject) { setUploadMsg({ ok: false, text: 'يرجى إدخال اسم المادة' }); return; }

    const fd = new FormData();
    fd.append('file', file);
    Object.entries(form).forEach(([k, v]) => fd.append(k, v));

    setUploading(true); setUploadMsg(null);
    try {
      await adminResourcesApi.upload(fd);
      setUploadMsg({ ok: true, text: '✅ تم رفع الملف ونشره بنجاح!' });
      setForm(emptyForm); setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      setStatus('approved'); setPage(1); setTab('list');
    } catch (e: any) {
      setUploadMsg({ ok: false, text: `❌ ${e.message}` });
    } finally { setUploading(false); }
  };

  const f = (k: keyof typeof emptyForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [k]: e.target.value }));

  /** Returns true only if the URL is a real viewable file (Drive or local upload) */
  const isRealFile = (url: string) =>
    !!url && !url.startsWith('fst://') && (
      url.includes('drive.google.com') || url.startsWith('/') || url.startsWith('http')
    );

  /** Convert any file URL to an embeddable preview URL */
  const getPreviewUrl = (url: string): string => {
    if (!url) return '';
    // Google Drive: /file/d/ID/view  →  /file/d/ID/preview
    const driveMatch = url.match(/drive\.google\.com\/file\/d\/([^/?]+)/);
    if (driveMatch) return `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
    // Local server file → direct (absolute or relative)
    if (url.startsWith('/')) return `https://api.radar-mr.com${url}`;
    return url;
  };

  return (
    <div>
      {/* ── Tab bar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-2">
          <button onClick={() => setTab('upload')}
            className={`px-5 py-2 rounded-xl text-sm font-semibold transition ${
              tab === 'upload' ? 'bg-green-700 text-white shadow' : 'bg-white border border-gray-200 text-gray-600'
            }`}>
            ⬆ رفع ملف جديد
          </button>
          <button onClick={() => setTab('list')}
            className={`px-5 py-2 rounded-xl text-sm font-semibold transition ${
              tab === 'list' ? 'bg-green-700 text-white shadow' : 'bg-white border border-gray-200 text-gray-600'
            }`}>
            📋 قائمة الملفات
          </button>
          <button onClick={() => setTab('import')}
            className={`px-5 py-2 rounded-xl text-sm font-semibold transition ${
              tab === 'import' ? 'bg-indigo-700 text-white shadow' : 'bg-white border border-gray-200 text-gray-600'
            }`}>
            📥 استيراد FST
          </button>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">الموارد ({total})</h1>
      </div>

      {/* ── Upload form ─────────────────────────────────────────────────────── */}
      {tab === 'upload' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 max-w-2xl mr-auto">
          <h2 className="text-lg font-bold text-gray-900 text-right mb-5">رفع ملف PDF / مستند</h2>
          <form onSubmit={handleUpload} className="space-y-4" dir="rtl">

            {/* File picker */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الملف *</label>
              <div
                className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-green-500 transition"
                onClick={() => fileRef.current?.click()}
              >
                {file ? (
                  <div className="text-green-700 font-medium">
                    📄 {file.name} <span className="text-gray-400">({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                  </div>
                ) : (
                  <div className="text-gray-400">
                    <div className="text-3xl mb-1">📁</div>
                    <div className="text-sm">اضغط لاختيار ملف PDF أو DOCX أو PPTX</div>
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.ppt,.pptx"
                className="hidden"
                onChange={e => setFile(e.target.files?.[0] || null)} />
            </div>

            {/* Title row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">العنوان بالعربية</label>
                <input value={form.titleAr} onChange={f('titleAr')} placeholder="ملخص الكيمياء العامة"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">العنوان بالفرنسية *</label>
                <input value={form.title} onChange={f('title')} placeholder="Chimie Générale - Résumé"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              </div>
            </div>

            {/* Subject + Type row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">المادة *</label>
                <input value={form.subject} onChange={f('subject')} placeholder="Chimie Générale"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">نوع المستند</label>
                <select value={form.resourceType} onChange={f('resourceType')}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
                  {Object.entries(TYPE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Faculty + Year row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الكلية</label>
                <select value={form.faculty} onChange={f('faculty')}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
                  {FACULTIES.map(fac => <option key={fac.value} value={fac.value}>{fac.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">السنة الدراسية</label>
                <select value={form.year} onChange={f('year')}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
                  <option value="1">السنة 1 (L1)</option>
                  <option value="2">السنة 2 (L2)</option>
                  <option value="3">السنة 3 (L3)</option>
                  <option value="4">السنة 4 (M1)</option>
                  <option value="5">السنة 5 (M2)</option>
                  <option value="6">السنة 6</option>
                  <option value="7">السنة 7</option>
                </select>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">وصف (اختياري)</label>
              <textarea value={form.description} onChange={f('description')} rows={2}
                placeholder="وصف مختصر للمحتوى..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none" />
            </div>

            {uploadMsg && (
              <div className={`text-sm p-3 rounded-xl ${uploadMsg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {uploadMsg.text}
              </div>
            )}

            <button type="submit" disabled={uploading}
              className="w-full py-3 bg-green-700 hover:bg-green-800 text-white font-semibold rounded-xl transition disabled:opacity-60">
              {uploading ? 'جارٍ الرفع...' : '⬆ رفع ونشر الملف'}
            </button>
          </form>
        </div>
      )}

      {/* ── Import / Bulk Scrape ──────────────────────────────────────────── */}
      {tab === 'import' && (
        <div className="max-w-3xl mr-auto space-y-5" dir="rtl">
          {/* Controls */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-lg font-bold text-gray-900 mb-4">
              استيراد فهرس المواد من موقع نتائج FST
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              يقوم النظام بتجربة أرقام الطلاب تلقائياً واستخراج أسماء المواد والسنة الدراسية. كل مادة جديدة تُحفظ تلقائياً دون تكرار.
              يمكن للمشرفين لاحقاً رفع ملفات PDF لكل مادة.
            </p>
            <div className="flex gap-3 items-end">
              <div>
                <label className="block text-xs text-gray-500 mb-1">رقم البداية</label>
                <input type="number" value={startNum} onChange={e => setStartNum(e.target.value)}
                  className="w-28 border border-gray-200 rounded-xl px-3 py-2 text-sm text-center"
                  disabled={scrape?.status === 'running'} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">رقم النهاية</label>
                <input type="number" value={endNum} onChange={e => setEndNum(e.target.value)}
                  className="w-28 border border-gray-200 rounded-xl px-3 py-2 text-sm text-center"
                  disabled={scrape?.status === 'running'} />
              </div>
              {scrape?.status !== 'running' ? (
                <button onClick={handleBulkStart}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition">
                  ▶ بدء الاستيراد
                </button>
              ) : (
                <button onClick={handleBulkStop}
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition">
                  ⏹ إيقاف
                </button>
              )}
            </div>
          </div>

          {/* Progress */}
          {scrape && scrape.status !== 'idle' && (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex justify-between items-center mb-2">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  scrape.status === 'running' ? 'bg-blue-100 text-blue-700 animate-pulse' :
                  scrape.status === 'done'    ? 'bg-green-100 text-green-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {({ running: '⏳ جارٍُ', done: '✅ اكتمل', stopped: '⏹ موقوف', idle: '☐' } as Record<string,string>)[scrape.status]}
                </span>
                <span className="text-xs text-gray-400">
                  C{String(scrape.current).padStart(5,'0')} / C{String(scrape.endNum).padStart(5,'0')}
                </span>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-gray-100 rounded-full h-2.5 mb-4 overflow-hidden">
                <div className="bg-indigo-500 h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${scrape.progress}%` }} />
              </div>
              {/* Stats */}
              <div className="grid grid-cols-4 gap-3 mb-4">
                {[
                  { label: 'طلاب وجدوا',      value: scrape.found,    color: 'text-green-700' },
                  { label: 'مواد جديدة',       value: scrape.inserted, color: 'text-indigo-700' },
                  { label: 'موجودة مسبقاً',   value: scrape.skipped,  color: 'text-amber-700' },
                  { label: 'أرقام فارغة',     value: scrape.errors,   color: 'text-gray-400' },
                ].map(s => (
                  <div key={s.label} className="text-center bg-gray-50 rounded-xl p-3">
                    <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>
              {/* Log */}
              <div className="bg-gray-900 rounded-xl p-3 h-64 overflow-y-auto font-mono text-xs text-green-400 space-y-0.5" dir="ltr">
                {(scrape.log ?? []).length === 0 ? (
                  <div className="text-gray-500 text-center pt-4">إنتظار البيانات...</div>
                ) : (scrape.log ?? []).map((line: string, i: number) => (
                  <div key={i} className={
                    line.startsWith('⚠') ? 'text-amber-400' :
                    line.startsWith('✅') ? 'text-green-400' :
                    line.startsWith('🏁') ? 'text-cyan-400' :
                    'text-gray-400'
                  }>{line}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Resource list ────────────────────────────────────────────────────── */}
      {tab === 'list' && (
        <>
          <div className="flex gap-2 mb-5">
            {(['pending', 'approved', 'rejected'] as const).map(s => {
              const activeColors = {
                pending:  'bg-amber-500 text-white',
                approved: 'bg-green-700 text-white',
                rejected: 'bg-red-600 text-white',
              };
              return (
                <button key={s} onClick={() => { setStatus(s); setPage(1); }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    status === s ? activeColors[s] : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>
                  {{ approved: '✅ المنشورة', pending: '⏳ بانتظار المراجعة', rejected: '❌ المرفوضة' }[s]}
                </button>
              );
            })}
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600" />
            </div>
          ) : resources.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <div className="text-4xl mb-2">📂</div>
              <p>لا توجد ملفات.</p>
              <button onClick={() => setTab('upload')} className="mt-3 text-green-700 underline text-sm">
                ارفع أول ملف الآن
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {resources.map(r => (
                <div key={r.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between gap-4">

                    {/* Actions */}
                    <div className="flex gap-2 flex-shrink-0 items-center">
                      {isRealFile(r.file_url) && (
                        <>
                          <button
                            onClick={() => setPreviewResource(r)}
                            className="px-3 py-1.5 bg-purple-50 text-purple-700 text-xs rounded-lg border border-purple-200 hover:bg-purple-100">
                            👁 معاينة
                          </button>
                          <a href={getPreviewUrl(r.file_url)} target="_blank" rel="noreferrer"
                            className="px-3 py-1.5 bg-blue-50 text-blue-700 text-xs rounded-lg border border-blue-200 hover:bg-blue-100">
                            ⬇ تحميل
                          </a>
                        </>
                      )}
                      {status === 'pending' && (
                        <>
                          {rejecting === r.id ? (
                            <div className="flex gap-1 items-center">
                              <input className="border border-gray-200 rounded-lg px-2 py-1 text-xs"
                                placeholder="سبب الرفض" value={rejectReason}
                                onChange={e => setRejectReason(e.target.value)} />
                              <button onClick={() => handleModerate(r.id, 'reject', rejectReason)}
                                className="px-2 py-1 bg-red-600 text-white text-xs rounded-lg">تأكيد</button>
                              <button onClick={() => setRejecting(null)}
                                className="px-2 py-1 bg-gray-100 text-xs rounded-lg">إلغاء</button>
                            </div>
                          ) : (
                            <>
                              <button onClick={() => handleModerate(r.id, 'approve')}
                                className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg">✓ قبول</button>
                              <button onClick={() => setRejecting(r.id)}
                                className="px-3 py-1.5 bg-red-50 text-red-600 text-xs rounded-lg border border-red-200">✗ رفض</button>
                            </>
                          )}
                        </>
                      )}
                      <button onClick={() => handleDelete(r.id, r.title_ar || r.title)}
                        title="حذف"
                        className="px-3 py-1.5 bg-gray-100 text-gray-500 text-xs rounded-lg hover:bg-red-50 hover:text-red-600 transition">
                        🗑
                      </button>
                    </div>

                    {/* Info */}
                    <div className="flex-1 text-right">
                      <div className="flex items-center justify-end gap-2 mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[r.status]}`}>
                          {TYPE_LABELS[r.resource_type] || r.resource_type}
                        </span>
                        <h3 className="font-semibold text-gray-900">{r.title_ar || r.title}</h3>
                      </div>
                      {r.title_ar && r.title && r.title !== r.title_ar && (
                        <p className="text-xs text-gray-400 mb-1">{r.title}</p>
                      )}
                      {r.uploader_name && (
                        <div className="flex items-center justify-end gap-1 mb-1">
                          <span className="text-xs font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
                            👤 {r.uploader_name}
                          </span>
                          {r.uploader_email && (
                            <span className="text-xs text-gray-400">{r.uploader_email}</span>
                          )}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-3 justify-end text-xs text-gray-400">
                        <span>📚 {r.subject}</span>
                        <span>🏛 {r.faculty}</span>
                        <span>📅 S{r.year}</span>
                        {r.file_name && <span>📄 {r.file_name}</span>}
                        {r.file_size && <span>💾 {(r.file_size / 1024 / 1024).toFixed(2)} MB</span>}
                        {r.downloads > 0 && <span>⬇ {r.downloads}</span>}
                        <span>🕒 {new Date(r.created_at).toLocaleDateString('ar-SA')}</span>
                        {r.rating_count > 0 && (
                          <span className="flex items-center gap-1 font-semibold text-amber-600">
                            ⭐ {Number(r.avg_rating).toFixed(1)}/5
                            <span className="text-gray-400 font-normal">({r.rating_count} تقييم)</span>
                          </span>
                        )}
                        {r.rating_count === 0 && status !== 'pending' && (
                          <span className="text-gray-300 italic">لا تقييمات بعد</span>
                        )}
                      </div>
                      {r.description && (
                        <p className="mt-1 text-xs text-gray-500 line-clamp-2">{r.description}</p>
                      )}
                      {r.rejection_reason && (
                        <p className="mt-1 text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
                          سبب الرفض: {r.rejection_reason}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {total > 20 && (
            <div className="flex justify-center gap-2 mt-6">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm disabled:opacity-40">السابق</button>
              <span className="px-4 py-2 text-sm text-gray-500">صفحة {page} من {Math.ceil(total / 20)}</span>
              <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 20)}
                className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm disabled:opacity-40">التالي</button>
            </div>
          )}
        </>
      )}

      {/* ── Preview Modal ──────────────────────────────────────────────────── */}
      {previewResource && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setPreviewResource(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            style={{ width: '90vw', height: '90vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50 flex-shrink-0">
              <div className="flex gap-2">
                <a
                  href={getPreviewUrl(previewResource.file_url)}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700"
                >
                  ⬇ فتح في تبويب جديد
                </a>
                <button
                  onClick={() => setPreviewResource(null)}
                  className="px-3 py-1.5 bg-gray-200 text-gray-700 text-xs rounded-lg hover:bg-gray-300"
                >
                  ✕ إغلاق
                </button>
              </div>
              <div className="text-right">
                <h3 className="font-bold text-gray-900 text-sm">
                  {previewResource.title_ar || previewResource.title}
                </h3>
                {previewResource.subject && (
                  <p className="text-xs text-gray-400">{previewResource.subject}</p>
                )}
              </div>
            </div>
            {/* Iframe viewer */}
            <iframe
              src={getPreviewUrl(previewResource.file_url)}
              className="flex-1 w-full border-0"
              title={previewResource.title}
              allow="autoplay"
            />
          </div>
        </div>
      )}
    </div>
  );
}
