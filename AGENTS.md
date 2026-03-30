# Project Agent Notes

## Repo Safety

- This repository is public.
- Do not commit or add to tracked files any sensitive owner, user, customer, or business data.
- Do not commit private URLs, dashboard links, internal domains, IPs, hostnames, service IDs, project IDs, account IDs, workspace names, deployment identifiers, or other non-public infrastructure or hosting details.
- Do not commit passwords, tokens, API keys, OAuth credentials, session cookies, JWTs, private keys, SSH keys, webhook secrets, recovery codes, seed phrases, connection strings, or secret environment values.
- Do not commit personal contact data, billing or financial information, support exports, internal tickets, unpublished business context, or logs, fixtures, or screenshots containing real user or operator data.
- Keep hosting references high level only; it is acceptable to note that the project uses Render, but do not commit deployment-specific identifiers, config values, or operational metadata.

## Hosting Context

- CLI command: `render`
- Auth user: configured via `render login`
- Active workspace: configured via `render workspace`

## Resources

- Web service name: set via hosting provider dashboard
- Web URL: set via `SWISSCLAW_HUB_URL` env var
- Postgres name: set via hosting provider dashboard

## Common Commands

```powershell
render whoami -o text
render workspace current -o text
render services -o json
render logs -r $RENDER_SERVICE_ID --limit 100 -o text
```
