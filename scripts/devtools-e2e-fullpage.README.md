# DevTools 全量页面回归（E2E）

> 通过 `miniprogram-automator` 驱动微信开发者工具，注入 cloud mock，覆盖全部 17 个页面 + 6 个跨页交互场景，每个页面都做真实渲染断言（不只是判断"没报错"）。

## 流程

```
npm run test:e2e:doctor      # 1. 环境探测：DevTools CLI / automator / project.config
   ↓
npm run test:e2e:fullpage    # 2. 全量 17 页 + 6 场景回归
```

## 前置条件

1. **微信开发者工具**已安装并至少手动启动过一次（让 CLI 跑得起来）
2. **DevTools 服务端口**已开启：`设置 → 安全设置 → 安全 → 服务端口`
3. **miniprogram-automator** 已安装：
   ```bash
   npm i --no-save miniprogram-automator
   ```
   或在 `/tmp/learning-diagnostic-automator/node_modules/miniprogram-automator` 留一份备份。

如果 DevTools 装在非默认位置：
```bash
export WECHAT_DEVTOOLS_CLI=/path/to/cli
```

## doctor 输出示例

```
========== DevTools CLI 环境探测 ==========
平台: darwin 23.4.0
项目: /Users/qiming/.../miniprogram-learning-diagnostic

✓  DevTools CLI 可达
     /Applications/wechatwebdevtools.app/Contents/MacOS/cli (1.06.2503282)
✓  miniprogram-automator
     已加载 (project); exports: launch, connect, Automator, Page, Element...
✓  project.config.json
     appid=wx... miniprogramRoot=miniprogram
!  DevTools 进程在监听端口
     lsof 未看到 wechatwebdevtools 监听
     → 请先手动打开 DevTools 一次（GUI 启动），再回到这里。
✓  automator.launch()
     platform=devtools SDK=3.4.5 model=iPhone 14; 初始 pageStack 长度 1

汇总: 0 失败, 1 警告, 4 通过
环境基本就绪，但有警告；可继续跑 E2E，注意观察。
```

退出码：`0` 就绪、`1` 失败、`2` 用户没装 DevTools/automator。

## fullpage 输出示例

```
========== 全量 17 页面回归测试（带断言）==========
系统: platform=devtools SDK=3.4.5 model=iPhone 14

--- Phase 1: 单页加载 (17 页) ---
✓ [1823ms] index 首页/家庭工作台
✓ [1560ms] student-profile 学生档案
✓ [1240ms] add-student 添加学生
✗ [2100ms] subject-home 数学学科工作台
     ASSERT FAIL: 缺少文本: 下一步建议
     CONSOLE ERR: Cannot read property 'nextAction' of undefined
...

--- Phase 2: 跨页交互场景 ---
✓ [3200ms] scenario: 家庭工作台 → 学生档案 → 家长管理 → 生成邀请
✓ [4500ms] scenario: 学科工作台 → 拍照 → 学习记录 → 默认试卷
✗ [2100ms] scenario: 卡点中心 → 筛选数学 → 卡点详情
     STEP FAIL: tapByText — 未找到 .bottleneck-card 含文本 "审题理解"

========== 汇总 ==========
总计: 23 (17 页面 + 6 场景)
通过: 21
失败: 2
截图: 2
报告: tmp/e2e-fullpage/report.json
```

## 报告结构

输出 `tmp/e2e-fullpage/report.json`：

```json
{
  "timestamp": "2026-06-17T...",
  "summary": { "total": 23, "passed": 21, "failed": 2, "pages": 17, "scenarios": 6, "screenshotsTaken": 2 },
  "results": [
    {
      "name": "subject-home 数学学科工作台",
      "route": "/pages/subject-home/subject-home?...",
      "status": "FAIL",
      "durationMs": 2100,
      "assertions": [
        { "name": "rootCheck", "ok": true },
        { "name": "expectText", "fail": "缺少: 下一步建议", "actualText": "..." }
      ],
      "consoleErrors": ["..."],
      "realConsoleErrors": ["Cannot read property..."],
      "screenshot": "tmp/e2e-fullpage/screenshots/...png"
    }
  ]
}
```

失败页面会自动截图到 `tmp/e2e-fullpage/screenshots/`。

## 与现有脚本的关系

| 脚本 | 范围 | 断言强度 |
| --- | --- | --- |
| `devtools-fullpage-smoke.js` | 17 页加载不报错 | 弱（只采集 error） |
| `devtools-parent-timeline-e2e.js` | 19 个交互场景 | 强（但只覆盖家长/时间线） |
| `devtools-english-e2e.js` | 英语模块 | 强（专域） |
| **`devtools-e2e-fullpage.js`（新）** | **17 页 + 6 跨页场景** | **强（每个页面都断言关键文本）** |

`devtools-e2e-fullpage.js` 是 `devtools-fullpage-smoke.js` 的强化版（把 smoke 改成了"必须出现的文本"），不是替代品；smoke 仍适合做轻量回归。
