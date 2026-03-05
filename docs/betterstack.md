# BetterStack Monitoring Integration

Source: BetterStack Logs Query API documentation at https://betterstack.com/docs/logs/query-api/connect-remotely/

## Overview

BetterStack is configured to receive monitoring information and logs from the Swissclaw Hub on Render.

## API Credentials

**Storage:** Password manager
**Type:** ClickHouse HTTP client credentials (Username:Password)

## API Details

### Endpoint

Set via environment variable `BETTERSTACK_ENDPOINT`.

### Authentication
- **Method:** HTTP Basic Auth (Username:Password) via `-u` flag
- **Source:** BetterStack AI SRE dashboard → MCP and API → Create "Connect ClickHouse HTTP client"
- **Security:** Password shown once in flash message, store securely

### Data Sources

| Source Type | Table Name | Description |
|-------------|------------|-------------|
| Logs | `remote(t{ID}_swissclaw-hub_logs)` | Application logs (hot storage) |
| Historical Logs | `s3Cluster(primary, t{ID}_swissclaw-hub_s3)` | Archived logs (cold storage) |
| Spans | `remote(t{ID}_swissclaw-hub_spans)` | Tracing data |
| Metrics | `remote(t{ID}_swissclaw-hub_metrics)` | Aggregated metrics |

*Replace `{ID}` with actual source ID from BetterStack dashboard*

## Usage Examples

### Query Recent Logs (Last Hour)
```bash
export BETTERSTACK_USER="<from password manager>"
export BETTERSTACK_PASS="<from password manager>"
export BETTERSTACK_ENDPOINT="<from BetterStack dashboard>"
export SOURCE_ID="<from BetterStack dashboard>"

curl -s -u "$BETTERSTACK_USER:$BETTERSTACK_PASS" \
  -H 'Content-type: plain/text' \
  -X POST "$BETTERSTACK_ENDPOINT" \
  -d "SELECT * FROM remote(${SOURCE_ID}_swissclaw_logs) WHERE dt > now() - INTERVAL 1 HOUR ORDER BY dt DESC LIMIT 100 FORMAT Pretty"
```

### Search for Specific Errors
```bash
curl -s -u "$BETTERSTACK_USER:$BETTERSTACK_PASS" \
  -H 'Content-type: plain/text' \
  -X POST "$BETTERSTACK_ENDPOINT" \
  -d "SELECT * FROM remote(${SOURCE_ID}_swissclaw_logs) WHERE raw ILIKE '%error%' AND dt > now() - INTERVAL 1 HOUR ORDER BY dt DESC LIMIT 10 FORMAT JSONEachRow"
```

## Output Formats

- `FORMAT JSON` - Single JSON structure
- `FORMAT JSONEachRow` - One JSON object per line (recommended for programmatic access)
- `FORMAT Pretty` - Human-readable table
- `FORMAT CSV` - Comma-separated values
- `FORMAT TSV` - Tab-separated values

## Query Limits

- **Standard:** Up to 4 concurrent log queries
- **Concurrent metrics queries:** Up to 20
- **Rate limiting:** Wait 1-2 seconds between requests to avoid limits

## Best Practices

1. **Always use LIMIT** to prevent fetching too much data
2. **Use ORDER BY dt DESC** for consistent pagination
3. **Filter early** with WHERE conditions
4. **Use appropriate time ranges** - shorter = faster
5. **Store credentials securely** - never hardcode in scripts
6. **Handle errors gracefully** - implement retry logic

## Common Errors

| Error | Solution |
|-------|----------|
| `MEMORY_LIMIT_EXCEEDED` | Use shorter time ranges, add filters, use LIMIT |
| Too many simultaneous queries | Add delays between requests, reduce query scope |

## Notes

- Password is shown only once during creation - cannot be retrieved again
- Historical data may be moved to cold storage (S3) for cost efficiency
- Use `UNION ALL` to combine hot and cold storage data for complete results
- Query API is read-only; use other APIs for writing
- Connection verified working (2026-02-09) — ClickHouse HTTP API on port 443 (HTTPS)
