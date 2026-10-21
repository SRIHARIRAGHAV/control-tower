# Known limitations

- Local development mode intentionally uses synthetic data and is read-only. It does not connect directly to Jira, Confluence or Bitbucket.
- Live integrations require Forge runtime, configured scopes and valid provider permissions.
- The current production connector does not yet retrieve Jira reopening changelog history or Bitbucket pull-request and pipeline histories; corresponding anomaly/risk sections may report insufficient data.
- Executive/operator roles are based on comma-separated Atlassian account IDs in Forge environment variables. The allowlists must be configured and tested in the deployed environment.
- Build verification is incomplete because dependencies could not be fully installed in the current environment.
- Forecast probabilities are deterministic statistical estimates, not calibrated promises. Validate against historical outcomes before operational use.
