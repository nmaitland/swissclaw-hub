# Project Agent Notes

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
