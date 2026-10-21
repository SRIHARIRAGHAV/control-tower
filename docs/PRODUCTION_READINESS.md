# Production Readiness Audit

## Status and scope

This is the Phase 1 code audit and baseline record for the Control Tower pilot.
It is not a production-readiness certification. Forge deployment credentials,
provider credentials, Jira field metadata, and live tenant data were not
available during this audit. Provider endpoint details not independently
verified against official documentation are explicitly marked unverified below.

## Baseline commands

Executed before the implementation work in this task:

| Command | Result |
|---|---|
| `npm.cmd run build` | Passed: TypeScript check and Vite production build. |
| `npm.cmd run forge:lint` | Passed: `No issues found.` |

The repository already has five Node test-runner tests for metric and freshness
helpers; Vitest is not installed. The requested exact npm `ci` baseline was not
needed to restore dependencies and was not run.

## Architecture traced

```text
Jira / Confluence / Bitbucket APIs
        |
        v
src/connectors/* -> src/sync/normalise.ts
        |
        v
src/sync/worker.ts -> src/sync/snapshot.ts -> buildRiskForecast()
        |                                  |
        v                                  v
src/db/client.ts (KVS)              forecast stored in KVS
        |                                  |
        +----------> source-handlers <------+
                          |
                          v
                  Forge resolvers
                          |
                          v
         frontend/services/forge-api.ts
                          |
                          v
ForgeIntegrationStatus.tsx -> xone-source-data -> dashboard.ts -> existing cards
```

The snapshot builder now forwards any normalized pull-request, pipeline, and
Confluence modification-time data to the forecast. The dashboard listener reads
the forecast and reports its concise readiness state in an existing text slot;
full forecast items are not inserted into the Jira due-commitment list because
that list explicitly represents dated Jira issues, not predictions.

## Audit findings

| ID | Type | Evidence | Symptom | Required fix | Status |
|---|---|---|---|---|---|
| S1 | WIRING BUG | `src/dashboard.ts`, `xone-source-data` listener; `src/sync/snapshot.ts` | Listener reads snapshot and state but not `data.forecast`; `POTENTIAL` comes from due dates; anomaly list is cleared. | Bind forecast readiness and evidence to existing text/tooltip slots; keep predictions out of the semantically distinct due-issue list. | Partial: forecast status and source/evidence tooltip are bound; forecast records are not rendered as due issues |
| S2 | DATA INSUFFICIENCY | `src/shared/types.ts`, `src/sync/snapshot.ts`, `src/connectors/*` | Jira reopen events, Bitbucket PR/pipeline records, and Confluence modification times are not normalized or passed into forecast input. | Fetch and preserve only fields/endpoints verified against provider docs and available scopes. | Partial: data models/mappers and snapshot pass-through exist; Jira changelog and Bitbucket PR/pipeline retrieval are not implemented |
| S3 | BACKEND BUG | `src/connectors/jira.ts`; `src/resolvers/sync.ts`; `src/sync/worker.ts` | Jira reads use `asUser()`; scheduled trigger invokes the same sync without an explicit requester; fallback JQL is user-dependent. | Thread user/app requester through sync, require a project key for app context, preserve user context interactively. | Implemented in code; Forge deployment and scheduled app-context sync remain unverified |
| S4 | BACKEND BUG | `src/db/client.ts` | Whole snapshot is stored under one KVS value; snapshot/status/forecast writes run concurrently and can partially update. | Verify Forge KVS limits, then implement bounded chunk/pointer storage and safe read fallback, or document a supported alternative. | Implemented: bounded chunks, snapshot-scoped state/forecast, one manifest publication point, legacy reads, and incomplete-data errors; no dedicated KVS integration test |
| S5 | BACKEND BUG | `src/resolvers/sync.ts`; `src/ForgeIntegrationStatus.tsx`; `manifest.yml` | `syncNow` performs full sync inline; initial load immediately triggers it when no snapshot exists. | Verify resolver limits and move work to async processing or set supported timeouts; keep UI in syncing state while polling. | Open; async mechanism verification required |
| S6 | SECURITY / RELIABILITY | `src/connectors/http.ts` | Uses global `fetch`; validates host, but no bounded retries, `Retry-After` handling, or retry tests. | Verify Forge-supported outbound fetch and provider requirements; implement bounded retry only for transient failures. | Implemented in code with Forge `api.fetch`, HTTPS/host validation, bounded retries and `Retry-After`; retry tests missing |
| S7 | LOGIC | `src/forecast/risk-forecast.ts` | Anomaly history counts only non-zero weeks toward minimum history. | Require observation coverage, allow valid zero weeks, require a separate event minimum and report exact counts. | Implemented in logic and covered by focused unit tests; complete source observation windows are not yet retrieved |
| S8 | LOGIC CONFLICT | `src/forecast/risk-forecast.ts`; `src/dashboard.ts` | Backend and frontend anomaly thresholds differ; frontend anomalies are currently not populated. | Make backend authoritative; remove frontend reclassification for forecast-fed anomalies. | Partial: backend thresholds are authoritative and readiness is shown, but no anomaly items are rendered in the frozen UI |
| S9 | DATA | `src/sync/normalise.ts`; `src/forecast/risk-forecast.ts` | Status normalization rewrites status names; forecast uses name-based done detection instead of Jira status category. | Preserve status category and use it as authoritative, retaining a documented fallback only when absent. | Implemented: Jira category is preserved and preferred, with status-name fallback |
| S10 | DATA INSUFFICIENCY | `src/connectors/jira.ts` | Custom fields selected by exact display name; duplicate names are silently resolved to the first match. | Report ambiguous/missing IDs, require explicit configuration for ambiguity, and expose IDs in backend diagnostics only. | Implemented in code; tenant-specific field resolution is unverified |
| S11 | DATA INSUFFICIENCY | `src/forecast/risk-forecast.ts` | Delivery model requires 15 resolved issues in 90 days; exact counts are not exposed by a diagnostics API. | Expose have/need counts and missing-input reasons through a diagnostics resolver. | Implemented in code; resolver behavior lacks focused tests |
| S12 | CONFIG | `src/connectors/bitbucket.ts`; `src/connectors/jira.ts`; `src/backend/handlers/source-handlers.ts` | Bitbucket configuration is checked; app-context Jira project configuration is not. | Document required encrypted variables and distinguish configuration from access failures. | Partial: app Jira requires a project key; provider connector credentials and live configuration remain unverified |
| S13 | NOT IMPLEMENTED | `src/dashboard.ts` COO risk arrays and historical views | Multiple COO categories and historical comparisons remain uncomputed; empty arrays must not imply a verified all-clear. | Keep explicit “not computed” wording in existing text slots; do not fabricate signals. | Partial: arrays are empty and status text says “Not assessed”; validate every visible surface |
| S14 | MODEL VALIDITY | `src/forecast/risk-forecast.ts` | Delivery uses resolved-only cycle samples; stuck-PR and stale-page items use fixed uncalibrated probability values. | Document survivorship bias and no validation; label heuristic basis and remove misleading probability output. | Partial: heuristic PR risks expose no probability; stale-page title heuristics were removed; calibration and holdout validation remain unavailable |
| S15 | SECURITY | `src/resolvers/*`; `src/dashboard.ts`; `src/services/jira-writer.ts` | Resolver authorization is not explicit; write endpoints have no audit log. Provider values flow through HTML templates and need context-specific escaping review. | Add authorization and payload validation to every resolver; audit write attempts; test HTML/attribute escaping. | Partial: authenticated-user gate, optional account allowlist, payload checks, and persistent write audit records exist; audit retention, resolver tests, and full escaping review remain open |
| S16 | FRESHNESS | `src/sync/worker.ts`; `src/sync/snapshot.ts`; `src/backend/persistence/source-storage.ts`; `src/ForgeIntegrationStatus.tsx` | Per-source last-success timestamps exist, but forecast freshness and cached/partial source inputs are not represented as forecast status. | Carry source freshness/cache metadata into forecast response; show it in existing text/tooltip slots. | Implemented in code and bound to the existing update tooltip; freshness behavior has focused adapter tests |
| A1 | UI FREEZE | `src/dashboard.ts`; latest committed UI history | Prior integrity changes edited template strings and control copy, although shell and CSS stayed unchanged. | Keep future frontend edits inside the source-data listener, data arrays, and pure adapter helpers; do not alter templates, layout or interactions. | Mandatory constraint |

## Provider and Forge documentation verification

Verified documentation:

- [Forge KVS limits](https://developer.atlassian.com/platform/forge/storage-reference/kvs/) documents a 240 KiB per-value limit; snapshots target 200 KiB chunks.
- [Forge runtime limits](https://developer.atlassian.com/platform/forge/limits/) distinguishes normal invocation limits from longer async-consumer limits (up to 900 seconds where configured).
- [Forge Fetch API](https://developer.atlassian.com/platform/forge/runtime-reference/fetch-api/) documents the Forge-supported outbound fetch surface used by the connector.
- [Jira issue search](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/) documents enhanced JQL search. Reopen history/changelog retrieval has not been implemented.
- [Confluence v2 pages](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-page/) exposes page-version metadata including `createdAt`; retrieval and scopes have not been validated in a tenant.
- [Bitbucket pull requests](https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/) document state and created/updated timestamps. A verified merge timestamp is not inferred from `updated_on`.
- [Bitbucket pipelines](https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pipelines/) documents pipeline endpoints; fetching, pagination, and tenant permissions remain unimplemented.

Endpoint discovery is not equivalent to successful live connector validation.

## Validation and limitations

- No live Jira, Confluence, Bitbucket, or Forge deployment was tested.
- No site-specific Jira custom field IDs or permission checks were available.
- No history-backed forecast validation or holdout dataset was available.
- Access defaults to any authenticated Jira user; writes still depend on the
  acting user's Jira permissions. `CONTROL_TOWER_ALLOWED_ACCOUNT_IDS` can
  restrict accounts. No account IDs were supplied.
- Audit retention is not configured; records currently persist in Forge KVS.
- Jira changelog/reopen history and Bitbucket PR/pipeline retrieval are not
  implemented. Anomaly status therefore remains insufficient unless coverage
  is supplied by a future verified connector.
- Full forecast items are intentionally not merged into the due-commitments
  card. That card is contractually a list/count of dated Jira issues; doing so
  would misrepresent predictions as commitments. The existing text/tooltip
  surfaces report readiness, sources, and evidence instead.
- Snapshot, status, and forecast are read through one manifest to avoid a
  mismatched publication. Per-source sync invocations are not serialized; a
  concurrent writer may leave unreachable chunk records, and no concurrency
  stress test was run.
- Initial dashboard visual comparison was not automated. No shell, styling,
  template markup, card hierarchy, controls, or layout was changed. The only
  dashboard edit is in the existing data listener: an existing footer reports
  concise forecast status and the existing update tooltip carries source/basis
  details.

Final validation run after the implementation:

| Command | Result |
|---|---|
| `npm.cmd run build` | Passed: TypeScript check and production build. |
| `npm.cmd test` | Passed: 12 Node tests. |
| `npm.cmd run forge:lint` | Passed: `No issues found.` |

## Final acceptance checklist

- [x] Forecast status and evidence metadata are bound through existing dashboard text slots.
- [ ] All connector fields/endpoints and pagination are verified in a live tenant.
- [ ] Scheduled app-context Jira synchronization is supported and tested.
- [x] Snapshot persistence uses bounded chunks and a manifest publication point.
- [x] Forecast outputs expose basis, thresholds, freshness, and insufficiency.
- [x] Only existing UI text/tooltip slots are used; no shell, styling, or template changes.
- [ ] Resolver inputs, authorization, audit retention, and write auditing have focused tests.
- [x] `npm.cmd run build`, `npm.cmd test`, and `npm.cmd run forge:lint` pass.
- [ ] Live tenant verification is performed before making deployment claims.
