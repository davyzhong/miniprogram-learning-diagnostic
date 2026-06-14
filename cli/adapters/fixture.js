const fs = require('node:fs')

function readFixture(fixturePath) {
  if (!fixturePath) {
    throw new Error('缺少 --fixture。当前 CLI 先支持 fixture adapter，真实 CloudBase adapter 将在后续阶段接入。')
  }
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function valueOf(fixture, key, params) {
  const value = fixture[key]
  if (typeof value === 'function') return value(params)
  if (Array.isArray(value)) return clone(value.shift ? value.shift() : value[0])
  if (value !== undefined) return clone(value)
  return { success: false, error: `fixture 缺少 ${key}` }
}

function createFixtureAdapter(fixturePath) {
  let fixture = null
  function fixtureOf() {
    if (!fixture) fixture = readFixture(fixturePath)
    return fixture
  }

  return {
    uploadAndAnalyze(params) {
      return Promise.resolve(valueOf(fixtureOf(), 'uploadAndAnalyze', params))
    },
    getAnalysisProgress(params) {
      return Promise.resolve(valueOf(fixtureOf(), 'getAnalysisProgress', params))
    },
    getReportDetail(params) {
      return Promise.resolve(valueOf(fixtureOf(), 'getReportDetail', params))
    },
    generateReportPDF(params) {
      return Promise.resolve(valueOf(fixtureOf(), 'generateReportPDF', params))
    },
    getSubjectDashboard(params) {
      return Promise.resolve(valueOf(fixtureOf(), 'getSubjectDashboard', params))
    },
    generatePaper(params) {
      return Promise.resolve(valueOf(fixtureOf(), 'generatePaper', params))
    },
    getLearningTimeline(params) {
      return Promise.resolve(valueOf(fixtureOf(), 'getLearningTimeline', params))
    }
  }
}

module.exports = {
  createFixtureAdapter
}
