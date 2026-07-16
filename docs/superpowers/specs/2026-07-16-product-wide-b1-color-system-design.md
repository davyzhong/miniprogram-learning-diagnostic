# Product-wide B1 Color System Design

## 1. Decision

The product adopts the approved **B1 Warm Multicolor** direction for every user-facing mini-program page.

B1 keeps the compact, action-oriented information architecture already established in the product, but replaces the emoji-led visual language with:

- typography hierarchy;
- restrained colored surfaces;
- subject-specific color accents;
- semantic status colors;
- compact borders, labels, and section bands;
- text-first controls that render consistently on Android and iOS.

The redesign changes presentation, not learning logic, permissions, navigation contracts, diagnosis selection, verification-paper behavior, or data models.

## 2. Product Character

The interface should feel like a well-organized family learning planner:

- warm rather than clinical;
- professional rather than childlike;
- colorful rather than monochrome;
- dense rather than spacious;
- actionable rather than decorative.

Color must help the user understand the page. It must not be used merely to make every card different.

## 3. Global Color System

### 3.1 Foundation colors

| Role | Color | Usage |
| --- | --- | --- |
| Navigation ink | `#26383A` | Navigation bars, strong identity blocks, selected structural controls |
| Canvas | `#F8F5EF` | Default page background |
| Card | `#FFFDFA` | Primary content surfaces |
| Primary text | `#253436` | Titles, values, primary labels |
| Body text | `#566568` | Explanations and summaries |
| Muted text | `#778386` | Time, metadata, helper text |
| Border | `#DEDBD2` | Card and row boundaries |

Pure white remains available for high-priority controls and compact contrast surfaces, but does not become the default page background.

### 3.2 Subject colors

| Subject | Accent | Soft surface | Meaning |
| --- | --- | --- | --- |
| Chinese | `#D4483A` | `#FDE1DC` | Chinese reports, review items, Chinese paper workflows |
| Mathematics | `#B37808` | `#FAE9B7` | Mathematics reports, verification items, mathematics progress |
| English | `#4168B7` | `#E1E8FA` | Vocabulary, dictation, English practice and reports |

Subject colors identify ownership. They do not communicate success or failure.

### 3.3 Semantic colors

| Meaning | Accent | Soft surface |
| --- | --- | --- |
| Current priority / needs attention | `#DF5B3F` | `#F8E3DF` |
| Improved / complete / healthy | `#16775E` | `#DFF1E9` |
| Informational / formal report | `#4168B7` | `#E6ECF8` |
| Waiting / verification pending | `#A36C08` | `#F8ECCB` |
| Error / destructive | `#A52F3A` | `#F8DDE1` |
| Neutral / inactive | `#778386` | `#F1EEE7` |

Semantic colors override subject colors only on explicit status labels. A Chinese report can have a red subject border while its “improved” badge remains green.

Error and destructive colors have the highest semantic precedence and must always include explicit text such as `加载失败`, `删除`, or `移除`. Coral is reserved for the current priority and must not be reused for destructive actions.

## 4. Typography

Use the WeChat and device system Chinese font stack to avoid font package cost and Android incompatibility.

Typography supplies hierarchy previously carried by emoji:

- Page title: `34rpx`, weight `700`;
- Section title: `27-30rpx`, weight `700`;
- Card title: `25-28rpx`, weight `600-700`;
- Body: `22-24rpx`, weight `400-500`;
- Metadata and labels: `19-21rpx`, weight `500-600`;
- Critical numeric values: `29-34rpx`, weight `700`.

Only weights `400`, `500`, `600`, and `700` are used. Unsupported intermediate weights must not be required for hierarchy. Letter spacing remains `0`. Long titles wrap to two lines; buttons and status labels remain compact and do not shrink below readable size.

## 5. Surface and Density Rules

- Page horizontal padding: `24-28rpx`.
- Standard card padding: `18-22rpx`.
- Dense row padding: `12-16rpx`.
- Standard vertical gap: `10-16rpx`.
- Card radius: `8-12rpx`; compact tags: `6-8rpx`.
- Avoid cards inside cards. Internal groupings use tinted rows, dividers, or a left accent border.
- Shadows are subtle or absent. Borders and surface contrast establish structure.
- Empty vertical space must carry meaning. Decorative whitespace is not used in operational pages.

## 6. Shared Components

### 6.1 Page header

The page header contains one page title, optional metadata, and at most two compact actions. AI usage remains a single top-level homepage entry.

Native WeChat navigation chrome is part of the system. The global `window.navigationBarBackgroundColor`, `window.backgroundColor`, and any page-level navigation overrides use the B1 foundation colors. Subject pages may keep a subject-aware accent only when text contrast remains compliant; stale navy overrides are not retained.

### 6.2 Summary band

Summary bands use a soft green surface or dark navigation ink depending on importance. They may contain:

- one short label;
- one strong conclusion;
- one supporting sentence;
- up to four compact statistics.

They must not become marketing-style hero sections.

### 6.3 Subject report card

Each diagnosis report uses:

- a subject-colored left or top border;
- report type and date;
- one judgment paragraph;
- compact evidence and change signals;
- one tinted next-action row.

The homepage shows compact report rows. The learning profile shows the expanded report-card form.

### 6.4 Priority action

Only the highest-priority action on a page receives a saturated coral surface. Secondary actions use soft subject or neutral surfaces.

### 6.5 Status badge

Status badges use semantic color, short text, and a stable minimum height. No status depends on an icon, emoji, or color alone.

### 6.6 Text markers

Where a compact visual marker is needed, use stable text:

- subject name: `语文`, `数学`, `英语`;
- ordered step: `01`, `02`, `03`;
- compact letter mark: `AI`, `Aa`, `PDF`;
- state word: `待复测`, `已改善`, `分析中`.

These markers replace emoji and platform-dependent symbols.

## 7. Page-family Application

### 7.1 Family homepage

- Warm canvas and a soft-green family summary band.
- Four statistics use distinct semantic soft surfaces.
- Each child remains one dense card.
- The current priority action uses coral.
- Latest diagnoses use subject-colored rows.
- Three subject quick actions use Chinese, mathematics, and English accents.
- Do not reintroduce duplicate identity, diagnosis, or AI-usage blocks.

### 7.2 Learning profile

- Identity stays in one compact header line.
- Diagnosis reports are the main content and remain more detailed than homepage summaries.
- Each report uses its subject accent and semantic evidence badges.
- Next actions are integrated into the report card.
- AI usage and cost do not appear on the student profile.

### 7.3 Subject workbenches

- The primary action receives the strongest subject surface.
- The latest formal diagnosis remains visible near the top.
- Queue rows use numbers or short text markers.
- Chinese, mathematics, and English keep distinct accents while sharing the same component structure.

### 7.4 Formal diagnosis report

- Use editorial hierarchy rather than many competing cards.
- Major report sections use colored section rules or headers.
- Evidence, improvements, persistent issues, and next actions use semantic colors.
- Long-form reading remains mostly neutral to prevent fatigue.

### 7.5 Learning records and upload history

- Records use a subject-colored left border and readable event name.
- Internal capability codes remain hidden.
- Parent-readable paper numbers such as `数学-20260712-06` remain visible.
- Filters use a compact segmented control.
- Dense metadata stays on one or two lines where possible.

### 7.6 Verification and paper pages

- Paper identity and current state appear in a compact header band.
- Chinese review items use the Chinese accent; mathematics verification uses the mathematics accent.
- Print, preview, upload, and verification actions use text labels and stable CSS shapes only.

### 7.7 English tools

- English vocabulary, dictation, practice, confusion, and wrong-word pages use indigo accents.
- Correct or mastered states use green, not indigo.
- Action controls remain text-first and do not depend on audio or microphone emoji.

### 7.8 Forms, management, AI usage, and utility pages

- Forms use neutral cards with colored section headings, not a unique color per field.
- Destructive actions remain red; normal management actions use navigation ink or green.
- AI usage charts and totals use a restrained multicolor data palette, while explanatory text stays neutral.
- Loading, empty, and error states use typography, borders, and semantic surfaces without decorative emoji.

### 7.9 Registered route matrix

The migration inventory is derived from both `pages` and `subPackages` in `miniprogram/app.json`. All 24 currently registered routes are in scope.

| Route | Family / accent | Required visual treatment |
| --- | --- | --- |
| `pages/index/index` | Family / multicolor | Family summary, dense child cards, subject diagnosis rows, single AI-usage entry |
| `pages/student-profile/student-profile` | Profile / multicolor | Expanded subject diagnoses and integrated next actions |
| `pages/add-student/add-student` | Form / neutral-green | Compact form, clear primary submit state |
| `pages/subject-home/subject-home` | Subject-aware | Subject hero, latest diagnosis, queue and tool hierarchy |
| `pages/upload/upload` | Upload / neutral-green | User-photo preview, readable capture guidance, upload states |
| `pages/upload-history/upload-history` | Records / subject-aware | Segmented filters, compact readable records, no internal codes |
| `pages/report/report` | Report / subject-aware | Editorial diagnosis hierarchy and section navigation |
| `pages/learning-progress/learning-progress` | Progress / semantic | Matrix and legend use semantic state tokens with text labels |
| `pages/bottleneck-center/bottleneck-center` | Subject-aware | Dense cross-subject bottleneck groups, filters and progress states; gold only for active mathematics content |
| `pages/bottleneck-detail/bottleneck-detail` | Subject-aware | Dynamic subject accent for knowledge position, evidence, resources and action hierarchy |
| `pages/knowledge-map/knowledge-map` | Mathematics / gold | Domain labels, progress structure and semantic node states |
| `pages/english-practice/english-practice` | English / indigo | Practice prompt, answer states and progress controls |
| `pages/english-dictation/english-dictation` | English / indigo | Audio state, paper workflow and primary action |
| `pages/english-wrong-words/english-wrong-words` | English / indigo | Dense word rows and mastered/pending states |
| `pages/chinese-review-detail/chinese-review-detail` | Chinese / red | Original wrong item, review stage and verification action |
| `pages/english-confusion/english-confusion` | English / indigo | Word comparison, selected answer and correction state |
| `pages/chinese-skill-task/chinese-skill-task` | Chinese / red | Method, prompt, response field and submit state |
| `pages/learning-resource/learning-resource` | Subject-aware | Resource type labels, source identity and task-pack actions |
| `pages/generate-verification/generate-verification` | Subject-aware | Generation state, paper identity and download action |
| `pages/default-paper/default-paper` | Subject-aware | Paper list, empty state and generation action |
| `pages/paper-preview/paper-preview` | Subject-aware | Paper metadata, question hierarchy and print/upload controls |
| `pages/parent-management/parent-management` | Management / neutral-green | Member rows, role labels and explicit destructive actions |
| `pages/join-student/join-student` | Form / neutral-green | Invitation context, inputs and join state |
| `pages/ai-usage/ai-usage` | Data / restrained multicolor | Totals, period filters, cost categories and readable ledger |

## 8. Accessibility and Compatibility

- No critical meaning depends on color alone.
- Text contrast should meet WCAG AA where practical within WeChat rendering.
- Interactive controls provide an effective hit area of at least `88rpx` by `88rpx`. Compact visible controls may use invisible padding or a larger parent hit area.
- The design uses no emoji, icon font, remote font, or new bitmap asset.
- Existing textual arrows may be replaced by CSS chevrons where Android glyph rendering is inconsistent.
- Dynamic text must be checked at Android and iOS font metrics.

Existing functional media remains supported: user-selected upload thumbnails, generated paper/report content, and current document images are not decorative assets and must not be removed. The installed `WechatSI` integration and its audio behavior remain unchanged; the redesign only replaces platform-dependent visual glyphs around those controls.

## 9. Technical Strategy

Add the B1 tokens and shared primitives to the global stylesheet, then migrate page families incrementally. Page-specific styles may select a subject accent but should not redefine foundation colors.

Update `miniprogram/app.json` and all page-level JSON navigation overrides as part of the same migration so native navigation and page content do not expose two competing color systems.

The migration must preserve existing WXML event handlers, navigation targets, permission paths, presenter output contracts, upload behavior, paper generation and preview behavior, Chinese verification behavior, and English audio/practice behavior. Structural WXML changes are limited to removing unstable icon text, adding semantic class names, and correcting hierarchy or duplication.

Old emoji-specific helpers and tests should be removed only after all consumers have migrated.

## 10. Acceptance Criteria

- Every registered user-facing page uses the B1 foundation tokens.
- A manifest-driven test resolves all 24 routes from `miniprogram/app.json` and fails when any route lacks the B1 page shell or shared tokens.
- A static UI scan checks repository-authored string literals in `miniprogram/pages/**/*.{wxml,js}` and `miniprogram/utils/**/*.js`, including general utilities and dynamically bound `icon` fields, and finds no decorative emoji.
- The scan may ignore comments, runtime user/generated content that is not a repository-authored literal, and native WeChat API option values such as `wx.showToast({ icon: 'none' })` or `icon: 'success'`.
- Chinese, mathematics, and English surfaces use their defined accent and soft-surface token pairs.
- Priority, improved, waiting, error, destructive, and neutral states use their defined semantic token pairs plus readable text.
- The family homepage and learning profile preserve their current diagnosis and action content without duplicate blocks.
- At a `375 × 812` viewport, the family homepage first screen contains the header, family summary, first child's identity, four statistics, priority action, and at least one diagnosis row.
- At a `375 × 812` viewport, the learning profile first screen contains the header, first report judgment, signal row, integrated next action, and the beginning of the next report when two reports exist.
- At a `375 × 812` viewport, learning records show the filter control and at least two normal-length record cards.
- No new image, font, or runtime dependency is added.
- `npm run check:size` passes the existing `800 KB` internal main-package budget.
- `miniprogram/app.json` and every page-level JSON navigation override use the approved B1 navigation/background tokens or an explicitly subject-aware approved token.
- Visual verification covers WeChat DevTools Android `360 × 800` and iPhone `390 × 844` profiles at default and `1.2×` font scale.
- A release smoke check on an available physical Android device confirms no blank glyphs, clipped text, overlap, or broken audio/upload controls.
- Existing page-flow, presenter, permission, navigation, upload, paper, Chinese verification, and English interaction tests pass without business-contract changes.

## 11. Visual Reference

The approved interactive mockup is the **B1 Warm Multicolor** option in the local visual companion session:

`.superpowers/brainstorm/98310-1784204002/bplus-color-directions.html`

The mockup is a design reference only and is excluded from Git.
