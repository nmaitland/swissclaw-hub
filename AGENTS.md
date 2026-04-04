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
- Web URL: set via `HUB_URL` env var
- Postgres name: set via hosting provider dashboard

## Bug Fix Workflow

When fixing a bug, follow this sequence:

1. **Create a branch** — `git checkout -b fix/<short-description>`
2. **Write a failing test first** — add an integration test that reproduces the bug and confirm it fails before touching the code
4. **Implement the fix** — change only what is needed to make the test pass
5. **Run all tests** — verify no regressions
3. **Run integration tests with the Docker test DB** — start the container (`docker start hub-test-db` or `docker compose -f docker-compose.test.yml up -d`), then run `npx jest <test-file>`
6. **Commit, push and open a PR** — `git push -u origin <branch>`, then `gh pr create ...`
7. **Monitor CI** — watch the GitHub Actions run on the PR; if it fails, investigate and push a fix commit on the same branch before merging

## Common Commands

```powershell
render whoami -o text
render workspace current -o text
render services -o json
render logs -r $RENDER_SERVICE_ID --limit 100 -o text
```
