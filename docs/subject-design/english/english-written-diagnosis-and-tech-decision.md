# English Written Diagnosis And Tech Decision

> Status: historical decision record; superseded by the vocabulary mastery design
> Updated: 2026-07-18

> This document explains an earlier written-diagnosis direction. The current English product boundary is the personal vocabulary loop documented in [README.md](./README.md): recognition and spelling are tracked independently, with paper dictation and ASR-assisted recognition but no pronunciation scoring.

## 1. Decision

English should first follow the mini program's strongest pattern:

```text
Paper evidence → diagnosis → verification → review
```

The first implementation focus should be written English, not oral/listening diagnosis.

## 2. Why Written Diagnosis Comes First

Written English is compatible with the existing CloudBase photo pipeline:

- Homework and exam photos are already natural parent inputs.
- Spelling, grammar, reading, and written answers are visible on paper.
- Reports can reuse the same evidence chain as math.
- Verification can still be printable and paper-based.

## 3. Suggested English Bottleneck Layers

| Layer | Examples |
| --- | --- |
| Vocabulary | unknown words, meaning confusion, high-frequency word gaps |
| Phonics as written evidence | sound-letter rule gaps visible in spelling or dictation notebooks |
| Spelling | letter order, letter group, capitalization, punctuation |
| Grammar | tense, singular/plural, preposition, article, word order |
| Sentence | sentence pattern, clause relation, translation interference |
| Reading | detail, main idea, inference, question-word matching |
| Writing | sentence completeness, handwriting, format, punctuation |

## 4. Oral And Listening Boundary

Oral and listening diagnosis are technically possible but product-risky.

They require:

- Recording UI.
- Uploading audio.
- Server-side format conversion.
- Third-party pronunciation or ASR API.
- A new mapping from score-level feedback to repairable bottlenecks.

More importantly, they change the product from passive diagnosis of real work to active in-app practice. That may weaken the product's differentiation.

## 5. Recommendation

| Stage | Scope | Reason |
| --- | --- | --- |
| MVP | Written diagnosis: spelling, grammar, reading, written expression | Reuses existing architecture and real homework evidence |
| V1.5 | Paper dictation and vocabulary weakness review | Still paper-compatible |
| V2 exploration | Pronunciation diagnosis | Only after a clear bottleneck model exists |
| Defer | Listening diagnosis | Requires full interactive in-app assessment |

## 6. Source Notes

This document consolidates earlier external research and technical notes. Any API pricing, competitor feature, or WeChat platform limit should be rechecked before implementation decisions, because those facts change over time.
