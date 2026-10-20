# Control Tower dashboard (interactive)

Run locally:

    pnpm install && pnpm dev

Open http://localhost:5173. Build for a TV/kiosk: `pnpm build && pnpm preview`.

The dashboard now uses React, TypeScript, and Vite. The existing dashboard shell,
styles, sample data, and interactions are preserved in `src/dashboard-shell.html`,
`src/dashboard.css`, and `src/dashboard.ts`; `src/App.tsx` mounts them.
The Forge, Radix, Tailwind, TanStack, Zustand, Zod, and form/chart packages are
included as the target UI stack for subsequent component and resolver integration.

## Keyboard / remote
Arrows move focus, Enter opens, Esc/Backspace closes, 1/2/3 = 12h/7d/30d, R refresh,
A auto-refresh, F filter, N notifications, C calendar, / search, M sidebar, ? help.
