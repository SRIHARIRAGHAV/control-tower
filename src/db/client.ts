import { kvs } from '@forge/kvs';
import { randomUUID } from 'node:crypto';
import type { RiskForecast } from '../forecast/risk-forecast';
import type {
  BitbucketRepositorySummary,
  ConfluencePageSummary,
  JiraIssueSummary,
  SyncState,
  XoneSnapshot,
} from '../shared/types';

type SnapshotRecord =
  | { kind: 'jira'; value: JiraIssueSummary }
  | { kind: 'confluence'; value: ConfluencePageSummary }
  | { kind: 'bitbucket'; value: BitbucketRepositorySummary };
type SnapshotManifest = {
  version: 1;
  snapshotId: string;
  syncedAt: string;
  chunkKeys: string[];
  statusKey?: string;
  forecastKey?: string;
};
type StoredSnapshot = XoneSnapshot | SnapshotManifest | { records: SnapshotRecord[] };

const snapshotEntity = kvs.entity<{ payload: StoredSnapshot; updatedAt: string }>('xone_snapshot');
const statusEntity = kvs.entity<{ payload: SyncState; updatedAt: string }>('xone_sync_status');
const forecastEntity = kvs.entity<{ payload: RiskForecast | null; updatedAt: string }>('xone_risk_forecast');
const MAX_CHUNK_BYTES = 200 * 1024;

function isSnapshotChunk(payload: StoredSnapshot): payload is { records: SnapshotRecord[] } {
  return 'records' in payload && Array.isArray(payload.records);
}

type StoredDashboardData = {
  snapshot: XoneSnapshot | null;
  state: SyncState | null;
  forecast: RiskForecast | null;
};

async function readSnapshotPayload(payload: StoredSnapshot | undefined): Promise<XoneSnapshot | null> {
  if (!payload) return null;
  if ('jiraIssues' in payload) return payload;
  if (!('version' in payload) || payload.version !== 1 ||
      !Array.isArray(payload.chunkKeys) || payload.chunkKeys.some((key) => typeof key !== 'string')) {
    throw new Error('The stored dashboard snapshot manifest is invalid.');
  }

  const chunks = await Promise.all(payload.chunkKeys.map((key) => snapshotEntity.get(key)));
  const snapshot: XoneSnapshot = {
    jiraIssues: [],
    confluencePages: [],
    bitbucketRepositories: [],
    syncedAt: payload.syncedAt,
  };
  for (const chunk of chunks) {
    if (!chunk || !isSnapshotChunk(chunk.payload)) {
      throw new Error('The stored dashboard snapshot is incomplete; no partial snapshot was returned.');
    }
    for (const record of chunk.payload.records) {
      if (!record || typeof record !== 'object' || !('kind' in record) || !('value' in record)) {
        throw new Error('The stored dashboard snapshot contains an invalid record.');
      }
      if (record.kind === 'jira') snapshot.jiraIssues.push(record.value);
      else if (record.kind === 'confluence') snapshot.confluencePages.push(record.value);
      else if (record.kind === 'bitbucket') snapshot.bitbucketRepositories.push(record.value);
      else throw new Error('The stored dashboard snapshot contains an unknown record type.');
    }
  }
  return snapshot;
}

export async function readLatestData(): Promise<StoredDashboardData> {
  const latest = await snapshotEntity.get('latest');
  const payload = latest?.payload;
  const statusKey = payload && 'version' in payload && payload.version === 1 &&
    'statusKey' in payload && typeof payload.statusKey === 'string' ? payload.statusKey : 'latest';
  const forecastKey = payload && 'version' in payload && payload.version === 1 &&
    'forecastKey' in payload && typeof payload.forecastKey === 'string' ? payload.forecastKey : 'latest';
  const [snapshot, stateResult, forecastResult] = await Promise.all([
    readSnapshotPayload(payload),
    statusEntity.get(statusKey),
    forecastEntity.get(forecastKey),
  ]);
  return { snapshot, state: stateResult?.payload ?? null, forecast: forecastResult?.payload ?? null };
}

export async function readSnapshot(): Promise<XoneSnapshot | null> {
  return (await readLatestData()).snapshot;
}

export async function readSyncState(): Promise<SyncState | null> {
  return (await readLatestData()).state;
}

export async function readRiskForecast(): Promise<RiskForecast | null> {
  return (await readLatestData()).forecast;
}

export async function writeSyncResult(
  snapshot: XoneSnapshot,
  state: SyncState,
  forecast?: RiskForecast,
): Promise<void> {
  const previous = await snapshotEntity.get('latest');
  const snapshotId = randomUUID();
  const records: SnapshotRecord[] = [
    ...snapshot.jiraIssues.map((value): SnapshotRecord => ({ kind: 'jira', value })),
    ...snapshot.confluencePages.map((value): SnapshotRecord => ({ kind: 'confluence', value })),
    ...snapshot.bitbucketRepositories.map((value): SnapshotRecord => ({ kind: 'bitbucket', value })),
  ];
  const chunks: SnapshotRecord[][] = [];
  let current: SnapshotRecord[] = [];
  let currentBytes = 0;
  for (const record of records) {
    const recordBytes = new TextEncoder().encode(JSON.stringify(record)).byteLength;
    if (recordBytes > MAX_CHUNK_BYTES) {
      throw new Error('A source record exceeds the safe snapshot chunk size; the previous snapshot remains active.');
    }
    if (current.length && currentBytes + recordBytes > MAX_CHUNK_BYTES) {
      chunks.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(record);
    currentBytes += recordBytes;
  }
  if (current.length || chunks.length === 0) chunks.push(current);
  const chunkKeys = chunks.map((_, index) => `snapshot:${snapshotId}:${index}`);
  const statusKey = `status:${snapshotId}`;
  const forecastKey = `forecast:${snapshotId}`;
  await Promise.all(chunks.map((chunk, index) =>
    snapshotEntity.set(chunkKeys[index], { payload: { records: chunk }, updatedAt: snapshot.syncedAt }),
  ));
  await Promise.all([
    statusEntity.set(statusKey, { payload: state, updatedAt: state.syncedAt ?? snapshot.syncedAt }),
    forecastEntity.set(forecastKey, { payload: forecast ?? null, updatedAt: forecast?.generatedAt ?? snapshot.syncedAt }),
  ]);
  await snapshotEntity.set('latest', {
    payload: { version: 1, snapshotId, syncedAt: snapshot.syncedAt, chunkKeys, statusKey, forecastKey },
    updatedAt: snapshot.syncedAt,
  });

  if (previous?.payload && 'version' in previous.payload && previous.payload.version === 1) {
    await Promise.all([
      ...previous.payload.chunkKeys.map((key) => snapshotEntity.delete(key)),
      ...(previous.payload.statusKey ? [statusEntity.delete(previous.payload.statusKey)] : []),
      ...(previous.payload.forecastKey ? [forecastEntity.delete(previous.payload.forecastKey)] : []),
    ]);
  }
}
