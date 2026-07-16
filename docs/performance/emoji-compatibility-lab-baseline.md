# Emoji 兼容性测试页包体基线

## 实施前

- 日期：2026-07-17（Asia/Shanghai）
- 命令：`npm run check:size`
- 源码主包：680 KB
- 仓库预算：800 KB
- 剩余预算：120 KB
- DevTools CLI：`/Applications/wechatwebdevtools.app/Contents/MacOS/cli`
- DevTools 探测：5 项通过，0 项失败，0 项警告
- 小程序基础库：3.16.1
- 模拟器型号：iPhone 12/13 (Pro)
- 稳定提交基线：`28aad31`
- DevTools Preview 总包：822,540 字节
- DevTools Preview 主包：581,254 字节

## 实施后

- 日期：2026-07-17（Asia/Shanghai）
- 命令：`npm run check:size`
- 源码主包：679 KB
- 源码主包变化：-1 KB
- DevTools Preview 总包：847,737 字节
- DevTools Preview 主包：582,545 字节
- 图标测试分包：23,906 字节
- DevTools 主包变化：+1,291 字节
- 主包上限：2,097,152 字节
- 功能主包增量上限：30,720 字节
- 结论：主包大小通过；主包增量通过；测试页成功隔离到独立分包。

## 验证结果

- JavaScript 静态检查：通过，283 个文件。
- 完整单元测试：865/865 通过。
- 覆盖率门禁：通过；全局行覆盖率 91.35%，函数覆盖率 86.08%。
- DevTools 自动化：成功打开 `pages/icon-compatibility/icon-compatibility`。
- 首屏状态：C01，7 个渲染项，14 个分类标签；页面数据未包含其他分类项目。
- 预览二维码：`tmp/emoji-lab-preview-qr.png`（临时文件，不进入版本库）。
- 真机 Emoji 判定：等待 Android 扫码后按 `pass / fail / uncertain` 反馈。
