| Run | Heap MB | Geo | Prog | Load links/sigs | Warm-up first-use | Soak first-use | Soak repeat | Ctx reset | Renderer recr. | Max burst | Interval p95 / max ms | Stalls ≥1 s | Throttled | Ctx lost/restored |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1.89 | 0 | 0 | 32/32 | 0 | 0 | 0 | 0 | 0 | 0 | 21.0 / 42 | 0 | 0 | 0/0 |
| 2 | 1.98 | 0 | 0 | 32/32 | 0 | 0 | 0 | 0 | 0 | 0 | 21.0 / 63 | 0 | 0 | 0/0 |
| 3 | 1.96 | 0 | 0 | 32/32 | 0 | 0 | 0 | 0 | 0 | 0 | 21.0 / 42 | 0 | 0 | 0/0 |
| 4 | 1.99 | 0 | 0 | 32/32 | 0 | 0 | 0 | 0 | 0 | 0 | 21.0 / 42 | 0 | 0 | 0/0 |
| 5 | 1.99 | 0 | 0 | 32/32 | 0 | 0 | 0 | 0 | 0 | 0 | 21.0 / 42 | 0 | 0 | 0/0 |

```json
{
  "runs": 5,
  "reproducedBurst": 0,
  "anyFirstUse": 0,
  "withContextLoss": 0,
  "withRendererChange": 0,
  "withStallOver1000": 0,
  "withThrottledIntervals": 0,
  "heapGrowthMB": {
    "count": 5,
    "min": 1.885172,
    "mean": 1.9641783999999998,
    "median": 1.984044,
    "p95": 1.993952,
    "p99": 1.993952,
    "max": 1.993952
  },
  "intervalP95": {
    "count": 5,
    "min": 21,
    "mean": 21,
    "median": 21,
    "p95": 21,
    "p99": 21,
    "max": 21
  },
  "intervalMax": {
    "count": 5,
    "min": 41.599999999998545,
    "mean": 45.859999999999125,
    "median": 41.70000000001164,
    "p95": 62.5,
    "p99": 62.5,
    "max": 62.5
  },
  "loadLinks": {
    "count": 5,
    "min": 32,
    "mean": 32,
    "median": 32,
    "p95": 32,
    "p99": 32,
    "max": 32
  },
  "loadSignatures": {
    "count": 5,
    "min": 32,
    "mean": 32,
    "median": 32,
    "p95": 32,
    "p99": 32,
    "max": 32
  },
  "signatureUnion": 32,
  "signatureInEveryRun": 32,
  "signaturesNotInEveryRun": []
}
```
