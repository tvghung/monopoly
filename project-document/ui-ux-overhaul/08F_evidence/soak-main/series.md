| Run | Heap MB | Geo | Prog | Load links/sigs | Warm-up first-use | Soak first-use | Soak repeat | Ctx reset | Renderer recr. | Max burst | Interval p95 / max ms | Stalls ≥1 s | Throttled | Ctx lost/restored |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1.88 | 0 | 0 | 49/42 | 0 | 0 | 0 | 0 | 0 | 0 | 34.7 / 56 | 0 | 0 | 0/0 |
| 2 | 1.90 | 0 | 0 | 49/42 | 0 | 0 | 0 | 0 | 0 | 0 | 21.0 / 49 | 0 | 0 | 0/0 |
| 3 | 1.99 | 0 | 0 | 49/42 | 0 | 0 | 0 | 0 | 0 | 0 | 21.0 / 46 | 0 | 0 | 0/0 |

```json
{
  "runs": 3,
  "reproducedBurst": 0,
  "anyFirstUse": 0,
  "withContextLoss": 0,
  "withRendererChange": 0,
  "withStallOver1000": 0,
  "withThrottledIntervals": 0,
  "heapGrowthMB": {
    "count": 3,
    "min": 1.875144,
    "mean": 1.9210266666666669,
    "median": 1.897788,
    "p95": 1.990148,
    "p99": 1.990148,
    "max": 1.990148
  },
  "intervalP95": {
    "count": 3,
    "min": 21,
    "mean": 25.566666666665697,
    "median": 21,
    "p95": 34.69999999999709,
    "p99": 34.69999999999709,
    "max": 34.69999999999709
  },
  "intervalMax": {
    "count": 3,
    "min": 45.83399999998801,
    "mean": 50.01133333333322,
    "median": 48.60000000000582,
    "p95": 55.60000000000582,
    "p99": 55.60000000000582,
    "max": 55.60000000000582
  },
  "loadLinks": {
    "count": 3,
    "min": 49,
    "mean": 49,
    "median": 49,
    "p95": 49,
    "p99": 49,
    "max": 49
  },
  "loadSignatures": {
    "count": 3,
    "min": 42,
    "mean": 42,
    "median": 42,
    "p95": 42,
    "p99": 42,
    "max": 42
  },
  "signatureUnion": 42,
  "signatureInEveryRun": 42,
  "signaturesNotInEveryRun": []
}
```
