const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const {
  parseRealDataSmokeConfig,
  buildSmokeRoutes
} = require('../scripts/real-data-smoke-config')

test('real data smoke config requires a student id', () => {
  assert.throws(
    () => parseRealDataSmokeConfig({ env: {}, argv: [] }),
    /REAL_DATA_STUDENT_ID/
  )
})

test('real data smoke config builds default routes for one student', () => {
  const config = parseRealDataSmokeConfig({
    env: {
      REAL_DATA_STUDENT_ID: 'student-1',
      REAL_DATA_STUDENT_NAME: '钟青羽'
    },
    argv: []
  })

  assert.equal(config.studentId, 'student-1')
  assert.equal(config.studentName, '钟青羽')
  assert.equal(config.routes.length, 6)
  assert.deepEqual(config.routes.map(route => route.name), [
    '首页',
    '学习档案',
    '数学工作台',
    '学习卡点中心',
    '学习记录',
    '生成验证试卷'
  ])
  assert.match(config.routes[1].path, /studentId=student-1/)
  assert.match(config.routes[1].path, /studentName=%E9%92%9F%E9%9D%92%E7%BE%BD/)
})

test('real data smoke config accepts explicit route list and output directory', () => {
  const outDir = path.join('/tmp', 'ldx-smoke')
  const config = parseRealDataSmokeConfig({
    env: {
      REAL_DATA_STUDENT_ID: 'student-1',
      REAL_DATA_SMOKE_ROUTES: 'profile,bottlenecks',
      REAL_DATA_SMOKE_OUTPUT_DIR: outDir
    },
    argv: []
  })

  assert.equal(config.outputDir, outDir)
  assert.deepEqual(config.routes.map(route => route.key), ['profile', 'bottlenecks'])
})

test('real data smoke config rejects unknown routes', () => {
  assert.throws(
    () => parseRealDataSmokeConfig({
      env: {
        REAL_DATA_STUDENT_ID: 'student-1',
        REAL_DATA_SMOKE_ROUTES: 'profile,unknown'
      },
      argv: []
    }),
    /未知烟测页面/
  )
})

test('real data smoke routes can be built directly for docs and scripts', () => {
  const routes = buildSmokeRoutes({
    studentId: 'student-1',
    studentName: '',
    routeKeys: ['subjectMath', 'records']
  })

  assert.deepEqual(routes.map(route => route.name), ['数学工作台', '学习记录'])
  assert.match(routes[0].path, /subject-home/)
  assert.match(routes[1].path, /upload-history/)
})
