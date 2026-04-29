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

export type DocStatus = 'UPLOADED' | 'TEXT_EXTRACTING' | 'TEXT_READY' | 'FAILED';
export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

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
  latex?: {
    enabled: boolean;
    blocks?: { id: string; latex: string; displayMode?: boolean }[];
  };
  medical_disclaimer?: string;
};

