| Run | Heap MB | Geo | Prog | Load links/sigs | Warm-up first-use | Soak first-use | Soak repeat | Ctx reset | Renderer recr. | Max burst | Interval p95 / max ms | Stalls ≥1 s | Throttled | Ctx lost/restored |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1.90 | 0 | 0 | 28/28 | 0 | 0 | 0 | 0 | 0 | 0 | 21.0 / 39 | 0 | 0 | 0/0 |
| 2 | 2.06 | 0 | 0 | 28/28 | 0 | 0 | 0 | 0 | 0 | 0 | 27.8 / 42 | 0 | 0 | 0/0 |
| 3 | 2.01 | 0 | 0 | 28/28 | 0 | 0 | 0 | 0 | 0 | 0 | 21.0 / 49 | 0 | 0 | 0/0 |

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
    "min": 1.904556,
    "mean": 1.9909586666666665,
    "median": 2.007348,
    "p95": 2.060972,
    "p99": 2.060972,
    "max": 2.060972
  },
  "intervalP95": {
    "count": 3,
    "min": 21,
    "mean": 23.266666666662786,
    "median": 21,
    "p95": 27.79999999998836,
    "p99": 27.79999999998836,
    "max": 27.79999999998836
  },
  "intervalMax": {
    "count": 3,
    "min": 38.93399999999383,
    "mean": 43.07799999999406,
    "median": 41.69999999998254,
    "p95": 48.60000000000582,
    "p99": 48.60000000000582,
    "max": 48.60000000000582
  },
  "loadLinks": {
    "count": 3,
    "min": 28,
    "mean": 28,
    "median": 28,
    "p95": 28,
    "p99": 28,
    "max": 28
  },
  "loadSignatures": {
    "count": 3,
    "min": 28,
    "mean": 28,
    "median": 28,
    "p95": 28,
    "p99": 28,
    "max": 28
  },
  "signatureUnion": 28,
  "signatureInEveryRun": 28,
  "signaturesNotInEveryRun": []
}
```
