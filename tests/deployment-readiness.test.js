const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath))
}

const REQUIRED_CLOUD_FUNCTIONS = [
  'uploadAndAnalyze',
  'analyzePhotos',
  'analyzeBatch',
  'generatePaper',
  'generateReportPDF',
  'getAnalysisProgress',
  'studentData',
  'studentAccess',
  'reportFeedback',
  'englishVocabulary'
]

test('deployable cloud functions have required manifests and timeout configs', () => {
  for (const name of REQUIRED_CLOUD_FUNCTIONS) {
    assert.ok(exists(`cloudfunctions/${name}`), `${name} folder should exist`)
    assert.ok(exists(`cloudfunctions/${name}/package.json`), `${name} should declare package.json`)
    assert.ok(exists(`cloudfunctions/${name}/config.json`), `${name} should declare config.json`)

    const pkg = JSON.parse(read(`cloudfunctions/${name}/package.json`))
    const config = JSON.parse(read(`cloudfunctions/${name}/config.json`))

    assert.equal(pkg.name, name, `${name} package name should match folder`)
    assert.equal(typeof config.timeout, 'number', `${name} timeout should be numeric`)
    assert.ok(config.timeout > 0 && config.timeout <= 60, `${name} timeout should be within CloudBase limit`)
  }
})

test('frontend cloud data layer exposes wrappers for deployable learning functions', () => {
  const source = read('miniprogram/utils/cloud.js')
  const expectedWrappers = [
    'callUploadAndAnalyze',
    'callAnalyzePhotos',
    'callGeneratePaper',
    'callGenerateReportPDF',
    'getAnalysisProgress',
    'getAccessibleStudents',
    'getStudentDashboard',
    'getSubjectDashboard',
    'getLearningTimeline',
    'cleanupStaleLearningRecords',
    'getReportDetail',
    'getPaperDetail',
    'createReportFeedback',
    'getReportFeedback',
    'getEnglishVocabularySummary',
    'createEnglishImportBatch',
    'confirmEnglishImportBatch',
    'seedEnglishPersonalVocabulary',
    'generateEnglishRecognitionSession',
    'submitEnglishRecognitionAttempt',
    'generateEnglishPracticeSession',
    'submitEnglishPracticeResult'
  ]

  for (const wrapper of expectedWrappers) {
    assert.match(source, new RegExp(`async function ${wrapper}\\b`), `${wrapper} should be implemented`)
    assert.match(source, new RegExp(`\\b${wrapper},`), `${wrapper} should be exported`)
  }
})

test('English vocabulary cloud function package is self-contained for deployment', () => {
  const source = read('cloudfunctions/englishVocabulary/index.js')

  assert.ok(exists('cloudfunctions/englishVocabulary/zhong-qingyu-pep-vocabulary.json'))
  assert.ok(exists('cloudfunctions/englishVocabulary/access.js'))
  assert.ok(exists('cloudfunctions/englishVocabulary/english-vocabulary.js'))
  assert.match(source, /require\(['"]\.\/access['"]\)/)
  assert.match(source, /require\(['"]\.\/english-vocabulary['"]\)/)
})

test('deployment workflow is documented and exposed as a package script', () => {
  const pkg = JSON.parse(read('package.json'))

  assert.ok(exists('docs/DEPLOYMENT.md'), 'deployment guide should exist')
  assert.match(read('docs/DEPLOYMENT.md'), /微信开发者工具 CLI/)
  assert.match(read('docs/DEPLOYMENT.md'), /uploadAndAnalyze/)
  assert.equal(pkg.scripts['check:deployment'], 'node --test tests/deployment-readiness.test.js')
  assert.match(pkg.scripts.test, /tests\/deployment-readiness\.test\.js/)
})

test('release and rollback workflow is documented and exposed as a package script', () => {
  const pkg = JSON.parse(read('package.json'))

  assert.ok(exists('docs/RELEASE_CHECKLIST.md'), 'release checklist should exist')
  const checklist = read('docs/RELEASE_CHECKLIST.md')
  assert.match(checklist, /npm run verify/)
  assert.match(checklist, /npm run test:coverage/)
  assert.match(checklist, /git diff --check/)
  assert.match(checklist, /cli preview/)
  assert.match(checklist, /云函数/)
  assert.match(checklist, /回滚/)
  assert.equal(pkg.scripts['release:check'], 'npm run check:deployment && npm run verify && npm run test:coverage')
  assert.match(read('README.md'), /docs\/RELEASE_CHECKLIST\.md/)
})
