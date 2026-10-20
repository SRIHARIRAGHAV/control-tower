# Control Tower dashboard (interactive)

## Local development

    npm install
    npm run dev

Open http://localhost:5173. Run `npm run build` to type-check and build the
Forge static resource into `forge-dist/`.

## Deploy to Jira

Install and authenticate the Atlassian Forge CLI, then run:

    npm run forge:lint
    npm run forge:deploy

The deployment builds the React dashboard first and packages it with the Forge
resolvers and Jira/Confluence/Bitbucket sync handlers. `npm run forge:install`
is for installing the app on a Jira site after the first deployment.

## Keyboard / remote
Arrows move focus, Enter opens, Esc/Backspace closes, 1/2/3 = 12h/7d/30d, R refresh,
A auto-refresh, F filter, N notifications, C calendar, / search, M sidebar, ? help.
