# 项目文档与 README 全面更新设计

> 日期：2026-07-18
> 状态：已确认（方案 A：产品展示型）

## 目标

以当前 `main` 分支代码为唯一事实来源，重建一套适合 GitHub 展示、项目维护和产品交付的文档体系。README 要在首屏说明产品价值，并用脱敏截图呈现真实产品形态；详细操作、工程实现和历史记录分别进入独立文档，避免重复。

## 信息架构

1. **GitHub 项目主页**：`README.md`。依次呈现产品定位、核心闭环、界面画廊、三学科差异、工程能力、快速开始、质量基线和文档导航。
2. **产品使用层**：`docs/user-guide/README.md`。使用 14 张统一尺寸的脱敏截图说明家庭工作台、诊断、验证、学习记录、语文和英语闭环。
3. **当前规范层**：PRD、项目计划、架构、云函数、数据字典、部署、测试、指标、发布和排障文档。统一更新日期、规模、状态、命令和交叉链接。
4. **专题设计层**：`docs/product/` 与 `docs/subject-design/` 的入口文档说明当前落地状态和推荐阅读顺序。
5. **历史层**：`docs/superpowers/specs/`、`plans/`、`docs/test-reports/` 和带日期的评审材料保留历史原貌，不把旧结论伪装成当前状态。

## README 视觉与内容设计

- 使用现有品牌 Logo，不引入额外运行时资源。
- 首屏使用简洁标题、定位文案、状态徽章和两张关键界面截图。
- 用流程图说明“拍照诊断 -> 定位卡点 -> 行动与验证 -> 持续改善”。
- 使用 2 到 3 列截图画廊展现家庭工作台、报告、数学、语文和英语工作台。
- 避免把完整操作手册复制进 README；所有细节链接到用户导览。
- 所有截图由 `scripts/generate-readme-screenshots.js` 使用匿名 mock 数据生成，严禁真实姓名、账号、学校、试卷照片、云文件地址和内部编码。

## 事实基线

- 25 个注册页面：8 个主包页面、17 个独立分包页面。
- 14 个业务云函数；`_shared-templates` 只作为共享模板目录，不计入业务云函数。
- 17 个云数据库集合，以 `SETUP.md` 的显式创建清单与代码实际读写的并集为准。
- 仓库有 89 个 `*.test.js` 文件；默认离线集执行其中 84 个，2026-07-18 本地 `npm test` 为 1008/1008 通过。其余 5 个是两个显式 E2E 和三个专项数学管线测试，按对应命令独立执行。
- emoji 兼容库为首批 202 项和第二批 996 项双端通过候选；生产页面是否使用由界面白名单和独立兼容实验页共同约束。
- 当前首页孩子卡顺序为身份与快捷操作、最新诊断、行动建议、四项统计和紧凑学科入口。

## 更新边界

- 允许修改的当前文档以 `scripts/check-docs.js` 的 `canonicalDocs` 清单为准，另包括 `CHANGELOG.md`、本规格、对应实施计划和截图生成/文档校验脚本。任何未列出的 Markdown 默认只读；如确需增加当前文档，必须先加入清单并说明职责。
- 修正过期数字、界面描述、集合数量、云函数数量、命令和文档链接。
- 不重写 `docs/test-reports/**`、既有 `docs/superpowers/plans/**`、既有 `docs/superpowers/specs/**`、`docs/TEST_CONSOLIDATION_PLAN.md`、`docs/TEST_STRATEGY_V2.md`、带日期的代码评审和性能报告；本次新增的规格与计划除外。最终使用 `git status --short`（包含未跟踪文件）和 `git diff --name-only HEAD` 核对受保护路径无意外改动。
- 不在本次文档任务中改变产品代码行为；截图生成所需的 mock 数据可按当前 UI 合同修正。

## 验收

1. `npm test`、`npm run check`、`npm run check:size` 通过。
2. `01-family-workbench.png` 至 `14-english-wrong-words.png` 共 14 张截图全部重新生成，均为 390 × 753 PNG；逐张检查无裁切、空白页或布局错位。
3. 截图匿名姓名白名单固定为 `学生示例`、`孩子A`、`家长A`；已知真实姓名拒绝清单为 `钟青羽`、`钟筱雨`，并允许通过 `README_SCREENSHOT_FORBIDDEN_NAMES` 追加。截图生成器对 URL 解码后的路由和渲染文本使用同一组规则，拒绝 `cloud://`、`wxfile://`、`LP-`、`BN-`、openid、手机号、学校/班级/账号字段、24 位数据库 ID 和 UUID；允许家长可读的“学科-YYYYMMDD-序号”验证卷编号。另对 14 张输出逐张目视复核。
4. README 和当前规范 Markdown 的相对链接从各自文件目录解析，目标全部存在；图片引用只允许仓库相对路径或公开 HTTPS 徽章。
5. 当前文档中不得继续出现 `916/916`、`1006/1006`、`311 文件`、`15 个集合`、`202 个 emoji 全量接入`等已被本基线替代的当前状态声明；历史材料不参与该扫描。
6. 依次运行 `node scripts/generate-readme-screenshots.js`、`npm run check:docs`、`npm test`、`node --test --test-concurrency=1 tests/math-bottleneck-hierarchy.test.js tests/math-history-reanalysis.test.js tests/math-learning-map-pipeline.test.js`、`npm run check`、`npm run check:size`、`git diff --check`，均以退出码 0 完成。默认离线基线为 1008/1008，新增脚本后的 JS 基线为 313 个文件，主包为 789 KB/1200 KB；两个显式真实环境 E2E 不属于本次纯文档验收。
