export const API_BASE =
  (import.meta as any)?.env?.VITE_API_BASE ||
  'https://api.radar-mr.com/api/v1';

const ACCESS_KEY = 'admin_access_token';
const REFRESH_KEY = 'admin_refresh_token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_KEY);
  } catch {
    return null;
  }
}

export function setToken(access: string, refresh?: string) {
  try {
    localStorage.setItem(ACCESS_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  } catch {
    // ignore
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  } catch {
    // ignore
  }
}

async function request<T>(
  path: string,
  opts: { method?: string; body?: any; token?: string | null } = {},
): Promise<T> {
  const method = opts.method || (opts.body ? 'POST' : 'GET');
  const token = opts.token ?? getToken();
  const headers: Record<string, string> = {};
  if (!(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: opts.body
      ? opts.body instanceof FormData
        ? opts.body
        : JSON.stringify(opts.body)
      : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data as T;
}

// `api` is intentionally typed as `any` to keep the admin UI flexible across
// backend versions and avoid large compile-time coupling.
export const api: any = {
  request,
  login: (email: string, password: string) =>
    request('/auth/login', { method: 'POST', body: { email, password } }),

  // Feature flags (new)
  adminAppFeatures: () => request('/billing/admin/app-features'),
  setAdminAppFeature: (key: string, is_active: boolean) =>
    request(`/billing/admin/app-features/${encodeURIComponent(key)}`, { method: 'PUT', body: { is_active } }),
  disableAllAppFeatures: () =>
    request('/billing/admin/app-features/disable-all', { method: 'POST' }),

  adminPremiumFeatures: () => request('/billing/admin/features'),
  setAdminPremiumFeature: (key: string, is_active: boolean) =>
    request(`/billing/admin/features/${encodeURIComponent(key)}`, { method: 'PUT', body: { is_active } }),
  disableAllPremiumFeatures: () =>
    request('/billing/admin/features/disable-all', { method: 'POST' }),

  // ───────────────────────────────────────────────────────────────────────────
  // Admin dashboard
  // ───────────────────────────────────────────────────────────────────────────
  stats: () => request('/admin/stats'),
  analytics: () => request('/admin/analytics'),

  // ───────────────────────────────────────────────────────────────────────────
  // Admin resources moderation + admin upload + bulk scrape
  // ───────────────────────────────────────────────────────────────────────────
  resources: (status: string, page = 1) =>
    request(`/admin/resources?status=${encodeURIComponent(status)}&page=${page}`),
  moderate: (id: string, action: 'approve' | 'reject', reason?: string) =>
    request(`/admin/resources/${encodeURIComponent(id)}/moderate`, { method: 'PUT', body: { action, ...(reason ? { reason } : {}) } }),
  deleteResource: (id: string) =>
    request(`/admin/resources/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  uploadResource: (formData: FormData) =>
    request('/admin/resources/upload', { method: 'POST', body: formData }),
  bulkScrapeStatus: () => request('/admin/bulk-scrape/status'),
  bulkScrapeStart: (startNum: number, endNum: number) =>
    request('/admin/bulk-scrape/start', { method: 'POST', body: { startNum, endNum } }),
  bulkScrapeStop: () => request('/admin/bulk-scrape/stop', { method: 'POST' }),

  // ───────────────────────────────────────────────────────────────────────────
  // Admin users
  // ───────────────────────────────────────────────────────────────────────────
  users: (page = 1, q = '') =>
    request(`/admin/users?page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}`),
  pendingUsers: () => request('/admin/users/pending'),
  approveUser: (id: string) => request(`/admin/users/${encodeURIComponent(id)}/approve`, { method: 'PUT' }),
  banUser: (id: string, ban: boolean) => request(`/admin/users/${encodeURIComponent(id)}/ban`, { method: 'PUT', body: { ban } }),
  verifyUser: (id: string) => request(`/admin/users/${encodeURIComponent(id)}/verify`, { method: 'PUT' }),

  // ───────────────────────────────────────────────────────────────────────────
  // Admin jobs (CRUD)
  // ───────────────────────────────────────────────────────────────────────────
  adminJobs: (page = 1, q = '', domain = '', jobType = '') => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    if (q) params.set('q', q);
    if (domain) params.set('domain', domain);
    if (jobType) params.set('type', jobType);
    return request(`/jobs/admin?${params.toString()}`);
  },
  createJob: (body: any) => request('/jobs/admin', { method: 'POST', body }),
  updateJob: (id: string, body: any) => request(`/jobs/admin/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  deleteJob: (id: string) => request(`/jobs/admin/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // ───────────────────────────────────────────────────────────────────────────
  // Admin housing moderation
  // ───────────────────────────────────────────────────────────────────────────
  adminHousing: () => request('/housing/admin'),
  moderateHousing: (id: string, action: 'approve' | 'reject', reason?: string) =>
    request(`/housing/admin/${encodeURIComponent(id)}/moderate`, { method: 'PUT', body: { action, ...(reason ? { reason } : {}) } }),
  deleteHousing: (id: string) => request(`/housing/admin/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // ───────────────────────────────────────────────────────────────────────────
  // Admin reminders moderation
  // ───────────────────────────────────────────────────────────────────────────
  remindersPending: () => request('/reminders/admin/pending'),
  remindersGlobal: () => request('/reminders/admin/global'),
  approveReminder: (id: string) => request(`/reminders/admin/${encodeURIComponent(id)}/approve`, { method: 'PUT' }),
  rejectReminder: (id: string) => request(`/reminders/admin/${encodeURIComponent(id)}/reject`, { method: 'PUT' }),

  // ───────────────────────────────────────────────────────────────────────────
  // Admin badges
  // ───────────────────────────────────────────────────────────────────────────
  adminBadges: () => request('/admin/badges'),
  createBadge: (body: any) => request('/admin/badges', { method: 'POST', body }),
  toggleBadge: (id: string, active: boolean) => request(`/admin/badges/${encodeURIComponent(id)}`, { method: 'PUT', body: { is_active: active } }),
  deleteBadge: (id: string) => request(`/admin/badges/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // ───────────────────────────────────────────────────────────────────────────
  // Curriculum (legacy buckets): faculties + subjects
  // ───────────────────────────────────────────────────────────────────────────
  adminFaculties: () => request('/admin/faculties'),
  createFaculty: (body: any) => request('/admin/faculties', { method: 'POST', body }),
  updateFaculty: (id: string, body: any) => request(`/admin/faculties/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  deleteFaculty: (id: string) => request(`/admin/faculties/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  adminSubjects: (faculty?: string, year?: number) => {
    const params = new URLSearchParams();
    if (faculty) params.set('faculty', faculty);
    if (year != null) params.set('year', String(year));
    const qs = params.toString();
    return request(`/admin/subjects${qs ? `?${qs}` : ''}`);
  },
  createSubject: (body: any) => request('/admin/subjects', { method: 'POST', body }),
  updateSubject: (id: string, body: any) => request(`/admin/subjects/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  deleteSubject: (id: string) => request(`/admin/subjects/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // ───────────────────────────────────────────────────────────────────────────
  // Daily challenge sets
  // ───────────────────────────────────────────────────────────────────────────
  dailyChallenges: () => request('/admin/daily-challenges'),
  createDailyChallenge: (body: any) => request('/admin/daily-challenges', { method: 'POST', body }),
  updateDailyChallenge: (id: string, body: any) => request(`/admin/daily-challenges/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  deleteDailyChallenge: (id: string) => request(`/admin/daily-challenges/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // ───────────────────────────────────────────────────────────────────────────
  // Password reset legacy requests (read-only)
  // ───────────────────────────────────────────────────────────────────────────
  passwordResets: () => request('/admin/password-resets'),

  // ───────────────────────────────────────────────────────────────────────────
  // Faculty change requests
  // ───────────────────────────────────────────────────────────────────────────
  facultyChanges: (status: string) => request(`/admin/faculty-change-requests?status=${encodeURIComponent(status)}`),
  approveFacultyChange: (id: string) => request(`/admin/faculty-change-requests/${encodeURIComponent(id)}/approve`, { method: 'PUT' }),
  rejectFacultyChange: (id: string, adminNote?: string) =>
    request(`/admin/faculty-change-requests/${encodeURIComponent(id)}/reject`, { method: 'PUT', body: { ...(adminNote ? { adminNote } : {}) } }),

  // ───────────────────────────────────────────────────────────────────────────
  // Drive import jobs
  // ───────────────────────────────────────────────────────────────────────────
  startDriveImport: (driveUrl: string, faculty: string, year: number, university: string) =>
    request('/admin/import/drive', { method: 'POST', body: { driveUrl, faculty, year, university } }),
  getDriveJob: (jobId: string) => request(`/admin/import/drive/${encodeURIComponent(jobId)}`),
  listDriveJobs: () => request('/admin/import/drive'),

  // ───────────────────────────────────────────────────────────────────────────
  // AI usage stats
  // ───────────────────────────────────────────────────────────────────────────
  aiUsageStats: (days: number) => request(`/ai/usage-stats?days=${encodeURIComponent(String(days))}`),

  // ───────────────────────────────────────────────────────────────────────────
  // Academic structure (new) — universities/faculties/filieres
  // ───────────────────────────────────────────────────────────────────────────
  academicUniversities: () => request('/academic-structure/universities'),
  createUniversity: (body: any) => request('/academic-structure/universities', { method: 'POST', body }),
  updateUniversity: (id: number, body: any) => request(`/academic-structure/universities/${id}`, { method: 'PUT', body }),
  deleteUniversity: (id: number) => request(`/academic-structure/universities/${id}`, { method: 'DELETE' }),

  academicFaculties: (universitySlug: string) =>
    request(`/academic-structure/faculties?university_slug=${encodeURIComponent(universitySlug)}`),
  createFacultyAcad: (body: any) => request('/academic-structure/faculties', { method: 'POST', body }),
  updateFacultyAcad: (id: number, body: any) => request(`/academic-structure/faculties/${id}`, { method: 'PUT', body }),
  deleteFacultyAcad: (id: number) => request(`/academic-structure/faculties/${id}`, { method: 'DELETE' }),

  academicFilieres: (facultySlug: string) =>
    request(`/academic-structure/filieres?faculty_slug=${encodeURIComponent(facultySlug)}`),
  createFiliere: (body: any) => request('/academic-structure/filieres', { method: 'POST', body }),
  updateFiliere: (id: number, body: any) => request(`/academic-structure/filieres/${id}`, { method: 'PUT', body }),
  deleteFiliere: (id: number) => request(`/academic-structure/filieres/${id}`, { method: 'DELETE' }),

  // ───────────────────────────────────────────────────────────────────────────
  // Premium feature requests (billing)
  // ───────────────────────────────────────────────────────────────────────────
  approveFeatureRequest: (id: string, adminNote?: string) =>
    request(`/billing/feature-requests/${encodeURIComponent(id)}/approve`, { method: 'PUT', body: { ...(adminNote ? { adminNote } : {}) } }),
  rejectFeatureRequest: (id: string, adminNote?: string) =>
    request(`/billing/feature-requests/${encodeURIComponent(id)}/reject`, { method: 'PUT', body: { ...(adminNote ? { adminNote } : {}) } }),
};

