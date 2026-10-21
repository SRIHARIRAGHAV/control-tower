import type { SyncState, XoneSnapshot } from './types';

export function shouldRunInitialSync(
  snapshot: XoneSnapshot | null,
  state: SyncState | null | undefined,
): boolean {
  if (!snapshot) return true;
  return ![state?.jira, state?.confluence, state?.bitbucket].some(
    (source) => source?.state === 'connected' || source?.state === 'partial',
  );
}
