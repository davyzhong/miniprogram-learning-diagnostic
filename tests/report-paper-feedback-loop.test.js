// 验收测试：诊断报告 ↔ 验证卷 ↔ 反馈 完整闭环
//
// 验证 3 个断裂点的修复：
//   A. triggerAutoVerificationPaper 成功后回写 report.verificationPaperId
//   B. getActiveVerificationPaper 支持 reportId 过滤（不再跨报告错配）
//   C. paper 有 verificationStatus 字段，验证完成后回写 completed

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')

// ============================================================
// 断裂 A：triggerAutoVerificationPaper 回写 report.verificationPaperId
// ============================================================

test('断裂A修复：triggerAutoVerificationPaper 成功后回写 report.verificationPaperId', () => {
  const source = fs.readFileSync(path.join(ROOT, 'cloudfunctions/analyzePhotos/auto-verification.js'), 'utf8')
  // 找 triggerAutoVerificationPaper 函数体
  const fnMatch = source.match(/async function triggerAutoVerificationPaper[\s\S]*?\nmodule\.exports/)
  assert.ok(fnMatch, 'triggerAutoVerificationPaper 必须存在')
  const body = fnMatch[0]

  // 必须在创建 paper 后回写 report
  assert.match(body, /verificationPaperId/, '必须回写 report.verificationPaperId')
  assert.match(body, /verificationPaperStatus.*generating/, '初始状态应为 generating')
  // v2 架构：云函数只创建 generating 记录，实际生成由前端驱动。
  // ready/failed 状态由前端 navigateToVerificationPaper 调 finalize/fail 时设置。
  assert.match(body, /generationProgress/, '必须写入 generationProgress 供前端驱动')
})

test('断裂A修复：createGeneratingPaper 写入 verificationStatus: pending', () => {
  const source = fs.readFileSync(path.join(ROOT, 'cloudfunctions/analyzePhotos/auto-verification.js'), 'utf8')
  const fnMatch = source.match(/async function createGeneratingPaper[\s\S]*?\n}/)
  assert.ok(fnMatch)
  assert.match(fnMatch[0], /verificationStatus.*pending/, 'paper 创建时必须有 verificationStatus: pending')
})

// ============================================================
// 断裂 B：getActiveVerificationPaper 支持 reportId 过滤
// ============================================================

test('断裂B修复：getActiveVerificationPaper 函数签名接受 reportId 参数', () => {
  const source = fs.readFileSync(path.join(ROOT, 'cloudfunctions/studentData/index.js'), 'utf8')
  const fnMatch = source.match(/async function getActiveVerificationPaper[\s\S]*?\n}/)
  assert.ok(fnMatch)
  assert.match(fnMatch[0], /reportId/, '函数签名必须接受 reportId')
  // 有 reportId 时用 triggeredByReport 过滤
  assert.match(fnMatch[0], /triggeredByReport/, '必须用 triggeredByReport 字段过滤')
  // 查不到时回退到学科维度
  assert.match(fnMatch[0], /fallback/i, '必须有回退逻辑（兼容旧数据）')
})

test('断裂B修复：dispatch 把 reportId 传给 getActiveVerificationPaper', () => {
  const source = fs.readFileSync(path.join(ROOT, 'cloudfunctions/studentData/index.js'), 'utf8')
  assert.match(source, /getActiveVerificationPaper\(openId.*event\.reportId\)/,
    'dispatch 必须把 event.reportId 传给 getActiveVerificationPaper')
})

test('断裂B修复：cloud.js 的 getActiveVerificationPaper 接受 reportId', () => {
  const source = fs.readFileSync(path.join(ROOT, 'miniprogram/utils/cloud.js'), 'utf8')
  const fnMatch = source.match(/async function getActiveVerificationPaper[\s\S]*?\n}/)
  assert.ok(fnMatch)
  assert.match(fnMatch[0], /reportId/, 'cloud.js 必须接受 reportId 参数')
})

test('断裂B修复：report.js 调用时传 reportId', () => {
  const source = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/report/report.js'), 'utf8')
  // report.js 通过统一入口 navigateToVerificationPaper 传递 reportId，
  // 后者内部调 getActiveVerificationPaper(studentId, subject, reportId)
  assert.match(source, /reportId/,
    'report.js 必须在调用验证卷入口时传 reportId')
  assert.match(source, /navigateToVerificationPaper/,
    'report.js 必须使用统一入口 navigateToVerificationPaper')
})

// ============================================================
// 断裂 C：验证完成后回写 paper.verificationStatus = completed
// ============================================================

test('断裂C修复：analyzePhotos 验证报告完成后回写 paper.verificationStatus', () => {
  const source = fs.readFileSync(path.join(ROOT, 'cloudfunctions/analyzePhotos/index.js'), 'utf8')
  // 搜索 verificationStatus 的回写逻辑
  assert.match(source, /verificationStatus.*completed/, '必须回写 paper.verificationStatus = completed')
  assert.match(source, /verificationReportId/, '必须回写 verificationReportId')
  assert.match(source, /verifiedAt/, '必须回写 verifiedAt 时间戳')
  // 必须在 mode === 'verification' 条件下
  assert.match(source, /mode\s*===\s*['"]verification['"][\s\S]*?verificationStatus.*completed/,
    '回写必须在验证报告模式下触发')
})

// ============================================================
// 完整闭环验证（静态：字段链路完整性）
// ============================================================

test('完整闭环：report → paper → verification report 的字段链路完整', () => {
  const autoSource = fs.readFileSync(path.join(ROOT, 'cloudfunctions/analyzePhotos/auto-verification.js'), 'utf8')
  // 诊断报告完成后回写 verificationPaperId（断裂 A）
  assert.match(autoSource, /verificationPaperId/, '诊断报告完成后必须回写 verificationPaperId')

  // paper.triggeredByReport → report._id（已有，正向关联）
  assert.match(autoSource, /triggeredByReport.*reportId/, 'paper 必须有 triggeredByReport 字段')

  // paper.verificationStatus 生命周期：pending → completed（断裂 C）
  assert.match(autoSource, /verificationStatus.*pending/, 'paper 创建时 verificationStatus = pending')
  const analyzeSource = fs.readFileSync(path.join(ROOT, 'cloudfunctions/analyzePhotos/index.js'), 'utf8')
  assert.match(analyzeSource, /verificationStatus.*completed/, '验证完成后 verificationStatus = completed')

  // report.paperId（验证报告指向 paper，uploadAndAnalyze 写入）
  const uploadSource = fs.readFileSync(path.join(ROOT, 'cloudfunctions/uploadAndAnalyze/index.js'), 'utf8')
  assert.match(uploadSource, /paperId/, 'uploadAndAnalyze 必须写入 report.paperId')
})

test('完整闭环：getActiveVerificationPaper 按 reportId 精准匹配验证卷', () => {
  const source = fs.readFileSync(path.join(ROOT, 'cloudfunctions/studentData/index.js'), 'utf8')
  // 函数签名有 reportId
  assert.match(source, /async function getActiveVerificationPaper\([^)]*reportId/, '函数签名必须有 reportId')
  // 有 reportId 时加 triggeredByReport 过滤
  assert.match(source, /triggeredByReport/, '必须用 triggeredByReport 字段过滤')
  // dispatch 传 reportId
  assert.match(source, /getActiveVerificationPaper\(openId,\s*event\.studentId,\s*event\.subject,\s*event\.reportId\)/,
    'dispatch 必须传 event.reportId')
})
