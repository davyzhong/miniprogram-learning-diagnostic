#!/usr/bin/env node
/**
 * 数据删除请求处理脚本（运维工具）
 *
 * 处理 dataDeletionRequests 集合中的用户删除请求。
 * 支持状态转换、dry-run 预览、审计日志。
 *
 * 状态转换：requested → processing → completed / rejected
 *
 * 用法：
 *   # 列出所有待处理请求
 *   node scripts/process-data-deletion-request.js --list
 *
 *   # Dry-run：预览指定请求会影响的记录
 *   node scripts/process-data-deletion-request.js --request-id <id> --dry-run
 *
 *   # 开始处理（标记为 processing）
 *   node scripts/process-data-deletion-request.js --request-id <id> --start --operator <name>
 *
 *   # 完成处理（标记为 completed）
 *   node scripts/process-data-deletion-request.js --request-id <id> --complete --operator <name>
 *
 *   # 拒绝请求
 *   node scripts/process-data-deletion-request.js --request-id <id> --reject --operator <name> --note "原因"
 *
 * 环境变量：
 *   ENV_ID — CloudBase 环境 ID（默认 cloud1-d6gneg68m5a7a3876）
 *
 * 注意：此脚本直接操作生产数据库，执行前务必先 --dry-run。
 */

const VALID_TRANSITIONS = {
  'requested': ['processing', 'rejected'],
  'processing': ['completed', 'rejected'],
  'completed': [],
  'rejected': [],
}

const SCOPES = {
  'student_all': {
    description: '删除学生的全部学习数据',
    collections: ['reports', 'papers', 'subjectProfiles', 'analysisTasks', 'reportFeedback',
      'studentEnglishWords', 'englishPracticeSessions', 'englishImportBatches',
      'learningResourcePacks', 'mathHistoryReanalysisTasks'],
    filterKey: 'studentId',
    storagePattern: null, // 需要从记录的 imageFiles/pdfFileId 中收集 fileID
  },
  'photos_only': {
    description: '仅删除照片文件（保留诊断结果）',
    collections: [],
    filterKey: 'studentId',
    storagePattern: 'image',
  },
  'usage_only': {
    description: '删除 AI 用量记录',
    collections: ['aiUsageEvents'],
    filterKey: '_openid', // usage 按 openid 隔离，需从 student owner 反查
  },
}

function printUsage() {
  console.log(`
数据删除请求处理脚本

用法：
  --list                          列出待处理请求
  --request-id <id>               指定请求 ID
  --dry-run                       预览影响范围（不修改任何数据）
  --start                         标记为 processing
  --complete                      标记为 completed
  --reject                        标记为 rejected
  --operator <name>               操作人（必须，用于审计）
  --note <text>                   备注（附加到请求记录）

示例：
  node scripts/process-data-deletion-request.js --list
  node scripts/process-data-deletion-request.js --request-id REQ001 --dry-run
  node scripts/process-data-deletion-request.js --request-id REQ001 --start --operator admin
`)
}

// ── 参数解析 ──
function parseArgs(argv) {
  const args = { action: null, requestId: '', operator: '', note: '' }
  const rest = argv.slice(2)
  for (let i = 0; i < rest.length; i++) {
    switch (rest[i]) {
      case '--list': args.action = 'list'; break
      case '--dry-run': args.action = args.action || 'dry-run'; break
      case '--start': args.action = 'start'; break
      case '--complete': args.action = 'complete'; break
      case '--reject': args.action = 'reject'; break
      case '--request-id': args.requestId = rest[++i] || ''; break
      case '--operator': args.operator = rest[++i] || ''; break
      case '--note': args.note = rest[++i] || ''; break
      case '--help': case '-h': args.action = 'help'; break
    }
  }
  return args
}

// ── 状态转换校验 ──
function validateTransition(currentStatus, targetStatus) {
  const allowed = VALID_TRANSITIONS[currentStatus]
  if (!allowed || !allowed.includes(targetStatus)) {
    throw new Error(`不允许的状态转换：${currentStatus} → ${targetStatus}（允许：${(allowed || []).join(', ') || '无'}）`)
  }
}

// ── Dry-run 影响范围预览 ──
function previewImpact(request, scopeConfig) {
  const lines = []
  lines.push(`请求 ID: ${request._id}`)
  lines.push(`用户 OpenID: ${request._openid}`)
  lines.push(`范围: ${request.scope}（${scopeConfig.description}）`)
  lines.push(`学生 ID: ${request.studentId || '(按用户)'} `)
  lines.push(`当前状态: ${request.status}`)
  lines.push('')
  lines.push('影响的集合：')
  for (const col of scopeConfig.collections) {
    lines.push(`  • ${col}（where ${scopeConfig.filterKey} == ${request.studentId || request._openid}）`)
  }
  if (scopeConfig.storagePattern) {
    lines.push(`  • 云存储文件（${scopeConfig.storagePattern === 'image' ? '照片' : '文件'}）`)
  }
  lines.push('')
  lines.push('注意：dry-run 不修改任何数据。实际处理时需逐集合确认删除数量。')
  return lines.join('\n')
}

async function main() {
  const args = parseArgs(process.argv)

  if (!args.action || args.action === 'help') {
    printUsage()
    process.exit(0)
  }

  // 所有写操作（start/complete/reject）都需要操作人
  if (['start', 'complete', 'reject'].includes(args.action) && !args.operator) {
    console.error('✗ --start/--complete/--reject 必须提供 --operator')
    process.exit(1)
  }

  const envId = process.env.ENV_ID || 'cloud1-d6gneg68m5a7a3876'

  // 以下需要连接 CloudBase，依赖 @cloudbase/node-sdk
  let tcb, app, db
  try {
    tcb = require('@cloudbase/node-sdk')
    app = tcb.init({ env: envId })
    db = app.database()
  } catch (error) {
    console.error('✗ 无法连接 CloudBase（需要 @cloudbase/node-sdk 和有效环境）:', error.message)
    console.error('  设置 ENV_ID 环境变量指定 CloudBase 环境。')
    process.exit(1)
  }

  const _ = db.command

  // ── --list ──
  if (args.action === 'list') {
    const res = await db.collection('dataDeletionRequests')
      .where({ status: _.in(['requested', 'processing']) })
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get()
    const items = res.data || []
    if (items.length === 0) {
      console.log('没有待处理的删除请求。')
    } else {
      console.log(`待处理删除请求（${items.length} 条）：\n`)
      for (const item of items) {
        console.log(`  ID: ${item._id}`)
        console.log(`    用户: ${item._openid}`)
        console.log(`    范围: ${item.scope}`)
        console.log(`    学生: ${item.studentId || '(按用户)'}`)
        console.log(`    状态: ${item.status}`)
        console.log(`    时间: ${item.createdAt}`)
        console.log(`    原因: ${item.reason || '(无)'}`)
        console.log('')
      }
    }
    process.exit(0)
  }

  // ── 以下需要 --request-id ──
  if (!args.requestId) {
    console.error('✗ 请提供 --request-id <id>')
    process.exit(1)
  }

  const reqRes = await db.collection('dataDeletionRequests').doc(args.requestId).get()
  const request = reqRes.data
  if (!request) {
    console.error(`✗ 请求不存在: ${args.requestId}`)
    process.exit(1)
  }

  const scopeConfig = SCOPES[request.scope]
  if (!scopeConfig) {
    console.error(`✗ 未知的删除范围: ${request.scope}`)
    process.exit(1)
  }

  // ── --dry-run ──
  if (args.action === 'dry-run') {
    console.log('========== DRY RUN ==========')
    console.log(previewImpact(request, scopeConfig))
    process.exit(0)
  }

  // ── --start / --complete / --reject ──
  const targetStatus = { start: 'processing', complete: 'completed', reject: 'rejected' }[args.action]

  try {
    validateTransition(request.status, targetStatus)
  } catch (error) {
    console.error(`✗ ${error.message}`)
    process.exit(1)
  }

  await db.collection('dataDeletionRequests').doc(args.requestId).update({
    data: {
      status: targetStatus,
      processedAt: new Date(),
      processedBy: args.operator,
      note: (request.note || '') + (args.note ? `\n[${args.operator}] ${args.note}` : ''),
    },
  })

  console.log(`✓ 请求 ${args.requestId} 已从 ${request.status} → ${targetStatus}`)
  console.log(`  操作人: ${args.operator}`)
  if (targetStatus === 'completed') {
    console.log('  注意：此脚本仅标记状态。实际数据删除需在 CloudBase 控制台或通过 API 手动执行。')
    console.log('  参考 dry-run 输出确定影响的集合。')
  }
  process.exit(0)
}

main().catch(err => {
  console.error('执行异常:', err.message || err)
  process.exit(1)
})
