#!/usr/bin/env node
/**
 * 本地 PDF 预览工具
 *
 * 用法：node scripts/preview-pdf.js
 * 输出：tmp/preview-verification.pdf（用 Preview 打开）
 *
 * 改了 pdf-renderer.js 后直接跑这个看效果，不用上传云函数。
 */
const path = require('path')
const fs = require('fs')

// 构造 20 道模拟题目（每道题独立卡点 + 独立解题思路）
const SAMPLE_DATA = [
  // 10 道核心题
  { content: '计算 0.25 × 0.4 = ?', answer: '0.1', lpName: '小数乘法小数点定位', lpCode: 'BN-DEC-MUL-POINT-COUNT', explanation: '0.25有2位小数、0.4有1位，共3位，积=0.100=0.1。' },
  { content: '计算 4.2 ÷ 0.6 = ?', answer: '7', lpName: '小数除法小数点移动', lpCode: 'BN-DEC-DIV-POINT-MOVE', explanation: '除数0.6变整数需×10，被除数同步×10变42，42÷6=7。' },
  { content: '计算 4/5 ÷ 2/3 = ?', answer: '6/5', lpName: '分数除法倒数缺失', lpCode: 'BN-FRACTION-DIV-RECIPROCAL', explanation: '除以分数=乘以倒数。4/5×3/2=12/10=6/5。' },
  { content: '计算 3.6 × 0.05 = ?', answer: '0.18', lpName: '小数乘法拆分加法', lpCode: 'BN-DEC-MUL-SPLIT-ADD', explanation: '拆成3×0.05+0.6×0.05=0.15+0.03=0.18。' },
  { content: '计算 1/2 + 1/3 = ?', answer: '5/6', lpName: '异分母通分错误', lpCode: 'BN-FRACTION-COMMON-DENOMINATOR', explanation: '公分母6，3/6+2/6=5/6。' },
  { content: '计算 936 ÷ 24 = ?', answer: '39', lpName: '小数除法试商', lpCode: 'BN-DEC-DIV-TRIAL', explanation: '把24看作25试商，93÷24≈3，3×24=72，93-72=21，落下6变216÷24=9。' },
  { content: '计算 1/4 + 1/6 = ?', answer: '5/12', lpName: '异分母加法', lpCode: 'BN-FRACTION-ADD-UNLIKE', explanation: '公分母12，3/12+2/12=5/12。' },
  { content: '计算 0.36 × 7 = ?', answer: '2.52', lpName: '小数乘法进位', lpCode: 'BN-DEC-MUL-CARRY', explanation: '36×7=252，0.36有2位小数，积=2.52。' },
  { content: '计算 36 × 0.7 = ?', answer: '25.2', lpName: '小数乘法进位错误', lpCode: 'BN-DEC-MUL-CARRY-ERROR', explanation: '36×7=252，0.7有1位小数，积=25.2。进位时3×7=21+进位2=23。' },
  { content: '计算 2.5 × 1.6 = ?', answer: '4', lpName: '小数乘法进位加法', lpCode: 'BN-DEC-MUL-CARRY-ADD', explanation: '25×16=400，共2位小数，积=4.00=4。竖式时每一步加进位。' },
  // 10 道延展题（同卡点换数字）
  { content: '计算 0.12 × 0.5 = ?', answer: '0.06', lpName: '小数乘法小数点定位', lpCode: 'BN-DEC-MUL-POINT-COUNT', explanation: '0.12有2位、0.5有1位，共3位，12×5=60，积=0.060=0.06。' },
  { content: '计算 7.8 ÷ 0.3 = ?', answer: '26', lpName: '小数除法小数点移动', lpCode: 'BN-DEC-DIV-POINT-MOVE', explanation: '都×10变78÷3=26。' },
  { content: '计算 3/4 ÷ 1/2 = ?', answer: '3/2', lpName: '分数除法倒数缺失', lpCode: 'BN-FRACTION-DIV-RECIPROCAL', explanation: '3/4×2/1=6/4=3/2。' },
  { content: '计算 2.5 × 0.04 = ?', answer: '0.1', lpName: '小数乘法拆分加法', lpCode: 'BN-DEC-MUL-SPLIT-ADD', explanation: '拆成2×0.04+0.5×0.04=0.08+0.02=0.1。' },
  { content: '计算 2/3 + 1/4 = ?', answer: '11/12', lpName: '异分母通分错误', lpCode: 'BN-FRACTION-COMMON-DENOMINATOR', explanation: '公分母12，8/12+3/12=11/12。' },
  { content: '计算 780 ÷ 15 = ?', answer: '52', lpName: '小数除法试商', lpCode: 'BN-DEC-DIV-TRIAL', explanation: '78÷15≈5，5×15=75，78-75=3，落下0变30÷15=2。' },
  { content: '计算 2/5 + 1/3 = ?', answer: '11/15', lpName: '异分母加法', lpCode: 'BN-FRACTION-ADD-UNLIKE', explanation: '公分母15，6/15+5/15=11/15。' },
  { content: '计算 0.48 × 5 = ?', answer: '2.4', lpName: '小数乘法进位', lpCode: 'BN-DEC-MUL-CARRY', explanation: '48×5=240，0.48有2位小数，积=2.40=2.4。' },
  { content: '计算 4.5 × 0.6 = ?', answer: '2.7', lpName: '小数乘法进位错误', lpCode: 'BN-DEC-MUL-CARRY-ERROR', explanation: '45×6=270，共2位小数，积=2.70=2.7。' },
  { content: '计算 1.8 × 2.3 = ?', answer: '4.14', lpName: '小数乘法进位加法', lpCode: 'BN-DEC-MUL-CARRY-ADD', explanation: '18×23=414，共2位小数，积=4.14。竖式3×8=24写4进2，3×1+2=5。' },
]

const SAMPLE_QUESTIONS = {
  title: '数学验证试卷 - 小数分数运算',
  questions: SAMPLE_DATA.map((d, i) => ({
    index: i + 1,
    ...d,
    points: 5,
    questionRole: i < 10 ? 'core' : 'transfer',
  })),
  verificationPack: {
    pages: [
      { pageCode: 'MATH-V-20260618-01-P01', questionIds: ['Q-1','Q-2','Q-3','Q-4','Q-5','Q-6'] },
      { pageCode: 'MATH-V-20260618-01-P02', questionIds: ['Q-7','Q-8','Q-9','Q-10','Q-11','Q-12'] },
      { pageCode: 'MATH-V-20260618-01-P03', questionIds: ['Q-13','Q-14','Q-15','Q-16','Q-17','Q-18','Q-19','Q-20'] },
    ],
  },
}

async function main() {
  console.log('生成 PDF 预览...')
  const { generatePDF } = require('../cloudfunctions/generatePaper/pdf-renderer')
  const fontPath = path.resolve(__dirname, '../cloudfunctions/generatePaper/NotoSansCJKsc-Regular.otf')

  const result = await generatePDF(SAMPLE_QUESTIONS, 'math', 'verification', {
    paperDate: '2026-06-18',
    paperCode: 'MATH-20260618-01',
    paperDisplayCode: '数学-20260618-01',
    verificationPack: SAMPLE_QUESTIONS.verificationPack,
  })

  const buffer = Buffer.isBuffer(result) ? result : result.buffer
  const outDir = path.resolve(__dirname, '../tmp')
  fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, 'preview-verification.pdf')
  fs.writeFileSync(outPath, buffer)

  console.log(`✅ PDF 已生成: ${outPath}`)
  console.log(`   题数: ${SAMPLE_QUESTIONS.questions.length}`)
  console.log(`   学生页: ${result.studentPages}`)
  console.log(`   答案页: ${result.answerPages}`)
  console.log(`   总页数: ${result.totalPages}`)
  console.log(`   文件大小: ${(buffer.length / 1024).toFixed(1)} KB`)
  console.log(`\n用 Preview 打开查看: open "${outPath}"`)
}

main().catch(e => { console.error(e); process.exit(1) })
