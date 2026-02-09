# BetterStack Monitoring Integration

Source: BetterStack Logs Query API documentation at https://betterstack.com/docs/logs/query-api/connect-remotely/

## Overview

BetterStack is configured to receive monitoring information and logs from the Swissclaw Hub on Render.

## API Credentials

**Credential Name:** `betterstack api key`  
**Storage:** 1Password assistant vault  
**Type:** ClickHouse HTTP client credentials (Username:Password)

## API Details

### Endpoint
```
https://telemetry.betterstack.com/api/v2/query/
```

### Authentication
- **Method:** HTTP Basic Auth (Username:Password)
- **Source:** AI SRE → MCP and API → Create "Connect ClickHouse HTTP client"
- **Security:** Password shown once in flash message, store securely

### Data Sources

| Source Type | Table Name | Description |
|-------------|------------|-------------|
| Logs | `remote(t{ID}_swissclaw-hub_logs)` | Application logs (hot storage) |
| Historical Logs | `s3Cluster(primary, t{ID}_swissclaw-hub_s3)` | Archived logs (cold storage) |
| Spans | `remote(t{ID}_swissclaw-hub_spans)` | Tracing data |
| Metrics | `remote(t{ID}_swissclaw-hub_metrics)` | Aggregated metrics |

*Replace `{ID}` with actual source ID from MCP and API dashboard*

## Usage Examples

### Query Recent Logs (Last Hour)
```bash
export BETTERSTACK_USER="username_from_1password"
export BETTERSTACK_PASS="password_from_1password"
export SOURCE_ID="t123456"  # Get from BetterStack dashboard

curl -L --request GET \
  --header "Authorization: Bearer $BETTERSTACK_USER:$BETTERSTACK_PASS" \
  --data-urlencode "source_ids=$SOURCE_ID" \
  --data-urlencode "query=SELECT * FROM remote(${SOURCE_ID}_swissclaw-hub_logs) WHERE dt > now() - INTERVAL 1 HOUR ORDER BY dt DESC LIMIT 100" \
  https://telemetry.betterstack.com/api/v2/query/live-tail
```

### Search for Specific Errors
```bash
curl -L --request GET \
  --header "Authorization: Bearer $BETTERSTACK_USER:$BETTERSTACK_PASS" \
  --data-urlencode "source_ids=$SOURCE_ID" \
  --data-urlencode "query=SELECT * FROM remote(${SOURCE_ID}_swissclaw-hub_logs) WHERE message ILIKE '%error%' AND dt > now() - INTERVAL 1 HOUR ORDER BY dt DESC" \
  https://telemetry.betterstack.com/api/v2/query/live-tail
```

### Access Nested JSON Fields
```bash
curl -L --request GET \
  --header "Authorization: Bearer $BETTERSTACK_USER:$BETTERSTACK_PASS" \
  --data-urlencode "source_ids=$SOURCE_ID" \
  --data-urlencode "query=SELECT * FROM remote(${SOURCE_ID}_swissclaw-hub_logs) WHERE _level = 'error' AND dt > now() - INTERVAL 1 HOUR ORDER BY dt DESC FORMAT JSONEachRow" \
  https://telemetry.betterstack.com/api/v2/query/live-tail
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

## Resources

- **BetterStack Dashboard:** https://telemetry.betterstack.com/
- **Live Tail:** https://telemetry.betterstack.com/team/0/tail
- **Sources:** https://telemetry.betterstack.com/team/0/sources
- **MCP & API:** https://telemetry.betterstack.com/team/0/dashboards/connections?tab=sql-api

## Testing

To test the integration:
```bash
# 1. Get credentials from 1Password
# 2. Set environment variables
export BETTERSTACK_USER="username"
export BETTERSTACK_PASS="password"
export SOURCE_ID="your_source_id"

# 3. Run test query
curl -L --request GET \
  --header "Authorization: Bearer $BETTERSTACK_USER:$BETTERSTACK_PASS" \
  --data-urlencode "source_ids=$SOURCE_ID" \
  --data-urlencode "query=SELECT 1 as test" \
  https://telemetry.betterstack.com/api/v2/query/live-tail
```

## Notes

- Password is shown only once during creation - cannot be retrieved again
- Historical data may be moved to cold storage (S3) for cost efficiency
- Use `UNION ALL` to combine hot and cold storage data for complete results
- Query API is read-only; use other APIs for writing
