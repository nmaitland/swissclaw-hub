# BetterStack API Test Results

**Date:** 2026-02-09 17:00 GMT
**Status:** CONFIRMED WORKING

## Test Results

Source: https://betterstack.com/docs/logs/query-api/connect-remotely/

### Connection Test
```bash
curl -L "$BETTERSTACK_ENDPOINT" \
  -u "$BETTERSTACK_USER:$BETTERSTACK_PASS" \
  --data-urlencode "query=SELECT 1 AS test FORMAT JSON"
```
**Result:** Connection successful

### Response
```json
{
  "meta": [{"name": "test", "type": "UInt8"}],
  "data": [{"test": 1}],
  "rows": 1,
  "statistics": {
    "elapsed": 0.001109408,
    "rows_read": 1,
    "bytes_read": 1
  }
}
```

## Current State

- ClickHouse HTTP API connection works
- Sources are configured in BetterStack
- Render sends logs to BetterStack

## Query Examples

### Query Recent Logs
```bash
curl -s -u "$BETTERSTACK_USER:$BETTERSTACK_PASS" \
  -H 'Content-type: plain/text' \
  -X POST "$BETTERSTACK_ENDPOINT" \
  -d "SELECT * FROM remote(${SOURCE_ID}_swissclaw_logs) ORDER BY dt DESC LIMIT 10 FORMAT Pretty"
```

## Notes

- Connection uses ClickHouse HTTP API on port 443 (HTTPS)
- Queries use SQL syntax optimized for ClickHouse
- Always include `FORMAT` clause (Pretty for debugging, JSONEachRow for scripts)
- Historical data may be in cold storage (S3) - use `s3Cluster` function for full queries
