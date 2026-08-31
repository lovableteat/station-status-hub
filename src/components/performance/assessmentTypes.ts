export type Category = "IDP" | "OKR" | "KPI";
export type AssessmentMode = "self" | "manager";
export type AssessmentAction = "draft" | "submit" | "return";
export type ReviewStatus = "draft" | "in-progress" | "submitted" | "approved";
export interface EvidenceImage {
  id: string;
  name: string;
  dataUrl: string;
}
export interface AssessmentSection {
  text: string;
  links: string[];
  images: EvidenceImage[];
}
export interface SelfAssessment {
  employeeNumber: string;
  team: string;
  level: string;
  legacyText: string;
  sections: Record<Category, AssessmentSection>;
}
export interface ManagerAssessment {
  employeeNumber: string;
  feedback: string;
  answers: { q1: number | null; q2: number | null };
}
export interface PerformanceGoal {
  id: string;
  category: Category;
  title: string;
  progress: number;
  weight: number;
}
export interface PerformanceReview {
  id: string;
  cycleId: string;
  employeeId: string;
  employeeName: string;
  department: string;
  role: string;
  reviewerName: string;
  status: ReviewStatus;
  score: number | null;
  dueDate: string;
  updatedAt: string;
  selfFeedback: string;
  managerFeedback: string;
  goals: PerformanceGoal[];
}
export interface AssessmentForm {
  recordId: string;
  sourceUpdatedAt: string;
  employeeId: string;
  employeeName: string;
  department: string;
  role: string;
  reviewerName: string;
  dueDate: string;
  score: string;
  self: SelfAssessment;
  manager: ManagerAssessment;
  goals: PerformanceGoal[];
}
export interface EmployeeOption {
  id: string;
  label: string;
}
