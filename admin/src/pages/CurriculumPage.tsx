import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminCurriculumApi } from '../api/typed';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Faculty {
  id: string;
  slug: string;
  name_fr: string;
  name_ar: string;
  icon: string;
  is_active: boolean;
  sort_order: number;
}

interface Subject {
  id: string;
  name_ar: string;
  name_fr: string | null;
  faculty_slug: string;
  faculty_name_fr: string;
  faculty_name_ar: string;
  faculty_icon: string;
  year: number | null;
  is_active: boolean;
  sort_order: number;
}

const YEARS = [1, 2, 3, 4, 5, 6, 7];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CurriculumPage() {
  const [tab, setTab] = useState<'faculties' | 'subjects'>('faculties');
  const navigate = useNavigate();

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">المناهج الدراسية</h1>
      <p className="text-sm text-gray-500 mb-4">إدارة الفلايير والمواد الدراسية</p>

      {/* Notice banner */}
      <div className="mb-6 flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
        <span className="text-xl mt-0.5">🏫</span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-blue-800">الهيكل الأكاديمي الجديد متاح الآن</p>
          <p className="text-xs text-blue-600 mt-0.5">
            تسجيل الطلاب (الجامعة → الكلية → الشعبة) يُدار الآن في صفحة مستقلة.
            الفلايير هنا تُستخدم فقط لتصنيف <strong>الموارد والمواد الدراسية</strong>.
          </p>
        </div>
        <button
          onClick={() => navigate('/academic-structure')}
          className="shrink-0 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition whitespace-nowrap"
        >
          🏫 الهيكل الأكاديمي ←
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        <button
          onClick={() => setTab('faculties')}
          className={`px-5 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
            tab === 'faculties'
              ? 'bg-white border border-b-white border-gray-200 -mb-px text-indigo-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          🏛️ الفلايير (تصنيف الموارد)
        </button>
        <button
          onClick={() => setTab('subjects')}
          className={`px-5 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
            tab === 'subjects'
              ? 'bg-white border border-b-white border-gray-200 -mb-px text-indigo-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          📖 المواد
        </button>
      </div>

      {tab === 'faculties' ? <FacultiesTab /> : <SubjectsTab />}
    </div>
  );
}

// ── Faculties Tab ─────────────────────────────────────────────────────────────

function FacultiesTab() {
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Add form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ slug: '', name_fr: '', name_ar: '', icon: '🎓', sort_order: '0' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name_fr: '', name_ar: '', icon: '', sort_order: '' });

  // Detail panel
  const [selectedFaculty, setSelectedFaculty] = useState<Faculty | null>(null);

  const load = () => {
    setLoading(true);
    adminCurriculumApi.faculties.list()
      .then((data: Faculty[]) => { setFaculties(data); setError(''); })
      .catch(() => setError('Erreur de chargement'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!form.slug || !form.name_fr || !form.name_ar) {
      setFormError('Tous les champs obligatoires doivent être remplis');
      return;
    }
    setSaving(true);
    try {
      await adminCurriculumApi.faculties.create({ ...form, sort_order: Number(form.sort_order) } as any);
      setForm({ slug: '', name_fr: '', name_ar: '', icon: '🎓', sort_order: '0' });
      setShowForm(false);
      load();
    } catch (err: any) {
      setFormError(err.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (faculty: Faculty) => {
    if (editId === faculty.id) {
      // Save
      try {
        await adminCurriculumApi.faculties.update(faculty.id, {
          name_fr: editForm.name_fr,
          name_ar: editForm.name_ar,
          icon: editForm.icon,
          sort_order: Number(editForm.sort_order),
        } as any);
        setEditId(null);
        load();
      } catch {
        alert('Erreur lors de la mise à jour');
      }
    } else {
      setEditId(faculty.id);
      setEditForm({
        name_fr: faculty.name_fr,
        name_ar: faculty.name_ar,
        icon: faculty.icon,
        sort_order: String(faculty.sort_order),
      });
    }
  };

  const handleDelete = async (f: Faculty) => {
    if (!confirm(`Supprimer la filière "${f.name_fr}" ? Les matières associées seront aussi supprimées.`)) return;
    try {
      await adminCurriculumApi.faculties.delete(f.id);
      load();
    } catch {
      alert('Erreur lors de la suppression');
    }
  };

  const handleToggle = async (f: Faculty) => {
    try {
      await adminCurriculumApi.faculties.update(f.id, { is_active: !f.is_active } as any);
      load();
    } catch {
      alert('Erreur');
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-500">{faculties.length} filière(s) enregistrée(s)</p>
        <button
          onClick={() => setShowForm(v => !v)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          {showForm ? '✕ Annuler' : '+ Ajouter une filière'}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleAdd} className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Slug (identifiant unique)*</label>
            <input
              value={form.slug}
              onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
              placeholder="ex: sciences"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Icône</label>
            <input
              value={form.icon}
              onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nom en français*</label>
            <input
              value={form.name_fr}
              onChange={e => setForm(f => ({ ...f, name_fr: e.target.value }))}
              placeholder="ex: Sciences"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">الاسم بالعربية*</label>
            <input
              dir="rtl"
              value={form.name_ar}
              onChange={e => setForm(f => ({ ...f, name_ar: e.target.value }))}
              placeholder="مثال: العلوم"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Ordre d'affichage</label>
            <input
              type="number"
              value={form.sort_order}
              onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={saving}
              className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Enregistrement…' : '✓ Créer la filière'}
            </button>
          </div>
          {formError && <p className="col-span-2 text-sm text-red-500">{formError}</p>}
        </form>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Chargement…</div>
      ) : error ? (
        <div className="text-center py-12 text-red-500">{error}</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Icône</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Slug</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Français</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">العربية</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Ordre</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Statut</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {faculties.map(f => (
                <tr
                  key={f.id}
                  className="hover:bg-indigo-50/40 transition-colors cursor-pointer"
                  onClick={() => { if (editId !== f.id) setSelectedFaculty(f); }}
                >
                  <td className="px-4 py-3 text-xl" onClick={e => e.stopPropagation()}>
                    {editId === f.id
                      ? <input value={editForm.icon} onChange={e => setEditForm(ef => ({ ...ef, icon: e.target.value }))} className="w-12 border rounded px-1 py-0.5 text-center" />
                      : f.icon}
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-500 text-xs">{f.slug}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">
                    {editId === f.id
                      ? <input value={editForm.name_fr} onChange={e => setEditForm(ef => ({ ...ef, name_fr: e.target.value }))} className="border rounded px-2 py-1 text-sm w-full" />
                      : f.name_fr}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-800" dir="rtl">
                    {editId === f.id
                      ? <input dir="rtl" value={editForm.name_ar} onChange={e => setEditForm(ef => ({ ...ef, name_ar: e.target.value }))} className="border rounded px-2 py-1 text-sm w-full text-right" />
                      : f.name_ar}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-500">
                    {editId === f.id
                      ? <input type="number" value={editForm.sort_order} onChange={e => setEditForm(ef => ({ ...ef, sort_order: e.target.value }))} className="border rounded px-2 py-1 text-sm w-16 text-center" />
                      : f.sort_order}
                  </td>
                  <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => handleToggle(f)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                        f.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {f.is_active ? '● Actif' : '○ Inactif'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1 justify-center">
                      <button
                        onClick={() => setSelectedFaculty(f)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-50 text-purple-600 hover:bg-purple-100 transition-colors"
                        title="Voir les détails"
                      >
                        👁️
                      </button>
                      <button
                        onClick={() => handleEdit(f)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          editId === f.id
                            ? 'bg-green-600 text-white hover:bg-green-700'
                            : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                        }`}
                      >
                        {editId === f.id ? '✓ Sauv.' : '✏️ Éditer'}
                      </button>
                      {editId === f.id && (
                        <button
                          onClick={() => setEditId(null)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200"
                        >
                          ✕
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(f)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {faculties.length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-gray-400">Aucune filière</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selectedFaculty && (
        <FacultyDetailModal faculty={selectedFaculty} onClose={() => setSelectedFaculty(null)} />
      )}
    </div>
  );
}

// ── Faculty Detail Modal ───────────────────────────────────────────────────────

function FacultyDetailModal({ faculty, onClose }: { faculty: Faculty; onClose: () => void }) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    adminCurriculumApi.subjects.list(faculty.slug)
      .then((data: Subject[]) => setSubjects(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [faculty.slug]);

  // Group subjects by year
  const byYear: Record<string, Subject[]> = {};
  subjects.forEach(s => {
    const key = s.year != null ? String(s.year) : 'all';
    if (!byYear[key]) byYear[key] = [];
    byYear[key].push(s);
  });
  const yearKeys = Object.keys(byYear).sort((a, b) => {
    if (a === 'all') return 1;
    if (b === 'all') return -1;
    return Number(a) - Number(b);
  });

  const YEAR_COLORS: Record<string, string> = {
    '1': 'bg-blue-100 text-blue-700 border-blue-200',
    '2': 'bg-teal-100 text-teal-700 border-teal-200',
    '3': 'bg-green-100 text-green-700 border-green-200',
    '4': 'bg-yellow-100 text-yellow-700 border-yellow-200',
    '5': 'bg-orange-100 text-orange-700 border-orange-200',
    '6': 'bg-red-100 text-red-700 border-red-200',
    '7': 'bg-purple-100 text-purple-700 border-purple-200',
    'all': 'bg-gray-100 text-gray-600 border-gray-200',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header gradient */}
        <div className="bg-gradient-to-br from-indigo-600 to-purple-700 px-6 py-5 text-white">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-5xl mb-3 drop-shadow">{faculty.icon}</div>
              <h2 className="text-2xl font-bold leading-tight">{faculty.name_fr}</h2>
              <p className="text-indigo-200 mt-1 text-base" dir="rtl">{faculty.name_ar}</p>
              <div className="flex flex-wrap gap-2 mt-3">
                <span className="bg-white/20 text-white text-xs px-2.5 py-1 rounded-full font-mono">
                  {faculty.slug}
                </span>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  faculty.is_active
                    ? 'bg-green-400/30 text-green-100'
                    : 'bg-red-400/30 text-red-200'
                }`}>
                  {faculty.is_active ? '● Actif' : '○ Inactif'}
                </span>
                <span className="bg-white/20 text-white text-xs px-2.5 py-1 rounded-full">
                  Ordre #{faculty.sort_order}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/70 hover:text-white text-2xl leading-none mt-1 hover:bg-white/10 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Stats bar */}
        {!loading && (
          <div className="px-6 py-3 bg-indigo-50 border-b border-indigo-100 flex flex-wrap gap-5 text-sm">
            <span className="text-gray-600">
              <span className="font-bold text-indigo-700 text-xl">{subjects.length}</span>
              <span className="ml-1 text-gray-500">matière(s)</span>
            </span>
            {yearKeys
              .filter(y => y !== 'all')
              .map(y => (
                <span key={y} className="text-gray-500">
                  Année {y}:{' '}
                  <span className="font-semibold text-gray-700">{byYear[y].length}</span>
                </span>
              ))}
            {byYear['all'] && (
              <span className="text-gray-500">
                Non classées:{' '}
                <span className="font-semibold text-gray-700">{byYear['all'].length}</span>
              </span>
            )}
          </div>
        )}

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <svg className="animate-spin h-6 w-6 mr-2 text-indigo-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Chargement des matières…
            </div>
          ) : subjects.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <div className="text-4xl mb-3">📭</div>
              Aucune matière enregistrée pour cette filière
            </div>
          ) : (
            <div className="space-y-6">
              {yearKeys.map(yearKey => (
                <div key={yearKey}>
                  <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">
                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold border ${
                      YEAR_COLORS[yearKey] ?? 'bg-gray-100 text-gray-600 border-gray-200'
                    }`}>
                      {yearKey === 'all' ? '∞' : yearKey}
                    </span>
                    {yearKey === 'all' ? 'Toutes les années' : `Année ${yearKey}`}
                    <span className="text-gray-300 font-normal">({byYear[yearKey].length})</span>
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {byYear[yearKey].map(s => (
                      <span
                        key={s.id}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors ${
                          s.is_active
                            ? 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300 hover:bg-indigo-50'
                            : 'bg-gray-50 border-gray-100 text-gray-400'
                        }`}
                      >
                        <span dir="rtl">{s.name_ar}</span>
                        {s.name_fr && (
                          <span className="text-gray-400 text-xs border-l border-gray-200 pl-1.5">{s.name_fr}</span>
                        )}
                        {!s.is_active && <span className="text-red-400 text-xs">⊘</span>}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Subjects Tab ──────────────────────────────────────────────────────────────

function SubjectsTab() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [filterFaculty, setFilterFaculty] = useState('');
  const [filterYear, setFilterYear] = useState('');

  // Add form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name_ar: '', name_fr: '', faculty_slug: '', year: '', sort_order: '0' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Edit
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name_ar: '', name_fr: '', year: '' });

  const loadSubjects = () => {
    setLoading(true);
    adminCurriculumApi.subjects.list(filterFaculty || undefined, filterYear ? Number(filterYear) : undefined)
      .then((data: Subject[]) => { setSubjects(data); setError(''); })
      .catch(() => setError('Erreur de chargement'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    adminCurriculumApi.faculties.list()
      .then((data: Faculty[]) => setFaculties(data))
      .catch(() => {});
  }, []);

  useEffect(() => { loadSubjects(); }, [filterFaculty, filterYear]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!form.name_ar || !form.faculty_slug) {
      setFormError('الاسم بالعربية والفليار مطلوبان');
      return;
    }
    setSaving(true);
    try {
      await adminCurriculumApi.subjects.create({
        name_ar: form.name_ar,
        name_fr: form.name_fr || null,
        faculty_slug: form.faculty_slug,
        year: form.year ? Number(form.year) : null,
        sort_order: Number(form.sort_order),
      } as any);
      setForm({ name_ar: '', name_fr: '', faculty_slug: form.faculty_slug, year: form.year, sort_order: '0' });
      setShowForm(false);
      loadSubjects();
    } catch (err: any) {
      setFormError(err.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const handleEditSave = async (s: Subject) => {
    try {
      await adminCurriculumApi.subjects.update(s.id, {
        name_ar: editForm.name_ar,
        name_fr: editForm.name_fr || null,
        year: editForm.year ? Number(editForm.year) : null,
      } as any);
      setEditId(null);
      loadSubjects();
    } catch {
      alert('Erreur lors de la mise à jour');
    }
  };

  const handleDelete = async (s: Subject) => {
    if (!confirm(`Supprimer "${s.name_ar}" ?`)) return;
    try {
      await adminCurriculumApi.subjects.delete(s.id);
      loadSubjects();
    } catch {
      alert('Erreur lors de la suppression');
    }
  };

  const handleToggle = async (s: Subject) => {
    try {
      await adminCurriculumApi.subjects.update(s.id, { is_active: !s.is_active } as any);
      loadSubjects();
    } catch {
      alert('Erreur');
    }
  };

  return (
    <div>
      {/* Filters bar */}
      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Filière</label>
          <select
            value={filterFaculty}
            onChange={e => setFilterFaculty(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none bg-white"
          >
            <option value="">Toutes les filières</option>
            {faculties.map(f => (
              <option key={f.id} value={f.slug}>{f.icon} {f.name_fr}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Année</label>
          <select
            value={filterYear}
            onChange={e => setFilterYear(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none bg-white"
          >
            <option value="">Toutes les années</option>
            {YEARS.map(y => <option key={y} value={y}>Année {y}</option>)}
          </select>
        </div>
        <div className="ml-auto">
          <p className="text-xs text-gray-400 mb-1">&nbsp;</p>
          <button
            onClick={() => setShowForm(v => !v)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            {showForm ? '✕ Annuler' : '+ Ajouter une matière'}
          </button>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleAdd} className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-4 grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">اسم المادة بالعربية*</label>
            <input
              dir="rtl"
              value={form.name_ar}
              onChange={e => setForm(f => ({ ...f, name_ar: e.target.value }))}
              placeholder="مثال: الرياضيات"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nom en français</label>
            <input
              value={form.name_fr}
              onChange={e => setForm(f => ({ ...f, name_fr: e.target.value }))}
              placeholder="ex: Mathématiques"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Filière*</label>
            <select
              value={form.faculty_slug}
              onChange={e => setForm(f => ({ ...f, faculty_slug: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none bg-white"
            >
              <option value="">Choisir une filière</option>
              {faculties.map(f => <option key={f.id} value={f.slug}>{f.icon} {f.name_fr}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Année (optionnelle)</label>
            <select
              value={form.year}
              onChange={e => setForm(f => ({ ...f, year: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none bg-white"
            >
              <option value="">Toutes les années</option>
              {YEARS.map(y => <option key={y} value={y}>Année {y}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Ordre</label>
            <input
              type="number"
              value={form.sort_order}
              onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={saving}
              className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Enregistrement…' : '✓ Créer la matière'}
            </button>
          </div>
          {formError && <p className="col-span-3 text-sm text-red-500">{formError}</p>}
        </form>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Chargement…</div>
      ) : error ? (
        <div className="text-center py-12 text-red-500">{error}</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-right px-4 py-3 font-medium text-gray-600">المادة</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Français</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Filière</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Année</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Statut</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {subjects.map(s => (
                <tr key={s.id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-4 py-3 text-right font-medium text-gray-800" dir="rtl">
                    {editId === s.id
                      ? <input dir="rtl" value={editForm.name_ar} onChange={e => setEditForm(ef => ({ ...ef, name_ar: e.target.value }))} className="border rounded px-2 py-1 text-sm w-full text-right" />
                      : s.name_ar}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {editId === s.id
                      ? <input value={editForm.name_fr} onChange={e => setEditForm(ef => ({ ...ef, name_fr: e.target.value }))} className="border rounded px-2 py-1 text-sm w-full" />
                      : (s.name_fr || <span className="text-gray-300 italic text-xs">—</span>)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-medium">
                      {s.faculty_icon} {s.faculty_name_fr}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-500">
                    {editId === s.id
                      ? (
                        <select value={editForm.year} onChange={e => setEditForm(ef => ({ ...ef, year: e.target.value }))} className="border rounded px-2 py-1 text-xs">
                          <option value="">Toutes</option>
                          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                      )
                      : (s.year ? `Année ${s.year}` : <span className="text-gray-300 text-xs italic">Toutes</span>)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleToggle(s)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                        s.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {s.is_active ? '● Actif' : '○ Inactif'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex gap-1 justify-center">
                      {editId === s.id ? (
                        <>
                          <button onClick={() => handleEditSave(s)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700">✓ Sauv.</button>
                          <button onClick={() => setEditId(null)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200">✕</button>
                        </>
                      ) : (
                        <button
                          onClick={() => { setEditId(s.id); setEditForm({ name_ar: s.name_ar, name_fr: s.name_fr || '', year: s.year ? String(s.year) : '' }); }}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                        >
                          ✏️ Éditer
                        </button>
                      )}
                      <button onClick={() => handleDelete(s)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors">🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
              {subjects.length === 0 && (
                <tr><td colSpan={6} className="text-center py-10 text-gray-400">Aucune matière trouvée</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
