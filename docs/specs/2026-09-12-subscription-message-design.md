# 订阅消息推送设计（Subscription Message Design）

**日期**：2026-09-12 ｜ **状态**：设计定稿待实施 ｜ **关联**：PRD P0"异步推送"（唯一未闭环项）、HANDOFF 遗留 #2

## 1. 问题

分析全程 6-10 分钟、验证卷生成 2-8 分钟，用户没有任何完成通知，只能开着页面轮询。微信订阅消息是唯一合规的触达通道，但它是**一次性授权**制：用户授权一次，服务端只能发一条。设计难点因此不是发送本身，而是**授权库存与推送事件的匹配**。

## 2. 事件清单（三个，全部服务端触发）

| 事件 | 触发点 | 数据源（均已存在） |
| --- | --- | --- |
| E1 分析完成 | analyzePhotos 写入 report completed/failed | 报告状态落库处（现 `sendNotification` 空壳，`analyzePhotos/index.js:315`） |
| E2 验证卷就绪 | generatePaper / regenerateVerificationPaper 写入 ready/failed | `generationStatus` 终态写入处 |
| E3 复测到期 | 到期复测提醒 | `interventionSessions.nextReviewAt`（每日定时触发器扫描） |

## 3. 授权库存模型（核心设计）

**授权余额账本**：集合 `subscriptionGrants`，文档 `{ openid, templateKey, grantedAt, consumedAt }`。每次用户点授权 → 记一条未消费 grant；每次发送 → 消费一条最旧 grant（原子 `where consumedAt not exists + update`）；发送失败或无余额 → 静默放弃（页内轮询已是兜底）。

**补充授权的时机（在用户有动机时请求，不做无来由弹窗）**：

| 动作 | 顺带请求授权 | 预期事件 |
| --- | --- | --- |
| 提交上传（诊断/验证作答） | E1 ×1 | 本次分析完成 |
| 下载/预览验证卷 | E2 ×1 | 下一张自动生成的卷 |
| 点击"到期复测"卡 | E3 ×1 | 下次到期 |

原则：**每个授权对应一个用户可预期的事件**，余额不囤积（只请求当次动作相关的一类）。

## 4. 云函数与配置

- 新建云函数 `sendSubscribeMessage`（Nodejs，60s 超时不需要——发送是短操作，默认即可）：
  - action=`send`：参数 `{openid, templateKey, data, page}`；内部走微信云调用 `cloud.openapi.subscribeMessage.send`（云开发身份免 access_token，无密钥）。
  - 供 analyzePhotos / generatePaper / 定时触发器 fire-and-forget 调用（失败写 `errorEvents` 台账，已就绪）。
- 模板 ID 不硬编码：`process.env.SUB_TPL_ANALYSIS / SUB_TPL_PAPER / SUB_TPL_REVIEW`，SETUP 文档写明在小程序后台申请哪三类字段。
- 前端封装 `utils/subscription.js`：`ensureGrant(templateKey)`（wx.requestSubscribeMessage 包装 + 上报 grant 到账本）。

## 5. 降级与边界

- 无余额 / 用户拒绝 / 模板下线：不发送、不重试，依赖现有轮询与首页状态卡（已就绪）。
- E3 定时触发器每日一次（CloudBase 定时触发器，cron `0 0 9 * * * *` 北京时间），扫描 `nextReviewAt ≤ 今天` 且未提醒的会话。
- 隐私：推送文案不含错题内容，只含"某学科诊断已完成，点击查看"级摘要。

## 6. 分阶段落地

1. **P1**：E1（分析完成）全链 + 授权时机 1 + 账本 + sendSubscribeMessage —— 解决最高频的等待痛点。
2. **P2**：E2 + 授权时机 2。
3. **P3**：E3 + 定时触发器 + 授权时机 3。

每阶段验收：真机收到推送且点击落到对应页面；余额不足时功能无损；`errorEvents` 无发送异常风暴。单测覆盖：账本消费原子性（借 cloud-function-harness）、ensureGrant 状态机（借 page harness）；E2E 按现有 DevTools 套件扩展一条"上传→授权→完成"链路（mock 发送）。
