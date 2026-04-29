// ─── Enums ────────────────────────────────────────────────────────────────────

export enum Language { Arabic = 'ar', French = 'fr' }
export enum UserRole { Student = 'student', Teacher = 'teacher', Moderator = 'moderator', Admin = 'admin' }

export enum Faculty {
  Sciences = 'sciences',
  Medicine = 'medicine',
  Law = 'law',
  Economics = 'economics',
  Arts = 'arts',
  Engineering = 'engineering',
  Islamic = 'islamic',
}

export enum University {
  UNA = 'una',      // Université de Nouakchott Al Asriya
  UPM = 'upm',      // Université des Sciences, de Technologie et de Médecine
  POLYTECHNIQUE = 'polytechnique', // Complexe Polytechnique
  ISE = 'ise',      // Institut Supérieur d'Enseignement
  ISERI = 'iseri',
}

export enum ResourceType {
  Note = 'note',
  PastExam = 'past_exam',
  Summary = 'summary',
  Exercise = 'exercise',
  Project = 'project',
  Presentation = 'presentation',
  VideoCourse = 'video_course',
}

export enum ResourceStatus {
  Pending = 'pending',
  Approved = 'approved',
  Rejected = 'rejected',
}

export enum ReminderType {
  Exam = 'exam',
  Assignment = 'assignment',
  Course = 'course',
  Other = 'other',
}

export enum DayOfWeek {
  Sunday = 0,
  Monday = 1,
  Tuesday = 2,
  Wednesday = 3,
  Thursday = 4,
  Friday = 5,
  Saturday = 6,
}

// ─── Domain Models ─────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  fullName: string;
  fullNameAr?: string;
  phone?: string;
  avatarUrl?: string;
  university: University;
  faculty: Faculty;
  filiere?: string;
  year: number;
  role: UserRole;
  language: Language;
  isVerified: boolean;
  totalUploads: number;
  totalDownloads: number;
  xp: number;
  level: number;
  streakDays: number;
  createdAt: string;
}

export interface Resource {
  id: string;
  title: string;
  titleAr?: string;
  description?: string;
  type: ResourceType;
  faculty: Faculty;
  university: University;
  subject: string;
  year: number;
  semester?: number;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  uploadedBy: Pick<User, 'id' | 'fullName' | 'faculty'>;
  status: ResourceStatus;
  downloads: number;
  likes: number;
  tags: string[];
  isLiked?: boolean;
  isBookmarked?: boolean;
  createdAt: string;
  updatedAt: string;
  moderatedAt?: string;
}

export interface Course {
  id: string;
  nameAr: string;
  name: string;      // French name
  teacher?: string;
  room?: string;
  color: string;
  dayOfWeek: DayOfWeek;
  startTime: string; // "HH:MM"
  endTime: string;   // "HH:MM"
}

export interface Reminder {
  id: string;
  title: string;
  description?: string;
  type: ReminderType;
  scheduledAt: string; // ISO 8601
  isCompleted: boolean;
  courseColor?: string;
  createdAt: string;
}

// ─── Navigation Types ──────────────────────────────────────────────────────────

export type RootStackParamList = {
  Onboarding: undefined;
  Auth: undefined;
  Main: undefined;
  ExploreModal: { screen: keyof ExploreStackParamList; params?: any };
  Paywall: undefined;
  PremiumRequest: { featureKey?: string } | undefined;
  Spending: undefined;
  BillingHub: undefined;
  UploadResource: undefined;
  Pomodoro: undefined;
  DailyChallenge: undefined;
  VoiceNotes: undefined;
  VoiceNoteDetail: { note: VoiceNote };
  AskZad: undefined;
  MyPlan: undefined;
  Forum: undefined;
  ForumPost: { postId: string; postTitle: string };
  PasswordResetApproval: { intentId: string };
  PasswordResetSetNew: { intentId: string; ticket: string };
  AISummaryImport: undefined;
  AISummaryOptions: { documentId: string };
  AISummaryResult: { summaryId: string };
  AISummaryHistory: undefined;
  AIExerciseImport: undefined;
  AIExerciseOptions: { documentId: string };
  AIExerciseResult: { correctionId: string };
  AIExerciseHistory: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  PendingApproval: undefined;
  ForgotPassword: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Explore: undefined;
  Profile: undefined;
};

export type ExploreStackParamList = {
  Resources: undefined;
  Timetable: undefined;
  Courses: undefined;
  Flashcards: undefined;
  Jobs: undefined;
  Reminders: undefined;
  Housing: undefined;
};

export type HousingStackParamList = {
  HousingList: undefined;
};

export type HomeStackParamList = {
  HomeMain: undefined;
};

export type JobsStackParamList = {
  JobsList: undefined;
  JobDetail: { job: Job };
  MyApplications: undefined;
};

export type ResourcesStackParamList = {
  ResourcesList: undefined;
  ResourceDetail: { resource: Resource };
  /** previewMode=true → PDF.js viewer limited to 3 pages, no download counter */
  ResourceViewer: { resource: Resource; previewMode?: boolean };
  UploadResource: undefined;
  MySubmissions: undefined;
  CourseViewer: { title: string; url: string; subject?: string };
};

export type CoursesStackParamList = {
  CoursesList: undefined;
  CourseViewer: { title: string; url: string; subject?: string };
};

export type ProfileStackParamList = {
  ProfileMain: undefined;
  Badges: undefined;
  ExamCountdown: undefined;
  Wrapped: undefined;
};

export interface MySubmission {
  id: string;
  title: string;
  title_ar?: string;
  subject: string;
  resource_type: string;
  faculty: string;
  university: string;
  year: number;
  file_url?: string;
  file_name?: string;
  file_size?: number;
  file_type?: string;
  status: ResourceStatus;
  rejection_reason?: string;
  moderated_at?: string;
  downloads: number;
  likes: number;
  tags: string[];
  created_at: string;
}

export interface Job {
  id: string;
  title: string;
  company: string;
  location?: string;
  domain?: string;
  jobType: 'stage' | 'cdi' | 'cdd' | 'freelance' | 'other';
  description?: string;
  requirements?: string;
  applyUrl?: string;
  deadline?: string;
  createdAt: string;
}

export interface HomeSummary {
  dueCards: number;
  todayReminders: { id: string; title: string; reminderType: string; scheduledAt: string; courseColor?: string }[];
  recentDecks: { id: string; title: string; color: string; dueCount: number }[];
  totalResources: number;
  xp: number;
  level: number;
  streakDays: number;
  nextExam?: { subject: string; examDate: string; color: string; daysLeft: number } | null;
}

export interface Badge {
  id: string;
  slug: string;
  nameFr: string;
  nameAr: string;
  emoji: string;
  color: string;
  descriptionFr?: string;
  descriptionAr?: string;
  conditionType: string;
  threshold: number;
  xpReward: number;
  earned: boolean;
  earnedAt?: string;
}

export interface ExamCountdown {
  id: string;
  subject: string;
  examDate: string;
  color: string;
  notes?: string;
  isDone: boolean;
  createdAt: string;
}

export type VoiceNoteStatus = 'processing' | 'done' | 'failed';
export type VoiceNoteEnhanceMode = 'summary' | 'rewrite' | 'flashcards' | 'course';

/** Structured output from the gpt-4o / gpt-4o-mini enhancement step */
export interface EnhancedTranscript {
  clean_transcript:  string;
  summary:           string;
  action_items:      string[];
  key_topics:        string[];
  unclear_segments:  string[];
}

export interface TranscriptVersion {
  transcript: string;
  saved_at:   string;   // ISO date string
  label:      string;   // e.g. "Version 1"
}

/** Réponse GET /voice-notes/:id/confidence-hints (analyse locale, sans IA). */
export type TranscriptConfidenceBand = 'solid' | 'uncertain' | 'review';

export type TranscriptWeakReason =
  | 'foreign_script'
  | 'repeated_line'
  | 'token_stutter'
  | 'ngram_echo'
  | 'low_lexical_diversity';

export interface TranscriptWeakSpan {
  startChar: number;
  endChar: number;
  band: TranscriptConfidenceBand;
  reasons: TranscriptWeakReason[];
  excerpt: string;
  minuteLabel?: string;
  approxStartSec?: number;
  approxEndSec?: number;
}

export interface TranscriptConfidenceHints {
  spans: TranscriptWeakSpan[];
  stats: {
    totalChars: number;
    uncertainSpanCount: number;
    reviewSpanCount: number;
  };
}

export interface VoiceNote {
  id: string;
  title?: string;
  subject?: string;
  language?: 'ar' | 'fr';        // language used for transcription
  duration_s?: number;
  status: VoiceNoteStatus;
  error_message?: string;
  transcript?: string;
  transcript_preview?: string;   // 200-char preview (list endpoint only)
  enhanced_text?: string;        // kept for backward compat (= clean_transcript)
  enhance_mode?: VoiceNoteEnhanceMode;
  deck_id?: string;
  transcription_model?: string;  // e.g. gpt-4o-transcribe
  audio_filename?: string;       // filename on disk (used to check if retranscription is possible)
  // Structured enhancement fields (available after /enhance call)
  clean_transcript?: string;
  summary?: string;
  action_items?: string[];       // stored as JSONB, parsed by API
  key_topics?: string[];
  unclear_segments?: string[];
  ai_course?: string;            // full AI-generated course (Wikipedia-enriched)
  transcript_versions?: TranscriptVersion[];  // history of previous transcripts
  created_at: string;
  updated_at: string;
}

export interface FlashcardDeck {
  id: string;
  userId: string;
  title: string;
  subject?: string;
  color: string;
  cardCount: number;
  dueCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Flashcard {
  id: string;
  deckId: string;
  front: string;
  back: string;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  nextReview: string;
  lastReviewed?: string;
}

export type FlashcardsStackParamList = {
  FlashcardsList: undefined;
  StudySession: { deckId: string; deckTitle: string; deckColor: string; quizMode?: boolean };
  CreateDeck: { deck?: FlashcardDeck } | undefined;
  ScanCreate: undefined;
};

// ─── Billing / Subscription ───────────────────────────────────────────────────

export type SubscriptionStatusType = 'trial' | 'active' | 'expired' | 'cancelled';

export interface SubscriptionStatus {
  status: SubscriptionStatusType;
  hasAccess: boolean;
  trialEndsAt: string;
  paidUntil: string | null;
  effectiveUntil: string;
  daysLeft: number;
  acceptedUploadsCount: number;
  bonusDays: number;
}

// ─── Forum / Q&A ──────────────────────────────────────────────────────────────

export interface ForumPost {
  id: string;
  userId: string;
  authorName: string;
  title: string;
  body: string;
  subject?: string;
  faculty?: string;
  upvotes: number;
  repliesCount: number;
  isUpvoted?: boolean;
  hasBestAnswer?: boolean;
  createdAt: string;
}

export interface ForumReply {
  id: string;
  postId: string;
  userId: string;
  authorName: string;
  body: string;
  upvotes: number;
  isBestAnswer: boolean;
  isUpvoted?: boolean;
  createdAt: string;
}
