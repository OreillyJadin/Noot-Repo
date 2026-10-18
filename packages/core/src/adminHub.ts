export interface AdminHubCounts {
  applications: number;
  gradeChecks: number;
  interviews: number;
  nextInterviewAt: string | null;
  reviews: number;
  complaints: number;
  disputes: number;
  ambassadorApplications: number;
  cashouts: number;
}

export function attentionTotal(counts: AdminHubCounts): number {
  return (
    counts.applications + counts.gradeChecks + counts.reviews + counts.complaints + counts.disputes +
    counts.ambassadorApplications + counts.cashouts
  );
}
