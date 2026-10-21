import type {
  AddJiraCommentInput,
  CreateJiraIssueInput,
  DashboardDataResponse,
} from '../../shared/types';

import { getLocalDemoData, syncLocalDemoData } from '../../local/demo-data';

const localDemoEnabled = import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE !== 'false';

export function isLocalDemoMode(): boolean {
  return localDemoEnabled;
}

async function invokeForge<T>(method: string, payload?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@forge/bridge');
  return payload ? invoke<T>(method, payload) : invoke<T>(method);
}

export function getDashboardData(): Promise<DashboardDataResponse> {
  if (localDemoEnabled) return getLocalDemoData();
  return invokeForge<DashboardDataResponse>('getDashboardData');
}

export function syncNow(): Promise<DashboardDataResponse> {
  if (localDemoEnabled) return syncLocalDemoData();
  return invokeForge<DashboardDataResponse>('syncNow');
}

export function createJiraIssue(input: CreateJiraIssueInput): Promise<{ id: string; key: string; self: string }> {
  if (localDemoEnabled) return Promise.reject(new Error('Jira write actions are disabled in local demo mode.'));
  return invokeForge('createJiraIssue', { ...input });
}

export function addJiraComment(input: AddJiraCommentInput): Promise<{ id: string; self: string }> {
  if (localDemoEnabled) return Promise.reject(new Error('Jira write actions are disabled in local demo mode.'));
  return invokeForge('addJiraComment', { ...input });
}
