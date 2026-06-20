# Prompt And Agent Design

> Status: active implementation reference  
> Updated: 2026-06-20

## 1. Design Goal

AI calls should produce structured, verifiable outputs rather than persuasive but untraceable explanations.

The system uses AI for:

- Photo analysis.
- Bottleneck candidate extraction.
- Question generation.
- Verification evidence interpretation.
- Learning resource pack generation.

## 2. Prompt Chain

### Photo Analysis

Input:

- One page image.
- Subject.
- Report mode.
- Verification paper metadata if available.

Output:

- Page-level OCR or summary.
- Error details.
- Candidate bottlenecks.
- Evidence quality.
- Verification target evidence when analyzing a completed paper.

### Bottleneck Normalization

Input:

- AI candidate labels.
- Existing subject profile.
- Math taxonomy and knowledge map seeds.

Output:

- Parent-readable bottleneck names.
- Fine-grained bottleneck IDs.
- Knowledge node IDs.
- Evidence state.

### Paper Generation

Input:

- Subject.
- Grade.
- Target bottlenecks or concrete review items.
- Verification task pack page plan.

Output:

- Printable questions.
- Answer key.
- Page codes.
- Target IDs.
- Question-to-target metadata.

### Verification Analysis

Input:

- Completed paper photos.
- Original generated paper.
- Expected target/page metadata.

Output:

- Per-target evidence.
- Correct, wrong, blank, unclear, missing, or extra status.
- Aggregated comparison summary.

## 3. Agent Roles

These are conceptual roles; implementation may be one cloud function or several modules.

| Role | Responsibility |
| --- | --- |
| Evidence Reader | Reads page images and extracts visible answer evidence |
| Bottleneck Mapper | Maps symptoms to fine-grained bottlenecks and knowledge nodes |
| Paper Planner | Schedules targets into printable task-pack pages |
| Question Writer | Generates age-appropriate verification questions |
| Evidence Judge | Compares completed paper evidence to expected targets |
| Parent Explainer | Produces concise parent-facing next action text |

## 4. Output Rules

- Prefer structured JSON contracts over prose.
- Include stable IDs whenever the result affects state.
- Preserve uncertainty instead of forcing a binary outcome.
- Never expose raw internal LP codes as the primary parent-facing label.
- Keep generated learning text short enough for a family session.

## 5. Testing Expectations

Any prompt contract change should be covered by:

- Unit tests for normalization and fallbacks.
- Cloud function tests for permission and data persistence.
- Presenter tests for parent-facing display.
- Regression cases for missing, blank, unclear, and duplicate evidence.

