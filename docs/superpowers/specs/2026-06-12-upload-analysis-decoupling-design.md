# 上传与分析完全解耦设计

**日期**: 2026-06-12
**状态**: 已确认

## 问题

`uploadAndAnalyze` 云函数在第 120 行同步 `await cloud.callFunction({ name: 'analyzePhotos' })`，导致：

1. 函数执行时间 = 上传处理时间 + 全部批次 AI 分析时间（可达数分钟）
2. 客户端被迫设置 20s 超时兜底，增加错误处理复杂度
3. 云函数长时间占用执行资源

## 方案：Fire-and-Forget

`uploadAndAnalyze` 调用 `analyzePhotos` 时不 await，立即返回。分析在后台独立执行。

## 变更清单

### 1. `cloudfunctions/uploadAndAnalyze/index.js`

**删除**：第 120-128 行的 await + 结果校验

```javascript
// 删除
const analyzeRes = await cloud.callFunction({
  name: 'analyzePhotos',
  data: { reportId },
});
if (!analyzeRes.result || analyzeRes.result.success === false) {
  throw new Error(analyzeRes.result && analyzeRes.result.error
    ? analyzeRes.result.error
    : '图片分析启动失败');
}
```

**替换为**：

```javascript
cloud.callFunction({
  name: 'analyzePhotos',
  data: { reportId },
}).catch(err => console.error('[uploadAndAnalyze] analyzePhotos 启动失败:', err.message));
```

**返回值**：`message` 从 `'分析完成'` 改为 `'分析已启动'`

### 2. `miniprogram/pages/upload/upload.js`

**删除**：`{ timeout: 20000 }` 参数和 catch 中的超时错误分支

```javascript
// 删除
}, { timeout: 20000 })

// 删除 catch 中的超时分支
if (analysisSubmitted && cloud.isTimeoutError(err)) {
  wx.showToast({ title: '已提交，AI将在后台分析', icon: 'none', duration: 2500 })
  setTimeout(() => wx.navigateBack(), 1200)
} else {
```

**替换为**：uploadAndAnalyze 秒回，不再需要 timeout。catch 只处理真正的错误。

```javascript
await cloud.callUploadAndAnalyze({...})

wx.showToast({ title: '已提交，AI 正在分析', icon: 'success', duration: 2000 })
setTimeout(() => wx.navigateBack(), 1200)

// catch 中
} catch (err) {
  wx.hideLoading()
  this.setData({ uploading: false })
  console.error('上传或提交分析失败', err)
  wx.showToast({ title: err.message || '上传失败，请重试', icon: 'none' })
}
```

### 3. 测试文件

- `tests/cloud-functions.test.js`：uploadAndAnalyze 测试不再断言 analyzePhotos 的返回结果，改为断言 `cloud.callFunction` 被调用（不等待返回）
- `tests/page-flows.test.js`：upload 测试移除超时相关断言

### 4. 文档

- `CLAUDE.md`：Known Issues 移除 "Upload and analysis not fully decoupled"
- `docs/ARCHITECTURE.md`：更新 uploadAndAnalyze 调用链描述
- `PRD.md`：更新异步分析流程状态

## 失败检测

不新增服务端检测机制。依赖现有链路：

```
analyzePhotos 启动失败
  → analysisTasks 状态停留在 pending
  → subject-home 轮询发现 pending 超时（已有逻辑）
  → 显示"分析超时" + 重试按钮（已有 UI）
  → 用户点重试 → onRetryAnalysis（已有实现）
```

## 不变的部分

- `analyzePhotos/index.js`：无变更
- `analyzeBatch/index.js`：无变更
- 前端轮询逻辑（`poller.js`、`subject-home.js`、`report.js`）：无变更
- `analysisTasks` 集合和状态机：无变更
