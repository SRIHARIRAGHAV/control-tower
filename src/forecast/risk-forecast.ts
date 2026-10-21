export interface ForecastIssue {
  key: string;
  project: string;
  status: string;
  statusCategory?: string;
  priority: string;
  owner?: string;
  department?: string;
  client?: string;
  createdAt?: string;
  dueDate?: string;
  resolvedAt?: string;
  reopenedAt?: string[];
}

export interface ForecastRepo {
  fullName: string;
  pullRequests?: { createdAt: string; mergedAt?: string; state: 'OPEN' | 'MERGED' | 'DECLINED' }[];
  pipelines?: { createdAt: string; result: 'SUCCESSFUL' | 'FAILED' | 'OTHER' }[];
}

export interface ForecastPage {
  title: string;
  lastModified?: string;
}

export interface ForecastInput {
  issues: ForecastIssue[];
  repos: ForecastRepo[];
  pages: ForecastPage[];
  reopenHistoryWeeks?: number;
  pipelineHistoryWeeks?: number;
}

export type Windows = 7 | 14 | 30;
export const WINDOWS: Windows[] = [7, 14, 30];
export type Insufficient = {
  status: 'insufficient-data';
  reason: string;
  have: number;
  need: number;
  missingInput: string;
};
export type Ready<T> = { status: 'ready' } & T;

export interface DeliveryWindow {
  window: Windows;
  issuesDue: number;
  expectedLate: number;
  probabilityAnyLate: number;
  worstDelayDays: number;
}

export interface PotentialRisk {
  id: string;
  lvl: 'h' | 'm';
  dept: string;
  project: string;
  day: number;
  type: 'client' | 'internal';
  area: string;
  risk: string;
  cause: string;
  impact: string;
  action: string;
  owner: string;
  client?: string;
  probability?: number;
  window: Windows;
  basis: 'statistical' | 'heuristic';
}

export interface AnomalyMetric {
  id: string;
  metric: string;
  unit: string;
  hist: number[];
  now: number;
  lvl: 'c' | 'h' | 'n';
  dept: string;
  project: string;
  day: number;
  cause: string;
}

export interface RiskForecast {
  generatedAt: string;
  thresholds: typeof FORECAST_THRESHOLDS;
  dataState: 'fresh' | 'partial' | 'stale';
  sources: Partial<Record<'jira' | 'confluence' | 'bitbucket', {
    state: string;
    syncedAt?: string;
    ageMs: number | null;
    cached: boolean;
  }>>;
  delivery: Insufficient | Ready<{ windows: DeliveryWindow[] }>;
  potentialRisks: Insufficient | Ready<{ items: PotentialRisk[] }>;
  anomalies: Insufficient | Ready<{ items: AnomalyMetric[]; checked: number }>;
}

export const FORECAST_THRESHOLDS = {
  minResolvedIssues: 15,
  resolvedWindowDays: 90,
  pullRequestMergeWindowDays: 90,
  minObservedWeeks: 8,
  minEventsForAnomaly: 3,
  anomalyZScore: 2,
  anomalyMultiple: 1.5,
  stuckPullRequestPercentile: 0.85,
} as const;
const MIN_RESOLVED = FORECAST_THRESHOLDS.minResolvedIssues;
const DAY = 86_400_000;
const days = (a: Date, b: Date) => (a.getTime() - b.getTime()) / DAY;
const isDone = (s: string, category?: string) =>
  category ? category.toLowerCase() === 'done' : /^(done|closed|resolved|complete|completed)$/i.test(s.trim());
const mean = (values: number[]) => values.reduce((total, value) => total + value, 0) / values.length;
const sd = (values: number[]) => Math.sqrt(mean(values.map((value) => (value - mean(values)) ** 2)));
const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
const insufficient = (reason: string, have: number, need: number, missingInput: string): Insufficient =>
  ({ status: 'insufficient-data', reason, have, need, missingInput });

function validDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function weekly(stamps: string[], now: Date): number[] {
  const output = new Array(9).fill(0);
  for (const stamp of stamps) {
    const date = validDate(stamp);
    if (!date) continue;
    const week = Math.floor(days(now, date) / 7);
    if (week >= 0 && week < 9) output[8 - week] += 1;
  }
  return output;
}

const survival = (sorted: number[], duration: number) => sorted.filter((value) => value > duration).length / sorted.length;

export function forecastDelivery(issues: ForecastIssue[], now: Date): RiskForecast['delivery'] {
  const cycle = issues
    .flatMap((issue) => {
      const created = validDate(issue.createdAt);
      const resolved = validDate(issue.resolvedAt);
      if (!created || !resolved) return [];
      const resolvedAgo = days(now, resolved);
      const duration = days(resolved, created);
      return resolvedAgo >= 0 && resolvedAgo <= 90 && duration >= 0 ? [duration] : [];
    })
    .sort((a, b) => a - b);

  if (cycle.length < MIN_RESOLVED) {
    return insufficient(
      `resolved Jira issues in the last ${FORECAST_THRESHOLDS.resolvedWindowDays} days: have ${cycle.length}, need ${MIN_RESOLVED}`,
      cycle.length,
      MIN_RESOLVED,
      'Jira resolvedAt and createdAt',
    );
  }

  const open = issues.flatMap((issue) => {
    const created = validDate(issue.createdAt);
    const due = validDate(issue.dueDate);
    return !isDone(issue.status, issue.statusCategory) && created && due ? [{ created, due }] : [];
  });
  const windows = WINDOWS.map((window): DeliveryWindow => {
    const probabilities: number[] = [];
    const overruns: number[] = [];
    for (const issue of open) {
      const left = days(issue.due, now);
      if (left < 0 || left > window) continue;
      const age = days(now, issue.created);
      const stillOpenShare = survival(cycle, age);
      if (stillOpenShare === 0) {
        probabilities.push(1);
        overruns.push(0);
        continue;
      }
      probabilities.push(Math.min(1, survival(cycle, age + left) / stillOpenShare));
      overruns.push(Math.max(0, pct(cycle, 0.85) - age - left));
    }
    return {
      window,
      issuesDue: probabilities.length,
      expectedLate: +probabilities.reduce((total, probability) => total + probability, 0).toFixed(1),
      probabilityAnyLate: +(1 - probabilities.reduce((product, probability) => product * (1 - probability), 1)).toFixed(2),
      worstDelayDays: Math.round(overruns.length ? pct(overruns.sort((a, b) => a - b), 0.85) : 0),
    };
  });
  return { status: 'ready', windows };
}

export function forecastAnomalies(input: ForecastInput, now: Date): RiskForecast['anomalies'] {
  const series = [
    {
      id: 'fan-reopen',
      metric: 'Reopened tickets',
      unit: '/ week',
      stamps: input.issues.flatMap((issue) => issue.reopenedAt ?? []),
      project: 'All projects',
      dept: 'QA',
      cause: 'Done tickets are being reopened more often than usual',
    },
    {
      id: 'fan-build',
      metric: 'Build failures',
      unit: '/ week',
      stamps: input.repos.flatMap((repository) =>
        (repository.pipelines ?? []).filter((pipeline) => pipeline.result === 'FAILED').map((pipeline) => pipeline.createdAt),
      ),
      project: 'All repositories',
      dept: 'Software Engineering',
      cause: 'Failed Bitbucket pipelines are above their normal weekly level',
    },
  ];
  const items: AnomalyMetric[] = [];
  const missing: string[] = [];
  let checked = 0;
  for (const item of series) {
    const counts = weekly(item.stamps, now);
    const history = counts.slice(0, 8);
    const current = counts[8];
    const observedWeeks = item.id === 'fan-reopen' ? input.reopenHistoryWeeks : input.pipelineHistoryWeeks;
    const eventCount = counts.reduce((total, value) => total + value, 0);
    if (observedWeeks === undefined || observedWeeks < FORECAST_THRESHOLDS.minObservedWeeks ||
        eventCount < FORECAST_THRESHOLDS.minEventsForAnomaly) {
      missing.push(`${item.id === 'fan-reopen' ? 'reopenedAt' : 'Bitbucket pipelines'}: ${eventCount} events in ${observedWeeks ?? 0} observed weeks (need ${FORECAST_THRESHOLDS.minEventsForAnomaly} events and ${FORECAST_THRESHOLDS.minObservedWeeks} weeks)`);
      continue;
    }
    checked++;
    const average = mean(history);
    const z = sd(history) > 0 ? (current - average) / sd(history) : current > average ? Infinity : 0;
    if (z > FORECAST_THRESHOLDS.anomalyZScore && current >= average * FORECAST_THRESHOLDS.anomalyMultiple) {
      items.push({
        id: item.id,
        metric: item.metric,
        unit: item.unit,
        hist: history,
        now: current,
        lvl: z > 4 ? 'c' : 'h',
        dept: item.dept,
        project: item.project,
        day: 0,
        cause: item.cause,
      });
    }
  }
  return checked === 0
    ? insufficient(
        missing.join('; '),
        Math.max(input.reopenHistoryWeeks ?? 0, input.pipelineHistoryWeeks ?? 0),
        FORECAST_THRESHOLDS.minObservedWeeks,
        'Jira reopenedAt / Bitbucket pipeline history',
      )
    : { status: 'ready', items, checked };
}

export function forecastPotentialRisks(
  input: ForecastInput,
  delivery: RiskForecast['delivery'],
  now: Date,
): RiskForecast['potentialRisks'] {
  const items: PotentialRisk[] = [];
  const pullRequests = input.repos.flatMap((repository) => repository.pullRequests ?? []);
  const mergedDurations = pullRequests.flatMap((pullRequest) => {
    const created = validDate(pullRequest.createdAt);
    const merged = validDate(pullRequest.mergedAt);
    if (!created || !merged) return [];
    const duration = days(merged, created);
    const mergedAgo = days(now, merged);
    return duration >= 0 && mergedAgo >= 0 && mergedAgo <= FORECAST_THRESHOLDS.pullRequestMergeWindowDays
      ? [duration]
      : [];
  }).sort((a, b) => a - b);

  if (delivery.status === 'ready') {
    for (const window of delivery.windows.filter((item) => item.probabilityAnyLate >= 0.5 && item.issuesDue > 0)) {
      items.push({
        id: `fp-delivery-${window.window}`,
        lvl: window.probabilityAnyLate >= 0.8 ? 'h' : 'm',
        dept: 'All',
        project: 'Dated Jira issues',
        day: window.window,
        type: 'internal',
        area: 'Client delivery',
        risk: `${window.expectedLate} of ${window.issuesDue} issues due in ${window.window} days likely late`,
        cause: 'Open time already exceeds what similar issues took in the last 90 days',
        impact: `Up to ${window.worstDelayDays} days of delay`,
        action: 'Review owners and scope for the issues due soonest',
        owner: '',
        probability: window.probabilityAnyLate,
        window: window.window,
        basis: 'statistical',
      });
    }
  }

  if (mergedDurations.length >= MIN_RESOLVED) {
    const mergeLimit = pct(mergedDurations, FORECAST_THRESHOLDS.stuckPullRequestPercentile);
    const stuck = pullRequests.filter((pullRequest) => {
      const created = validDate(pullRequest.createdAt);
      return pullRequest.state === 'OPEN' && created && days(now, created) > mergeLimit;
    }).length;
    if (stuck) {
      items.push({
        id: 'fp-prs',
        lvl: 'm',
        dept: 'Software Engineering',
        project: 'Bitbucket',
        day: 7,
        type: 'internal',
        area: 'Quality',
        risk: `${stuck} pull requests open longer than 85% of merges in the last 90 days`,
        cause: `Normal merge time is under ${Math.ceil(mergeLimit)} days`,
        impact: 'Features wait in review and miss the release',
        action: 'Assign reviewers to the oldest pull requests',
        owner: '',
        window: 7,
        basis: 'heuristic',
      });
    }
  }

  const hasPullRequestHistory = mergedDurations.length >= MIN_RESOLVED;
  if (delivery.status !== 'ready' && !hasPullRequestHistory) {
    return insufficient(
      'No supported potential-risk input is ready (Jira delivery cycle time or Bitbucket pull-request merge history)',
      0,
      MIN_RESOLVED,
      'Jira cycle time or Bitbucket merged pull requests',
    );
  }
  return { status: 'ready', items };
}

export function buildRiskForecast(input: ForecastInput, now = new Date()): RiskForecast {
  const delivery = forecastDelivery(input.issues, now);
  return {
    generatedAt: now.toISOString(),
    thresholds: FORECAST_THRESHOLDS,
    dataState: 'fresh',
    sources: {},
    delivery,
    potentialRisks: forecastPotentialRisks(input, delivery, now),
    anomalies: forecastAnomalies(input, now),
  };
}
