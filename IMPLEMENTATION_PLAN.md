# Control Tower local working-demo plan

## Scope
- Keep the existing dashboard and Forge architecture.
- Provide clearly labelled synthetic data in local Vite development mode.
- Surface the deterministic backend forecast in the existing dashboard shell.
- Keep local demo read-only; real provider requests remain in the Forge runtime.
- Enforce configured executive/operator roles in Forge resolvers.

## Completion criteria
- `npm test` passes.
- `npm run build` passes after dependencies are correctly installed.
- `npm run dev` renders synthetic demo data and the forecast panel.
- No local demo label implies data is live.
- Live Forge deployment and real provider access are verified separately.
