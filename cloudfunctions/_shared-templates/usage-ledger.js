// AI 用量事件账本写入 helper。
//
// 在每个 AI 云函数的真实 model.generateText 调用边界包三明治：
//   const eventId = await recordUsageStart({...})
//   try { const result = await model.generateText(...); await recordUsageSuccess({eventId, usage: result.usage, outputText: result.text, ...}); }
//   catch (e) { await recordUsageFailure({eventId, errorMessage: ...}); throw e }
//
// 关键约束：账本是观测层，写入失败绝不阻断业务流程——所有写操作 try/catch 吞错仅 console.error。
// 此文件是 cloudfunctions/*/usage-ledger.js 的规范副本，改价/改逻辑时同步全部副本，
// 由 deployment-readiness 测试守护一致性。

const pricing = require('./pricing')

function nowDate(db) {
  return db && db.serverDate ? db.serverDate() : new Date()
}

// 自动建表兜底：集合不存在时先建再重试（CloudBase 首次写入常见）。
async function addDocument(db, name, data) {
  try {
    return await db.collection(name).add({ data })
  } catch (error) {
    if (db.createCollection && /collection not exists|Db or Table not exist|DATABASE_COLLECTION_NOT_EXIST|ResourceNotFound|-502005/i.test(String(error && (error.errMsg || error.message || error.errCode || error.code) || ''))) {
      try { await db.createCollection(name) } catch (_) { /* ignore */ }
      return db.collection(name).add({ data })
    }
    throw error
  }
}

async function updateDocument(db, name, id, data) {
  return db.collection(name).doc(id).update({ data })
}

// 记录一次 AI 调用开始（pending 态）。返回 eventId（失败返回 null，业务继续）。
async function recordUsageStart({
  db, openId,
  eventType, studentId = '', subject = '', sourceId = '', sourceType = '',
  cloudFunction, model, provider = 'cloudbase_ai',
  imageCount = 0, pageCount = 0, isTest = false
}) {
  if (!db || !openId || !eventType || !model) return null
  const event = {
    _openid: openId,
    studentId,
    subject,
    eventType,
    sourceId,
    sourceType,
    cloudFunction: cloudFunction || '',
    model,
    provider,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    imageCount: Number(imageCount) || 0,
    pageCount: Number(pageCount) || 0,
    estimatedCostCny: 0,
    pricingVersion: pricing.PRICING_VERSION,
    costSource: '',
    status: 'pending',
    isEstimate: false,
    isTest: Boolean(isTest),
    errorMessage: '',
    createdAt: nowDate(db),
    completedAt: null
  }
  try {
    const res = await addDocument(db, 'aiUsageEvents', event)
    return res && res._id ? res._id : null
  } catch (error) {
    console.error('[usage-ledger] recordUsageStart failed', error && error.message)
    return null
  }
}

// 调用成功后补全 token 与成本。优先用真实 usage，否则按输出文本估算。
// usage 形如 { inputTokens, outputTokens, totalTokens } 或云平台原始字段（tokensFromUsage 兼容）。
async function recordUsageSuccess({
  db, eventId, usage = null, outputText = '', model, imageCount = 0
}) {
  if (!db || !eventId) return
  const real = pricing.tokensFromUsage(usage)
  let inputTokens = 0
  let outputTokens = 0
  let totalTokens = 0
  let costSource = ''
  let isEstimate = false

  if (real) {
    inputTokens = real.inputTokens
    outputTokens = real.outputTokens
    totalTokens = real.totalTokens
    costSource = 'provider_usage'
    isEstimate = false
  } else {
    // 无真实 usage：输出 token 按文本估算；输入 token 无法得知，按输出等量粗估（保守上界）
    outputTokens = pricing.estimateTokensFromText(outputText)
    inputTokens = Math.max(outputTokens, pricing.estimateTokensFromText(outputText) * 2)
    totalTokens = inputTokens + outputTokens
    costSource = pricing.estimateTokensFromText(outputText) > 0 ? 'estimated_by_chars' : 'estimated_by_image_count'
    isEstimate = true
  }

  const tokenCost = pricing.costFromTokens(model, inputTokens, outputTokens)
  const imageCost = pricing.costFromImages(model, imageCount)
  const estimatedCostCny = pricing.round4(tokenCost + imageCost)

  try {
    await updateDocument(db, 'aiUsageEvents', eventId, {
      inputTokens,
      outputTokens,
      totalTokens,
      estimatedCostCny,
      costSource,
      isEstimate,
      status: 'succeeded',
      completedAt: nowDate(db)
    })
  } catch (error) {
    console.error('[usage-ledger] recordUsageSuccess failed', error && error.message)
  }
}

// 调用失败：保留输入规模，标记 failed。
async function recordUsageFailure({ db, eventId, errorMessage = '', model = '', imageCount = 0 }) {
  if (!db || !eventId) return
  // 失败也按图片数估一个成本下限（真实调用确实发生了）
  const imageCost = pricing.costFromImages(model, imageCount)
  try {
    await updateDocument(db, 'aiUsageEvents', eventId, {
      estimatedCostCny: imageCost,
      costSource: imageCost > 0 ? 'estimated_by_image_count' : '',
      isEstimate: true,
      status: 'failed',
      errorMessage: String(errorMessage || '').slice(0, 300),
      completedAt: nowDate(db)
    })
  } catch (error) {
    console.error('[usage-ledger] recordUsageFailure failed', error && error.message)
  }
}

module.exports = {
  recordUsageStart,
  recordUsageSuccess,
  recordUsageFailure,
  // 导出供测试与云函数复用
  addDocument,
  updateDocument,
  nowDate
}
