# Math Learning Map Roadmap

> Status: active subject roadmap  
> Updated: 2026-06-20

## 1. Direction

Math is the deepest current subject line. The next goal is to move from coarse "wrong question categories" to a map-based repair system:

```text
Paper evidence
  ↓
Fine-grained bottleneck
  ↓
Knowledge node
  ↓
Learning resource or worked example
  ↓
Child explanation
  ↓
Focused practice
  ↓
Spaced verification
  ↓
Node mastery update
```

## 2. Why This Matters

Labels such as "calculation error" or "word problem error" are too broad for action.

The app should identify smaller repairable units, for example:

- Decimal multiplication point placement.
- Fraction division reciprocal rule.
- Percent base quantity.
- Ratio part-whole reference.
- Circle area versus circumference.
- Surface area exposed-face enumeration.
- Estimation and inverse-check habit.

## 3. Current Data Model

| Layer | File | Purpose |
| --- | --- | --- |
| Knowledge nodes | `data/math/knowledge-nodes.seed.json` | Math map nodes and dependencies |
| Fine bottlenecks | `data/math/bottleneck-taxonomy-v2.seed.json` | Repairable bottleneck taxonomy |
| Historical replay | `data/math/historical-error-replay.seed.json` | Real historical errors mapped into the new system |
| Resources | `data/math/learning-resources.seed.json` | Candidate learning resources and review metadata |
| Mastery state | `data/math/student-node-mastery.example.json` | Example per-student node state |
| Intervention sessions | `data/math/intervention-sessions.example.json` | Example family repair sessions |

## 4. Execution Phases

### Phase 1: Fine Bottleneck Library

- Keep expanding from historical evidence.
- Every bottleneck should include symptoms, root cause signals, micro-validation rules, repair strategy, mastery evidence, and source evidence.
- Avoid broad labels such as "careless" or "does not understand math."

### Phase 2: Knowledge Node Map

- Cover primary school math first.
- Prioritize Grade 6 and junior-high transition pressure points.
- Record prerequisites and successors.
- Link every confirmed bottleneck to at least one node.

### Phase 3: Resource Review

- Store links, summaries, review status, risks, parent rating, and child feedback.
- Do not copy platform content.
- Children should only access parent-selected resources, not open recommendation feeds.

### Phase 4: Report Integration

- Diagnosis reports should show:
  - Evidence.
  - Candidate bottleneck.
  - Knowledge node.
  - Suggested verification.
  - Suggested resource or learning pack.

### Phase 5: Mastery Tracking

Node states:

- `unobserved`
- `suspected_gap`
- `relearning`
- `partial_mastery`
- `mastered`
- `recurring`

State updates should come from evidence, not one-time AI judgment.

## 5. Current Priority

The highest-leverage math repair line is:

```text
Estimation and inverse-check habit
  + fraction/decimal/percent conversion
  + percent base quantity
  + ratio reference
  + geometry formula target selection
```

These are cross-topic skills that improve many paper outcomes at once.

