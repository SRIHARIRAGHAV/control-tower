# Implementation change summary

## Updated files

- `package.json`: changed the test command to use Node 22's built-in TypeScript type stripping so `.mjs` tests can import the tested `.ts` modules.
- `src/local/demo-data.ts`: previously contained local synthetic source fixtures; this adapter has been removed so synthetic records cannot appear in the dashboard.
- `src/frontend/services/forge-api.ts`: dashboard reads, syncs, and Jira writes now use Forge bridge resolvers only.
- `src/ForgeIntegrationStatus.tsx`: source status now reflects Forge integration results without a synthetic-data mode.
- `src/dashboard-shell.html`: adds a forecast summary panel outside the dashboard's re-rendered content region.
- `src/dashboard.css`: styles the responsive forecast summary panel.
- `src/dashboard.ts`: renders delivery outlook, potential risk and anomaly sections from the backend forecast response using `textContent` rather than injecting provider strings as HTML.
- `src/shared/types.ts`: extends issue/page/repository summary types for reopening, modification, PR and pipeline history fields.
- `src/sync/snapshot.ts`: passes available normalized source history into the forecast engine and accepts a sync execution-context option.
- `src/sync/worker.ts`: supports selecting the Jira execution context during synchronization.
- `src/connectors/jira.ts`: supports user-context interactive sync and app-context scheduled sync.
- `src/connectors/confluence.ts` and `src/sync/normalise.ts`: map Confluence page modification timestamps when the provider response supplies one.
- `src/backend/persistence/source-storage.ts`: avoids serving forecasts older than the source freshness threshold.
- `src/resolvers/authorization.ts`, `src/resolvers/dashboard.ts`, `src/resolvers/sync.ts`, and `src/resolvers/claims.ts`: derive user identity from Forge context and enforce Jira permissions on provider operations.
- `.env.example`: documents AI settings and the scheduled Jira project key; provider credentials belong in encrypted Forge variables.
- `README.md`: documents Forge tunnel/deployment, live integration configuration, role configuration and limitations.
- `src/dashboard.ts` and `src/dashboard.css`: timeline buckets, aging Jira issues, and due commitments display all available source records in internally scrollable lists.
- `tests/authorization.test.mjs`: adds role authorization tests.
- `tests/forecast.test.mjs`: adds deterministic forecast and insufficient-data tests.

## Intentionally not claimed as complete
- Standalone Vite mode does not emulate Forge or provide source data; real provider sync must be validated in the installed/tunneled Forge app.
- Live Forge scopes, account-ID allowlists, scheduled triggers and provider authentication need validation in the target Atlassian environment.
- Jira changelog/reopening history and live Bitbucket pull-request/pipeline history are not yet retrieved by the production connectors; those forecast signals remain insufficient-data in real usage until those feeds are implemented.
- No forecast calibration or predictive accuracy claim has been established.
