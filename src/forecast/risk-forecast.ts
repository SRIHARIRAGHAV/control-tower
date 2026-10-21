export interface ForecastIssue {
  key: string;
  project: string;
  status: string;
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
}

export type Windows = 7 | 14 | 30;
export const WINDOWS: Windows[] = [7, 14, 30];
export type Insufficient = { status: 'insufficient-data'; reason: string; have: number; need: number };
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
  probability: number;
  window: Windows;
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
  delivery: Insufficient | Ready<{ windows: DeliveryWindow[] }>;
  potentialRisks: Insufficient | Ready<{ items: PotentialRisk[] }>;
  anomalies: Insufficient | Ready<{ items: AnomalyMetric[]; checked: number }>;
}

const MIN_RESOLVED = 15;
const MIN_WEEKS = 6;
const Z_LIMIT = 2;
const DAY = 86_400_000;
const days = (a: Date, b: Date) => (a.getTime() - b.getTime()) / DAY;
const isDone = (s: string) => /^(done|closed|resolved|complete|completed)$/i.test(s.trim());
const mean = (values: number[]) => values.reduce((total, value) => total + value, 0) / values.length;
const sd = (values: number[]) => Math.sqrt(mean(values.map((value) => (value - mean(values)) ** 2)));
const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
const insufficient = (reason: string, have: number, need: number): Insufficient =>
  ({ status: 'insufficient-data', reason, have, need });

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
    return insufficient('Not enough resolved Jira issues in the last 90 days to estimate cycle time', cycle.length, MIN_RESOLVED);
  }

  const open = issues.flatMap((issue) => {
    const created = validDate(issue.createdAt);
    const due = validDate(issue.dueDate);
    return !isDone(issue.status) && created && due ? [{ created, due }] : [];
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
  let checked = 0;
  let best = 0;
  for (const item of series) {
    const counts = weekly(item.stamps, now);
    const history = counts.slice(0, 8);
    const current = counts[8];
    const activeWeeks = history.filter((count) => count > 0).length + (current > 0 ? 1 : 0);
    best = Math.max(best, activeWeeks);
    if (activeWeeks < MIN_WEEKS) continue;
    checked++;
    const average = mean(history);
    const z = sd(history) > 0 ? (current - average) / sd(history) : current > average ? Infinity : 0;
    if (z > Z_LIMIT && current >= average * 1.5) {
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
    ? insufficient('Not enough weekly reopen or pipeline history to define a normal level', best, MIN_WEEKS)
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
    return duration >= 0 ? [duration] : [];
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
        owner: 'Delivery lead',
        probability: window.probabilityAnyLate,
        window: window.window,
      });
    }
  }

  if (mergedDurations.length >= MIN_RESOLVED) {
    const mergeLimit = pct(mergedDurations, 0.85);
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
        risk: `${stuck} pull requests open longer than 85% of past merges`,
        cause: `Normal merge time is under ${Math.ceil(mergeLimit)} days`,
        impact: 'Features wait in review and miss the release',
        action: 'Assign reviewers to the oldest pull requests',
        owner: 'Engineering lead',
        probability: 0.6,
        window: 7,
      });
    }
  }

  const datedPages = input.pages.flatMap((page) => {
    const lastModified = validDate(page.lastModified);
    return lastModified ? [{ title: page.title, lastModified }] : [];
  });
  const staleDecisions = datedPages.filter((page) =>
    /decision|adr|rfc/i.test(page.title) && days(now, page.lastModified) > 90,
  ).length;
  if (staleDecisions) {
    items.push({
      id: 'fp-stale',
      lvl: 'm',
      dept: 'All',
      project: 'Confluence',
      day: 30,
      type: 'internal',
      area: 'Data & reporting',
      risk: `${staleDecisions} decision pages not updated in 90+ days`,
      cause: 'Decision records may no longer match what the teams are doing',
      impact: 'Teams act on outdated decisions',
      action: 'Ask page owners to confirm or retire them',
      owner: 'Page owners',
      probability: 0.5,
      window: 30,
    });
  }

  const hasPullRequestHistory = mergedDurations.length >= MIN_RESOLVED;
  const hasPageHistory = datedPages.length > 0;
  if (delivery.status !== 'ready' && !hasPullRequestHistory && !hasPageHistory) {
    return insufficient('Not enough Jira cycle-time, pull-request merge, or Confluence modified-date history', 0, MIN_RESOLVED);
  }
  return { status: 'ready', items };
}

export function buildRiskForecast(input: ForecastInput, now = new Date()): RiskForecast {
  const delivery = forecastDelivery(input.issues, now);
  return {
    generatedAt: now.toISOString(),
    delivery,
    potentialRisks: forecastPotentialRisks(input, delivery, now),
    anomalies: forecastAnomalies(input, now),
  };
}
