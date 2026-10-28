# Incident review: slow checkouts

14 October 2026 | Severity 2 | Resolved | Platform team

## Summary

For 47 minutes, card checkouts took up to 9 seconds to confirm. A connection pool limit set in a routine config change was too low for evening traffic, so requests queued behind each other. No payments were lost or charged twice.

## Impact

| Metric | Normal | During incident |
| --- | ---: | ---: |
| p95 checkout latency | 420 ms | 8,900 ms |
| Checkouts per minute | 3,180 | 2,240 |
| Abandoned checkouts | 1.9% | 6.4% |

## Timeline (UTC)

- **18:02** Config change deployed to the payments API.
- **18:11** Latency alert fires. On-call engineer starts investigating.
- **18:26** Database pool saturation found on the API dashboards.
- **18:41** Change rolled back on half the fleet; latency starts to fall.
- **18:49** Rollback complete. Latency back to normal.

## Root cause

The change lowered the per-instance pool size while we were testing a new database proxy. The proxy was not yet in the request path, so each instance had fewer connections than it needed.

```yaml
database:
  pool_size: 12   # was 40; meant for the proxy rollout
  pool_timeout_ms: 5000
```

## What we are changing

1. Pool settings get a minimum in config validation, so a value below 32 fails the deploy.
2. Config changes to the payments API go out to one region first.
3. We will alert on pool wait time, not only on end-to-end latency.
