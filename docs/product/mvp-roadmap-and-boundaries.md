# MVP Roadmap And Product Boundaries

> Status: active planning reference  
> Updated: 2026-06-20

## 1. Current Boundary

The implemented MVP focuses on a closed loop:

```text
Upload evidence
  ↓
Generate diagnosis
  ↓
Identify bottlenecks
  ↓
Generate verification paper
  ↓
Upload completed verification
  ↓
Compare evidence
  ↓
Update learning state
```

The first product boundary was "math photo diagnosis." The current implementation has expanded to multi-subject scaffolding, but math remains the deepest diagnostic loop.

## 2. Current Priorities

### P0: Traceable Verification

- Generate verification task packs for many fine-grained bottlenecks.
- Preserve page codes and target metadata.
- Analyze uploads by page and target.
- Avoid marking improvement without explicit evidence.

### P1: Math Knowledge Map

- Map errors to fine-grained bottlenecks.
- Map bottlenecks to knowledge nodes.
- Connect nodes to resource packs and mastery status.
- Keep the parent-facing interface actionable.

### P2: English Written Diagnosis

- Prioritize paper-visible diagnosis: spelling, vocabulary, grammar, reading, and written expression.
- Keep oral/listening diagnosis exploratory until product positioning is clear.

### P3: Chinese Review Workflows

- Focus on concrete review items rather than broad labels.
- Preserve item-level evidence and follow-up status.

## 3. Out Of Scope For This Repository

- Broad AI Learning OS white papers.
- Investment and fundraising narratives.
- Public article drafts.
- Raw student materials.
- External paid-course notes.
- Non-implementation research archives.

## 4. Milestone Map

| Phase | Goal | Implementation Evidence |
| --- | --- | --- |
| P0 | Photo diagnosis MVP | Upload, analysis, report, PDF |
| P1 | Verification loop | Verification paper, upload, comparison report |
| P2 | Multi-child and shared access | Student members and invite flow |
| P3 | Fine-grained bottleneck hierarchy | Math taxonomy, grouped bottleneck views |
| P4 | Verification task pack | Page-aware target scheduling and evidence |
| P5 | Learning resource pack | Child-facing learning materials and practice |
| P6 | Knowledge map externalization | Node state, resources, and parent-visible map |

## 5. Success Criteria

The MVP is successful when a non-technical parent can:

- Create a child profile.
- Upload paper photos.
- Understand the report's main conclusion.
- See which evidence supports the conclusion.
- Generate and print a verification paper.
- Upload the completed paper.
- Understand whether the bottleneck improved.

## 6. Quality Gates

- `npm run verify` must pass before pushing implementation changes.
- Data schema changes must update `docs/DATA_DICTIONARY.md`.
- New cloud function behavior must update `docs/CLOUD_FUNCTIONS.md`.
- New test coverage should be reflected in `docs/TEST_MATRIX.md`.
- Subject behavior changes should update `docs/subject-design/`.

