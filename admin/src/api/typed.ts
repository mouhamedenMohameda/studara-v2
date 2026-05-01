import { api } from './client';

export type AdminRole = 'admin' | 'moderator' | 'user' | string;

export interface AdminUserShape {
  role: AdminRole;
  [k: string]: any;
}

export interface AdminLoginResponse {
  access: string;
  refresh?: string;
  user: AdminUserShape;
}

export type AppFeature = {
  key: string;
  label: string;
  is_active: boolean;
  updated_at?: string;
};

export type PremiumFeature = {
  key: string;
  label_ar?: string;
  label_fr?: string;
  is_active: boolean;
  sort_order?: number;
};

const typedRequest = api.request as unknown as <T>(
  path: string,
  opts?: { method?: string; body?: any; token?: string | null },
) => Promise<T>;

export const authAdminApi = {
  login: (email: string, password: string) =>
    typedRequest<AdminLoginResponse>('/auth/login', { method: 'POST', body: { email, password } }),
};

export const featureFlagsApi = {
  adminAppFeatures: () => typedRequest<AppFeature[]>('/billing/admin/app-features'),
  adminPremiumFeatures: () => typedRequest<PremiumFeature[]>('/billing/admin/features'),
  setAdminAppFeature: (key: string, is_active: boolean) =>
    typedRequest(`/billing/admin/app-features/${encodeURIComponent(key)}`, { method: 'PUT', body: { is_active } }),
  setAdminPremiumFeature: (key: string, is_active: boolean) =>
    typedRequest(`/billing/admin/features/${encodeURIComponent(key)}`, { method: 'PUT', body: { is_active } }),
  disableAllAppFeatures: () => typedRequest('/billing/admin/app-features/disable-all', { method: 'POST' }),
  disableAllPremiumFeatures: () => typedRequest('/billing/admin/features/disable-all', { method: 'POST' }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin: Resources moderation + admin uploads + bulk scrape
// ─────────────────────────────────────────────────────────────────────────────

export type ResourceStatus = 'pending' | 'approved' | 'rejected';
export type ModerateAction = 'approve' | 'reject';

export interface AdminResourceRow {
  id: string;
  status: ResourceStatus;
  title?: string;
  title_ar?: string;
  subject?: string;
  faculty?: string;
  university?: string;
  year?: number;
  resource_type?: string;
  description?: string;
  file_url?: string;
  file_name?: string;
  file_size?: number;
  downloads?: number;
  created_at?: string;
  rejection_reason?: string | null;
  uploader_name?: string;
  uploader_email?: string;
  avg_rating?: number;
  rating_count?: number;
  [k: string]: any;
}

export interface PaginatedAdminResources {
  data: AdminResourceRow[];
  total: number;
}

export interface BulkScrapeStatus {
  status: 'idle' | 'running' | 'stopped' | 'done' | string;
  startNum?: number;
  endNum?: number;
  current?: number;
  progress?: number;
  found?: number;
  inserted?: number;
  skipped?: number;
  errors?: number;
  log?: string[];
  [k: string]: any;
}

export const adminResourcesApi = {
  list: (status: ResourceStatus, page: number) =>
    typedRequest<PaginatedAdminResources>(`/admin/resources?status=${encodeURIComponent(status)}&page=${page}`),

  moderate: (id: string, action: ModerateAction, reason?: string) =>
    typedRequest(`/admin/resources/${encodeURIComponent(id)}/moderate`, {
      method: 'PUT',
      body: { action, ...(reason ? { reason } : {}) },
    }),

  delete: (id: string) =>
    typedRequest<{ deleted: string }>(`/admin/resources/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  upload: (formData: FormData) =>
    typedRequest<AdminResourceRow>('/admin/resources/upload', { method: 'POST', body: formData }),

  bulkScrapeStatus: () => typedRequest<BulkScrapeStatus>('/admin/bulk-scrape/status'),
  bulkScrapeStart: (startNum: number, endNum: number) =>
    typedRequest('/admin/bulk-scrape/start', { method: 'POST', body: { startNum, endNum } }),
  bulkScrapeStop: () => typedRequest('/admin/bulk-scrape/stop', { method: 'POST' }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin: Users management
// ─────────────────────────────────────────────────────────────────────────────

export interface AdminUserRow {
  id: string;
  email: string;
  full_name?: string;
  faculty?: string;
  filiere?: string | null;
  year?: number;
  role?: string;
  is_verified?: boolean;
  is_banned?: boolean;
  is_approved?: boolean;
  total_uploads?: number;
  total_downloads?: number;
  created_at?: string;
  [k: string]: any;
}

export const adminUsersApi = {
  list: (page: number, q?: string) =>
    typedRequest<AdminUserRow[]>(
      `/admin/users?page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}`,
    ),

  pending: () => typedRequest<AdminUserRow[]>('/admin/users/pending'),

  approve: (id: string) =>
    typedRequest(`/admin/users/${encodeURIComponent(id)}/approve`, { method: 'PUT' }),

  ban: (id: string, ban: boolean) =>
    typedRequest(`/admin/users/${encodeURIComponent(id)}/ban`, { method: 'PUT', body: { ban } }),

  verify: (id: string) =>
    typedRequest(`/admin/users/${encodeURIComponent(id)}/verify`, { method: 'PUT' }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin: Subscriptions management
// ─────────────────────────────────────────────────────────────────────────────

export interface AdminLegacySubscriptionInfo {
  full_name: string;
  email: string;
  trial_ends_at: string;
  paid_until: string | null;
  effective_until: string;
  bonus_days: number;
  accepted_uploads_count: number;
  status: 'active' | 'trial' | 'expired';
  [k: string]: any;
}

export interface AdminCatalogSubscriptionBundle {
  catalog: Record<string, unknown>;
  usage: { counters?: Array<{ counterKey: string; remainingTotal: number; limitTotal: number }> };
  [k: string]: any;
}

export const adminSubscriptionsApi = {
  getUserSubscription: (userId: string) =>
    typedRequest<AdminLegacySubscriptionInfo | null>(`/admin/users/${encodeURIComponent(userId)}/subscription`),

  grantSubscription: (userId: string, body: { duration_days: number; plan: string; note?: string }) =>
    typedRequest(`/admin/users/${encodeURIComponent(userId)}/subscription`, { method: 'PUT', body }),

  revokeSubscription: (userId: string) =>
    typedRequest(`/admin/users/${encodeURIComponent(userId)}/subscription`, { method: 'DELETE' }),

  getUserCatalogSubscription: (userId: string) =>
    typedRequest<AdminCatalogSubscriptionBundle | null>(`/admin/users/${encodeURIComponent(userId)}/catalog-subscription`),

  grantCatalogPlan: (userId: string, body: { planCode: string; periodDays: number; note?: string }) =>
    typedRequest(`/admin/users/${encodeURIComponent(userId)}/catalog-plan`, { method: 'POST', body }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin: Dashboard
// ─────────────────────────────────────────────────────────────────────────────

export const adminDashboardApi = {
  stats: () => typedRequest('/admin/stats'),
  analytics: () => typedRequest('/admin/analytics'),
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin: Jobs
// ─────────────────────────────────────────────────────────────────────────────

export type AdminJobType = 'stage' | 'cdi' | 'cdd' | 'freelance' | 'other';

export interface AdminJobRow {
  id: string;
  title: string;
  company: string;
  location?: string;
  domain?: string;
  job_type: AdminJobType;
  description?: string;
  requirements?: string;
  apply_url?: string;
  deadline?: string;
  is_active: boolean;
  created_at: string;
  [k: string]: any;
}

export const adminJobsApi = {
  list: (page = 1, q = '', domain = '', type = '') => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    if (q) params.set('q', q);
    if (domain) params.set('domain', domain);
    if (type) params.set('type', type);
    return typedRequest<{ data: AdminJobRow[]; total: number }>(`/jobs/admin?${params.toString()}`);
  },
  create: (body: Record<string, unknown>) =>
    typedRequest('/jobs/admin', { method: 'POST', body }),
  update: (id: string, body: Record<string, unknown>) =>
    typedRequest(`/jobs/admin/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  delete: (id: string) =>
    typedRequest(`/jobs/admin/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin: Housing
// ─────────────────────────────────────────────────────────────────────────────

export interface AdminHousingListing {
  id: string;
  user_id: string;
  poster_name: string;
  poster_email: string;
  title: string;
  title_ar?: string;
  type: 'studio' | 'chambre' | 'appartement' | 'colocation';
  price: number;
  area?: string;
  description?: string;
  phone?: string;
  whatsapp?: string;
  furnished: boolean;
  features: string[];
  status: 'pending' | 'approved' | 'rejected';
  reject_reason?: string;
  created_at: string;
  [k: string]: any;
}

export const adminHousingApi = {
  list: () => typedRequest<AdminHousingListing[]>('/housing/admin'),
  moderate: (id: string, action: 'approve' | 'reject', reason?: string) =>
    typedRequest(`/housing/admin/${encodeURIComponent(id)}/moderate`, { method: 'PUT', body: { action, ...(reason ? { reason } : {}) } }),
  delete: (id: string) =>
    typedRequest(`/housing/admin/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin: Opportunities (Scholarships / Study abroad)
// ─────────────────────────────────────────────────────────────────────────────

export type OpportunityStatus = 'pending' | 'approved' | 'rejected';
export type OpportunityType = 'program' | 'scholarship' | 'exchange' | 'internship' | 'fellowship' | 'grant' | 'summer_school' | 'other';

export type OpportunityAvailabilityFilter = 'all' | 'available' | 'expired';
export type OpportunityActiveFilter = 'all' | 'true' | 'false';

export interface AdminOpportunityRow {
  id: string;
  title: string;
  opportunity_type: OpportunityType;
  provider_name?: string | null;
  host_country?: string | null;
  host_city?: string | null;
  host_institution?: string | null;
  description?: string | null;
  eligibility?: string | null;
  benefits?: string | null;
  has_scholarship?: boolean;
  scholarship_details?: string | null;
  apply_url?: string | null;
  official_url?: string | null;
  source_name?: string | null;
  source_url?: string | null;
  deadline?: string | null;
  status: OpportunityStatus;
  reject_reason?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  moderated_by?: string | null;
  moderated_at?: string | null;
  extracted_by?: string | null;
  extracted_at?: string | null;
  [k: string]: any;
}

export interface AdminOpportunitiesScrapeJob {
  id: string;
  status: 'pending' | 'running' | 'done' | 'error' | 'stopped' | string;
  startedAt: string;
  finishedAt?: string;
  logs: string[];
  summary?: {
    sources: number;
    fetched: number;
    inserted: number;
    duplicates: number;
    failed: number;
  };
  error?: string;
}

export type AdminOpportunitiesListFilters = {
  search?: string;
  type?: OpportunityType | '';
  level?: string;
  institution?: string;
  city?: string;
  country?: string;
  hasScholarship?: 'all' | 'true' | 'false';
  availability?: OpportunityAvailabilityFilter;
  deadlineYear?: string;
  active?: OpportunityActiveFilter;
};

export const adminOpportunitiesApi = {
  list: (status: OpportunityStatus, page = 1, filters: AdminOpportunitiesListFilters = {}) => {
    const params = new URLSearchParams();
    params.set('status', status);
    params.set('page', String(page));
    if (filters.search?.trim()) params.set('search', filters.search.trim());
    if (filters.type) params.set('type', filters.type);
    if (filters.level?.trim()) params.set('level', filters.level.trim());
    if (filters.institution?.trim()) params.set('institution', filters.institution.trim());
    if (filters.city?.trim()) params.set('city', filters.city.trim());
    if (filters.country?.trim()) params.set('country', filters.country.trim());
    if (filters.hasScholarship && filters.hasScholarship !== 'all') params.set('hasScholarship', filters.hasScholarship);
    if (filters.availability && filters.availability !== 'all') params.set('availability', filters.availability);
    if (filters.deadlineYear?.trim()) params.set('deadlineYear', filters.deadlineYear.trim());
    if (filters.active && filters.active !== 'all') params.set('active', filters.active);
    return typedRequest<{ data: AdminOpportunityRow[]; total: number }>(`/opportunities/admin/list?${params.toString()}`);
  },
  scrapeStart: () =>
    typedRequest<{ jobId: string }>('/opportunities/admin/scrape/start', { method: 'POST' }),
  scrapeJob: (jobId: string) =>
    typedRequest<AdminOpportunitiesScrapeJob>(`/opportunities/admin/scrape/${encodeURIComponent(jobId)}`),
  bulkHide: (body: { ids?: string[]; status?: OpportunityStatus; search?: string }) =>
    typedRequest<{ ok: true; updated: number }>(
      '/opportunities/admin/bulk-hide',
      { method: 'POST', body },
    ),
  bulkDelete: (body: { ids?: string[]; status?: OpportunityStatus; search?: string }) =>
    typedRequest<{ ok: true; deleted: number }>(
      '/opportunities/admin/bulk-delete',
      { method: 'POST', body },
    ),
  moderate: (id: string, action: 'approve' | 'reject', reason?: string) =>
    typedRequest<AdminOpportunityRow>(`/opportunities/admin/${encodeURIComponent(id)}/moderate`, {
      method: 'PUT',
      body: { action, ...(reason ? { reason } : {}) },
    }),
  update: (id: string, body: Record<string, unknown>) =>
    typedRequest<AdminOpportunityRow>(`/opportunities/admin/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  create: (body: Record<string, unknown>) =>
    typedRequest<AdminOpportunityRow>('/opportunities/admin', { method: 'POST', body }),
  delete: (id: string) =>
    typedRequest(`/opportunities/admin/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin: Reminders
// ─────────────────────────────────────────────────────────────────────────────

export interface AdminPendingReminder {
  id: string;
  title: string;
  description: string | null;
  reminder_type: string;
  scheduled_at: string;
  submitter_name: string;
  submitted_by: string;
  created_at: string;
  status?: string;
  [k: string]: any;
}

export const adminRemindersApi = {
  pending: () => typedRequest<AdminPendingReminder[]>('/reminders/admin/pending'),
  global: () => typedRequest<any[]>('/reminders/admin/global'),
  approve: (id: string) => typedRequest(`/reminders/admin/${encodeURIComponent(id)}/approve`, { method: 'PUT' }),
  reject: (id: string) => typedRequest(`/reminders/admin/${encodeURIComponent(id)}/reject`, { method: 'PUT' }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin: Badges
// ─────────────────────────────────────────────────────────────────────────────

export interface AdminBadge {
  id: string;
  slug: string;
  name_fr: string;
  name_ar: string;
  emoji: string;
  color: string;
  condition_type: string;
  threshold: number;
  xp_reward: number;
  description_fr?: string;
  is_active: boolean;
  created_at: string;
  earned_count?: number;
  [k: string]: any;
}

export const adminBadgesApi = {
  list: () => typedRequest<AdminBadge[]>('/admin/badges'),
  create: (body: Record<string, unknown>) => typedRequest('/admin/badges', { method: 'POST', body }),
  toggle: (id: string, is_active: boolean) => typedRequest(`/admin/badges/${encodeURIComponent(id)}`, { method: 'PUT', body: { is_active } }),
  delete: (id: string) => typedRequest(`/admin/badges/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin: Password reset legacy (read-only)
// ─────────────────────────────────────────────────────────────────────────────

export interface AdminPasswordResetRequest {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  created_at: string;
  [k: string]: any;
}

export const adminPasswordResetsApi = {
  list: () => typedRequest<AdminPasswordResetRequest[]>('/admin/password-resets'),
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin: Faculty change requests
// ─────────────────────────────────────────────────────────────────────────────

export interface AdminFacultyChangeRequest {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  current_faculty: string;
  current_university: string;
  current_year: number;
  new_faculty: string | null;
  new_university: string | null;
  new_year: number | null;
  current_filiere: string | null;
  new_filiere: string | null;
  status: 'pending' | 'approved' | 'rejected';
  admin_note: string | null;
  created_at: string;
  [k: string]: any;
}

export const adminFacultyChangesApi = {
  list: (status: string) => typedRequest<AdminFacultyChangeRequest[]>(`/admin/faculty-change-requests?status=${encodeURIComponent(status)}`),
  approve: (id: string) => typedRequest(`/admin/faculty-change-requests/${encodeURIComponent(id)}/approve`, { method: 'PUT' }),
  reject: (id: string, adminNote?: string) =>
    typedRequest(`/admin/faculty-change-requests/${encodeURIComponent(id)}/reject`, { method: 'PUT', body: { ...(adminNote ? { adminNote } : {}) } }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin: Drive import
// ─────────────────────────────────────────────────────────────────────────────

export const adminDriveImportApi = {
  start: (driveUrl: string, faculty: string, year: number, university: string) =>
    typedRequest<{ jobId: string }>('/admin/import/drive', { method: 'POST', body: { driveUrl, faculty, year, university } }),
  get: (jobId: string) =>
    typedRequest(`/admin/import/drive/${encodeURIComponent(jobId)}`),
  list: () =>
    typedRequest('/admin/import/drive'),
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin: Daily challenge sets
// ─────────────────────────────────────────────────────────────────────────────

export const adminDailyChallengesApi = {
  list: () => typedRequest('/admin/daily-challenges'),
  create: (body: Record<string, unknown>) => typedRequest('/admin/daily-challenges', { method: 'POST', body }),
  update: (id: string, body: Record<string, unknown>) => typedRequest(`/admin/daily-challenges/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  delete: (id: string) => typedRequest(`/admin/daily-challenges/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin: Daily challenge prizes (winner payout workflow)
// ─────────────────────────────────────────────────────────────────────────────

export interface AdminDailyChallengePrizeRow {
  id: string;
  challenge_date: string;
  faculty: string;
  phone: string;
  provider: 'bankily' | 'sedad' | 'masrivi' | string;
  account_full_name: string;
  submitted_at: string;
  admin_proof_url?: string | null;
  admin_proof_uploaded_at?: string | null;
  user_confirmed_at?: string | null;
  time_taken_s?: number | null;
  referral_count?: number | null;
  user_id: string;
  full_name: string;
  email: string;
}

export const adminDailyChallengePrizesApi = {
  list: (status: 'pending' | 'proof_uploaded' | 'confirmed' = 'pending') =>
    typedRequest<{ status: string; items: AdminDailyChallengePrizeRow[] }>(
      `/admin/daily-challenge/prizes?status=${encodeURIComponent(status)}`,
    ),
  uploadProof: (id: string, formData: FormData) =>
    typedRequest(`/admin/daily-challenge/prizes/${encodeURIComponent(id)}/proof`, { method: 'POST', body: formData }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin: AI usage stats
// ─────────────────────────────────────────────────────────────────────────────

export const adminAiUsageApi = {
  usageStats: (days: number) => typedRequest(`/ai/usage-stats?days=${encodeURIComponent(String(days))}`),
};

// ─────────────────────────────────────────────────────────────────────────────
// Curriculum (legacy buckets): faculties + subjects
// ─────────────────────────────────────────────────────────────────────────────

export interface AdminCurriculumFaculty {
  id: string;
  slug: string;
  name_fr: string;
  name_ar: string;
  icon: string;
  is_active: boolean;
  sort_order: number;
  [k: string]: any;
}

export interface AdminCurriculumSubject {
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
  [k: string]: any;
}

export const adminCurriculumApi = {
  faculties: {
    list: () => typedRequest<AdminCurriculumFaculty[]>('/admin/faculties'),
    create: (body: Record<string, unknown>) => typedRequest('/admin/faculties', { method: 'POST', body }),
    update: (id: string, body: Record<string, unknown>) => typedRequest(`/admin/faculties/${encodeURIComponent(id)}`, { method: 'PUT', body }),
    delete: (id: string) => typedRequest(`/admin/faculties/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },
  subjects: {
    list: (faculty?: string, year?: number) => {
      const params = new URLSearchParams();
      if (faculty) params.set('faculty', faculty);
      if (year != null) params.set('year', String(year));
      const qs = params.toString();
      return typedRequest<AdminCurriculumSubject[]>(`/admin/subjects${qs ? `?${qs}` : ''}`);
    },
    create: (body: Record<string, unknown>) => typedRequest('/admin/subjects', { method: 'POST', body }),
    update: (id: string, body: Record<string, unknown>) => typedRequest(`/admin/subjects/${encodeURIComponent(id)}`, { method: 'PUT', body }),
    delete: (id: string) => typedRequest(`/admin/subjects/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Academic structure (new)
// ─────────────────────────────────────────────────────────────────────────────

export const adminAcademicStructureApi = {
  universities: {
    list: () => typedRequest('/academic-structure/universities'),
    create: (body: Record<string, unknown>) => typedRequest('/academic-structure/universities', { method: 'POST', body }),
    update: (id: number, body: Record<string, unknown>) => typedRequest(`/academic-structure/universities/${id}`, { method: 'PUT', body }),
    delete: (id: number) => typedRequest(`/academic-structure/universities/${id}`, { method: 'DELETE' }),
  },
  faculties: {
    list: (universitySlug: string) =>
      typedRequest(`/academic-structure/faculties?university_slug=${encodeURIComponent(universitySlug)}`),
    create: (body: Record<string, unknown>) => typedRequest('/academic-structure/faculties', { method: 'POST', body }),
    update: (id: number, body: Record<string, unknown>) => typedRequest(`/academic-structure/faculties/${id}`, { method: 'PUT', body }),
    delete: (id: number) => typedRequest(`/academic-structure/faculties/${id}`, { method: 'DELETE' }),
  },
  filieres: {
    list: (facultySlug: string) =>
      typedRequest(`/academic-structure/filieres?faculty_slug=${encodeURIComponent(facultySlug)}`),
    create: (body: Record<string, unknown>) => typedRequest('/academic-structure/filieres', { method: 'POST', body }),
    update: (id: number, body: Record<string, unknown>) => typedRequest(`/academic-structure/filieres/${id}`, { method: 'PUT', body }),
    delete: (id: number) => typedRequest(`/academic-structure/filieres/${id}`, { method: 'DELETE' }),
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Billing: premium feature requests
// ─────────────────────────────────────────────────────────────────────────────

export const adminPremiumRequestsApi = {
  approve: (id: string, adminNote?: string) =>
    typedRequest(`/billing/feature-requests/${encodeURIComponent(id)}/approve`, { method: 'PUT', body: { ...(adminNote ? { adminNote } : {}) } }),
  reject: (id: string, adminNote?: string) =>
    typedRequest(`/billing/feature-requests/${encodeURIComponent(id)}/reject`, { method: 'PUT', body: { ...(adminNote ? { adminNote } : {}) } }),
  list: (status: string, page: number) =>
    typedRequest(`/billing/feature-requests?status=${encodeURIComponent(status)}&page=${page}&limit=20`),
};

