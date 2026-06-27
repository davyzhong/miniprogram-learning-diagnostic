# Dependencies & Integrations

<!-- Generated: 2026-06-25 | Files scanned: 254 | Token estimate: ~500 -->

## 外部服务

| 服务 | 用途 | 使用方 |
|------|------|--------|
| **CloudBase AI (混元 hy3-preview)** | 多模态 OCR + 错题分析 | analyzeBatch, englishVocabulary |
| **CloudBase AI (deepseek-v4-flash)** | 验证卷出题 + 资源包生成 | generatePaper, learningResource |
| **CloudBase 云存储** | 图片/PDF 存储 | uploadAndAnalyze, generatePaper |
| **CloudBase 云数据库** | 12 collections | 所有云函数 |
| **微信 wx.cloud** | 前端→云函数调用 | miniprogram/utils/cloud.js |

## AI 调用模式

```
# 多模态（图片分析）
analyzeBatch:   ai.createModel('cloudbase').generateText({ model:'hy3-preview', messages:[{role:'user', content:[{text}, {image_url}]}] })

# 文本生成（出题）
generatePaper:  ai.createModel('cloudbase').generateText({ model:'deepseek-v4-flash', messages:[{role:'user', content:prompt}] })
```

## PDF 生成

```
PDFKit (pdfkit)  → cloudfunctions/generatePaper/pdf-renderer.js
  ├── NotoSansCJKsc-Regular.otf  内置中文字体
  ├── A4 双栏布局 + 演算区
  └── 学生页(流式分页) + 答案页
```

## 测试框架

```
Node.js 内置 test runner (node --test)
tests/*.test.js  共 611 tests
tests/helpers/   cloud-function-harness.js (mock cloud/db)
```

## 无第三方 npm 运行时依赖

前端和云函数运行时仅依赖：
- `wx-server-sdk` (微信云开发 SDK)
- `@cloudbase/node-sdk` (CloudBase Node SDK)
- `pdfkit` (仅 generatePaper)
- 开发依赖：`miniprogram-automator`（E2E 测试）

## 部署约束

- CloudBase 每个云函数独立打包 → `_shared/` 须内联副本
- 主包 ≤ 2MB（当前 ~1028KB）
- 单云函数超时 60s → 分批追加模式规避
- `data/*.json` 不随云函数上传 → 用 `.seed.js` 或内联 `taxonomy-bn-list.js`
