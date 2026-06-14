const test = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const cli = path.join(root, 'cli/ldx.js')

function createFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ldx-fixture-'))
  const fixturePath = path.join(dir, 'fixture.json')
  fs.writeFileSync(fixturePath, JSON.stringify({
    uploadAndAnalyze: { success: true, reportId: 'report-1', status: 'analyzing' },
    getAnalysisProgress: { success: true, reportId: 'report-1', status: 'completed', progress: 100 },
    getReportDetail: {
      success: true,
      report: {
        _id: 'report-1',
        type: 'diagnosis',
        subject: 'math',
        summary: '发现计算基础卡点',
        bottlenecks: [{ lpCode: 'LP-001', lpName: '计算错误（加减乘除）' }],
        errorDetails: []
      }
    },
    generateReportPDF: { success: true, reportId: 'report-1', pdfFileId: 'cloud://report.pdf', totalPages: 2 },
    getSubjectDashboard: {
      success: true,
      profile: {
        studentId: 'student-1',
        subject: 'math',
        currentBottlenecks: [{ lpCode: 'LP-001', lpName: '计算错误（加减乘除）', status: 'needs_verification' }]
      }
    },
    generatePaper: {
      success: true,
      paperId: 'paper-1',
      paperDisplayCode: '数学-20260614-01',
      pdfFileId: 'cloud://paper.pdf',
      questionCount: 3,
      studentPages: 1,
      answerPages: 1,
      totalPages: 2,
      bottleneckSummaries: ['计算基础']
    },
    getLearningTimeline: {
      success: true,
      items: [{ type: 'report', title: '数学诊断报告', summary: '发现计算基础' }]
    }
  }, null, 2))
  return fixturePath
}

function run(args, fixturePath = createFixture()) {
  return spawnSync(process.execPath, [cli, ...args, '--fixture', fixturePath, '--format', 'json'], {
    cwd: root,
    encoding: 'utf8'
  })
}

function parseJson(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return JSON.parse(result.stdout)
}

test('ldx upload photos starts a diagnosis from cloud file IDs', () => {
  const result = run(['upload', 'photos', '--student', 'student-1', '--subject', 'math', '--file-id', 'cloud://a.jpg'])
  const json = parseJson(result)

  assert.equal(json.reportId, 'report-1')
  assert.equal(json.status, 'analyzing')
})

test('ldx report show and report pdf expose diagnostic report outputs', () => {
  const show = parseJson(run(['report', 'show', '--report', 'report-1']))
  assert.equal(show.summary, '发现计算基础卡点')
  assert.equal(show.bottlenecks[0].displayName, '计算基础')

  const pdf = parseJson(run(['report', 'pdf', '--report', 'report-1']))
  assert.equal(pdf.pdfFileId, 'cloud://report.pdf')
})

test('ldx bottleneck list, paper generate, verification upload and timeline show cover P0 commands', () => {
  const bottlenecks = parseJson(run(['bottleneck', 'list', '--student', 'student-1', '--subject', 'math']))
  assert.equal(bottlenecks.active[0].name, '计算基础')

  const paper = parseJson(run(['paper', 'generate', '--student', 'student-1', '--subject', 'math', '--targets', 'LP-001']))
  assert.equal(paper.paperDisplayCode, '数学-20260614-01')

  const verification = parseJson(run(['verification', 'upload', '--student', 'student-1', '--subject', 'math', '--paper', 'paper-1', '--file-id', 'cloud://answer.jpg']))
  assert.equal(verification.reportId, 'report-1')

  const timeline = parseJson(run(['timeline', 'show', '--student', 'student-1', '--subject', 'math']))
  assert.equal(timeline.items[0].title, '数学诊断报告')
})

test('ldx returns non-zero and a readable error when required arguments are missing', () => {
  const result = spawnSync(process.execPath, [cli, 'report', 'show', '--format', 'json'], {
    cwd: root,
    encoding: 'utf8'
  })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /缺少 --report/)
})
