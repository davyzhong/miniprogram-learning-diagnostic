#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const {
  createCloudMock,
  createDatabase,
  loadModule
} = require('../tests/helpers/cloud-function-harness')

const TIMELINE_COLLECTIONS = new Set([
  'reports',
  'papers',
  'englishPracticeSessions',
  'learningResourcePacks'
])

function textBlock(label, count = 12) {
  return Array.from({ length: count }, (_, index) => (
    `${label} 第${index + 1}段：记录题目条件、学生作答、识别结果和诊断证据。`
  )).join('')
}

function timestamp(index) {
  return new Date(Date.UTC(2026, 5, 30, 12) - index * 60 * 60 * 1000).toISOString()
}

function buildRepresentativeTimelineSeed() {
  const reports = Array.from({ length: 20 }, (_, index) => ({
    _id: `report-${index + 1}`,
    _openid: 'owner-1',
    studentId: 'student-1',
    subject: index % 3 === 0 ? 'chinese' : 'math',
    type: 'diagnosis',
    status: 'completed',
    summary: `第 ${index + 1} 次诊断摘要`,
    totalErrors: 12,
    bottlenecks: [{ lpCode: 'LP-008', lpName: '审题理解', errorCount: 4 }],
    imageFiles: Array.from({ length: 5 }, (_, imageIndex) => ({
      fileID: `cloud://report-${index + 1}/page-${imageIndex + 1}.jpg`,
      fileName: `第${imageIndex + 1}页.jpg`,
      ocrText: textBlock(`报告${index + 1}图片${imageIndex + 1}`, 10)
    })),
    pageResults: Array.from({ length: 5 }, (_, pageIndex) => ({
      pageIndex,
      rawAnalysis: textBlock(`报告${index + 1}页面${pageIndex + 1}`, 8)
    })),
    errorDetails: Array.from({ length: 12 }, (_, errorIndex) => ({
      questionContent: `第 ${errorIndex + 1} 题应用题`,
      studentAnswer: '学生的原始作答过程',
      analysis: textBlock(`错题${errorIndex + 1}`, 3)
    })),
    rawAiResponse: textBlock(`报告${index + 1}原始模型响应`, 20),
    createdAt: timestamp(index * 4)
  }))
  const papers = Array.from({ length: 10 }, (_, index) => ({
    _id: `paper-${index + 1}`,
    _openid: 'owner-1',
    studentId: 'student-1',
    subject: 'math',
    type: 'verification',
    paperDisplayCode: `MATH-V-${String(index + 1).padStart(3, '0')}`,
    bottleneckSummaries: ['审题理解', '计算基础'],
    questionCount: 20,
    questions: Array.from({ length: 20 }, (_, questionIndex) => ({
      content: `第 ${questionIndex + 1} 题：${textBlock('验证题', 2)}`,
      answer: '标准答案',
      explanation: textBlock('解析', 3)
    })),
    createdAt: timestamp(index * 4 + 1)
  }))
  const englishPracticeSessions = Array.from({ length: 8 }, (_, index) => ({
    _id: `english-${index + 1}`,
    studentId: 'student-1',
    functionType: 'familiarity',
    type: 'recognition',
    status: 'completed',
    wordCount: 20,
    wordItems: Array.from({ length: 20 }, (_, wordIndex) => ({
      wordId: `word-${wordIndex + 1}`,
      word: `vocabulary${wordIndex + 1}`,
      meanings: ['示例释义'],
      prompt: textBlock('单词提示', 2)
    })),
    attempts: Array.from({ length: 30 }, (_, attemptIndex) => ({
      wordId: `word-${(attemptIndex % 20) + 1}`,
      recognizedText: 'recognized vocabulary answer',
      rawRecognition: textBlock('语音识别明细', 3),
      judgment: { status: attemptIndex % 3 === 0 ? 'incorrect' : 'correct' }
    })),
    createdAt: timestamp(index * 4 + 2)
  }))
  const learningResourcePacks = Array.from({ length: 8 }, (_, index) => ({
    _id: `resource-${index + 1}`,
    studentId: 'student-1',
    subject: 'math',
    title: `审题训练 ${index + 1}`,
    status: 'ready',
    estimatedMinutes: 15,
    target: { id: 'LP-008', name: '审题理解' },
    generatedContent: Array.from({ length: 8 }, (_, sectionIndex) => ({
      title: `训练步骤 ${sectionIndex + 1}`,
      body: textBlock('个性化学习内容', 10)
    })),
    createdAt: timestamp(index * 4 + 3),
    updatedAt: timestamp(index * 4 + 3)
  }))

  return {
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '基线学生', grade: 6 }],
    studentMembers: [],
    reports,
    papers,
    englishPracticeSessions,
    learningResourcePacks
  }
}

async function runTimeline(seed, ignoreProjection) {
  let databaseReadBytes = 0
  const db = createDatabase(seed, {
    ignoreProjection,
    onQuery: query => {
      if (TIMELINE_COLLECTIONS.has(query.collection)) {
        databaseReadBytes += Buffer.byteLength(JSON.stringify(query.data))
      }
    }
  })
  const handler = loadModule('cloudfunctions/studentData/index.js', {
    'wx-server-sdk': createCloudMock({ db, openId: 'owner-1' })
  })
  const response = await handler.main({ action: 'getLearningTimeline', studentId: 'student-1', limit: 20 })
  const visibleIds = Array.isArray(response.items)
    ? response.items.map(item => item.id)
    : [
        ...(response.reports || []).map(item => `report-${item._id}`),
        ...(response.papers || []).map(item => `paper-${item._id}`),
        ...(response.englishSessions || []).map(item => `english-session-${item._id}`),
        ...(response.learningResourcePacks || []).map(item => `learning-resource-${item._id}`)
      ]
  return {
    databaseReadBytes,
    responseBytes: Buffer.byteLength(JSON.stringify(response)),
    visibleIds
  }
}

async function measureTimelinePayload() {
  const seed = buildRepresentativeTimelineSeed()
  const [legacy, projected] = await Promise.all([
    runTimeline(seed, true),
    runTimeline(seed, false)
  ])
  const databaseReadReduction = legacy.databaseReadBytes
    ? 1 - projected.databaseReadBytes / legacy.databaseReadBytes
    : 0
  return {
    timestamp: new Date().toISOString(),
    fixture: {
      reports: seed.reports.length,
      papers: seed.papers.length,
      englishSessions: seed.englishPracticeSessions.length,
      learningResourcePacks: seed.learningResourcePacks.length
    },
    legacy,
    projected,
    databaseReadReduction,
    visibleOrderingUnchanged: JSON.stringify(legacy.visibleIds) === JSON.stringify(projected.visibleIds),
    thresholds: {
      minimumDatabaseReadReduction: 0.6,
      databaseReadBytes: 256 * 1024,
      responseBytes: 128 * 1024
    }
  }
}

async function main() {
  const report = await measureTimelinePayload()
  const outputPath = path.resolve('tmp/performance/timeline-payload-baseline.json')
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  console.log(`Timeline payload baseline: ${outputPath}`)
  const passed = report.visibleOrderingUnchanged
    && report.databaseReadReduction >= report.thresholds.minimumDatabaseReadReduction
    && report.projected.databaseReadBytes < report.thresholds.databaseReadBytes
    && report.projected.responseBytes < report.thresholds.responseBytes
  process.exitCode = passed ? 0 : 1
}

if (require.main === module) {
  main().catch(error => {
    console.error(error && (error.stack || error.message || String(error)))
    process.exitCode = 2
  })
}

module.exports = {
  buildRepresentativeTimelineSeed,
  measureTimelinePayload
}
