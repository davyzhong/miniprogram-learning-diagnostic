# Timeline Payload Performance Baseline

Date: 2026-07-13

## Scope

This baseline measures the first page of `studentData:getLearningTimeline` with a deterministic representative fixture:

| Record type | Count | Representative heavy fields |
| --- | ---: | --- |
| Reports | 20 | 5 OCR images, page analysis, 12 error details, raw model response |
| Papers | 10 | 20 questions with answers and explanations |
| English sessions | 8 | 20 word items and 30 recognition attempts |
| Learning resource packs | 8 | 8 generated learning sections |

The legacy run disables database field projections while keeping the same timeline code. The projected run uses the production `.field()` declarations. This isolates database-to-function transfer from the final cloud response.

## Result

| Metric | Legacy | Projected | Change |
| --- | ---: | ---: | ---: |
| Database read payload | 617,901 B | 154,701 B | -74.96% |
| Cloud response payload | 30,704 B | 30,704 B | unchanged |
| Visible first-page ordering | baseline | identical | no regression |

Budgets:

- Database read payload: less than 256 KiB.
- Cloud response payload: less than 128 KiB.
- Database read reduction: at least 60%.

Run the reproducible CLI baseline with:

```bash
npm run perf:timeline
```

The JSON artifact is written to `tmp/performance/timeline-payload-baseline.json`. This is a deterministic local database-transfer baseline; real CloudBase latency must still be checked during staging smoke tests.

## DevTools Page-Ready Baseline

The same verification run collected five cold and five warm home-page samples:

| Mode | P50 | P95 | Maximum | Errors |
| --- | ---: | ---: | ---: | ---: |
| Cold | 3,723 ms | 3,731 ms | 3,731 ms | 0 |
| Warm | 3,716 ms | 3,740 ms | 3,740 ms | 0 |

Both modes pass the current 6,000 ms P95 gate. Core DevTools E2E also passed 23/23 checks (17 pages and 6 cross-page scenarios).
