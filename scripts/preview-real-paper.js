#!/usr/bin/env node
/**
 * 本地渲染真实验证卷 PDF（用云数据库里的题目 + 修复后的分页逻辑）
 *
 * 用法：node scripts/preview-real-paper.js
 * 前置：先导出 /tmp/paper-117e.json
 * 输出：tmp/preview-real-paper.pdf
 */
const path = require('path')
const fs = require('fs')
const { generatePDF, groupQuestions } = require('../cloudfunctions/generatePaper/pdf-renderer')
const { inferTargetType } = require('../cloudfunctions/generatePaper/verification-pack')

// 本地复刻 cleanLatex（与 index.js 保持一致，预览旧数据时清理 LaTeX 乱码）
function cleanLatex(text) {
  return String(text || '')
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, (m, a, b) => {
      const na = /^[0-9.]+$/.test(a) ? a : `(${a})`
      const nb = /^[0-9.]+$/.test(b) ? b : `(${b})`
      return `${na}/${nb}`
    })
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, (m, a, b) => {
      const na = /^[0-9.]+$/.test(a) ? a : `(${a})`
      const nb = /^[0-9.]+$/.test(b) ? b : `(${b})`
      return `${na}/${nb}`
    })
    .replace(/\\sqrt\{([^{}]*)\}/g, '√($1)')
    .replace(/\\times/g, '×').replace(/\\div/g, '÷').replace(/\\pm/g, '±')
    .replace(/\\leq/g, '≤').replace(/\\geq/g, '≥').replace(/\\neq/g, '≠')
    .replace(/\\cdot/g, '·')
    .replace(/\\text\{([^{}]*)\}/g, '$1')
    .replace(/\\[\(\)\[\]]/g, '')
    .replace(/\$+/g, '')
    .replace(/\\[a-zA-Z]+(\{[^{}]*\})?/g, ' ')
    .replace(/\(\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function formatDateCode(paperDate) {
  const text = /^\d{4}-\d{2}-\d{2}$/.test(String(paperDate||'')) ? String(paperDate) : ''
  if (!text) {
    const d = new Date()
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`
  }
  return text.replace(/-/g, '')
}

const PAPER_FILE = process.env.PAPER_FILE || '/tmp/paper-117e.json'
const paper = JSON.parse(fs.readFileSync(PAPER_FILE, 'utf8'))
const allQuestions = (paper.questions || []).map(q => {
  const { pageCode, questionId, ...rest } = q
  // 清理 LaTeX 乱码（模拟云函数 cleanPromptText 的效果）
  rest.content = cleanLatex(rest.content)
  rest.answer = cleanLatex(rest.answer)
  if (rest.explanation) rest.explanation = cleanLatex(rest.explanation)
  if (rest.lpName) rest.lpName = cleanLatex(rest.lpName)
  return rest
})
// 给旧数据补模拟 explanation（验证答案页渲染，真实生成时 LLM 会返回）
allQuestions.forEach((q, i) => {
  if (!q.explanation) {
    q.explanation = `本题解题过程：根据题目数字 ${q.content ? q.content.slice(0, 20) : ''}，先确定运算顺序，逐步计算得出 ${q.answer || '答案'}。关键点在于正确处理进位和小数点位置。`
  }
})
const subject = paper.subject || 'math'
const type = paper.type || 'verification'
const paperDate = paper.paperDate || '2026-06-20'
const paperCodes = {
  paperCode: paper.paperCode || 'MATH-20260620-01',
  paperDisplayCode: paper.paperDisplayCode || '数学-20260620-01',
}

console.log(`题目数: ${allQuestions.length}`)

// 按 lpCode 分组排序（同卡点题目连续，双栏配对时左右尽量同卡点）
allQuestions.sort((a, b) => {
  const la = (a.lpCode || a.targetId || '')
  const lb = (b.lpCode || b.targetId || '')
  if (la !== lb) return la < lb ? -1 : 1
  return 0
})

// 按题数分页（每页 8 题）— 与 _regeneratePdf 逻辑一致
const QUESTIONS_PER_PAGE = 8
const totalPages = Math.max(1, Math.ceil(allQuestions.length / QUESTIONS_PER_PAGE))
const dateCode = formatDateCode(paperDate)
const sequence = (paperCodes.paperCode.match(/-(\d+)$/)||[])[1] || '01'
const subjectCode = 'MATH'

const pages = []
for (let i = 0; i < totalPages; i++) {
  const pageStart = i * QUESTIONS_PER_PAGE
  const pageQuestions = allQuestions.slice(pageStart, pageStart + QUESTIONS_PER_PAGE)
  const pageIndex = i + 1
  const pageCode = `${subjectCode}-V-${dateCode}-${String(sequence).padStart(2,'0')}-P${String(pageIndex).padStart(2,'0')}`
  const targetIds = Array.from(new Set(pageQuestions.map(q => q.lpCode || q.targetId || '综合')))
  pages.push({ pageIndex, pageCode, status: 'pending', pageType: 'mixed_review', targetIds, questionIds: [] })
  pageQuestions.forEach(q => {
    q.pageCode = pageCode
    q.targetId = q.lpCode || q.targetId || '综合'
  })
}

// 分配 questionId / questionRole / 统一 index
const targetRoleCounts = new Map()
let pageQCounter = 0
let curPageCode = ''
allQuestions.forEach((q, idx) => {
  q.index = idx + 1  // 全局连续编号
  if (q.pageCode !== curPageCode) { curPageCode = q.pageCode; pageQCounter = 0 }
  pageQCounter++
  q.questionId = `${q.pageCode}-Q${String(pageQCounter).padStart(2,'0')}`
  const rc = (targetRoleCounts.get(q.targetId) || 0) + 1
  targetRoleCounts.set(q.targetId, rc)
  q.questionRole = rc <= 1 ? 'core' : 'transfer'
  q.targetType = inferTargetType(q.targetId)
  const pp = pages.find(p => p.pageCode === q.pageCode)
  if (pp) pp.questionIds.push(q.questionId)
})

const verificationPack = {
  packId: `VPK-${subjectCode}-${dateCode}-${sequence}`,
  subject, subjectCode,
  paperCode: paperCodes.paperCode, paperDate, dateCode, sequence,
  totalTargets: Array.from(new Set(allQuestions.map(q => q.targetId))).length,
  totalStudentPages: totalPages,
  scheduleStrategy: 'question_count_paginated',
  pages,
}

// 检查分页
const byPage = {}
allQuestions.forEach(q => { byPage[q.pageCode] = (byPage[q.pageCode]||0)+1 })
console.log('\n按题数均匀分页:')
Object.keys(byPage).sort().forEach(pc => console.log(`  ${pc}: ${byPage[pc]} 题`))

const questionsData = { title: paper.title || '数学验证试卷', questions: allQuestions, verificationPack }

;(async () => {
  const result = await generatePDF(questionsData, subject, type, {
    paperDate,
    paperCode: paperCodes.paperCode,
    paperDisplayCode: paperCodes.paperDisplayCode,
    verificationPack,
  })
  const outPath = path.resolve(__dirname, '..', 'tmp', 'preview-real-paper.pdf')
  fs.writeFileSync(outPath, result.buffer)
  console.log(`\n✓ PDF: ${outPath}`)
  console.log(`  学生页: ${result.studentPages}, 答案页: ${result.answerPages}, 总页数: ${result.totalPages}`)
})().catch(e => { console.error('渲染失败:', e.message||e); process.exit(1) })
