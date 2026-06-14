# 2026-06-14 首页工作台到孩子档案点击测试

## 背景

本轮修复针对"多孩子家庭工作台点击孩子卡片后不能进入孩子学习档案"的问题。

根因是之前只用页面单元测试验证了 `onStudentTap`，但真实 WXML 中孩子卡片主体绑定的是通用 `onTraceableUrlTap`。测试覆盖没有命中真实点击链路，导致交付前没有发现该交互风险。

## 修复

- 孩子卡片主体改为显式绑定 `onStudentTap`。
- 卡片内的状态块、学科行、最近试卷、下一步仍保留各自的 `catchtap` 精准跳转。
- `scripts/devtools-parent-timeline-e2e.js` 的 mock 改为两个孩子，强制首页进入家庭工作台模式。
- 新增 DevTools 用例：`点击孩子卡片主体：进入该孩子学习档案`。

## 验证结果

命令：

```bash
npm run test:devtools-parent-timeline
```

结果：

- 18/18 通过
- 失败数：0
- 小程序异常数：0
- 覆盖重点：
  - 多孩子首页只显示家庭工作台
  - 点击孩子卡片主体进入 `pages/student-profile/student-profile`
  - 学习档案页可继续进入家长管理、卡点中心、学习记录、报告、验证卷

同时执行：

```bash
npm run verify
```

结果：

- 236/236 测试通过
- 81 个 JavaScript 文件检查通过
