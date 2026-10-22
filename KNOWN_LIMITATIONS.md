# Known limitations

- Standalone Vite development mode has no Forge runtime and displays no source data. Use a Forge tunnel or installed app to access Jira, Confluence and Bitbucket integrations.
- Live integrations require Forge runtime, configured scopes and valid provider permissions.
- The current production connector does not yet retrieve Jira reopening changelog history or Bitbucket pull-request and pipeline histories; corresponding anomaly/risk sections may report insufficient data.
- Users must be signed in to Jira and able to open the installed Forge app. Jira and Confluence access, including write permissions, remains subject to each user's provider permissions.
- Forge snapshot, status, forecast, and audit data use Forge KVS JSON values; prior custom-entity records are not migrated and a fresh sync is required after upgrading.
- Forecast probabilities are deterministic statistical estimates, not calibrated promises. Validate against historical outcomes before operational use.
