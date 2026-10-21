# Control Tower dashboard (interactive)

## Local development and demo mode

    npm ci
    npm run dev

Open http://localhost:5173. Vite development mode uses **clearly labelled synthetic demo fixtures** by default, so the dashboard can be demonstrated without an Atlassian session or credentials. The fixtures are not live company data and must never be used for business decisions. The Sync button refreshes the local fixture response; it does not call Jira, Confluence, or Bitbucket.

To turn off local demo mode, set `VITE_DEMO_MODE=false` in your local environment and run the app inside the configured Forge context. The live connectors use Forge APIs and are not a standalone local REST integration. Local Vite mode cannot validate Atlassian authentication, Forge storage, scheduled triggers, role allowlists, or provider scopes.

Run `npm run build` to type-check and build the Forge static resource into `forge-dist/`. Run `npm test` for freshness, metric, and deterministic forecast tests.

## Live-data scope and metric rules

The live dashboard starts with no sample company data. It uses the latest Jira
snapshot only when the latest Jira sync succeeded; if Jira sync fails, cached
issues are hidden from current metrics and the previous successful sync time
remains available in the source-status details. Data older than two hours is
also marked stale and excluded from current metrics. A Jira source can be marked
partial when named custom fields are not configured. Source status includes
record counts, sync errors, timestamps, and the missing Jira fields.

Current Jira calculations use these rules:

- The priority score is `(normal/moderate + 0.5 × high) / known-priority issues`
  expressed as a percentage. Critical issues contribute zero; issues with
  unknown priority are excluded and counted as unrated. This is a rule-based
  score, not a forecast or a configured company target.
- On-time delivery uses resolved Jira issues with both a due date and
  resolution date in the last 30 calendar days. A resolution on or before the
  due date is on time. The dashboard shows `Unavailable` when that denominator
  is empty.
- Overdue and upcoming counts use Jira due dates and current open status.
  Upcoming due dates are not labeled as predicted risks.
- Blocked issues are identified from Jira status. The aging measure is elapsed
  time since issue creation; blocker duration is unavailable because changelog
  history is not retrieved.
- Cross-department labels use the Jira `Department` and `Impacted department`
  fields. They do not prove a dependency or handoff. Approval records use the
  `COO decision` and `COO approver` fields; approval age and deadlines are not
  available.

Jira release/milestone data, issue-link dependencies, priority-change history,
and financial exposure are not currently retrieved. Bitbucket provides
repository and recent-commit metadata, not pull requests, builds, or
deployments. Confluence provides page metadata; page content is not analyzed.
Historical snapshots, validated probability models, a finance integration,
and live generative AI are not available. The dashboard therefore marks those
metrics or recommendations unavailable instead of filling them with examples.

## Deploy to Jira

Install and authenticate the Atlassian Forge CLI, then run:

    npm run forge:lint
    npm run forge:deploy

The deployment builds the React dashboard first and packages it with the Forge
resolvers and Jira/Confluence/Bitbucket sync handlers. `npm run forge:install`
is for installing the app on a Jira site after the first deployment.

## Access-control configuration

The intended Forge role policy uses comma-separated Atlassian account IDs in encrypted Forge environment variables:

- `CONTROL_TOWER_EXECUTIVE_ACCOUNT_IDS`: users allowed to view executive dashboard data.
- `CONTROL_TOWER_OPERATOR_ACCOUNT_IDS`: users allowed to synchronize sources and perform Jira write actions.

Configure these only in the Forge environment, not in frontend variables or committed files. If the allowlists are not configured, role-protected operations are denied. Local demo mode is read-only and does not exercise the Forge authorization policy.

## AI service configuration

`.env.example` lists the planned server-side AI settings. The AI provider is not
connected yet; provide the server endpoint and request/response format before
enabling live AI chat and generated insights. Do not put AI credentials in
frontend code or commit a populated `.env` file. For Forge deployments, secrets
must be stored as encrypted Forge environment variables.

## Keyboard / remote
Arrows move focus, Enter opens, Esc/Backspace closes, 1/2/3 = 12h/7d/30d, R refresh,
A auto-refresh, F filter, N notifications, C calendar, / search, M sidebar, ? help.
