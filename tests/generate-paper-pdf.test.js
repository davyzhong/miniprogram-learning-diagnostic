const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { EventEmitter } = require('node:events')

function createRecordingPdfKit() {
  const operations = []

  class PdfMock extends EventEmitter {
    constructor() {
      super()
      this.y = 40
      this.page = { width: 595, height: 842, margins: { top: 40, bottom: 40, left: 40, right: 40 } }
      operations.push(['newDocument'])
    }

    registerFont(name, fontPath) { operations.push(['registerFont', name, fontPath]); return this }
    font(name) { operations.push(['font', name]); return this }
    fontSize(size) { operations.push(['fontSize', size]); return this }
    fillColor(color) { operations.push(['fillColor', color]); return this }
    strokeColor(color) { operations.push(['strokeColor', color]); return this }
    lineWidth(width) { operations.push(['lineWidth', width]); return this }
    text(text, x, y, options) {
      operations.push(['text', String(text), x, y, options])
      if (typeof y === 'number') this.y = y + 18
      return this
    }
    moveTo(x, y) { operations.push(['moveTo', x, y]); return this }
    lineTo(x, y) { operations.push(['lineTo', x, y]); return this }
    stroke() { operations.push(['stroke']); return this }
    fill() { operations.push(['fill']); return this }
    rect(x, y, width, height) { operations.push(['rect', x, y, width, height]); return this }
    roundedRect(x, y, width, height, radius) {
      operations.push(['roundedRect', x, y, width, height, radius])
      return this
    }
    dash(length, options) { operations.push(['dash', length, options]); return this }
    undash() { operations.push(['undash']); return this }
    save() { operations.push(['save']); return this }
    restore() { operations.push(['restore']); return this }
    addPage() { operations.push(['addPage']); this.y = 40; return this }
    heightOfString(text, options) {
      const width = Number(options && options.width) || 500
      return Math.max(18, Math.ceil(String(text).length / Math.max(1, Math.floor(width / 12))) * 18)
    }
    end() {
      operations.push(['end'])
      this.emit('data', Buffer.from('pdf'))
      queueMicrotask(() => this.emit('end'))
    }
  }

  return { PdfMock, operations }
}

test('verification PDF uses bundled Chinese font and renders grouped student and answer pages', async () => {
  const fontPath = path.resolve(__dirname, '../cloudfunctions/generatePaper/NotoSansCJKsc-Regular.otf')
  assert.equal(fs.existsSync(fontPath), true)

  const { PdfMock, operations } = createRecordingPdfKit()
  const { generatePDF } = require('../cloudfunctions/generatePaper/pdf-renderer')
  await generatePDF({
    title: '数学验证试卷',
    questions: [
      { index: 1, content: '计算：38 × 24 =', answer: '912', lpCode: 'LP-001', lpName: '计算错误' },
      { index: 2, content: '小明读题后应该先求什么？', answer: '先求总数', lpCode: 'LP-008', lpName: '审题错误' }
    ]
  }, 'math', 'verification', {
    pdfkit: PdfMock,
    fontPath,
    paperDate: '2026-06-13',
    paperDisplayCode: '数学-20260613-01'
  })

  const texts = operations.filter(item => item[0] === 'text').map(item => item[1])
  // 标题栏：试卷编号 + 页面编码，不再显示"学习卡点验证卷"
  assert.ok(texts.some(t => t.includes('数学-20260613-01')), '标题栏应含试卷编号')
  assert.ok(texts.includes('计算错误'), '应显示卡点名"计算错误"')
  assert.ok(texts.includes('审题错误'), '应显示卡点名"审题错误"')
  assert.equal(texts.some(text => /^LP-\d+/.test(text)), false)
  assert.ok(texts.includes('学习卡点验证卷 · 参考答案'))
  assert.ok(texts.includes('供家长 / 教师使用'))
  assert.ok(operations.some(item => item[0] === 'dash'))
  assert.ok(operations.some(item => item[0] === 'registerFont' && item[2] === fontPath))
})

test('verification PDF renders bottleneck names without raw codes', async () => {
  const { PdfMock, operations } = createRecordingPdfKit()
  const { generatePDF } = require('../cloudfunctions/generatePaper/pdf-renderer')
  await generatePDF({
    questions: [
      {
        index: 1,
        content: '题目一',
        answer: '答案一',
        lpCode: 'LP-003',
        lpName: '百分数/小数转换错误'
      }
    ]
  }, 'math', 'verification', {
    pdfkit: PdfMock,
    fontPath: path.resolve(__dirname, '../cloudfunctions/generatePaper/NotoSansCJKsc-Regular.otf')
  })

  const texts = operations.filter(item => item[0] === 'text').map(item => item[1])
  // 卡点名不再在题目区画 chip，而是在 groupBar 和答案区显示
  // 核心断言：原始 LP 编码不应出现在用户可见文本中
  assert.equal(texts.includes('LP-003'), false)
})

test('verification PDF has a dedicated answer page after student pages', async () => {
  const { PdfMock, operations } = createRecordingPdfKit()
  const { generatePDF } = require('../cloudfunctions/generatePaper/pdf-renderer')
  await generatePDF({
    questions: [
      { index: 1, content: '题目一', answer: '答案一', lpCode: 'LP-001', lpName: '计算错误' }
    ]
  }, 'math', 'verification', {
    pdfkit: PdfMock,
    fontPath: path.resolve(__dirname, '../cloudfunctions/generatePaper/NotoSansCJKsc-Regular.otf')
  })

  const answerTitleIndex = operations.findIndex(item => item[0] === 'text' && item[1] === '学习卡点验证卷 · 参考答案')
  const firstPageBreakIndex = operations.findIndex(item => item[0] === 'addPage')
  assert.ok(firstPageBreakIndex >= 0)
  assert.ok(answerTitleIndex > firstPageBreakIndex)
})

test('verification PDF returns student and answer page metadata with the buffer', async () => {
  const { PdfMock } = createRecordingPdfKit()
  const { generatePDF } = require('../cloudfunctions/generatePaper/pdf-renderer')
  const result = await generatePDF({
    questions: Array.from({ length: 7 }, (_, index) => ({
      index: index + 1,
      content: `第 ${index + 1} 题：请写出完整计算过程。`,
      answer: `答案 ${index + 1}`,
      lpCode: index < 4 ? 'LP-001' : 'LP-008',
      lpName: index < 4 ? '计算错误' : '审题错误'
    }))
  }, 'math', 'verification', {
    pdfkit: PdfMock,
    fontPath: path.resolve(__dirname, '../cloudfunctions/generatePaper/NotoSansCJKsc-Regular.otf')
  })

  assert.ok(Buffer.isBuffer(result.buffer))
  assert.ok(result.studentPages >= 1)
  assert.ok(result.answerPages >= 1)
  assert.equal(result.totalPages, result.studentPages + result.answerPages)
})

test('verification PDF prints traceable page codes on student pages', async () => {
  const { PdfMock, operations } = createRecordingPdfKit()
  const { generatePDF } = require('../cloudfunctions/generatePaper/pdf-renderer')
  // 两道短题放在同一物理页（流式排版后，pageCode 不再强制换页）。
  // pageCode 仍作为语义标识记录到 metadata，供学生完成进度追踪使用。
  const result = await generatePDF({
    questions: [
      {
        index: 1,
        questionId: 'MATH-V-20260616-01-P01-Q01',
        pageCode: 'MATH-V-20260616-01-P01',
        content: '第 1 页任务题',
        answer: '答案一',
        lpCode: 'BN-FINE-1',
        lpName: '小数点定位不稳'
      },
      {
        index: 2,
        questionId: 'MATH-V-20260616-01-P02-Q01',
        pageCode: 'MATH-V-20260616-01-P02',
        content: '第 2 页任务题',
        answer: '答案二',
        lpCode: 'BN-FINE-4',
        lpName: '分数通分不稳'
      }
    ]
  }, 'math', 'verification', {
    pdfkit: PdfMock,
    fontPath: path.resolve(__dirname, '../cloudfunctions/generatePaper/NotoSansCJKsc-Regular.otf'),
    verificationPack: {
      pages: [
        { pageCode: 'MATH-V-20260616-01-P01' },
        { pageCode: 'MATH-V-20260616-01-P02' }
      ]
    }
  })

  const texts = operations.filter(item => item[0] === 'text').map(item => item[1])
  // 首页标题栏应含第一题所在 pageCode
  assert.ok(texts.some(t => t.includes('MATH-V-20260616-01-P01')), '标题栏应含 pageCode P01')
  // 流式排版：两道短题共占一张物理页，pageCode P02 的题目也落在同一页上（不再强制换页）。
  // 两道题的 questionId 都应被记录到学生页 metadata，保证进度追踪不丢题。
  const allQuestionIds = result.studentPageMetadata.flatMap(page => page.questionIds)
  assert.ok(allQuestionIds.includes('MATH-V-20260616-01-P01-Q01'), 'metadata 应记录 P01 的题目')
  assert.ok(allQuestionIds.includes('MATH-V-20260616-01-P02-Q01'), 'metadata 应记录 P02 的题目')
  // 首页 pageCode 应为 P01
  assert.equal(result.studentPageCodes[0], 'MATH-V-20260616-01-P01')
})

test('verification PDF fills each page to capacity instead of breaking per pageCode (regression for blank pages)', async () => {
  const { PdfMock } = createRecordingPdfKit()
  const { generatePDF } = require('../cloudfunctions/generatePaper/pdf-renderer')
  // 复现 weight 降序分页 bug：高权重卡点挤爆前几页、低权重卡点饿死后几页。
  // 这里构造 40 个卡点 × 置信度分层题量（高 3 / 中 2 / 低 1）= 75 题，
  // 每 4 个卡点分配一个 pageCode（共 10 个 pageCode）。
  // 旧行为：前几页 12 题溢出、后几页仅 4 题（大段空白）。
  // 新行为：流式排版，每页填满到容量上限（约 8-14 题），无稀疏空白页。
  const questions = []
  let qIdx = 0
  for (let t = 1; t <= 40; t++) {
    const weight = t <= 10 ? 85 : t <= 25 ? 60 : 30
    const count = weight >= 75 ? 3 : weight >= 45 ? 2 : 1
    const pageCode = `MATH-V-20260621-01-P${String(Math.ceil(t / 4)).padStart(2, '0')}`
    for (let k = 0; k < count; k++) {
      qIdx++
      questions.push({
        index: qIdx,
        // questionId 用全局 qIdx 保证唯一（同 pageCode 下多个卡点各自出题，避免 Q01 撞车）
        questionId: `${pageCode}-Q${String(qIdx).padStart(3, '0')}`,
        pageCode,
        content: `第${qIdx}题：计算并写出过程。`,
        answer: `答案${qIdx}`,
        lpCode: `BN-DEMO-${t}`,
        lpName: `演示卡点${t}`
      })
    }
  }
  const pageCodes = Array.from(new Set(questions.map(q => q.pageCode))).sort()

  const result = await generatePDF({ questions }, 'math', 'verification', {
    pdfkit: PdfMock,
    fontPath: path.resolve(__dirname, '../cloudfunctions/generatePaper/NotoSansCJKsc-Regular.otf'),
    verificationPack: { pages: pageCodes.map((pageCode, i) => ({ pageCode, pageIndex: i + 1 })) }
  })

  // 所有题目 questionId 都应被记录（无丢失）
  const allQuestionIds = result.studentPageMetadata.flatMap(page => page.questionIds)
  assert.equal(allQuestionIds.length, questions.length, '所有题目都应被记录到 metadata')
  assert.equal(new Set(allQuestionIds).size, questions.length, 'questionId 不应重复')

  // 核心回归断言：每页都应填满到合理容量，不应出现"仅 4-5 题"的稀疏空白页。
  // 容量下限设为 6（A4 双栏 4 行演算区至少容 8 题，留余量给标签）。
  const perPageCounts = result.studentPageMetadata.map(page => page.questionIds.length)
  const minPerPage = Math.min(...perPageCounts)
  // 最后一页可能是余数页（题少），单独豁免；其余页都应 ≥ 6。
  const nonLastPages = perPageCounts.slice(0, -1)
  const minNonLast = nonLastPages.length ? Math.min(...nonLastPages) : minPerPage
  assert.ok(minNonLast >= 6,
    `非末页每页至少 6 题（实际最小 ${minNonLast}），不应出现稀疏空白页。分布：${perPageCounts.join(', ')}`)
  // 物理页数应明显少于 pageCode 数（10 个 pageCode → 6-7 页，而非 10 页）
  assert.ok(result.studentPages < pageCodes.length,
    `流式排版后页数（${result.studentPages}）应少于 pageCode 数（${pageCodes.length}）`)
})
