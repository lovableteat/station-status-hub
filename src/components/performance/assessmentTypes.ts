export type Category = "IDP" | "OKR" | "KPI";
export type AssessmentMode = "self" | "manager";
export type AssessmentAction = "draft" | "submit" | "return";
export type ReviewStatus = "draft" | "in-progress" | "submitted" | "approved";
export interface EvidenceImage {
  id: string;
  name: string;
  dataUrl: string;
}
export interface AssessmentEntry {
  id: string;
  text: string;
}
export interface AssessmentSection {
  text: string;
  /** The employee's own 1-5 rating for this category. */
  selfScore: number | null;
  entries?: AssessmentEntry[];
  draftText?: string;
  links: string[];
  images: EvidenceImage[];
}
export interface SelfAssessment {
  employeeNumber: string;
  team: string;
  level: string;
  grade: string;
  legacyText: string;
  sections: Record<Category, AssessmentSection>;
}
export interface ManagerAssessment {
  employeeNumber: string;
  feedback: string;
  roleGroup: string;
  standardsVersion: string;
  answers: Record<string, number | null>;
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
  orgLevel?: string;
}
export interface PerformanceSelfContext {
  employeeId: string;
  username: string;
  displayName: string;
  managerId: string | null;
  managerName: string;
  managerOrgLevel: string;
  department: string;
  section: string;
  jobTitle: string;
  orgLevel: "director" | "section_chief" | "member";
  performanceRole: "none" | "employee" | "manager";
  assigned: boolean;
}
