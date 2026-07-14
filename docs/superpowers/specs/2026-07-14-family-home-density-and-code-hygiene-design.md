# Family Home Density and Internal Code Hygiene Design

## Goal

Finish the B+ migration of the family learning workbench and remove internal identifiers from every user-facing mini-program surface. The family page keeps its current information architecture, but uses materially less vertical space and much stronger semantic iconography. Learning records and related pages show readable learning concepts or compact counts instead of implementation codes.

## Confirmed Product Decisions

- Keep all existing child-card sections: four status metrics, priority action, three-subject status, latest formal diagnosis, and quick links.
- Compress those sections instead of removing them. The common phone viewport should expose the important state of two children with substantially less empty space than the current page.
- Use semantic emoji and lightweight CSS graphics. Do not add image assets, icon fonts, or dependencies.
- Never expose internal identifiers such as `BN-*`, `LP-*`, `ERR-*`, knowledge-node IDs, resource IDs, task-page codes, report database IDs, or raw cloud IDs.
- Human-oriented paper display codes such as `数学-20260712-06` may appear only on the paper workbench/detail page. Timeline cards, family cards, reports, uploads, and general lists hide them.
- Internal identifiers remain available in data fields, route parameters, analytics, and lookup logic. The restriction applies to rendered text and user-facing presenter fields, not system behavior.

## Family Workbench Design

### Header and Household Summary

The top row uses icon-labeled controls for AI usage and adding a child. The household summary becomes a compact B+ dashboard band rather than a large text hero. It contains:

- a family icon and one-line household status;
- compact icon metrics for children, pending actions, improvements, and formal diagnoses;
- one clear action target;
- no decorative empty area or large marketing-style copy.

### Child Identity Row

Each child card starts with a single compact identity row:

- small avatar or child icon;
- name, grade, role, and recent-update text;
- semantic status icon and short status label;
- profile action on the same row.

The row should not exceed the height needed for two lines of metadata. The card border color continues to communicate whether follow-up is pending or clear.

### Four Metrics

The current four metrics remain, but become a single dense status strip. Each item contains an icon, number, and short label in one compact cell. Cells use restrained color coding and stable grid dimensions. Padding and minimum height are reduced, while tap targets remain usable.

### Priority and Secondary Actions

The priority action becomes the strongest row in each child card. It contains a task icon, short label, one-line or two-line action summary, and a compact action affordance. Secondary actions use two compact icon rows instead of tall text cards.

### Subject Status

Math, Chinese, and English rows use subject icons and subject-specific accent colors. Each row exposes subject name, a short readable state, and one action. Long bottleneck lists are compacted to two or three readable concepts plus a count. Hidden subjects remain visually subdued.

### Diagnosis and Quick Links

The latest formal diagnosis remains a primary child-card element. It uses a report icon, subject icon, short judgment, diagnosis coverage, and a clear report action. Quick links become compact icon buttons with short labels; supporting copy is removed where the label and icon are sufficient.

### Density Constraints

- Reduce child-card outer and inner vertical padding by roughly 25-35% from the current implementation.
- At the 390 x 844 logical-pixel DevTools viewport with two representative children, the first viewport must show the complete household summary, the complete first-child identity/metrics/priority block, and at least the second child's identity row. At 430 x 932, it must also show the second child's metric strip.
- Reduce large rounded corners to the B+ maximum of 8 px equivalent where practical.
- Avoid stacked section labels that consume a separate full row when an icon-labeled divider can carry the same meaning.
- Keep fixed grid tracks and wrapping rules so long Chinese text cannot overlap controls.
- Do not remove data or make tap targets smaller than practical mini-program controls.

## Internal Code Hygiene

### Identifier Classification

The following values are internal and must never appear in rendered text:

- bottleneck identifiers: `BN-*`;
- legacy learning-point identifiers: `LP-*`;
- error identifiers: `ERR-*`;
- knowledge-node and resource identifiers such as `MATH-*`, `NODE-*`, and `RES-*` when used as IDs;
- task-page codes and verification page codes;
- Mongo/CloudBase document IDs, file IDs, and raw route IDs;
- fallback strings created by joining raw identifier arrays.

### Presentation Policy

All presenter output follows this priority:

1. Use an explicit readable title, display name, taxonomy title, or mapped label.
2. If several readable names exist, show at most three names followed by a remaining-count summary.
3. If names cannot be resolved, show a semantic aggregate such as `覆盖 39 个数学学习卡点`.
4. If neither names nor a reliable count exists, show a neutral phrase such as `覆盖本轮重点学习内容`.
5. Never fall back to the raw identifier.

This policy applies to summaries, chips, titles, statuses, empty states, toast text, PDF-facing labels generated by mini-program presenters, and accessibility labels.

### Learning Record Redesign

The paper event card contains only:

- semantic paper icon, subject, and event time;
- readable coverage summary;
- current lifecycle status;
- compact page/question counts when meaningful;
- one next action.

The general timeline does not show the paper display code. It also does not repeat student-page, answer-page, and task-pack metadata when those values do not help the parent choose an action. Repeated paper cards from the same day remain separate records when they represent separate workflows, but their content stays compact.

### Shared Sanitizer

Introduce a small presentation utility that can:

- detect internal-code-shaped strings;
- remove or replace codes embedded in mixed prose;
- resolve known bottleneck and learning-point IDs through existing taxonomy helpers;
- compact readable name lists;
- provide semantic count fallbacks.

Presenters should sanitize at their output boundary. WXML should never be responsible for recognizing IDs. Route payloads and dataset attributes may continue to carry IDs.

## Scope of Audit

Audit every registered user page and its presenter, with special attention to:

- family workbench and child cards;
- learning records;
- report and verification feedback;
- paper preview and upload context;
- bottleneck center/detail and knowledge map;
- verification generation and learning resources;
- subject home and learning progress.

Static source matches inside data seeds, route construction, comparisons, and tests are allowed. User-facing literals and presenter return values are not.

## Error and Compatibility Behavior

- Legacy records containing only IDs must still render. They use mapped titles or semantic count summaries.
- Missing taxonomy entries must not crash rendering and must not reveal the unknown ID.
- Existing navigation continues to use the original IDs internally.
- Existing human paper codes remain available on paper detail pages for parents who need to distinguish printed sheets.
- Loading, empty, permission-restricted, and failure states follow the same code-hygiene rules.

## Testing

### Unit Tests

- Sanitizer tests cover standalone IDs, IDs embedded in prose, mixed readable text and IDs, unknown IDs, and count fallback.
- Child-workbench tests assert icon fields and compact summaries for every section.
- Upload-history tests use fixtures containing long `BN-*` arrays and assert that no internal code reaches event titles, summaries, chips, or status text.
- Paper detail tests verify that the human paper display code remains visible only on the paper workbench/detail presenter.

### Static Gate

Add a manifest-driven user-facing code-hygiene test. It derives its complete page list from the main package and subpackages registered in `miniprogram/app.json`, scans WXML text bindings and presenter fixtures for internal identifier leakage, and explicitly allows route/data attributes and implementation-only source fields. The gate should report the page and field that leaked; a newly registered page cannot bypass the audit.

### Regression and Visual Verification

- Run the complete unit suite and JavaScript checks.
- Run package-size validation; the main package must remain under the current 800 KB internal budget.
- Run DevTools core E2E and the knowledge-map flow.
- Inspect family workbench and learning records on iPhone 12/13 dimensions with two children, long names, long readable bottleneck titles, and legacy ID-only records.
- Verify no overlap, no truncated action controls, no excessive whitespace, and no visible internal IDs.

## Success Criteria

- The family workbench visibly matches the icon-rich B+ language used by the diagnosis workbench.
- All existing child-card information remains available with clearly higher information density.
- The important state of two children is substantially more visible in the first viewport.
- No internal identifier appears in any audited user-facing surface.
- Learning-record paper cards are concise, readable, and action-oriented.
- Existing navigation, diagnosis, paper, and verification workflows continue to pass automated tests.
