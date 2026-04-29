import React, { useEffect, useState, useCallback } from 'react';
import { adminDailyChallengesApi } from '../api/typed';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Question {
  front:          string;
  options:        [string, string, string, string];
  correct_answer: string;
  subject:        string;
}

interface ChallengeSet {
  id:             string;
  challenge_date: string;
  faculty:        string;
  show_from_hour:   number;
  show_from_minute: number;
  time_limit_s:     number;
  questions:      Question[];
  is_active:      boolean;
  created_at:     string;
  created_by_name?: string;
}

const FACULTIES = [
  { value: 'all',         label: 'الكل (جميع الطلاب)' },
  { value: 'sciences',    label: 'العلوم' },
  { value: 'medicine',    label: 'الطب' },
  { value: 'law',         label: 'الحقوق' },
  { value: 'economics',   label: 'الاقتصاد' },
  { value: 'arts',        label: 'الآداب' },
  { value: 'engineering', label: 'الهندسة' },
  { value: 'islamic',     label: 'الشريعة' },
];

const FACULTY_LABEL: Record<string, string> = Object.fromEntries(
  FACULTIES.map(f => [f.value, f.label])
);

const EMPTY_QUESTION = (): Question => ({
  front:          '',
  options:        ['', '', '', ''],
  correct_answer: '',
  subject:        '',
});

const DEFAULT_N_QUESTIONS = 5;

// ─── Question Builder ─────────────────────────────────────────────────────────
function QuestionEditor({
  q, qi, onChange, onRemove,
}: {
  q: Question;
  qi: number;
  onChange: (q: Question) => void;
  onRemove: () => void;
}) {
  const optLabels = ['A', 'B', 'C', 'D'];
  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-purple-700">السؤال {qi + 1}</span>
        <button
          onClick={onRemove}
          className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50"
        >
          ✕ حذف
        </button>
      </div>

      {/* Subject */}
      <input
        type="text"
        placeholder="المادة (اختياري) — مثال: الرياضيات"
        value={q.subject}
        onChange={e => onChange({ ...q, subject: e.target.value })}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right"
        dir="rtl"
      />

      {/* Question text */}
      <textarea
        placeholder="نص السؤال *"
        value={q.front}
        onChange={e => onChange({ ...q, front: e.target.value })}
        rows={2}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right resize-none"
        dir="rtl"
      />

      {/* Options */}
      <div className="space-y-2">
        <p className="text-xs text-gray-500 font-medium">الخيارات (اختر الصحيح بالنقر على ●)</p>
        {q.options.map((opt, oi) => {
          const isCorrect = q.correct_answer === opt && opt !== '';
          return (
            <div key={oi} className="flex items-center gap-2">
              <button
                onClick={() => opt && onChange({ ...q, correct_answer: opt })}
                title="انقر لتعيين كإجابة صحيحة"
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition
                  ${isCorrect
                    ? 'border-green-500 bg-green-500 text-white'
                    : 'border-gray-300 hover:border-green-400'}`}
              >
                {isCorrect ? '✓' : ''}
              </button>
              <span className="text-xs font-bold text-gray-400 w-4">{optLabels[oi]}</span>
              <input
                type="text"
                placeholder={`الخيار ${optLabels[oi]} *`}
                value={opt}
                onChange={e => {
                  const newOpts = [...q.options] as [string, string, string, string];
                  newOpts[oi] = e.target.value;
                  // If this option was the correct answer, update correct_answer
                  const newCorrect = q.correct_answer === q.options[oi] ? e.target.value : q.correct_answer;
                  onChange({ ...q, options: newOpts, correct_answer: newCorrect });
                }}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-right"
                dir="rtl"
              />
            </div>
          );
        })}
      </div>

      {q.correct_answer && (
        <p className="text-xs text-green-600 font-medium text-right">
          ✓ الإجابة الصحيحة: "{q.correct_answer}"
        </p>
      )}
      {!q.correct_answer && (
        <p className="text-xs text-amber-500 text-right">⚠ لم تحدد الإجابة الصحيحة بعد</p>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DailyChallengeAdminPage() {
  const [sets,    setSets]    = useState<ChallengeSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [saving,  setSaving]  = useState(false);

  // Form state
  const [showForm,  setShowForm]  = useState(false);
  const [editId,    setEditId]    = useState<string | null>(null);
  const [formDate,  setFormDate]  = useState('');
  const [formFaculty,   setFormFaculty]   = useState('all');
  const [formHour,      setFormHour]      = useState(0);
  const [formMinute,    setFormMinute]    = useState(0);
  const [formTimeLimit, setFormTimeLimit] = useState(60);
  const [formActive,    setFormActive]    = useState(true);
  const [questions, setQuestions] = useState<Question[]>(
    Array.from({ length: DEFAULT_N_QUESTIONS }, EMPTY_QUESTION),
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminDailyChallengesApi.list() as ChallengeSet[];
      setSets(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Open form for new or edit ─────────────────────────────────────────────
  const openNew = () => {
    setEditId(null);
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormFaculty('all');
    setFormHour(0);
    setFormMinute(0);
    setFormTimeLimit(60);
    setFormActive(true);
    setQuestions(Array.from({ length: DEFAULT_N_QUESTIONS }, EMPTY_QUESTION));
    setShowForm(true);
  };

  const openEdit = (s: ChallengeSet) => {
    setEditId(s.id);
    setFormDate(s.challenge_date);
    setFormFaculty(s.faculty);
    setFormHour(s.show_from_hour);
    setFormMinute(s.show_from_minute ?? 0);
    setFormTimeLimit(s.time_limit_s);
    setFormActive(s.is_active);
    // Ensure 4 options per question
    setQuestions(s.questions.map(q => ({
      ...q,
      options: [
        q.options[0] ?? '',
        q.options[1] ?? '',
        q.options[2] ?? '',
        q.options[3] ?? '',
      ] as [string, string, string, string],
    })));
    setShowForm(true);
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    // Validate
    if (!formDate) { alert('اختر تاريخ التحدي'); return; }
    const validQs = questions.filter(q => q.front.trim() && q.correct_answer.trim() && q.options.every(o => o.trim()));
    if (validQs.length < 1) { alert('أضف سؤالاً واحداً على الأقل مع 4 خيارات وإجابة صحيحة'); return; }

    setSaving(true);
    try {
      const payload = {
        challenge_date: formDate,
        faculty:        formFaculty,
        show_from_hour:   formHour,
        show_from_minute: formMinute,
        time_limit_s:     formTimeLimit,
        is_active:      formActive,
        questions:      validQs,
      };

      if (editId) {
        await adminDailyChallengesApi.update(editId, payload as any);
      } else {
        await adminDailyChallengesApi.create(payload as any);
      }

      setShowForm(false);
      await load();
    } catch (e: any) {
      alert('خطأ: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string, date: string) => {
    if (!confirm(`حذف تحدي ${date}؟ لا يمكن التراجع`)) return;
    try {
      await adminDailyChallengesApi.delete(id);
      await load();
    } catch (e: any) {
      alert('خطأ: ' + e.message);
    }
  };

  // ── Toggle active ─────────────────────────────────────────────────────────
  const handleToggle = async (s: ChallengeSet) => {
    try {
      await adminDailyChallengesApi.update(s.id, { is_active: !s.is_active });
      await load();
    } catch (e: any) {
      alert('خطأ: ' + e.message);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">🎲 التحدي اليومي</h1>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-purple-700 transition"
        >
          <span className="text-lg">＋</span>
          إضافة تحدي
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* ── FORM MODAL ── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-8 pb-8 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 p-6 space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                {editId ? '✏️ تعديل التحدي' : '＋ تحدي جديد'}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            {/* Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">📅 تاريخ التحدي *</label>
              <input
                type="date"
                value={formDate}
                onChange={e => setFormDate(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm"
              />
            </div>

            {/* Faculty */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">🎓 الفِرقة المستهدفة</label>
              <select
                value={formFaculty}
                onChange={e => setFormFaculty(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white"
              >
                {FACULTIES.map(f => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>

            {/* Time settings */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  🕐 وقت البدء (UTC)
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0} max={23}
                    value={formHour}
                    onChange={e => setFormHour(Math.min(23, Math.max(0, Number(e.target.value))))}
                    className="w-16 border border-gray-200 rounded-xl px-2 py-2.5 text-sm text-center"
                  />
                  <span className="text-gray-400 font-bold text-lg">:</span>
                  <input
                    type="number"
                    min={0} max={59}
                    value={formMinute}
                    onChange={e => setFormMinute(Math.min(59, Math.max(0, Number(e.target.value))))}
                    className="w-16 border border-gray-200 rounded-xl px-2 py-2.5 text-sm text-center"
                  />
                  <span className="text-sm text-gray-500">UTC</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">0 = متاح من منتصف الليل</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ⏱ مدة التحدي (ثانية)
                </label>
                <input
                  type="number"
                  min={10} max={3600}
                  value={formTimeLimit}
                  onChange={e => setFormTimeLimit(Number(e.target.value))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm"
                />
              </div>
            </div>

            {/* Active toggle */}
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
              <span className="text-sm font-medium text-gray-700">التحدي نشط (يظهر للطلاب)</span>
              <button
                onClick={() => setFormActive(!formActive)}
                className={`w-12 h-6 rounded-full transition-colors relative ${formActive ? 'bg-green-500' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${formActive ? 'left-7' : 'left-1'}`} />
              </button>
            </div>

            {/* Questions */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-bold text-gray-700">
                  📝 الأسئلة ({questions.length})
                </label>
                <button
                  onClick={() => setQuestions(qs => [...qs, EMPTY_QUESTION()])}
                  className="text-xs text-purple-600 hover:text-purple-800 font-medium px-3 py-1 rounded-lg hover:bg-purple-50"
                >
                  ＋ سؤال
                </button>
              </div>
              <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                {questions.map((q, qi) => (
                  <QuestionEditor
                    key={qi}
                    q={q}
                    qi={qi}
                    onChange={newQ => setQuestions(qs => qs.map((x, i) => i === qi ? newQ : x))}
                    onRemove={() => setQuestions(qs => qs.filter((_, i) => i !== qi))}
                  />
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-purple-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-purple-700 transition disabled:opacity-50"
              >
                {saving ? 'جارٍ الحفظ...' : (editId ? '💾 تحديث' : '✅ إنشاء التحدي')}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-6 border border-gray-200 text-gray-600 py-3 rounded-xl text-sm font-medium hover:bg-gray-50"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── LIST ── */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 ml-3" />
          <span>جارٍ التحميل...</span>
        </div>
      ) : sets.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <div className="text-5xl mb-4">🎲</div>
          <p className="text-lg font-medium">لا توجد تحديات مجدولة بعد</p>
          <p className="text-sm mt-2">أنشئ أول تحدي يومي من الزر أعلاه</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sets.map(s => {
            const isPast    = s.challenge_date < new Date().toISOString().slice(0, 10);
            const isToday   = s.challenge_date === new Date().toISOString().slice(0, 10);
            const isFuture  = s.challenge_date > new Date().toISOString().slice(0, 10);
            const statusBg  = isToday ? 'bg-purple-50 border-purple-200'
              : isPast  ? 'bg-gray-50 border-gray-200'
              : 'bg-blue-50 border-blue-200';
            const badge = isToday ? (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-purple-600 text-white">اليوم</span>
            ) : isFuture ? (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-500 text-white">مجدول</span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-500">منتهٍ</span>
            );

            return (
              <div key={s.id} className={`border rounded-2xl p-5 ${statusBg}`}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  {/* Info */}
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-900">{s.challenge_date}</span>
                      {badge}
                      {!s.is_active && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">معطّل</span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500 flex-wrap">
                      <span>🎓 {FACULTY_LABEL[s.faculty] ?? s.faculty}</span>
                      <span>🕐 {String(s.show_from_hour).padStart(2,'0')}:{String(s.show_from_minute ?? 0).padStart(2,'0')} UTC</span>
                      <span>⏱ {s.time_limit_s}ث</span>
                      <span>📝 {s.questions.length} سؤال</span>
                    </div>
                    {s.created_by_name && (
                      <p className="text-xs text-gray-400">أُنشئ بواسطة: {s.created_by_name}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleToggle(s)}
                      title={s.is_active ? 'تعطيل' : 'تفعيل'}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition
                        ${s.is_active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                      {s.is_active ? '✅ نشط' : '⭕ معطّل'}
                    </button>
                    <button
                      onClick={() => openEdit(s)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition"
                    >
                      ✏️ تعديل
                    </button>
                    <button
                      onClick={() => handleDelete(s.id, s.challenge_date)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 transition"
                    >
                      🗑
                    </button>
                  </div>
                </div>

                {/* Questions preview */}
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {s.questions.slice(0, 4).map((q, qi) => (
                    <div key={qi} className="bg-white/70 rounded-lg px-3 py-2 text-xs text-gray-700 line-clamp-2 text-right">
                      <span className="font-bold text-purple-600 ml-1">{qi + 1}.</span>
                      {q.front}
                    </div>
                  ))}
                  {s.questions.length > 4 && (
                    <div className="bg-white/70 rounded-lg px-3 py-2 text-xs text-gray-400 text-right">
                      +{s.questions.length - 4} أسئلة إضافية…
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
