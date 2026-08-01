# Diagnostic Accuracy Evaluation Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the safe, local, repeatable phase-one evaluation foundation for math, Chinese, and English using only fictional fixtures.

**Architecture:** Add a standalone CommonJS evaluation module under `evaluation/diagnostic-accuracy` with explicit boundaries for dataset validation, matching, subject scoring, immutable runs, review, comparison, and reporting. Production data remains outside the repository behind a guarded `DIAG_EVAL_DATA_ROOT`; phase one uses a fixture adapter and never calls cloud functions or external models.

**Tech Stack:** Node.js 26, CommonJS, built-in `node:test`, built-in `fs/path/http/crypto`, JSON Schema documents as contracts, plain HTML/CSS/JavaScript for the local review page.

---

## Scope split

This plan implements phase 1 from the approved spec. It deliberately stops before:

- exporting or importing real student data;
- OCR-based image redaction;
- calling a real AI pre-label provider;
- replaying the production diagnostic cloud pipeline;
- collecting the formal 450-item benchmark;
- changing prompts, models, diagnosis rules, or release gates.

Those activities require the completed foundation plus separate plans. Phase 1 is independently useful: it proves all contracts and calculations end to end with fictional data and creates the interfaces later phases will implement.

## File map

| Path | Responsibility |
| --- | --- |
| `evaluation/diagnostic-accuracy/constants.js` | Versioned enums, thresholds, and formal/fixture profiles |
| `evaluation/diagnostic-accuracy/data-root.js` | Resolve and reject unsafe evaluation data roots |
| `evaluation/diagnostic-accuracy/schemas/*.schema.json` | Dataset, annotation, run, and output contracts |
| `evaluation/diagnostic-accuracy/validate.js` | Structural and cross-record validation without external dependencies |
| `evaluation/diagnostic-accuracy/importer.js` | Copy a verified fictional bundle into a versioned local dataset directory |
| `evaluation/diagnostic-accuracy/normalizers.js` | Versioned shared and subject-specific text normalization |
| `evaluation/diagnostic-accuracy/matcher.js` | Stable-ID, region-IoU, and text-similarity one-to-one matching |
| `evaluation/diagnostic-accuracy/scorers/*.js` | Common and subject metrics, error grading, confidence intervals, McNemar calculation |
| `evaluation/diagnostic-accuracy/adapters/fixture.js` | Read immutable fictional system outputs and pre-labels |
| `evaluation/diagnostic-accuracy/run-store.js` | Create immutable run directories and manifests |
| `evaluation/diagnostic-accuracy/pipeline.js` | Orchestrate validation, fixture diagnosis, matching, scoring, and reporting |
| `evaluation/diagnostic-accuracy/review-store.js` | Lock annotations and append audit events |
| `evaluation/diagnostic-accuracy/review-server.js` | Serve the local review UI and narrow JSON API |
| `evaluation/diagnostic-accuracy/review-app/*` | Browser UI for pre-label review with hidden system output before lock |
| `evaluation/diagnostic-accuracy/compare.js` | Compare a candidate run with a locked baseline |
| `evaluation/diagnostic-accuracy/report.js` | Emit deterministic JSON and Markdown reports |
| `evaluation/diagnostic-accuracy/cli.js` | `import`, `prelabel`, `review`, `run`, and `compare` command entry point |
| `evaluation/diagnostic-accuracy/fixtures/*` | Fully fictional three-subject bundle and two deterministic output runs |
| `tests/diagnostic-evaluation-*.test.js` | Focused unit and small end-to-end tests |

### Task 1: Safe data root and versioned contracts

**Files:**
- Create: `evaluation/diagnostic-accuracy/constants.js`
- Create: `evaluation/diagnostic-accuracy/data-root.js`
- Create: `evaluation/diagnostic-accuracy/schemas/dataset.schema.json`
- Create: `evaluation/diagnostic-accuracy/schemas/annotation.schema.json`
- Create: `evaluation/diagnostic-accuracy/schemas/run.schema.json`
- Create: `evaluation/diagnostic-accuracy/schemas/system-output.schema.json`
- Create: `tests/diagnostic-evaluation-data-root.test.js`
- Modify: `.gitignore`

- [ ] **Step 1: Write failing path-guard tests**

Cover these exact cases in `tests/diagnostic-evaluation-data-root.test.js`:

```js
test('requires an absolute DIAG_EVAL_DATA_ROOT', () => {
  assert.throws(() => resolveDataRoot({ value: 'relative/path', repoRoot }), /绝对路径/)
})

test('rejects repository and synchronized folders', () => {
  assert.throws(() => resolveDataRoot({ value: path.join(repoRoot, '.local'), repoRoot }), /仓库/)
  assert.throws(() => resolveDataRoot({ value: '/tmp/Google Drive/eval', repoRoot }), /同步目录/)
})

test('accepts a separate local absolute directory', () => {
  assert.equal(resolveDataRoot({ value: '/private/tmp/ldx-eval', repoRoot }), '/private/tmp/ldx-eval')
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --test tests/diagnostic-evaluation-data-root.test.js`

Expected: FAIL because `data-root.js` does not exist.

- [ ] **Step 3: Implement the guard and constants**

Export `resolveDataRoot({ value, repoRoot, homeDir })`. Reject empty values, relative paths, filesystem roots, anything inside `repoRoot`, and path segments matching `Google Drive`, `GoogleDrive`, `iCloud`, `Dropbox`, `OneDrive`, or `Box`. Do not create directories in this function.

Define immutable constants for:

```js
DATASET_SCHEMA_VERSION = '1.0.0'
SCORER_VERSION = '1.0.0'
MATCH_THRESHOLDS = { regionIou: 0.5, textSimilarity: 0.9, ambiguityMargin: 0.05 }
FORMAL_MINIMUMS = { documentsPerSubject: 20, itemsPerSubject: 150, historical: 100, challenge: 40 }
CORE_GUARDRAILS = [
  { key: 'overall.clearImageDiscoveryRecall', regression: 'decrease' },
  { key: 'overall.classificationAccuracy', regression: 'decrease' },
  { key: 'overall.s1Rate', regression: 'increase' },
  { key: 'overall.unreadableCorrectRejection', regression: 'decrease' },
  { key: 'overall.runCompletion', regression: 'decrease' },
  { key: 'math.nodeTop1', regression: 'decrease' },
  { key: 'math.bottleneckTop1', regression: 'decrease' },
  { key: 'chinese.originalItemLocation', regression: 'decrease' },
  { key: 'chinese.errorType', regression: 'decrease' },
  { key: 'english.wordIdentity', regression: 'decrease' },
  { key: 'english.recognitionSpelling', regression: 'decrease' }
]
```

- [ ] **Step 4: Add JSON Schema contract documents**

The dataset schema must represent `documents → pages → items`, stable IDs, source type, subject, grade, crop rectangle, composite parent/child relationship, hashes, annotation references, and `formal|exploratory|fixture` profile. The annotation schema must represent pre-label, human label, lock state, audit events, and dispute state. The run schemas must make Git commit, dataset version, model/prompt/adapter identity, configuration, status counts, and outputs explicit.

- [ ] **Step 5: Protect common accidental local-data paths**

Append to `.gitignore`:

```gitignore
# Diagnostic evaluation data must live outside the repository and sync folders
.local/evaluation/
evaluation-data/
```

- [ ] **Step 6: Run tests and commit**

Run: `node --test tests/diagnostic-evaluation-data-root.test.js`

Expected: PASS.

Commit:

```bash
git add .gitignore evaluation/diagnostic-accuracy/constants.js evaluation/diagnostic-accuracy/data-root.js evaluation/diagnostic-accuracy/schemas tests/diagnostic-evaluation-data-root.test.js
git commit -m "feat: define safe diagnostic evaluation storage"
```

### Task 2: Dataset validation, import, and fictional fixtures

**Files:**
- Create: `evaluation/diagnostic-accuracy/validate.js`
- Create: `evaluation/diagnostic-accuracy/importer.js`
- Create: `evaluation/diagnostic-accuracy/fixtures/dataset.json`
- Create: `evaluation/diagnostic-accuracy/fixtures/annotations.json`
- Create: `evaluation/diagnostic-accuracy/fixtures/system-output-baseline.json`
- Create: `evaluation/diagnostic-accuracy/fixtures/system-output-candidate.json`
- Create: `tests/diagnostic-evaluation-dataset.test.js`

- [ ] **Step 1: Write failing validation tests**

Test that the validator:

- accepts the fictional `fixture` profile;
- requires globally unique document, page, and sample IDs;
- requires every formal item to belong to a locked page inventory;
- rejects crop-only items from the formal profile but allows them in `exploratory`;
- rejects unverified redaction state;
- validates composite parent/child references;
- enforces formal minimums only for `formal`, not for `fixture`;
- recomputes and verifies declared content hashes;
- validates annotation subject fields, lock/audit consistency, and sample references;
- validates system-output document/sample references and required prediction fields;
- validates run manifests and rejects unknown status counts or missing version metadata;
- reports all validation errors together instead of stopping at the first error.

- [ ] **Step 2: Verify the tests fail**

Run: `node --test tests/diagnostic-evaluation-dataset.test.js`

Expected: FAIL because the validator and fixtures do not exist.

- [ ] **Step 3: Create the fictional bundle**

Create at least two items per subject. Include these deterministic cases:

- math: one correct arithmetic item and one incorrect fraction item with node and bottleneck labels;
- Chinese: one incorrect character item with original-review and migration labels, plus one blank item;
- English: one correctly recognized word and one misspelled word with separate recognition/spelling states;
- at least one composite parent with two children;
- at least one `unreadable` challenge item;
- one baseline output error corrected in the candidate output.

Use invented identifiers (`student_fixture`, `document_math_01`) and generated text only. Do not reuse names, database IDs, images, OCR summaries, or file paths from project history. Use text fixture image references such as `fixture://math/page-1` rather than binary images.

- [ ] **Step 4: Implement executable validators and `importDataset`**

Export `validateDataset`, `validateAnnotations`, `validateSystemOutput`, and `validateRunManifest`. Each returns `{ valid, errors, summary }`, validates its JSON Schema-shaped structure plus cross-record invariants, and verifies declared SHA-256 content hashes using one canonical JSON serialization helper. `importDataset({ sourceFile, dataRoot, profile })` validates before writing, writes to `datasets/<datasetVersion>/dataset.json` using exclusive creation, and refuses to overwrite an existing version. Import accepts only `redactionStatus: verified` records; real image scanning is deliberately not implemented in phase 1.

- [ ] **Step 5: Run tests and commit**

Run: `node --test tests/diagnostic-evaluation-dataset.test.js`

Expected: PASS.

Commit:

```bash
git add evaluation/diagnostic-accuracy/validate.js evaluation/diagnostic-accuracy/importer.js evaluation/diagnostic-accuracy/fixtures tests/diagnostic-evaluation-dataset.test.js
git commit -m "feat: validate diagnostic benchmark datasets"
```

### Task 3: Normalization and deterministic one-to-one matching

**Files:**
- Create: `evaluation/diagnostic-accuracy/normalizers.js`
- Create: `evaluation/diagnostic-accuracy/matcher.js`
- Create: `tests/diagnostic-evaluation-matcher.test.js`

- [ ] **Step 1: Write failing normalization and matcher tests**

Cover:

```js
assert.equal(normalizeText('Ａ＋Ｂ ＝ ３。', 'math'), 'a+b=3')
assert.equal(normalizeText('  colour\n', 'english'), 'colour')
assert.equal(regionIou({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 0, width: 10, height: 10 }), 1 / 3)
```

Also test the required matching order:

1. exact `sampleId`;
2. unique same-page IoU `>= 0.5`;
3. normalized text similarity `>= 0.90` with at least `0.05` margin over the second candidate;
4. ambiguous, multi-match, or insufficient-location results go to `unresolved`;
5. unmatched gold items are `missed`; unmatched predictions are `hallucinated`.

Gold and prediction IDs participating in `unresolved` are excluded from `missed` and `hallucinated` until adjudication; Task 5 must still mark the run incomplete and retain them in the adjudication queue.

- [ ] **Step 2: Verify failure**

Run: `node --test tests/diagnostic-evaluation-matcher.test.js`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement minimal versioned normalization**

Apply Unicode NFKC, lowercase English, whitespace removal where subject-safe, and a fixed punctuation map. Do not infer mathematical equivalence in the normalizer; expose `answerMatches(predicted, acceptedAnswers, subject)` and require accepted answer variants from the locked gold label.

- [ ] **Step 4: Implement deterministic matching**

Return:

```js
{
  matches: [{ sampleId, predictionId, method, score }],
  missed: [...],
  hallucinated: [...],
  unresolved: [{ reason, goldIds, predictionIds }]
}
```

Sort inputs and outputs by stable ID before matching so fixture order cannot change results.

- [ ] **Step 5: Run tests and commit**

Run: `node --test tests/diagnostic-evaluation-matcher.test.js`

Expected: PASS.

Commit:

```bash
git add evaluation/diagnostic-accuracy/normalizers.js evaluation/diagnostic-accuracy/matcher.js tests/diagnostic-evaluation-matcher.test.js
git commit -m "feat: match diagnostic outputs deterministically"
```

### Task 4: Common and subject-specific scoring

**Files:**
- Create: `evaluation/diagnostic-accuracy/scorers/statistics.js`
- Create: `evaluation/diagnostic-accuracy/scorers/common.js`
- Create: `evaluation/diagnostic-accuracy/scorers/math.js`
- Create: `evaluation/diagnostic-accuracy/scorers/chinese.js`
- Create: `evaluation/diagnostic-accuracy/scorers/english.js`
- Create: `evaluation/diagnostic-accuracy/scorers/index.js`
- Create: `tests/diagnostic-evaluation-scoring.test.js`

- [ ] **Step 1: Write failing metric tests**

Use table-driven fixtures to verify:

- discovery recall, missed rate, hallucination rate, and run completion;
- four-class confusion matrix and accuracy;
- correct and incorrect `unreadable` abstentions;
- text and accepted-answer matching;
- math leaf-node Top-1 distinct from ancestor hit, bottleneck Top-1, and multi-label precision/recall/F1;
- Chinese original-item location, error type, original-review binding, and migration legality;
- English word identity, recognition/spelling dimensions, and state update;
- S0–S3 precedence and deduplication;
- severe hallucinations add to the S1 numerator but not its denominator;
- failed pages keep all gold items in discovery denominators;
- composite parents do not double-count their children;
- Wilson 95% intervals for proportions.

- [ ] **Step 2: Verify failure**

Run: `node --test tests/diagnostic-evaluation-scoring.test.js`

Expected: FAIL because scorer modules do not exist.

- [ ] **Step 3: Implement statistics and the common scorer**

All ratios return `{ numerator, denominator, rate, interval95 }`; return `rate: null` when the denominator is zero. Expose raw counts beside rates. Keep operational discovery metrics separate from conditional field/attribution metrics.

- [ ] **Step 4: Implement focused subject scorers**

Each scorer accepts one matched `{ gold, prediction }` pair and returns named checks plus error labels. `scorers/index.js` owns aggregation and error-severity precedence; subject files must not know about run storage or reporting.

The aggregate score object must expose every `CORE_GUARDRAILS[].key` path with stable `{ numerator, denominator, rate, interval95 }` values. Tests fail if a declared core metric is absent.

- [ ] **Step 5: Run tests and commit**

Run: `node --test tests/diagnostic-evaluation-scoring.test.js`

Expected: PASS.

Commit:

```bash
git add evaluation/diagnostic-accuracy/scorers tests/diagnostic-evaluation-scoring.test.js
git commit -m "feat: score three-subject diagnostic accuracy"
```

### Task 5: Immutable runs and fixture evaluation pipeline

**Files:**
- Create: `evaluation/diagnostic-accuracy/adapters/fixture.js`
- Create: `evaluation/diagnostic-accuracy/run-store.js`
- Create: `evaluation/diagnostic-accuracy/pipeline.js`
- Create: `tests/diagnostic-evaluation-pipeline.test.js`

- [ ] **Step 1: Write failing run-store and pipeline tests**

Use a temporary data root. Verify:

- a run records `runId`, Git commit, dataset/scorer/model/prompt/adapter versions, timestamps, config, status counts, and estimated usage;
- the fixture adapter never imports cloud modules or performs network I/O;
- successful output writes `manifest.json`, `raw-output.json`, `match.json`, and `score.json` under `runs/<runId>/`;
- exclusive writes reject an existing `runId` and never overwrite prior output;
- a partial adapter failure produces `status: incomplete`, retains failed item IDs, and still scores discovery misses;
- any unresolved one-to-one match produces `status: incomplete`, increments `statusCounts.unresolved`, and writes an adjudication queue;
- identical fixed inputs produce byte-identical score JSON after removing timestamps/run IDs.

- [ ] **Step 2: Verify failure**

Run: `node --test tests/diagnostic-evaluation-pipeline.test.js`

Expected: FAIL because the run modules do not exist.

- [ ] **Step 3: Implement the fixture adapter and immutable store**

The adapter reads a supplied fictional output JSON file and exposes:

```js
async function diagnoseDocument({ document, outputByDocumentId })
async function prelabelItem({ item, annotationsBySampleId })
```

The store uses `fs.mkdirSync(runDir, { recursive: false })` and exclusive file flags. It may create the parent `runs` directory but must not delete, truncate, or replace an existing run.

- [ ] **Step 4: Implement orchestration**

`runEvaluation({ dataset, annotations, adapter, dataRoot, metadata })` validates datasets, annotations, adapter system outputs, and the final run manifest; creates the run; diagnoses every document; records failures; matches outputs; scores all subjects; finalizes the manifest; and returns the run path. It must reject formal scoring when annotations are not locked; fixture profile may use locked fictional annotations.

Unresolved matches remain outside `missed` and `hallucinated` until adjudication because their pairing is unknown, but they must appear in `adjudication-queue.json`, make the run `incomplete`, and prevent baseline promotion. They cannot silently leave the run counts or report.

- [ ] **Step 5: Run tests and commit**

Run: `node --test tests/diagnostic-evaluation-pipeline.test.js`

Expected: PASS.

Commit:

```bash
git add evaluation/diagnostic-accuracy/adapters evaluation/diagnostic-accuracy/run-store.js evaluation/diagnostic-accuracy/pipeline.js tests/diagnostic-evaluation-pipeline.test.js
git commit -m "feat: run immutable diagnostic evaluations"
```

### Task 6: Review store and local review interface

**Files:**
- Create: `evaluation/diagnostic-accuracy/review-store.js`
- Create: `evaluation/diagnostic-accuracy/review-server.js`
- Create: `evaluation/diagnostic-accuracy/review-app/index.html`
- Create: `evaluation/diagnostic-accuracy/review-app/app.js`
- Create: `evaluation/diagnostic-accuracy/review-app/styles.css`
- Create: `tests/diagnostic-evaluation-review.test.js`

- [ ] **Step 1: Write failing review-boundary tests**

Verify:

- unlocked review payloads include image reference and pre-label but exclude system output;
- locking requires a validated caller-supplied local reviewer alias, required subject fields, and an audit event;
- locked labels are immutable; corrections create a new dataset version rather than modifying the file;
- independent-QC payloads exclude AI pre-label, first-review label, and system output;
- disputed items cannot be counted as locked;
- the HTTP server binds to `127.0.0.1` only and rejects non-JSON mutations and paths outside the configured data root.

- [ ] **Step 2: Verify failure**

Run: `node --test tests/diagnostic-evaluation-review.test.js`

Expected: FAIL because review modules do not exist.

- [ ] **Step 3: Implement the review store**

Use append-only audit JSON Lines plus an atomically replaced derived working file inside a temporary directory followed by `renameSync`. The API must expose separate views:

```js
getPrimaryReviewItem(sampleId)       // pre-label visible, system output hidden
getIndependentQcItem(sampleId)       // only source and blank form
lockPrimaryLabel(sampleId, label, reviewerAlias)
recordQcLabel(sampleId, label, reviewerAlias)
recordAdjudication(sampleId, label, adjudicatorAlias)
```

- [ ] **Step 4: Implement the minimal local UI**

The UI shows item navigation, fictional image reference/placeholder, subject-specific form fields, pre-label accept/edit controls, dispute flag, lock confirmation, and a required reviewer-alias field. The server validates aliases as non-empty local audit identifiers; this is attribution, not authentication. Before lock the UI must not request or render system output; after lock it may request a separate comparison payload and show system-versus-gold differences. Do not implement authentication, remote hosting, production styling, or dashboards in phase 1.

- [ ] **Step 5: Run tests and commit**

Run: `node --test tests/diagnostic-evaluation-review.test.js`

Expected: PASS.

Commit:

```bash
git add evaluation/diagnostic-accuracy/review-store.js evaluation/diagnostic-accuracy/review-server.js evaluation/diagnostic-accuracy/review-app tests/diagnostic-evaluation-review.test.js
git commit -m "feat: add local diagnostic label review"
```

### Task 7: Deterministic reports and candidate comparison

**Files:**
- Create: `evaluation/diagnostic-accuracy/report.js`
- Create: `evaluation/diagnostic-accuracy/compare.js`
- Modify: `evaluation/diagnostic-accuracy/pipeline.js`
- Modify: `evaluation/diagnostic-accuracy/run-store.js`
- Create: `tests/diagnostic-evaluation-report.test.js`

- [ ] **Step 1: Write failing report and comparison tests**

Verify reports contain overall metrics, each subject, source/grade/question-type/image-quality slices, S0–S3 counts, representative fixture IDs, unresolved/failed lists, confidence intervals, and run metadata.

For comparison, verify:

- new S0 always fails;
- two or more new S1 items fail;
- one new S1 returns `needs_review`;
- a core metric regression greater than 0.02 in its configured direction fails;
- McNemar exact two-sided `p < 0.05` on paired `diagnosisFullyCorrect` outcomes fails;
- candidate fixture fixes its known baseline error and reports an improvement;
- only the versioned `CORE_GUARDRAILS` are eligible for the two-point regression guardrail, and tests cover both `decrease` and `increase` regression directions;
- JSON key order and Markdown section order are deterministic.

- [ ] **Step 2: Verify failure**

Run: `node --test tests/diagnostic-evaluation-report.test.js`

Expected: FAIL because reporting modules do not exist.

- [ ] **Step 3: Implement JSON and Markdown reports**

`buildEvaluationReport` returns a JSON-safe object. `renderEvaluationMarkdown` renders from that object and never reads raw images or annotations. Reports may include fictional sample IDs but no raw question text by default.

Update `pipeline.js` and `run-store.js` so a completed or incomplete run always persists `report.json` and `report.md` after scoring. Use exclusive writes and include unresolved/failed status in both reports. A report-generation failure changes the run to `incomplete`; it must not leave a manifest claiming completion.

- [ ] **Step 4: Implement comparison rules**

Use the fixed paired gold item IDs. `diagnosisFullyCorrect` is true only when the item is discovered, four-class conclusion is correct, and required primary attribution is correct. Implement an exact two-sided McNemar/binomial calculation using built-in JavaScript only. Read absolute guardrail metrics only from `CORE_GUARDRAILS`; apply the two-point threshold in the configured regression direction. Missing, renamed, or directionless guardrails are comparison errors rather than implicit passes.

- [ ] **Step 5: Run tests and commit**

Run: `node --test tests/diagnostic-evaluation-report.test.js`

Expected: PASS.

Commit:

```bash
git add evaluation/diagnostic-accuracy/report.js evaluation/diagnostic-accuracy/compare.js evaluation/diagnostic-accuracy/pipeline.js evaluation/diagnostic-accuracy/run-store.js tests/diagnostic-evaluation-report.test.js
git commit -m "feat: compare diagnostic quality baselines"
```

### Task 8: CLI, package integration, documentation, and phase-one verification

**Files:**
- Create: `evaluation/diagnostic-accuracy/cli.js`
- Create: `tests/diagnostic-evaluation-cli.test.js`
- Modify: `package.json`
- Modify: `docs/TESTING.md`
- Modify: `docs/TEST_MATRIX.md`
- Modify: `docs/README.md`

- [ ] **Step 1: Write failing CLI integration tests**

Spawn the CLI with a temporary data root and verify:

```bash
node evaluation/diagnostic-accuracy/cli.js import --source ... --profile fixture
node evaluation/diagnostic-accuracy/cli.js prelabel --dataset fixture-v1 --adapter fixture --fixture-annotations evaluation/diagnostic-accuracy/fixtures/annotations.json
node evaluation/diagnostic-accuracy/cli.js run --dataset fixture-v1 --adapter fixture --output ...
node evaluation/diagnostic-accuracy/cli.js compare --baseline run-a --candidate run-b
```

Also verify missing `DIAG_EVAL_DATA_ROOT`, unsafe roots, unknown commands, overwrite attempts, and unsupported non-fixture adapters return non-zero with readable errors. Test `review` by starting the server on port `0`, checking the bound host is `127.0.0.1`, then closing it.

- [ ] **Step 2: Verify failure**

Run: `node --test tests/diagnostic-evaluation-cli.test.js`

Expected: FAIL because the CLI does not exist.

- [ ] **Step 3: Implement the CLI and scripts**

The CLI reuses the module functions and contains no scoring logic. For the fixture adapter, `prelabel` requires `--fixture-annotations`; it validates the supplied annotation fixture, extracts only pre-label fields, and writes `datasets/<datasetVersion>/annotations/prelabels.json` using exclusive creation. `review` reads that file and writes its audit/working files under the same dataset version. `run` requires the resulting locked annotation file or an explicit `--locked-annotations` path. Unsupported real providers fail closed.

Add:

```json
"eval:diagnosis:import": "node evaluation/diagnostic-accuracy/cli.js import",
"eval:diagnosis:prelabel": "node evaluation/diagnostic-accuracy/cli.js prelabel",
"eval:diagnosis:review": "node evaluation/diagnostic-accuracy/cli.js review",
"eval:diagnosis:run": "node evaluation/diagnostic-accuracy/cli.js run",
"eval:diagnosis:compare": "node evaluation/diagnostic-accuracy/cli.js compare"
```

Do not add `eval:diagnosis:smoke` until a production-equivalent no-write adapter exists in a later plan.

- [ ] **Step 4: Add all eight new test files to `test:unit` and `test:coverage`**

Add the focused files explicitly, following the current repository convention. Run each focused test first, then the full verification.

- [ ] **Step 5: Document phase-one commands and safety boundary**

Document that phase 1 uses fictional fixtures only; `DIAG_EVAL_DATA_ROOT` must be outside the repository and sync folders; real export, OCR redaction, real pre-labeling, production replay, smoke, and 450-item collection remain future work. Update the test matrix with the new offline suite without claiming a real accuracy baseline exists.

- [ ] **Step 6: Run phase-one end-to-end fixture flow**

Use a temporary directory outside the repository:

```bash
DIAG_EVAL_DATA_ROOT=/private/tmp/ldx-diagnostic-eval npm run eval:diagnosis:import -- --source=evaluation/diagnostic-accuracy/fixtures/dataset.json --profile=fixture
DIAG_EVAL_DATA_ROOT=/private/tmp/ldx-diagnostic-eval npm run eval:diagnosis:prelabel -- --dataset=fixture-v1 --adapter=fixture --fixture-annotations=evaluation/diagnostic-accuracy/fixtures/annotations.json
DIAG_EVAL_DATA_ROOT=/private/tmp/ldx-diagnostic-eval npm run eval:diagnosis:run -- --dataset=fixture-v1 --adapter=fixture --locked-annotations=evaluation/diagnostic-accuracy/fixtures/annotations.json --fixture-output=evaluation/diagnostic-accuracy/fixtures/system-output-baseline.json
```

Expected: import, pre-label, and run succeed; the run directory contains immutable manifest, match, score, JSON report, and Markdown report files.

- [ ] **Step 7: Run all gates**

Run:

```bash
node --test tests/diagnostic-evaluation-*.test.js
npm run verify
npm run test:coverage
npm run check:docs
git diff --check
```

Expected: all commands pass. Coverage remains above the repository's 80% line/function thresholds.

- [ ] **Step 8: Commit the integration**

```bash
git add evaluation/diagnostic-accuracy tests/diagnostic-evaluation-*.test.js package.json docs/TESTING.md docs/TEST_MATRIX.md docs/README.md .gitignore
git commit -m "feat: add diagnostic accuracy evaluation foundation"
```

## Phase-one completion criteria

- All modules run using only fictional data and built-in Node.js APIs.
- Unsafe or synchronized data roots are rejected before any write.
- Formal, exploratory, and fixture profiles cannot be mixed accidentally.
- Matching and all three subject scorers follow the approved denominators.
- Locked annotations, audit records, immutable runs, reports, and comparisons are reproducible.
- The review API does not expose system output before lock and supports independent QC isolation.
- The candidate fictional run shows a deterministic improvement over the baseline.
- Default verification, coverage, documentation, and diff checks pass.
- No real data, cloud call, external AI call, production smoke, or product behavior change is included.
