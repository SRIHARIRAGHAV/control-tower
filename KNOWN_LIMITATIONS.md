# Known limitations

- Local development mode intentionally uses synthetic data and is read-only. It does not connect directly to Jira, Confluence or Bitbucket.
- Live integrations require Forge runtime, configured scopes and valid provider permissions.
- The current production connector does not yet retrieve Jira reopening changelog history or Bitbucket pull-request and pipeline histories; corresponding anomaly/risk sections may report insufficient data.
- Users must be signed in to Jira and able to open the installed Forge app. Jira and Confluence access, including write permissions, remains subject to each user's provider permissions.
- Build verification is incomplete because dependencies could not be fully installed in the current environment.
- Forecast probabilities are deterministic statistical estimates, not calibrated promises. Validate against historical outcomes before operational use.
