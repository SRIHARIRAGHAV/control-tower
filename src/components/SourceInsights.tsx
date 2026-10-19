import type { SyncState, XoneSnapshot } from '../shared/types';
import { buildSourceInsights } from '../data/source-insights';
import { formatCount } from '../utils/format-count';

interface SourceInsightsProps {
  snapshot: XoneSnapshot | null;
  state: SyncState | null;
}

export default function SourceInsights({ snapshot, state }: SourceInsightsProps) {
  const summary = buildSourceInsights(snapshot, state);

  return (
    <section className="forge-insights" aria-label="Source data summary">
      <b>Source data summary</b>
      <p className="forge-insights-total">
        {formatCount(summary.totalRecords, 'record')} synced
        {summary.blockedIssues > 0 || summary.highPriorityIssues > 0
          ? ` · ${summary.blockedIssues} blocked · ${summary.highPriorityIssues} high priority`
          : ''}
      </p>
      <ul>
        {summary.insights.map((insight) => (
          <li className={`forge-insight ${insight.tone}`} key={insight.id}>
            <strong>{insight.title}</strong>
            <small>{insight.detail}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}
