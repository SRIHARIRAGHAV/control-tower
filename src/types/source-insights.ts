export interface SourceInsight {
  id: string;
  tone: 'info' | 'warning';
  title: string;
  detail: string;
}

export interface SourceInsightSummary {
  totalRecords: number;
  blockedIssues: number;
  highPriorityIssues: number;
  insights: SourceInsight[];
}
