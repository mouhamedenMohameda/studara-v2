import React, { useState, useEffect, useCallback } from 'react';
import { adminAcademicStructureApi } from '../api/typed';

// ─── Types ────────────────────────────────────────────────────────────────────
interface University { id: number; slug: string; name_ar: string; name_fr: string; city: string; sort_order: number; is_active: boolean; }
interface Faculty    { id: number; slug: string; university_slug: string; name_ar: string; name_fr: string; type: string; diploma_note: string; sort_order: number; is_active: boolean; num_years: number | null; }
interface Filiere    { id: number; slug: string; faculty_slug: string; name_ar: string; name_fr: string; sort_order: number; is_active: boolean; }

const FACULTY_TYPES = ['faculty', 'institute', 'preparatory', 'prepa-engineer'] as const;
const TYPE_LABELS: Record<string, string> = {
  'faculty': 'كلية (Faculty)',
  'institute': 'معهد (Institute)',
  'preparatory': 'أقسام تحضيرية (Preparatory)',
  'prepa-engineer': 'IPGEI (Prépa → Ingénieur)',
};

// ─── Small reusable modal ────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400';

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AcademicStructurePage() {
  const [universities, setUniversities] = useState<University[]>([]);
  const [faculties,    setFaculties]    = useState<Faculty[]>([]);
  const [filieres,     setFilieres]     = useState<Filiere[]>([]);
  const [selUniv,      setSelUniv]      = useState<University | null>(null);
  const [selFac,       setSelFac]       = useState<Faculty | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');

  // Modal state
  const [univModal,  setUnivModal]  = useState<'add' | 'edit' | null>(null);
  const [facModal,   setFacModal]   = useState<'add' | 'edit' | null>(null);
  const [filModal,   setFilModal]   = useState<'add' | 'edit' | null>(null);
  const [editTarget, setEditTarget] = useState<University | Faculty | Filiere | null>(null);

  // Form state
  const emptyUniv = { slug: '', name_ar: '', name_fr: '', city: '', sort_order: 0, is_active: true };
  const emptyFac  = { slug: '', university_slug: '', name_ar: '', name_fr: '', type: 'faculty', diploma_note: '', sort_order: 0, is_active: true, num_years: null as number | null };
  const emptyFil  = { slug: '', faculty_slug: '', name_ar: '', name_fr: '', sort_order: 0, is_active: true };
  const [univForm, setUnivForm] = useState({ ...emptyUniv });
  const [facForm,  setFacForm]  = useState({ ...emptyFac });
  const [filForm,  setFilForm]  = useState({ ...emptyFil });

  // ── Fetch helpers ──────────────────────────────────────────────────────────
  const loadUnivs = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminAcademicStructureApi.universities.list() as any;
      setUniversities((r as any).data ?? r ?? []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  const loadFacs = useCallback(async (uSlug: string) => {
    const r = await adminAcademicStructureApi.faculties.list(uSlug) as any;
    setFaculties((r as any).data ?? r ?? []);
    setSelFac(null); setFilieres([]);
  }, []);

  const loadFils = useCallback(async (fSlug: string) => {
    const r = await adminAcademicStructureApi.filieres.list(fSlug) as any;
    setFilieres((r as any).data ?? r ?? []);
  }, []);

  useEffect(() => { loadUnivs(); }, [loadUnivs]);

  // ── Select handlers ────────────────────────────────────────────────────────
  const pickUniv = async (u: University) => {
    setSelUniv(u); setSelFac(null); setFilieres([]);
    await loadFacs(u.slug);
  };
  const pickFac = async (f: Faculty) => {
    setSelFac(f);
    await loadFils(f.slug);
  };

  // ── University CRUD ────────────────────────────────────────────────────────
  const openAddUniv = () => { setUnivForm({ ...emptyUniv }); setEditTarget(null); setUnivModal('add'); };
  const openEditUniv = (u: University) => { setUnivForm({ slug: u.slug, name_ar: u.name_ar, name_fr: u.name_fr, city: u.city || '', sort_order: u.sort_order, is_active: u.is_active }); setEditTarget(u); setUnivModal('edit'); };
  const saveUniv = async () => {
    try {
      if (univModal === 'add') await adminAcademicStructureApi.universities.create(univForm as any);
      else                     await adminAcademicStructureApi.universities.update((editTarget as University).id, univForm as any);
      setUnivModal(null); await loadUnivs();
    } catch (e: any) { alert(e.message); }
  };
  const deleteUniv = async (u: University) => {
    if (!confirm(`حذف ${u.name_ar}؟ سيحذف كل ما يتبعها.`)) return;
    await adminAcademicStructureApi.universities.delete(u.id);
    setSelUniv(null); setFaculties([]); setFilieres([]);
    await loadUnivs();
  };

  // ── Faculty CRUD ───────────────────────────────────────────────────────────
  const openAddFac = () => {
    if (!selUniv) return;
    setFacForm({ ...emptyFac, university_slug: selUniv.slug });
    setEditTarget(null); setFacModal('add');
  };
  const openEditFac = (f: Faculty) => {
    setFacForm({ slug: f.slug, university_slug: f.university_slug, name_ar: f.name_ar, name_fr: f.name_fr, type: f.type, diploma_note: f.diploma_note || '', sort_order: f.sort_order, is_active: f.is_active, num_years: f.num_years ?? null });
    setEditTarget(f); setFacModal('edit');
  };
  const saveFac = async () => {
    try {
      if (facModal === 'add') await adminAcademicStructureApi.faculties.create(facForm as any);
      else                    await adminAcademicStructureApi.faculties.update((editTarget as Faculty).id, facForm as any);
      setFacModal(null);
      if (selUniv) await loadFacs(selUniv.slug);
    } catch (e: any) { alert(e.message); }
  };
  const deleteFac = async (f: Faculty) => {
    if (!confirm(`حذف ${f.name_ar}؟ سيحذف كل الفليرات.`)) return;
    await adminAcademicStructureApi.faculties.delete(f.id);
    if (selFac?.id === f.id) { setSelFac(null); setFilieres([]); }
    if (selUniv) await loadFacs(selUniv.slug);
  };

  // ── Filiere CRUD ───────────────────────────────────────────────────────────
  const openAddFil = () => {
    if (!selFac) return;
    setFilForm({ ...emptyFil, faculty_slug: selFac.slug });
    setEditTarget(null); setFilModal('add');
  };
  const openEditFil = (fi: Filiere) => {
    setFilForm({ slug: fi.slug, faculty_slug: fi.faculty_slug, name_ar: fi.name_ar, name_fr: fi.name_fr, sort_order: fi.sort_order, is_active: fi.is_active });
    setEditTarget(fi); setFilModal('edit');
  };
  const saveFil = async () => {
    try {
      if (filModal === 'add') await adminAcademicStructureApi.filieres.create(filForm as any);
      else                    await adminAcademicStructureApi.filieres.update((editTarget as Filiere).id, filForm as any);
      setFilModal(null);
      if (selFac) await loadFils(selFac.slug);
    } catch (e: any) { alert(e.message); }
  };
  const deleteFil = async (fi: Filiere) => {
    if (!confirm(`حذف ${fi.name_ar}؟`)) return;
    await adminAcademicStructureApi.filieres.delete(fi.id);
    if (selFac) await loadFils(selFac.slug);
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">🏫 الهيكل الأكاديمي</h1>
        <p className="text-sm text-gray-500 mt-1">إدارة الجامعات → الكليات/المعاهد → الفليرات</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Column 1: Universities ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800 text-sm">الجامعات / المؤسسات</h2>
            <button onClick={openAddUniv} className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700">+ إضافة</button>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {loading && <p className="text-center text-gray-400 py-8 text-sm">جارٍ التحميل…</p>}
            {universities.map(u => (
              <div
                key={u.id}
                onClick={() => pickUniv(u)}
                className={`px-4 py-3 cursor-pointer hover:bg-gray-50 transition ${selUniv?.id === u.id ? 'bg-green-50 border-r-2 border-green-500' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{u.name_ar}</p>
                    <p className="text-xs text-gray-400">{u.city} · {u.slug}</p>
                  </div>
                  <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                    <button onClick={() => openEditUniv(u)} className="text-xs text-blue-500 hover:underline">تعديل</button>
                    <button onClick={() => deleteUniv(u)} className="text-xs text-red-400 hover:underline">حذف</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Column 2: Faculties ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800 text-sm">
              {selUniv ? `كليات: ${selUniv.name_ar}` : 'الكليات / المعاهد'}
            </h2>
            <button
              onClick={openAddFac}
              disabled={!selUniv}
              className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >+ إضافة</button>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {!selUniv && <p className="text-center text-gray-400 py-8 text-sm">اختر جامعة أولاً</p>}
            {faculties.map(f => (
              <div
                key={f.id}
                onClick={() => pickFac(f)}
                className={`px-4 py-3 cursor-pointer hover:bg-gray-50 transition ${selFac?.id === f.id ? 'bg-green-50 border-r-2 border-green-500' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{f.name_ar}</p>
                    <p className="text-xs text-gray-400">{TYPE_LABELS[f.type] ?? f.type} · {f.slug}</p>
                  </div>
                  <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                    <button onClick={() => openEditFac(f)} className="text-xs text-blue-500 hover:underline">تعديل</button>
                    <button onClick={() => deleteFac(f)} className="text-xs text-red-400 hover:underline">حذف</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Column 3: Filieres ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800 text-sm">
              {selFac ? `فليرات: ${selFac.name_ar}` : 'الفليرات / التخصصات'}
            </h2>
            <button
              onClick={openAddFil}
              disabled={!selFac}
              className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >+ إضافة</button>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {!selFac && <p className="text-center text-gray-400 py-8 text-sm">اختر كلية أولاً</p>}
            {filieres.map(fi => (
              <div key={fi.id} className="px-4 py-3 flex items-center justify-between hover:bg-gray-50">
                <div>
                  <p className="text-sm font-medium text-gray-800">{fi.name_ar}</p>
                  <p className="text-xs text-gray-400">{fi.name_fr} · {fi.slug}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEditFil(fi)} className="text-xs text-blue-500 hover:underline">تعديل</button>
                  <button onClick={() => deleteFil(fi)} className="text-xs text-red-400 hover:underline">حذف</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── University Modal ── */}
      {univModal && (
        <Modal title={univModal === 'add' ? 'إضافة جامعة' : 'تعديل الجامعة'} onClose={() => setUnivModal(null)}>
          <div className="space-y-3">
            <Field label="Slug (بدون مسافات)">
              <input className={inputCls} value={univForm.slug} onChange={e => setUnivForm(p => ({ ...p, slug: e.target.value }))} placeholder="una" />
            </Field>
            <Field label="الاسم بالعربية">
              <input className={inputCls} value={univForm.name_ar} onChange={e => setUnivForm(p => ({ ...p, name_ar: e.target.value }))} dir="rtl" />
            </Field>
            <Field label="Nom en français">
              <input className={inputCls} value={univForm.name_fr} onChange={e => setUnivForm(p => ({ ...p, name_fr: e.target.value }))} dir="ltr" />
            </Field>
            <Field label="المدينة">
              <input className={inputCls} value={univForm.city} onChange={e => setUnivForm(p => ({ ...p, city: e.target.value }))} dir="rtl" />
            </Field>
            <Field label="الترتيب (sort_order)">
              <input className={inputCls} type="number" value={univForm.sort_order} onChange={e => setUnivForm(p => ({ ...p, sort_order: +e.target.value }))} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={univForm.is_active} onChange={e => setUnivForm(p => ({ ...p, is_active: e.target.checked }))} />
              مفعّل
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setUnivModal(null)} className="px-4 py-2 text-sm border border-gray-200 rounded-xl hover:bg-gray-50">إلغاء</button>
            <button onClick={saveUniv} className="px-4 py-2 text-sm bg-green-600 text-white rounded-xl hover:bg-green-700">حفظ</button>
          </div>
        </Modal>
      )}

      {/* ── Faculty Modal ── */}
      {facModal && (
        <Modal title={facModal === 'add' ? 'إضافة كلية / معهد' : 'تعديل الكلية'} onClose={() => setFacModal(null)}>
          <div className="space-y-3">
            <Field label="Slug">
              <input className={inputCls} value={facForm.slug} onChange={e => setFacForm(p => ({ ...p, slug: e.target.value }))} dir="ltr" />
            </Field>
            <Field label="الاسم بالعربية">
              <input className={inputCls} value={facForm.name_ar} onChange={e => setFacForm(p => ({ ...p, name_ar: e.target.value }))} dir="rtl" />
            </Field>
            <Field label="Nom en français">
              <input className={inputCls} value={facForm.name_fr} onChange={e => setFacForm(p => ({ ...p, name_fr: e.target.value }))} dir="ltr" />
            </Field>
            <Field label="النوع">
              <select className={inputCls} value={facForm.type} onChange={e => setFacForm(p => ({ ...p, type: e.target.value }))}>
                {FACULTY_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
              </select>
            </Field>
            <Field label="ملاحظة الدبلوم (اختياري)">
              <input className={inputCls} value={facForm.diploma_note} onChange={e => setFacForm(p => ({ ...p, diploma_note: e.target.value }))} dir="ltr" />
            </Field>
            <Field label="عدد السنوات (اختياري)">
              <input
                className={inputCls}
                type="number"
                min={1}
                max={10}
                placeholder="مثال: 3 أو 5 أو 7"
                value={facForm.num_years ?? ''}
                onChange={e => setFacForm(p => ({ ...p, num_years: e.target.value === '' ? null : +e.target.value }))}
              />
            </Field>
            <Field label="الترتيب">
              <input className={inputCls} type="number" value={facForm.sort_order} onChange={e => setFacForm(p => ({ ...p, sort_order: +e.target.value }))} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={facForm.is_active} onChange={e => setFacForm(p => ({ ...p, is_active: e.target.checked }))} />
              مفعّل
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setFacModal(null)} className="px-4 py-2 text-sm border border-gray-200 rounded-xl hover:bg-gray-50">إلغاء</button>
            <button onClick={saveFac} className="px-4 py-2 text-sm bg-green-600 text-white rounded-xl hover:bg-green-700">حفظ</button>
          </div>
        </Modal>
      )}

      {/* ── Filiere Modal ── */}
      {filModal && (
        <Modal title={filModal === 'add' ? 'إضافة فليرة' : 'تعديل الفليرة'} onClose={() => setFilModal(null)}>
          <div className="space-y-3">
            <Field label="Slug">
              <input className={inputCls} value={filForm.slug} onChange={e => setFilForm(p => ({ ...p, slug: e.target.value }))} dir="ltr" />
            </Field>
            <Field label="الاسم بالعربية">
              <input className={inputCls} value={filForm.name_ar} onChange={e => setFilForm(p => ({ ...p, name_ar: e.target.value }))} dir="rtl" />
            </Field>
            <Field label="Nom en français">
              <input className={inputCls} value={filForm.name_fr} onChange={e => setFilForm(p => ({ ...p, name_fr: e.target.value }))} dir="ltr" />
            </Field>
            <Field label="الترتيب">
              <input className={inputCls} type="number" value={filForm.sort_order} onChange={e => setFilForm(p => ({ ...p, sort_order: +e.target.value }))} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={filForm.is_active} onChange={e => setFilForm(p => ({ ...p, is_active: e.target.checked }))} />
              مفعّل
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setFilModal(null)} className="px-4 py-2 text-sm border border-gray-200 rounded-xl hover:bg-gray-50">إلغاء</button>
            <button onClick={saveFil} className="px-4 py-2 text-sm bg-green-600 text-white rounded-xl hover:bg-green-700">حفظ</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
