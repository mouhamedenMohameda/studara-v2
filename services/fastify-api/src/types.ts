export type DocStatus = 'UPLOADED' | 'TEXT_EXTRACTING' | 'TEXT_READY' | 'FAILED';
export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export type ExerciseSubject =
  | 'mathematiques'
  | 'physique'
  | 'chimie'
  | 'economie'
  | 'comptabilite'
  | 'finance'
  | 'informatique'
  | 'biologie'
  | 'medecine';

export type ExerciseCorrectionResult = {
  statement: string;
  detectedSubject?: string;
  confidence?: number; // 0..1
  correction_step_by_step: string;
  method_explanation: string;
  final_answer: string;
  common_errors: string[];
  method_summary: string;
  similar_exercise: string;
  student_answer_feedback?: {
    errors: { excerpt: string; why_wrong: string; fix: string }[];
    corrected_solution: string;
  };
  latex?: { enabled: boolean };
  medical_disclaimer?: string;
};

export type ExerciseDocument = {
  id: string;
  status: DocStatus;
  errorMessage?: string;
  statementText?: string;
  mimeType?: string;
  originalFilename?: string;
  storagePath?: string;
  warnings: string[];
  ocrConfidence?: number;
  createdAt: number;
  updatedAt: number;
};

export type ExerciseCorrection = {
  id: string;
  documentId: string;
  subject: ExerciseSubject;
  studentAnswer?: string;
  outputLanguage: 'fr' | 'ar' | 'en' | 'fr_ar';
  status: JobStatus;
  warnings: string[];
  errorMessage?: string;
  result?: ExerciseCorrectionResult;
  createdAt: number;
  updatedAt: number;
};

