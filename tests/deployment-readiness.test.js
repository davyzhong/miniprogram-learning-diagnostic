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
  'englishVocabulary',
  'learningResource'
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

test('generatePaper PDF display helpers are self-contained for single-function deployment', () => {
  const sources = [
    read('cloudfunctions/generatePaper/index.js'),
    read('cloudfunctions/generatePaper/pdf-renderer.js'),
    read('cloudfunctions/generatePaper/bottleneck-display.js')
  ].join('\n')

  assert.ok(exists('cloudfunctions/generatePaper/bottleneck-name.js'))
  assert.ok(exists('cloudfunctions/generatePaper/constants.js'))
  assert.ok(exists('cloudfunctions/generatePaper/access.js'))
  assert.doesNotMatch(sources, /require\(['"]\.\.\/_shared\//)
  assert.match(sources, /require\(['"]\.\/bottleneck-name['"]\)/)
  assert.match(sources, /require\(['"]\.\/constants['"]\)/)
  assert.match(sources, /require\(['"]\.\/access['"]\)/)
})

test('math learning map seed data is packaged with the miniprogram runtime', () => {
  const runtimeSeeds = [
    'knowledge-nodes.seed',
    'bottleneck-taxonomy-v2.seed',
    'learning-resources.seed'
  ]
  const source = read('miniprogram/utils/math-learning-map.js')

  for (const seedName of runtimeSeeds) {
    const sourcePath = `data/math/${seedName}.json`
    const runtimePath = `miniprogram/data/math/${seedName}.js`

    assert.ok(exists(runtimePath), `${runtimePath} should be packaged for miniprogram runtime`)
    assert.deepEqual(require(path.join(root, runtimePath)), JSON.parse(read(sourcePath)), `${runtimePath} should match ${sourcePath}`)
    assert.match(source, new RegExp(`require\\(['"]\\.\\./data/math/${seedName.replaceAll('.', '\\.')}['"]\\)`))
  }

  assert.doesNotMatch(source, /require\(['"][^'"]+\.json['"]\)/)
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

// ── Project structural integrity (merged from project-integrity.test.js) ──

test('every registered page has its complete four-file bundle', () => {
  const app = require('../miniprogram/app.json')
  for (const page of app.pages) {
    for (const extension of ['js', 'json', 'wxml', 'wxss']) {
      assert.equal(
        fs.existsSync(path.join(root, 'miniprogram', `${page}.${extension}`)),
        true,
        `${page}.${extension} is missing`
      )
    }
  }
})

test('every WXML event handler exists on its page controller', () => {
  const pagesDir = path.join(root, 'miniprogram/pages')
  for (const directory of fs.readdirSync(pagesDir)) {
    const base = path.join(pagesDir, directory, directory)
    if (!fs.existsSync(`${base}.wxml`)) continue
    const wxml = fs.readFileSync(`${base}.wxml`, 'utf8')
    let js = fs.readFileSync(`${base}.js`, 'utf8')
    // If the page spreads shared navigation, include those handlers too
    if (js.includes('sharedNavigation')) {
      js += fs.readFileSync(path.join(root, 'miniprogram/utils/shared-navigation.js'), 'utf8')
    }
    const handlers = [...wxml.matchAll(/(?:bind|catch)(?:tap|input|change|submit|longpress)="([^"]+)"/g)]
      .map(match => match[1])
    for (const handler of handlers) {
      assert.match(js, new RegExp(`\\b${handler}\\s*\\(`), `${directory} is missing ${handler}`)
    }
  }
})

test('brand illustration and logo assets exist', () => {
  const assets = [
    'miniprogram/assets/images/math-diagnostic-guide.jpg',
    'miniprogram/assets/images/app-logo-share.jpg',
    'brand-assets/app-logo.png'
  ]

  for (const asset of assets) {
    const absolutePath = path.join(root, asset)
    assert.equal(fs.existsSync(absolutePath), true, `${asset} is missing`)
    assert.ok(fs.statSync(absolutePath).size > 0, `${asset} is empty`)
  }
})
