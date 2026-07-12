// AI 调用成本估算与价格表。
//
// 第一阶段价格由维护者手工维护（设计文档 §5.5），不建 aiPricingRules 集合。
// 改价时同步更新所有副本（cloudfunctions/*/pricing.js），由 deployment-readiness 测试守护一致性。
//
// 价格口径：平台估算成本（非用户应付）。单位元。

const PRICING_VERSION = '2026-07-11'

// 每千 token 单价（元）。CloudBase AI 平台估算，仅供内测成本观察。
const PRICE_PER_1K_TOKENS = {
  'hy3-preview': { input: 0.018, output: 0.018 }, // 纯文本模型（已弃用于图片分析）
  'qwen3.5-plus': { input: 0.0008, output: 0.0048 }, // 多模态视觉模型（当前用于图片分析）
  'glm-5v-turbo': { input: 0.001, output: 0.002 }, // 备选视觉模型（响应过慢，未启用）
  'deepseek-v4-flash': { input: 0.001, output: 0.002 } // 文本生成模型
}

// 每张图片的附加估算成本（元）。视觉模型按图片计费的兜底估算。
const PRICE_PER_IMAGE = {
  'hy3-preview': 0.01,
  'qwen3.5-plus': 0.01,
  'glm-5v-turbo': 0.01,
  'deepseek-v4-flash': 0
}

// 字符 → token 的粗略换算系数（中文约 1.5 字/token，英文约 4 字符/token，取折中）。
const CHARS_PER_TOKEN = 2.5

const DEFAULT_MODEL_PRICE = { input: 0.005, output: 0.005 }

function priceOf(model) {
  return PRICE_PER_1K_TOKENS[model] || DEFAULT_MODEL_PRICE
}

function imagePriceOf(model) {
  return PRICE_PER_IMAGE[model] || 0
}

// 估算 token 数：无真实 usage 时按字符数粗估。
function estimateTokensFromText(text = '') {
  if (!text) return 0
  return Math.ceil(String(text).length / CHARS_PER_TOKEN)
}

// 从真实 usage 对象提取 token（兼容多种字段命名）。
function tokensFromUsage(usage = {}) {
  if (!usage || typeof usage !== 'object') return null
  const input = Number(usage.inputTokens || usage.promptTokens || usage.prompt_tokens || usage.input || 0)
  const output = Number(usage.outputTokens || usage.completionTokens || usage.completion_tokens || usage.output || 0)
  const total = Number(usage.totalTokens || usage.total_tokens || usage.total || 0)
  // 至少有一个非零值才算拿到真实 usage
  if (input === 0 && output === 0 && total === 0) return null
  return {
    inputTokens: input,
    outputTokens: output,
    totalTokens: total || (input + output)
  }
}

// 按 token 计算成本（元）。
function costFromTokens(model, inputTokens, outputTokens) {
  const price = priceOf(model)
  const inputCost = (Number(inputTokens) || 0) / 1000 * price.input
  const outputCost = (Number(outputTokens) || 0) / 1000 * price.output
  return round4(inputCost + outputCost)
}

// 按图片数计算附加成本（元）。
function costFromImages(model, imageCount) {
  return round4((Number(imageCount) || 0) * imagePriceOf(model))
}

function round4(value) {
  return Math.round((Number(value) || 0) * 10000) / 10000
}

module.exports = {
  PRICING_VERSION,
  PRICE_PER_1K_TOKENS,
  PRICE_PER_IMAGE,
  CHARS_PER_TOKEN,
  round4,
  estimateTokensFromText,
  tokensFromUsage,
  costFromTokens,
  costFromImages,
  priceOf,
  imagePriceOf
}
