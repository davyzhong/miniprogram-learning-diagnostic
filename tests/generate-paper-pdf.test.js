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
  // pageCode 已移到标题栏（不再在页尾显示"页面编号：xxx"）
  assert.ok(texts.some(t => t.includes('MATH-V-20260616-01-P01')), '标题栏应含 pageCode P01')
  assert.ok(texts.some(t => t.includes('MATH-V-20260616-01-P02')), '标题栏应含 pageCode P02')
  assert.deepEqual(result.studentPageCodes, [
    'MATH-V-20260616-01-P01',
    'MATH-V-20260616-01-P02'
  ])
  assert.deepEqual(result.studentPageMetadata, [
    {
      pageNumber: 1,
      pageCode: 'MATH-V-20260616-01-P01',
      questionIds: ['MATH-V-20260616-01-P01-Q01']
    },
    {
      pageNumber: 2,
      pageCode: 'MATH-V-20260616-01-P02',
      questionIds: ['MATH-V-20260616-01-P02-Q01']
    }
  ])
})
