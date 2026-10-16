import type {
  AddJiraCommentInput,
  CreateJiraIssueInput,
  DashboardDataResponse,
} from '../../domain/contracts';

async function invokeForge<T>(method: string, payload?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@forge/bridge');
  return payload ? invoke<T>(method, payload) : invoke<T>(method);
}

export function getDashboardData(): Promise<DashboardDataResponse> {
  return invokeForge<DashboardDataResponse>('getDashboardData');
}

export function syncNow(): Promise<DashboardDataResponse> {
  return invokeForge<DashboardDataResponse>('syncNow');
}

export function createJiraIssue(input: CreateJiraIssueInput): Promise<{ id: string; key: string; self: string }> {
  return invokeForge('createJiraIssue', { ...input });
}

export function addJiraComment(input: AddJiraCommentInput): Promise<{ id: string; self: string }> {
  return invokeForge('addJiraComment', { ...input });
}
