# 学习指标与运营观测

> 更新日期：2026-06-15  
> 目标：用已有学习数据回答 MVP 是否稳定跑通、诊断是否可信、验证闭环是否有效。

## 1. 设计原则

1. 指标只从现有 `reports`、`papers`、`reportFeedback` 数据派生，不新增采集点。
2. 输出只包含计数、比例和周趋势，不输出图片文件名、OCR 摘要、题目内容或学生作答过程。
3. 第一版面向单个孩子使用，适合钟青羽这个单人 MVP 的真实数据复盘。

## 2. 本地运行

准备一个本地 JSON 文件，包含以下字段：

```json
{
  "studentId": "student_xxx",
  "reports": [],
  "papers": [],
  "feedback": []
}
```

运行文本摘要：

```bash
METRICS_INPUT=/path/to/student-export.json METRICS_STUDENT_ID=student_xxx npm run metrics:student
```

输出 JSON：

```bash
npm run metrics:student -- --input=/path/to/student-export.json --student-id=student_xxx --json
```

## 3. 指标口径

| 指标 | 计算方式 | 用途 |
| --- | --- | --- |
| 报告数 | 当前学生 `reports` 数量 | 判断样本规模 |
| 分析完成率 | `status=completed` 报告数 / 全部报告数 | 判断后台分析链路是否稳定 |
| 分析失败率 | `failed/timeout` 报告数 / 全部报告数 | 定位运行风险 |
| 上传照片数 | `reports.imageFiles` 或 `imageFileIds` 计数 | 判断输入样本量 |
| 重复照片数 | `imageFiles.isDuplicate=true` 计数 | 判断样本污染程度 |
| 报告质量 | `reports.quality.level/status` 汇总 | 判断结论可信度 |
| 验证通过率 | `verificationEvidence` 中 passed 数 / 目标总数 | 判断学习卡点是否被验证改善 |
| 家长反馈率 | `reportFeedback` 数 / 报告数 | 判断 AI 误判或不确定结论的反馈密度 |
| 周趋势 | 按周汇总报告、试卷、反馈、完成率、验证通过率 | 判断 MVP 是否逐周变好 |

## 4. 解读建议

- 分析完成率低：优先检查云函数超时、批次拆分、图片格式和 AI 返回结构。
- 报告质量不足占比高：优先检查重复上传、模糊图片、OCR 摘要为空和弱证据卡点。
- 验证通过率低：说明学习卡点修复训练或验证题难度需要复核。
- 家长反馈率高：说明 AI 识别、卡点归因或报告表达需要重点优化。

这份指标不是给家长看的成绩单，而是给产品和研发用的仪表盘：它帮助我们判断“错题 → 卡点 → 验证 → 改善”的闭环是不是越来越可靠。
