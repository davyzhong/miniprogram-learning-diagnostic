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
| Cloud response payload | 23,188 B | 23,188 B | unchanged |
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

The final merged branch uses the event-driven DevTools report across 17 pages and 6 cross-page scenarios:

| Metric | P50 | P90 | P95 | Maximum |
| --- | ---: | ---: | ---: | ---: |
| Navigation | 3,785 ms | 3,907 ms | 3,955 ms | 3,955 ms |
| Usable-page ready | 19 ms | 22 ms | 27 ms | 27 ms |
| Total duration | 3,805 ms | 3,929 ms | 3,986 ms | 3,986 ms |

Core DevTools E2E passed 23/23 checks. The report is written to `tmp/perf/baseline-report.json` by `npm run perf:baseline`.
