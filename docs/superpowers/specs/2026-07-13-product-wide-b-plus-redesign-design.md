# Product-wide B+ redesign

Date: 2026-07-13
Status: approved

## Goal

Make formal diagnostic reports the center of the mini program while applying the approved B+ visual language to every user-facing page. The redesign must improve scanability and information density, add substantially more semantic icons and lightweight graphics, preserve existing workflows and permissions, and keep the main package below its 2 MB limit.

## Approved product decisions

- Every subject with a completed, effective formal diagnosis exposes its own latest diagnosis.
- Verification reports never replace formal diagnosis reports in the latest-diagnosis area.
- Subjects without a formal diagnosis are hidden from that area and consume no space.
- A subject diagnosis module combines the latest report, evidence and change signals, and the next useful action.
- The diagnostic report detail uses a layered structure: summary, diagnostic evidence, and historical change.
- B+ is the global visual language for all pages, not a report-only treatment.
- Semantic emoji and CSS graphics are preferred over image assets or an icon font.

## Experience principles

### Report first

The learning profile begins with the latest formal diagnoses that exist. General tools, upload affordances, and secondary navigation follow the diagnosis modules. The family and subject workbenches also surface the latest relevant diagnosis without duplicating the full report.

### Dense but readable

Each diagnosis module fits the following information into a compact vertical block:

- subject and formal-report identity;
- generated date and full-report link;
- one concise core judgment;
- an inline evidence/change strip;
- a compact trend signal;
- one primary next action and a lightweight upload action.

Large three-column KPI cards, decorative whitespace, and repeated explanatory copy are removed. Two subject modules, common learning tools, and the upload entry should be scannable within roughly one mobile viewport where content length permits.

### Semantic visual language

Icons are functional labels, not decoration. Stable mappings include:

| Meaning | Symbol |
| --- | --- |
| Learning profile | `📚` |
| Formal diagnosis | `🩺` |
| Full report | `📖` |
| Evidence | `📝` |
| Improved | `✅` |
| Persisting | `🔁` |
| Waiting for verification | `⏳` |
| Next action | `🎯` |
| Verification paper | `📄` |
| Upload | `📤` / `📷` |
| Learning bottleneck | `🧩` |
| Knowledge map | `🗺️` |
| History | `🗂️` / `🕘` |
| Helpful judgment | `💡` |

Every icon keeps an adjacent text label when it represents an action or status. Emoji dimensions and line boxes are fixed so platform-specific glyph rendering cannot shift the layout. Pure CSS bars, dots, timelines, and progress shapes provide additional graphics without adding asset weight.

## Global design system

The global stylesheet provides a compact B+ foundation rather than requiring every page to recreate it:

- page shell and dense content container;
- compact section header and icon-title pair;
- semantic icon box and inline icon label;
- status strip and metric token;
- primary command row and secondary icon command;
- dense list row and disclosure indicator;
- CSS mini bars, trend dots, timelines, and progress tracks;
- loading, empty, error, restricted, and completed states;
- subject accents for math, Chinese, and English;
- accessible focus/pressed states and stable control dimensions.

Existing page-specific selectors remain valid during migration. Shared classes are additive, allowing pages to move to B+ without a risky all-at-once class rename.

## Data contract

### Latest formal diagnosis by subject

`studentData.getStudentDashboard` must provide an explicit lightweight collection of latest formal diagnoses by subject. It cannot derive this value from only the globally newest N reports because a busy subject can crowd another subject out of that window.

For each of `math`, `chinese`, and `english`, the selected report must:

- belong to the requested student;
- have `status === 'completed'`;
- not be archived or stale;
- be effective unless `isEffective` is absent for backward compatibility;
- have a report type other than `verification`;
- be the newest by `createdAt`.

The response contains only the fields required by the learning-profile presenter. Missing subjects are omitted rather than represented by empty cards. Existing `recentReports` remains available for timelines and backward compatibility.

`studentData.getHomeDashboard` must extend each `perStudent` entry with the same lightweight per-subject diagnosis collection. It may use batched subject queries followed by server-side fallback queries for missing student/subject pairs, but it must not infer coverage from one globally limited report window. The family workbench therefore gains diagnosis coverage without adding client-side initial-load requests.

### Diagnosis workbench view model

`buildLearningProfileHomeView` produces one workbench per returned formal diagnosis. Each workbench contains:

- subject identity and semantic icon;
- report URL and generated time;
- compact judgment;
- evidence, improved, persisting, and waiting counts when available;
- a lightweight trend label based on existing historical/profile evidence;
- a primary action resolved from existing paper/profile state;
- an upload fallback.

Action priority is: ready verification workflow, existing subject follow-up workflow, then upload new evidence. A missing optional action never hides the report.

## Page-family rollout

### Core diagnosis

- `index`: add report coverage and latest-report entry to each child workbench without displacing the primary family task.
- `student-profile`: replace the single global report panel with compact per-subject diagnosis workbenches; hide undiagnosed subjects.
- `subject-home`: make the latest formal diagnosis a prominent compact module and keep verification as follow-up state.
- `report`: implement the approved layered report structure and B+ visual hierarchy.

### Learning loop

- `upload`: icon-led source/status controls, denser upload queue, and a strong completed-report transition.
- `upload-history`: clearer diagnostic-report identity, report filter, dense timeline graphics, and icon-led record types.
- `learning-progress`: CSS timeline and semantic change symbols.
- `bottleneck-center` and `bottleneck-detail`: compact severity/status signals, evidence links, and action rows.
- `knowledge-map`: denser node graphics and consistent status icons.
- `learning-resource`: compact resource type, estimated effort, completion, and verification graphics.
- `generate-verification`, `default-paper`, and `paper-preview`: consistent paper, generation, download, print, upload, and feedback symbols.

### English tools

- `english-practice`: icon-led practice modes, compact attempt feedback, and stable progress graphics.
- `english-dictation`: visual recording/playback/submission states with dense result summaries.
- `english-wrong-words`: compact mastery status, review actions, and history indicators.

### Family and system

- `add-student`, `join-student`, and `parent-management`: clearer roles, permissions, invitation, and destructive actions using semantic symbols and compact rows.
- `ai-usage`: denser usage/cost presentation with CSS bars and event-type icons.

All 21 registered user-facing pages are covered by these groups.

## Diagnostic report detail

The formal diagnosis page uses three visible layers:

1. **Report summary**: formal identity, evidence time, concise core judgment, compact evidence/change totals, and next action.
2. **Diagnostic evidence**: learning observations, source questions/photos, wrong and correct answers, reasoning, and confidence/clarity states.
3. **Historical change**: improved, persisting, and newly observed items, plus linked verification feedback where available.

A compact section control helps users move between these layers. Existing content is reorganized, not discarded. Loading, analyzing, partial, failed, verification, feedback, PDF, and retry states remain supported.

## Entry reinforcement

Diagnostic reports are reinforced contextually:

- learning profile: per-subject diagnosis workbenches;
- family workbench: diagnosis coverage and latest report for each child;
- subject workbench: latest formal diagnosis plus follow-up state;
- upload completion: primary command to read the generated report;
- learning history: report filter and unmistakable report rows;
- bottleneck and paper flows: traceable links back to supporting diagnosis.

The same large report card is not repeated everywhere. Each surface exposes only the report information needed for that workflow.

## Performance and package constraints

- Add no icon font, raster icon set, or runtime graphics dependency.
- Prefer text emoji, existing assets, and CSS primitives.
- Keep shared CSS concise; remove superseded page rules where safe.
- Avoid adding new blocking requests to initial page load.
- Fetch latest formal diagnoses in the existing dashboard request.
- Preserve lazy subpackages and current preload behavior unless measurement supports a change.
- Run the existing main-package size gate and retain the 800 KB internal warning threshold.

## Compatibility and failure states

- Existing records without `isEffective` remain eligible.
- Existing report types other than `verification` are treated as formal diagnosis for backward compatibility.
- If the latest-diagnosis DTO is missing during a staggered deployment, the profile page may use subject-scoped latest-report lookups for `math`, `chinese`, and `english`. It must never derive the guaranteed per-subject collection from globally limited `recentReports`. If subject-scoped lookup is unavailable, the diagnosis area shows a compact retry state instead of incomplete data.
- Missing report summaries, counts, trends, papers, or resources collapse gracefully without empty visual blocks.
- Emoji never replaces critical text, so unsupported or differently rendered glyphs do not block comprehension.
- Current role and permission checks remain authoritative for every action.

## Implementation constraints

- The working tree already contains uncommitted user changes, including shared cloud data modules and their tests. Those edits are authoritative input: implementation must inspect and integrate with them, never overwrite, revert, or discard them.
- The design-spec commit intentionally contains only this document. Later commits must stage only files belonging to the redesign and must preserve unrelated user modifications.
- Shared data-contract work must be reconciled with the current on-disk versions before page migration begins.
- Existing behavior tests remain the compatibility contract unless this approved specification explicitly changes the behavior.

## Verification

Automated coverage must include:

- latest math and Chinese diagnoses both survive when one subject has many newer reports;
- verification reports do not replace formal diagnoses;
- undiagnosed subjects are hidden from the diagnosis area;
- each workbench routes to the correct report, follow-up, and upload destinations;
- report summary/evidence/change sections preserve existing content and states;
- every registered WXML page adopts the B+ semantic visual language;
- no critical button relies on emoji alone;
- static checks, deployment readiness, full unit tests, and package-size gates pass.

Visual verification uses WeChat DevTools at representative phone dimensions. Screenshots cover the family workbench, learning profile with two diagnoses, subject home, formal diagnosis, upload, history, paper, English practice, parent management, and AI usage. Checks include overflow, overlap, emoji line-height stability, dynamic text length, empty states, and loading/error states.

The required viewport presets are 375 x 812 and 430 x 932 logical pixels. Deterministic visual fixtures cover: two formal diagnoses, one very long diagnosis judgment, no diagnosis, loading, permission-restricted, partial analysis, and error/retry states.

Migration has an objective static acceptance signal: every registered page root includes the shared `bplus-page` class, uses the shared B+ page shell/state classes instead of defining a parallel global shell, and exposes semantic text labels for icon-only critical actions. A manifest-driven test checks all 21 registered WXML pages. Page-family tests then verify the page-specific icon and compact-layout requirements.

## Non-goals

- Replacing existing product workflows or permission rules.
- Introducing a new navigation architecture.
- Adding decorative image packs, custom fonts, or a third-party icon library.
- Fabricating data or actions that the current backend cannot support.
