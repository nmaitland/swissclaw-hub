# BetterStack API Test Results

**Date:** 2026-02-09 17:00 GMT  
**Status:** ✅ **CONFIRMED WORKING**

## Test Results

Source: https://betterstack.com/docs/logs/query-api/connect-remotely/

### Connection Test
```bash
curl -L "https://eu-fsn-3-connect.betterstackdata.com" \
  -u "$BETTERSTACK_USER:$BETTERSTACK_PASS" \
  --data-urlencode "query=SELECT 1 AS test FORMAT JSON"
```
**Result:** Connection successful ✅

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

## Discovered Sources

Running Neil's sample query revealed these configured sources:

| Named Collection | Query Type |
|------------------|------------|
| `t503255_swissclaw_logs` | Logs (hot storage) |
| `t503255_swissclaw_logs_2_logs` | Logs (hot storage) |
| `t503255_swissclaw_logs_2_metrics` | Metrics |
| `t503255_swissclaw_metrics` | Metrics |

## Current State

- ✅ ClickHouse HTTP API connection works
- ✅ Sources are configured in BetterStack
- ⏳ No log data yet (Render needs to send logs)

## Next Steps

1. **Configure Render to send logs to BetterStack**
   - Navigate to Render Dashboard → Swissclaw Hub service
   - Add BetterStack Logs integration (Stream/Drain logs)
   - Use ingesting host: `in.logs.betterstack.com`
   - Use source token from BetterStack

2. **Verify logs flowing**
   - Check Live Tail in BetterStack dashboard
   - Query via API once logs arrive

## Query Examples

### Query Recent Logs (once data arrives)
```bash
curl -s -u "$BETTERSTACK_USER:$BETTERSTACK_PASS" \
  -H 'Content-type: plain/text' \
  -X POST 'https://eu-fsn-3-connect.betterstackdata.com' \
  -d "SELECT * FROM remote(t503255_swissclaw_logs) ORDER BY dt DESC LIMIT 10 FORMAT Pretty"
```

### Search for Errors
```bash
curl -s -u "$BETTERSTACK_USER:$BETTERSTACK_PASS" \
  -H 'Content-type: plain/text' \
  -X POST 'https://eu-fsn-3-connect.betterstackdata.com' \
  -d "SELECT * FROM remote(t503255_swissclaw_logs) WHERE raw ILIKE '%error%' AND dt > now() - INTERVAL 1 HOUR ORDER BY dt DESC LIMIT 10 FORMAT JSONEachRow"
```

### Query Metrics
```bash
curl -s -u "$BETTERSTACK_USER:$BETTERSTACK_PASS" \
  -H 'Content-type: plain/text' \
  -X POST 'https://eu-fsn-3-connect.betterstackdata.com' \
  -d "SELECT toStartOfHour(dt) AS time, countMerge(events_count) FROM remote(t503255_swissclaw_metrics) GROUP BY time ORDER BY time DESC LIMIT 10 FORMAT Pretty"
```

## Credentials

**Stored in 1Password:** `betterstack clickhouse api` (assistant vault)
- **Hostname:** `eu-fsn-3-connect.betterstackdata.com:443`

**Quick access:**
```bash
export BETTERSTACK_USER="$(op item get 'betterstack clickhouse api' --field username --reveal --vault assistant)"
export BETTERSTACK_PASS="$(op item get 'betterstack clickhouse api' --field credential --reveal --vault assistant)"
```

## Resources

- **BetterStack Dashboard:** https://telemetry.betterstack.com/
- **Live Tail:** https://telemetry.betterstack.com/team/0/tail
- **Sources:** https://telemetry.betterstack.com/team/0/sources

## Notes

- Connection uses ClickHouse HTTP API on port 443 (HTTPS)
- Queries use SQL syntax optimized for ClickHouse
- Always include `FORMAT` clause (Pretty for debugging, JSONEachRow for scripts)
- Historical data may be in cold storage (S3) - use `s3Cluster` function for full queries
