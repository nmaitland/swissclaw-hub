# Project Agent Notes

## Render Context

- CLI command: `render`
- Auth user: configured via `render login`
- Active workspace: configured via `render workspace`

## swissclaw-hub Resources

- Web service name: `swissclaw-hub`
- Web URL: set via `SWISSCLAW_HUB_URL` env var
- Postgres name: `swissclaw-hub-db`

## Common Commands

```powershell
render whoami -o text
render workspace current -o text
render services -o json
render logs -r $RENDER_SERVICE_ID --limit 100 -o text
```
