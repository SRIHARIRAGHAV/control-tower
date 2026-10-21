# Implementation change summary

## Updated files

- `package.json`: changed the test command to use Node 22's built-in TypeScript type stripping so `.mjs` tests can import the tested `.ts` modules.
- `src/local/demo-data.ts`: added synthetic local-only Jira-like issues, Confluence-like pages and Bitbucket-like repository records; builds a deterministic forecast response. All source messages state that data is synthetic and no provider was contacted.
- `src/frontend/services/forge-api.ts`: routes local Vite development to the demo adapter by default; prevents local demo from invoking Jira write resolvers.
- `src/ForgeIntegrationStatus.tsx`: adds a visible `LOCAL DEMO · SYNTHETIC DATA` label.
- `src/dashboard-shell.html`: adds a forecast summary panel outside the dashboard's re-rendered content region.
- `src/dashboard.css`: styles the responsive forecast summary panel.
- `src/dashboard.ts`: renders delivery outlook, potential risk and anomaly sections from the backend forecast response using `textContent` rather than injecting provider strings as HTML.
- `src/shared/types.ts`: extends issue/page/repository summary types for reopening, modification, PR and pipeline history fields.
- `src/sync/snapshot.ts`: passes available normalized source history into the forecast engine and accepts a sync execution-context option.
- `src/sync/worker.ts`: supports selecting the Jira execution context during synchronization.
- `src/connectors/jira.ts`: supports user-context interactive sync and app-context scheduled sync.
- `src/connectors/confluence.ts` and `src/sync/normalise.ts`: map Confluence page modification timestamps when the provider response supplies one.
- `src/backend/persistence/source-storage.ts`: avoids serving forecasts older than the source freshness threshold.
- `src/auth/authentication.ts`: obtains identity from Forge context and maps server-configured, environment-specific developer/CEO/COO allowlists. Unknown modes and unmatched accounts fail closed.
- `src/resolvers/dashboard.ts`: requires an authorized role before returning dashboard data.
- `src/resolvers/sync.ts`: requires an authorized role for manual sync; scheduled sync uses the app-context Jira path.
- `src/resolvers/claims.ts`: requires an authorized role for Jira issue creation and comments; Jira still enforces the user's permissions.
- `.env.example`: documents local demo mode and the server-side Forge access variables.
- `README.md`: documents local demo mode, role configuration and limitations.
- `tests/authorization.test.mjs`: adds role authorization tests.
- `tests/forecast.test.mjs`: adds deterministic forecast and insufficient-data tests.

## Intentionally not claimed as complete
- Local mode uses synthetic fixtures, not live Atlassian records.
- Forge environment variables, account-ID assignments, scheduled triggers and provider permissions must be configured and verified in the target Atlassian environments.
- Jira changelog/reopening history and live Bitbucket pull-request/pipeline history are not yet retrieved by the production connectors; those forecast signals remain insufficient-data in real usage until those feeds are implemented.
- No forecast calibration or predictive accuracy claim has been established.
