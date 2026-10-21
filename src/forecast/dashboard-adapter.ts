import type { PotentialRisk, RiskForecast } from './risk-forecast';

export interface DashboardPotentialRisk {
  id: string;
  key: string;
  dept: string;
  project: string;
  lvl: string;
  day: number;
  type: string;
  area: string;
  risk: string;
  cause: string;
  impact: string;
  action: string;
  owner: string;
  client?: string;
  open: true;
  age: null;
  dueDate: '';
}

export function mapPotentialRisks(items: PotentialRisk[]): DashboardPotentialRisk[] {
  return items.map((item) => ({
    id: item.id,
    key: item.id,
    dept: item.dept,
    project: item.project,
    lvl: item.lvl,
    day: item.day,
    type: item.type,
    area: item.area,
    risk: item.risk,
    cause: item.cause,
    impact: item.impact,
    action: item.action,
    owner: item.owner,
    ...(item.client ? { client: item.client } : {}),
    open: true,
    age: null,
    dueDate: '',
  }));
}

function statusMessage(
  result: RiskForecast['potentialRisks'] | RiskForecast['anomalies'],
): string {
  if (result.status === 'insufficient-data') {
    return `insufficient data (${result.have}/${result.need})`;
  }
  return `${result.items.length} items; rule-based, not accuracy-validated`;
}

export function potentialForecastStatus(forecast: RiskForecast | undefined): string {
  if (!forecast) return 'unavailable';
  if (forecast.dataState === 'stale') return 'stale';
  if (forecast.dataState === 'partial') return 'partial';
  return statusMessage(forecast.potentialRisks);
}

export function anomalyForecastStatus(forecast: RiskForecast | undefined): string {
  if (!forecast) return 'unavailable';
  if (forecast.dataState === 'stale') return 'stale';
  if (forecast.dataState === 'partial') return 'partial';
  return statusMessage(forecast.anomalies);
}

export function forecastTooltip(forecast: RiskForecast | undefined): string {
  if (!forecast) return 'Forecast unavailable';
  const sources = Object.entries(forecast.sources).map(([name, source]) => {
    const age = source.ageMs === null ? 'age unavailable' : `${Math.floor(source.ageMs / 60_000)} minutes old`;
    return `${name}: ${source.state}${source.cached ? ' (cached)' : ''}, ${age}`;
  }).join('; ');
  const potential = forecast.potentialRisks.status === 'ready'
    ? forecast.potentialRisks.items.map((item) => `${item.id}: ${item.risk} [${item.basis}]`).join('; ') || 'No potential risk items'
    : forecast.potentialRisks.reason;
  const anomalies = forecast.anomalies.status === 'ready'
    ? forecast.anomalies.items.map((item) => `${item.metric}: ${item.now} ${item.unit}`).join('; ') || 'No anomalies flagged'
    : forecast.anomalies.reason;
  return `Forecast generated ${forecast.generatedAt}; ${forecast.dataState}. Sources: ${sources || 'not recorded'}. Potential risks: ${potential}. Anomalies: ${anomalies}.`;
}
