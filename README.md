# Xone

Xone is a Jira Cloud global-page app built with Atlassian Forge Custom UI,
React, TypeScript, Forge Functions, and Forge Custom Entity Store. Its live
dashboard displays the latest synced Jira, Confluence, and Bitbucket records,
with rule-based issue-attention indicators derived from Jira status and
priority. It does not substitute generated sample metrics for live records.

## Architecture

```text
src/
├── index.ts              Forge function entrypoint
├── resolvers/            Dashboard, sync, and Jira write routes
├── connectors/           Jira, Confluence, Bitbucket, and HTTP clients
├── sync/                 Source worker, normalization, and snapshot orchestration
├── services/             Jira write operations
├── db/                   Forge Custom Entity Store client
├── shared/               Runtime-neutral TypeScript contracts
└── frontend/             React app, UI features, dashboard assets, Forge bridge

src/frontend/index.html ──> frontend/main.tsx ──> static/dashboard/
manifest.yml ─────────────> src/index.ts ──> resolvers/ + scheduled sync
connectors + resolvers ───> sync/services ──> db + shared contracts
frontend ───────────────────────────────────> shared contracts
```

- `src/shared/` contains shared data contracts and has no Forge runtime
  dependencies.
- `src/resolvers/` registers Forge resolver routes. `src/index.ts` is the
  function entrypoint used by `manifest.yml`.
- `src/connectors/` owns each provider API boundary. Shared external HTTP
  handling and provider-to-domain normalization are kept in `http.ts` and
  `src/sync/normalise.ts`.
- `src/sync/` coordinates source reads, preserves prior data when an individual
  source fails, and persists the combined snapshot through `src/db/client.ts`.
- `src/db/` is the persistence boundary and uses Forge Custom Entity Store
  (`@forge/kvs`); it is not a SQL database or a separate database server.
- The React source remains under `src/frontend/`. Vite builds the Forge Custom
  UI resource into `static/dashboard/`; generated build output is ignored by
  Git.
- `src/frontend/features/` contains UI features, `services/` contains typed
  Forge bridge calls, and `dashboard/` keeps the existing dashboard assets
  together.
- `src/frontend/dashboard/` isolates the original imperative dashboard shell
  and its assets behind `LegacyDashboardView`. New UI should be built as React
  features rather than adding more DOM manipulation to that legacy dashboard.
- `src/index.ts` is the Forge function entrypoint; `src/frontend/main.tsx` is
  the browser entrypoint. Vite builds from `src/frontend/` into Forge's
  `static/dashboard/` resource directory, and the two runtimes stay separate.

The `rules/`, `scoring/`, `ai/`, and additional resolver modules in the planned
architecture are not implemented yet. They should be added alongside the
corresponding product behavior rather than as empty or success-shaped stubs.
Forge Custom Entity Store is the approved persistence layer for this app, so
do not add the example SQL migration or a separate database.

Keep credentials, Forge API calls, and storage access in backend-only layers
(`connectors`, `services`, and `db`). Normalize provider responses in
`src/sync/normalise.ts` and share only normalized contracts with the frontend.

## Local checks

```powershell
npm install
npm run build
npm run forge:lint
```

Forge API calls require the app to run in an Atlassian Forge context. Use
`npm run dev` for UI-only development and `npm run forge:tunnel` after
registering and installing the app for Forge development.

## Forge setup

1. Install the Forge CLI globally: `npm install --global @forge/cli`.
2. Authenticate with your Atlassian account using `forge login`.
3. Register the app with `forge register`. This replaces the placeholder app
   ID in `manifest.yml` with the ID assigned to your Forge account.
4. Run `npm run build` and `npm run forge:lint`.
5. Deploy to development with `npm run forge:deploy`.
6. Install it into a Jira development site with
   `npm run forge:install -- --site <your-site>.atlassian.net`.
7. Grant the requested Jira, Confluence, and storage permissions when prompted.

The application uses the Forge Custom Entity Store (`@forge/kvs`) for its
latest source snapshot and sync status. Forge SQL and external databases are
not used.

## Connected sources

The dashboard uses **only live connected-source data**. Use **Sync sources
now** to fetch Jira, Confluence, and Bitbucket records and refresh the stored
snapshot. It does not generate or substitute mock records in the dashboard.

The dashboard flags open Jira issues with blocked statuses or high/urgent
priorities. These are transparent current-state indicators, not predictions.
Jira sync also fetches due dates and, when present, the custom fields named
Department, Impacted department, Client, Customer impact, Mitigation, Owner,
COO decision, COO approver, Approval date, and Delivery initiative. Create/map
the Department fields in Jira to classify issues; records without a Department remain
Unassigned rather than being inferred from their project name. The dashboard
shows six highest-priority departments at a time, with the other department
records shown two at a time in a paged department carousel. Department cards summarize live
priority counts, client/internal/cross-department issue counts, handoffs, and
oldest known issue age. The organisation impact section shows an issue-priority
matrix, affected clients with their linked Jira issues, and department handoffs.
These summaries use populated Jira fields; missing department, client, or impact
values are called out instead of being inferred. Due dates appear in the
deadline timeline, while approval fields and approval age appear in the COO
approval summary. Overall health is a current status/priority index, not a
prediction. An evidence-based delivery forecast is calculated during sync from
Jira resolution dates and is shown only when at least 15 completed issues from
the last 90 days are available. Reopen events, Bitbucket pull requests and
pipelines, and Confluence modification dates are not currently synced, so those
forecast signals report insufficient data rather than inventing a result.
The forecast is not a financial risk score. Desktop dashboard content is
available as two swipeable pages; the layout adjusts to available screen width,
and phones use vertical scrolling within each page.

Jira and Confluence access uses the app's declared Forge scopes. Bitbucket is optional and uses a Bitbucket OAuth consumer with repository read
permission, configured through **encrypted Forge variables**:

- `BITBUCKET_WORKSPACE`
- `BITBUCKET_OAUTH_CLIENT_ID`
- `BITBUCKET_OAUTH_CLIENT_SECRET`

Create an OAuth consumer in the Bitbucket workspace settings, grant repository
read access, and store its key and secret as encrypted Forge variables. The
backend exchanges them using OAuth 2 client credentials and sends the returned
short-lived access token to the repository API. Do not commit credentials or
put them in frontend code. After configuring the variables, deploy again and
use **Sync sources now** from the Sources menu.

Jira sync is restricted to projects the app can browse because Jira rejects
unbounded JQL searches. To sync one specific Jira project, set the Forge
variable `JIRA_PROJECT_KEY` to its project key (for example, `KAN`). When it is
not set, the app searches projects where the signed-in user has browse
permission. Confluence uses the v2 pages API to read page summaries
and requests the granular `read:page:confluence` scope required by that API.

Live verification requires deploying and installing the Forge app in a Jira
site, granting its requested scopes, then running **Sync sources now**.
Bitbucket additionally requires the encrypted workspace slug and OAuth
consumer credentials listed above.

## Forge modules

- Jira global page with a Forge Custom UI resource built into
  `static/dashboard/`.
- Forge resolver functions for reading sync data, triggering sync, and
  creating Jira issues/comments as the signed-in user.
- Hourly Forge scheduled trigger for Jira, Confluence, and optional Bitbucket
  reads.
- Custom Entity Store entities for the source snapshot and integration status.

Deployment and installation require an authenticated Forge CLI session and a
Jira development site. Neither is performed by the local build.
