import { useState, useEffect, useRef } from 'react';
import { adminCurriculumApi, adminDriveImportApi } from '../api/typed';

interface Faculty {
  id: string;
  slug: string;
  name_fr: string;
  name_ar: string;
  icon: string;
  is_active: boolean;
  sort_order: number;
}

interface ImportJob {
  id: string;
  status: 'pending' | 'listing' | 'importing' | 'done' | 'error';
  driveUrl: string;
  faculty: string;
  year: number;
  university: string;
  startedAt: string;
  finishedAt?: string;
  logs: string[];
  summary?: {
    listed: number;
    inserted: number;
    duplicates: number;
    errors: number;
    subjects: Record<string, number>;
    byType: Record<string, number>;
  };
  error?: string;
}

const YEARS = [1, 2, 3, 4, 5, 6];

const STATUS_CONFIG = {
  pending:   { label: 'En attente',  color: '#6B7280', bg: '#F3F4F6' },
  listing:   { label: '📋 Listing Drive…', color: '#2563EB', bg: '#EFF6FF' },
  importing: { label: '⬆️ Import en cours…', color: '#7C3AED', bg: '#F5F3FF' },
  done:      { label: '✅ Terminé', color: '#059669', bg: '#ECFDF5' },
  error:     { label: '❌ Erreur', color: '#DC2626', bg: '#FEF2F2' },
};

export default function DriveImportPage() {
  const [driveUrl, setDriveUrl]     = useState('');
  const [faculty, setFaculty]       = useState('');
  const [year, setYear]             = useState(1);
  const [university, setUniversity] = useState('Université de Mauritanie');
  const [loading, setLoading]       = useState(false);
  const [faculties, setFaculties]   = useState<Faculty[]>([]);

  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [job, setJob]                   = useState<ImportJob | null>(null);
  const [history, setHistory]           = useState<ImportJob[]>([]);

  const logsRef  = useRef<HTMLDivElement>(null);
  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load faculties and history on mount
  useEffect(() => {
    adminCurriculumApi.faculties.list()
      .then((list: any) => {
        const active = (Array.isArray(list) ? list : []).filter((f: Faculty) => f.is_active);
        setFaculties(active);
        if (active.length > 0) {
          setFaculty(active[0].slug);
        }
      })
      .catch(() => {});
    adminDriveImportApi.list().then((data: any) => setHistory(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

  // Poll current job
  useEffect(() => {
    if (!currentJobId) return;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const j: ImportJob = await adminDriveImportApi.get(currentJobId!) as any;
        setJob(j);
        if (j.status === 'done' || j.status === 'error') {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setLoading(false);
          // Refresh history
          adminDriveImportApi.list().then((data: any) => setHistory(Array.isArray(data) ? data : [])).catch(() => {});
        }
      } catch {}
    }, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [currentJobId]);

  // Auto-scroll logs
  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [job?.logs]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!driveUrl.trim()) return;
    setLoading(true);
    setJob(null);
    try {
      const r = await adminDriveImportApi.start(driveUrl, faculty, year, university);
      setCurrentJobId((r as any).jobId);
    } catch (err: any) {
      setLoading(false);
      alert('Erreur: ' + (err.response?.data?.error || err.message));
    }
  };

  const renderBadge = (status: ImportJob['status']) => {
    const c = STATUS_CONFIG[status];
    return (
      <span style={{
        background: c.bg, color: c.color,
        padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
      }}>{c.label}</span>
    );
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
        📥 Import depuis Google Drive
      </h1>
      <p style={{ color: '#6B7280', marginBottom: 24 }}>
        Collez le lien d'un dossier Drive partagé — le serveur liste et importe automatiquement toutes les ressources.
      </p>

      {/* Form */}
      <form onSubmit={handleSubmit} style={{
        background: '#fff', border: '1px solid #E5E7EB',
        borderRadius: 12, padding: 24, marginBottom: 24,
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>🔗 Lien Google Drive (dossier partagé)</label>
          <input
            type="url"
            value={driveUrl}
            onChange={e => setDriveUrl(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/..."
            required
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>Filière</label>
            <select value={faculty} onChange={e => setFaculty(e.target.value)} style={inputStyle}>
              {faculties.map(f => <option key={f.slug} value={f.slug}>{f.icon} {f.name_fr}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Année d'étude</label>
            <select value={year} onChange={e => setYear(Number(e.target.value))} style={inputStyle}>
              {YEARS.map(y => <option key={y} value={y}>{y}ère / {y}ème année</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Université</label>
          <input
            type="text"
            value={university}
            onChange={e => setUniversity(e.target.value)}
            style={inputStyle}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            background: loading ? '#6B7280' : '#7C3AED',
            color: '#fff', border: 'none', borderRadius: 8,
            padding: '10px 28px', fontSize: 15, fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? '⏳ Import en cours…' : '🚀 Lancer l\'import'}
        </button>
      </form>

      {/* Current job progress */}
      {job && (
        <div style={{
          background: '#fff', border: '1px solid #E5E7EB',
          borderRadius: 12, padding: 24, marginBottom: 24,
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Job en cours</h2>
            {renderBadge(job.status)}
          </div>

          {/* Logs */}
          <div ref={logsRef} style={{
            background: '#111827', borderRadius: 8, padding: 12,
            fontFamily: 'monospace', fontSize: 12, color: '#D1FAE5',
            maxHeight: 260, overflowY: 'auto', marginBottom: 16,
            whiteSpace: 'pre-wrap', lineHeight: 1.6,
          }}>
            {job.logs.map((l, i) => (
              <div key={i} style={{ color: l.includes('❌') ? '#FCA5A5' : l.includes('✅') ? '#6EE7B7' : '#D1FAE5' }}>
                {l}
              </div>
            ))}
            {(job.status === 'listing' || job.status === 'importing') && (
              <span style={{ animation: 'blink 1s infinite' }}>█</span>
            )}
          </div>

          {/* Summary */}
          {job.summary && (
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>📊 Résumé de l'import</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
                <StatCard label="Fichiers Drive" value={job.summary.listed} color="#2563EB" />
                <StatCard label="✅ Insérés" value={job.summary.inserted} color="#059669" />
                <StatCard label="⏭️ Doublons" value={job.summary.duplicates} color="#D97706" />
                <StatCard label="❌ Erreurs" value={job.summary.errors} color="#DC2626" />
              </div>

              {/* Subjects */}
              {Object.keys(job.summary.subjects).length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Top matières détectées :</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {Object.entries(job.summary.subjects).slice(0, 15).map(([sub, count]) => (
                      <span key={sub} style={{
                        background: '#F3F4F6', borderRadius: 20,
                        padding: '3px 10px', fontSize: 12, color: '#374151',
                      }}>
                        {sub} <strong>({count})</strong>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* By type */}
              {Object.keys(job.summary.byType).length > 0 && (
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Par type :</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {Object.entries(job.summary.byType).map(([type, count]) => (
                      <span key={type} style={{
                        background: '#EFF6FF', color: '#2563EB',
                        borderRadius: 20, padding: '3px 10px', fontSize: 12,
                      }}>
                        {type}: <strong>{count}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {job.error && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: 12 }}>
              <p style={{ color: '#DC2626', fontSize: 13, margin: 0, fontFamily: 'monospace' }}>{job.error}</p>
            </div>
          )}
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div style={{
          background: '#fff', border: '1px solid #E5E7EB',
          borderRadius: 12, padding: 24,
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Historique des imports</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {history.map(h => (
              <div key={h.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', background: '#F9FAFB', borderRadius: 8,
                cursor: 'pointer',
              }} onClick={() => { setCurrentJobId(h.id); setJob(h); }}>
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#111827' }}>
                    {h.faculty} — Année {h.year} — {h.university}
                  </p>
                  <p style={{ margin: 0, fontSize: 11, color: '#9CA3AF' }}>
                    {new Date(h.startedAt).toLocaleString('fr-FR')}
                    {h.summary && ` · ${h.summary.inserted} insérés`}
                  </p>
                </div>
                {renderBadge(h.status)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      background: '#F9FAFB', borderRadius: 8, padding: '12px 16px',
      textAlign: 'center', border: `1px solid ${color}22`,
    }}>
      <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color }}>{value.toLocaleString()}</p>
      <p style={{ margin: 0, fontSize: 11, color: '#6B7280', marginTop: 2 }}>{label}</p>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600,
  color: '#374151', marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1px solid #D1D5DB', fontSize: 14, color: '#111827',
  boxSizing: 'border-box',
};
