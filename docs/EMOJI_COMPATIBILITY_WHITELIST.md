# 小程序 Emoji 真机兼容白名单

> 基线日期：2026-07-18
>
> 适用范围：微信小程序 Android 与 iOS 正式界面
>
> 权威结果：`scripts/emoji-compatibility/device-results-2026-07-18.json`

## 1. 当前结论

| 批次 | 候选数 | Android | iOS | 正式白名单 |
|---|---:|---:|---:|---:|
| B01 | 202 | 202 通过 | 202 通过 | 202 |
| B02 | 1000 | 996 通过、4 个方格 | 1000 通过 | 996 |
| 合计 | 1202 | 1198 双端通过 | 1202 通过 | 1198 个唯一字形 |

正式界面采用“双端均通过”原则。B02 除以下 4 项外全部加入白名单：

| 测试编号 | 字形 | 名称 | Android | iOS | 结论 |
|---|---|---|---|---|---|
| `B02-C01-007` | 🪎 | 宝箱 | 方格 | 通过 | 禁用 |
| `B02-C02-024` | ▶️ | 播放按钮 | 方格 | 通过 | 禁用 |
| `B02-C09-031` | 🛘 | 山体滑坡 | 方格 | 通过 | 禁用 |
| `B02-C17-013` | 🪊 | 长号 | 方格 | 通过 | 禁用 |

本结果来自产品负责人在 Android 和 iOS 微信小程序真机端的人工验收。未记录具体手机型号、系统版本和微信版本，因此结论代表当前目标设备基线，不应推断为所有历史设备的普遍兼容承诺。

## 2. 开发调用

正式页面不得直接写 Emoji 字面量，统一从 `miniprogram/utils/ui-symbols.js` 调用：

```js
const { symbolOf } = require('../../utils/ui-symbols')

const icon = symbolOf('B02-C03-001')
```

- B01 常用图标继续使用稳定语义键，例如 `symbolOf('report')`、`symbolOf('calendar')`。
- B02 使用冻结测试编号，例如 `symbolOf('B02-C12-004')`，便于从测试页、文档和代码反查同一字形。
- 失败编号返回空字符串，例如 `symbolOf('B02-C01-007') === ''`。
- 所有入口、按钮和状态必须保留文字，Emoji 仅用于辅助识别。
- 新设计优先从语义明确、视觉尺寸稳定的通过项中选择，不应因为白名单扩大而一次性堆满页面。

## 3. 数据与生成链路

| 文件 | 职责 |
|---|---|
| `scripts/emoji-compatibility/batch-02-manifest.json` | 冻结 1000 项测试编号、字形、名称和 Unicode 序列 |
| `scripts/emoji-compatibility/device-results-2026-07-18.json` | 冻结 Android/iOS 实测结果和 4 个失败编号 |
| `miniprogram/utils/ui-symbols-batch-02.js` | 生成的 996 项紧凑生产白名单，不手工编辑 |
| `miniprogram/utils/ui-symbols.js` | 业务页面唯一调用入口 |
| `miniprogram/pages/icon-compatibility/emoji-candidates-batch-02.js` | 测试页面完整数据，仍保留在独立分包 |

更新测试结果后执行：

```bash
npm run emoji:batch02:runtime
npm run emoji:batch02:runtime:verify
node --test tests/ui-symbols.test.js tests/emoji-batch-02.test.js tests/emoji-candidates.test.js tests/bplus-design-system.test.js
```

生成器会校验 `candidateCount`、`approvedCount` 和失败编号；生成文件与结果快照不一致时，验证命令会失败。

## 4. 后续维护规则

1. 新增或修改结果时，保留日期、平台、微信端环境和精确测试编号。
2. 任一目标平台显示方格、拆分序列或错误字形，该项不得进入正式白名单。
3. 若复测设备范围扩大，新增结果快照，不覆盖历史证据；确认新基线后再切换生成器输入。
4. 页面改版只通过 `symbolOf()` 取图标，测试页数据不得被业务页面直接引用。
5. B02 生产白名单使用编号计算和紧凑字形表，源码约 11 KB；后续扩批必须继续记录包体变化并受项目 1200 KB 主包预算（2026-07-18 由 800 KB 上调）及微信 2 MB 限制约束。
