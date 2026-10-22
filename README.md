# Control Tower dashboard (interactive)

## Development and live integrations

    npm ci
    npm run dev

Standalone Vite mode does not provide a Forge runtime or Atlassian authentication. It will not display sample or synthetic company data; source data and sync actions require the Forge bridge. For real Jira, Confluence, and Bitbucket data, deploy and install the app and open it in its Jira context. For local Forge development, run `npm run forge:tunnel` and open the tunneled app in Jira.

Local Vite mode is useful for frontend builds, but cannot validate Atlassian authentication, Forge storage, scheduled triggers, or provider scopes.

Run `npm run build` to type-check and build the Forge static resource into `forge-dist/`. Run `npm test` for freshness, metric, and deterministic forecast tests.

## Live-data scope and metric rules

The dashboard uses the latest Jira
snapshot only when the latest Jira sync succeeded; if Jira sync fails, cached
issues are hidden from current metrics and the previous successful sync time
remains available in the source-status details. Data older than two hours is
also marked stale and excluded from current metrics. A Jira source can be marked
partial when named custom fields are not configured. Source status includes
record counts, sync errors, timestamps, and the missing Jira fields.
The backend stores its latest snapshot, sync state, and forecast as JSON values
in Forge KVS; it does not require custom entity schemas. After upgrading from
the previous custom-entity storage format, run a sync to populate the new
storage keys; existing custom-entity records are not migrated.

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

Jira and Confluence use the app's Forge scopes. Bitbucket sync additionally
requires encrypted Forge variables `BITBUCKET_WORKSPACE`,
`BITBUCKET_OAUTH_CLIENT_ID`, and `BITBUCKET_OAUTH_CLIENT_SECRET`, and a
Bitbucket OAuth consumer with repository-read permission. Configure credentials
in the Forge environment; do not put them in `.env`, frontend variables, or
committed files. The Sync control fetches provider data through the backend
connectors and reports each source's connected, partial, missing-configuration,
or error status independently.

## Access-control configuration

The Forge resolver context is the only source of the current account ID; the
frontend cannot supply or override the identity. Any signed-in Jira user who
can open the installed app may view the dashboard and trigger a sync. Jira and
Confluence requests run as that user, so each user's provider permissions
still apply. User-triggered snapshots are isolated per Atlassian account. The
scheduled sync runs as the app and stores a separate snapshot which is not
returned by user-facing resolvers. Jira write actions run as the current user;
Jira enforces that user's project and issue permissions.

The Forge app must be deployed and installed by a Forge administrator. This
does not bypass the Jira site's normal sign-in, site access, project
permissions, or app availability policies. Configure `JIRA_PROJECT_KEY` in
Forge for scheduled app-context Jira sync; it is never accepted from a browser
request. Standalone Vite mode does not exercise Forge authentication or Jira
permissions.

On first open, the app attempts a sync. If every source failed previously, it
tries again the next time the app opens. Jira and Confluence use the current
Jira user's Forge-granted access. Bitbucket is separate: the current connector
requires `BITBUCKET_WORKSPACE`, `BITBUCKET_OAUTH_CLIENT_ID`, and
`BITBUCKET_OAUTH_CLIENT_SECRET` Forge variables, plus an OAuth consumer with
repository-read permission. A Jira app installation does not authorize access
to an installing customer's Bitbucket workspace. These app-level variables
connect only the configured workspace; supporting each customer's own
Bitbucket account requires a per-customer OAuth connection flow.

## AI service configuration

`.env.example` lists the planned server-side AI settings. The AI provider is not
connected yet; provide the server endpoint and request/response format before
enabling live AI chat and generated insights. Do not put AI credentials in
frontend code or commit a populated `.env` file. For Forge deployments, secrets
must be stored as encrypted Forge environment variables.

## Keyboard / remote
Arrows move focus, Enter opens, Esc/Backspace closes, 1/2/3 = 12h/7d/30d, R refresh,
A auto-refresh, F filter, N notifications, C calendar, / search, M sidebar, ? help.
