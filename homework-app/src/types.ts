export type Role = 'teacher' | 'student';

export interface Profile {
  id: string;
  role: Role;
  full_name: string | null;
  teacher_id: string | null;
  created_at: string;
}

export type SubmissionStatus = 'submitted' | 'reviewed';

export interface Submission {
  id: string;
  student_id: string;
  teacher_id: string;
  title: string;
  comment: string | null;
  file_path: string;
  status: SubmissionStatus;
  created_at: string;
}

export type ReviewResult = 'approved' | 'needs_revision';

export interface Review {
  id: string;
  submission_id: string;
  teacher_id: string;
  student_id: string;
  result: ReviewResult;
  comment: string | null;
  created_at: string;
}
