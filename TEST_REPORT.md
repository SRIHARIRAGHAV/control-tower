# Test report

## Environment
- Node.js: v22.16.0
- npm: v10.9.2

## Results
- `npm test`: PASS — 9 tests across role authorization, data freshness, delivery metrics and forecast behavior.
- `npm run build`: BLOCKED — TypeScript could not find dependency type definitions because `node_modules` was incomplete in this execution environment. A fresh `npm ci` attempt did not complete within the available tool session. This is not a successful build and is not proof of a source-code compile failure.

## Required local verification
1. Run `npm ci` on a machine with registry access.
2. Run `npm test`.
3. Run `npm run build` and fix any compiler errors that appear with complete dependencies.
4. Run `npm run dev`, verify the local synthetic-data label, sync button, dashboard metrics and forecast summary.
5. Test live connectors, Forge role variables and scheduled sync only in a configured Forge development environment.
