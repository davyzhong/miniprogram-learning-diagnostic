# Learning Diagnostic Product Brief

> Status: active implementation reference  
> Updated: 2026-07-18
> Product: Learning Diagnostic Mini Program

## 1. One Sentence

Learning Diagnostic helps parents photograph a child's paper homework or exam, receive an AI-assisted learning bottleneck report, follow a concrete learning action, generate targeted verification papers, and track whether the bottleneck improves.

The current product applies subject-specific evidence rules: math verifies transfer with related questions, Chinese retests the exact wrong character or word before near transfer, and English tracks recognition and spelling separately inside a personal vocabulary loop.

## 2. Product Positioning

The mini program is not a generic homework explanation app. It is a learning diagnostic tool.

The product answers:

- What did the child get wrong?
- What is the likely learning bottleneck behind the error?
- Which evidence supports the diagnosis?
- What should be verified next?
- Did the bottleneck persist, improve, or need more evidence?

## 3. Core Hypothesis

Learning bottlenecks can be discovered, localized, verified, repaired, and retested through real paper-based learning evidence.

The important distinction is:

```text
Wrong answer = symptom
Learning bottleneck = repairable cause candidate
Verification paper = evidence to confirm or reject the candidate
```

## 4. Target Users

### Parent

The parent is the primary operator:

- Creates and manages child profiles.
- Uploads paper photos.
- Reads diagnosis reports.
- Generates verification papers.
- Prints, supervises, and uploads completed verification papers.
- Reviews whether the child's bottlenecks are improving.

### Child

The child is the learning subject:

- Completes school work or verification papers on paper.
- Leaves written process evidence.
- Completes correction and retest workflows.
- Explains the corrected idea in parent-led sessions.

## 5. Current Product Shape

The implemented mini program supports:

- Family and child profiles.
- Subject workbenches for math, Chinese, and English.
- Photo upload and async AI analysis.
- Diagnosis reports.
- Fine-grained learning bottleneck views.
- Verification paper generation.
- Default diagnosis paper generation.
- Paper preview and PDF download.
- Verification upload and comparison reports.
- Learning record timeline.
- Parent member invitation and shared access.
- English vocabulary and practice workflows.
- Math knowledge map and learning resource pack foundations.

## 6. Three Diagnosis Paths

```text
Subject home
  ├─ A. Photo diagnosis
  │    Existing paper photos → async AI analysis → diagnosis report
  ├─ B. Verification paper
  │    Historical bottlenecks → generated A4 paper → child answers on paper → upload → verification report
  └─ C. Default diagnosis paper
       Grade-level generated paper → child answers on paper → upload → diagnosis report
```

## 7. Product Principles

- Keep paper as the main evidence carrier when process traces matter.
- Do not hide uncertainty: distinguish confirmed, suspected, improved, persisting, missing, blank, and unclear evidence.
- Prefer parent-readable names over internal `LP-*` codes.
- Keep the next action small enough for a family to execute.
- Use AI for candidate generation, but rely on verification evidence for state changes.
- Keep raw child data private; commit only desensitized samples and structured seed data.

## 8. What The MVP Does Not Try To Be

The current mini program is not:

- A complete AI Learning OS.
- A general AI tutor.
- A course platform.
- A social learning community.
- A full long-term learning planning system.
- A replacement for school instruction.

Those broader ideas belong to the total project knowledge base, not this implementation repository.
