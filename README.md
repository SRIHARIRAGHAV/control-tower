# Xone

Xone is a Jira Cloud global-page app built with Atlassian Forge Custom UI,
React, TypeScript, Forge Functions, and Forge Custom Entity Store. The
dashboard currently keeps its original sample risk metrics; Forge integration
status and the latest synced Jira, Confluence, and Bitbucket records are shown
in the **Sources** menu.

## Architecture

```text
src/
├── frontend/       React app, UI features, dashboard assets, Forge bridge
├── backend/        Forge handlers, sync services, Jira/Confluence/Bitbucket APIs
├── db/             Forge Custom Entity Store adapter
└── domain/         Shared, runtime-neutral data contracts

src/frontend/index.html ──> frontend/main.tsx
manifest.yml ─────────────> src/index.ts ──> backend handlers
frontend ──────────────────────────────────> domain contracts
backend ───────────────────────────────────> db + domain contracts
```

- `src/domain/` contains shared data contracts. It has no Forge or UI runtime
  dependencies.
- `src/backend/handlers/` validates and routes Forge resolver requests.
- `src/backend/services/` coordinates sync work and `integrations/` owns each
  provider API boundary.
- `src/db/` is the persistence boundary and uses Forge Custom Entity Store
  (`@forge/kvs`); it is not a separate database server.
- `src/frontend/features/` contains UI features, `services/` contains typed
  Forge bridge calls, and `dashboard/` keeps the existing dashboard assets
  together.
- `src/frontend/dashboard/` isolates the original imperative dashboard shell
  and its assets behind `LegacyDashboardView`. New UI should be built as React
  features rather than adding more DOM manipulation to that legacy dashboard.
- `src/index.ts` is the Forge function entrypoint; `src/frontend/main.tsx` is
  the browser entrypoint. Vite builds from `src/frontend/` into Forge's
  `static/` resource directory, and the two runtimes stay separate.

Keep credentials, Forge API calls, and storage access in the backend. Keep
provider response mapping in its integration module and share only normalized
domain contracts with the frontend.

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

Jira and Confluence access uses the app's declared Forge scopes. Bitbucket is
optional and requires a workspace slug, account email, and repository-read API
token configured as **encrypted Forge variables** in each target environment:

- `BITBUCKET_WORKSPACE`
- `BITBUCKET_ACCOUNT_EMAIL`
- `BITBUCKET_API_TOKEN`

Do not commit credentials or put them in frontend code. After configuring
variables, deploy again and use **Sync sources now** from the Sources menu.

## Forge modules

- Jira global page with a Forge Custom UI resource built into `static/`.
- Forge resolver functions for reading sync data, triggering sync, and
  creating Jira issues/comments as the signed-in user.
- Hourly Forge scheduled trigger for Jira, Confluence, and optional Bitbucket
  reads.
- Custom Entity Store entities for the source snapshot and integration status.

Deployment and installation require an authenticated Forge CLI session and a
Jira development site. Neither is performed by the local build.
