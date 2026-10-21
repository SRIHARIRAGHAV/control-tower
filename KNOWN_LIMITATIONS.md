# Known limitations

- Local development mode intentionally uses synthetic data and is read-only. It does not connect directly to Jira, Confluence or Bitbucket.
- Live integrations require Forge runtime, configured scopes and valid provider permissions.
- The current production connector does not yet retrieve Jira reopening changelog history or Bitbucket pull-request and pipeline histories; corresponding anomaly/risk sections may report insufficient data.
- Forge access mode and developer/CEO/COO account-ID allowlists must be set independently in each deployed environment. Role changes take effect after redeploying that environment.
- Local demo mode uses synthetic fixtures and does not exercise Forge authentication or role authorization.
- Jira and Confluence access, including write permissions, remains subject to each authorized user's provider permissions.
- Live authorization still requires the Forge environment variables, account-ID assignments, installation permissions, and Jira data permissions to be verified in the target Atlassian sites.
- Forecast probabilities are deterministic statistical estimates, not calibrated promises. Validate against historical outcomes before operational use.
