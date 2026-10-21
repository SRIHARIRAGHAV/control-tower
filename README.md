# Control Tower dashboard (interactive)

## Local development and demo mode

    npm ci
    npm run dev

Open http://localhost:5173. The local Vite server binds to localhost by default
and uses **clearly labelled synthetic demo fixtures** so developers can work
without an Atlassian session or credentials. The fixtures are not live company
data and must never be used for business decisions. The Sync button refreshes
the local fixture response; it does not call Jira, Confluence, or Bitbucket.

To turn off local demo mode, set `VITE_DEMO_MODE=false` in your local environment and run the app inside the configured Forge context. The live connectors use Forge APIs and are not a standalone local REST integration. Local Vite mode cannot validate Atlassian authentication, Forge storage, scheduled triggers, or provider scopes.

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

The Forge resolver context is the only source of the current account ID; the
frontend cannot supply or override identity or role. The backend denies access
unless both an explicit Forge access mode and the account's role allowlist
match. Jira administrator status does not grant a Control Tower role.
The manifest exposes a Jira `globalPage` and no public webtrigger or anonymous
data route; having the app URL alone does not satisfy the resolver authorization
checks. Access to the Jira app entry point is additionally subject to the
site's Forge installation and Jira app-availability controls.

Configure these as Forge environment variables. Forge keeps variables and
storage separate per environment. Do not set the same role lists in both
environments:

- Development: set `CONTROL_TOWER_ACCESS_MODE=development` and list only
  authorized developer account IDs in `CONTROL_TOWER_DEVELOPER_ACCOUNT_IDS`.
  CEO/COO lists do not grant access in development.
- Production: set `CONTROL_TOWER_ACCESS_MODE=production` and assign only
  approved executives to `CONTROL_TOWER_CEO_ACCOUNT_IDS` and
  `CONTROL_TOWER_COO_ACCOUNT_IDS`. Developer IDs do not grant access in
  production.
- Any unset/unknown mode or unmatched account is denied. Staging remains
  denied unless its policy is deliberately configured.

The comma-separated values are Atlassian account IDs, not email addresses.
Set them in the Forge environment, never in frontend variables or committed
files. Example configuration:

    forge variables set --environment development CONTROL_TOWER_ACCESS_MODE development
    forge variables set --environment development CONTROL_TOWER_DEVELOPER_ACCOUNT_IDS "developer-account-id"
    forge variables set --environment production CONTROL_TOWER_ACCESS_MODE production
    forge variables set --environment production CONTROL_TOWER_CEO_ACCOUNT_IDS "ceo-account-id"
    forge variables set --environment production CONTROL_TOWER_COO_ACCOUNT_IDS "coo-account-id"
    forge deploy --environment development
    forge deploy --environment production

After changing variables, deploy to that same Forge environment before the
change takes effect. Revoke a user by removing their account ID from the
corresponding allowlist and redeploying that environment; authorization has no
in-process role cache. An already-open dashboard rechecks authorization every
60 seconds and when the tab becomes active, then clears in-memory dashboard
data when authorization is lost. Browser throttling can delay periodic checks
in an inactive tab; backend resolvers enforce authorization on every request.
Control who can change Forge variables, deploy, or install production through
Atlassian/Forge administration; repository code cannot assign those platform
administrative permissions. Deploy/install the development app only on a
non-production Jira site or test project, with separate integration
credentials and synthetic or sanitized test data. Developer access does not
grant production access.

The `getAuthStatus`, `getDashboardData`, `syncNow`, `createJiraIssue`, and
`addJiraComment` resolvers all use the same server-side authorization policy.
The dashboard is not initialized and data resolvers do not return snapshots
until authorization succeeds. User-triggered Jira and Confluence requests run
as the current user; Jira still enforces that user's project and issue
permissions. User-triggered snapshots remain isolated per account. Scheduled
sync runs as the app and writes only to the current Forge environment's
storage; it does not expose data through the user-facing resolvers.

Configure `JIRA_PROJECT_KEY` separately in each Forge environment for
scheduled app-context Jira sync; it is never accepted from a browser request.
Local Vite demo mode is only a localhost synthetic preview; it is read-only and
does not test Forge authentication or role authorization. Do not expose the
local server on a network or use it with confidential production data.

## AI service configuration

`.env.example` lists the planned server-side AI settings. The AI provider is not
connected yet; provide the server endpoint and request/response format before
enabling live AI chat and generated insights. Do not put AI credentials in
frontend code or commit a populated `.env` file. For Forge deployments, secrets
must be stored as encrypted Forge environment variables.

## Keyboard / remote
Arrows move focus, Enter opens, Esc/Backspace closes, 1/2/3 = 12h/7d/30d, R refresh,
A auto-refresh, F filter, N notifications, C calendar, / search, M sidebar, ? help.
