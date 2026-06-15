const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createCloudMock,
  createDatabase,
  loadModule
} = require('./helpers/cloud-function-harness')

function loadReportFeedback(db, openId = 'owner-1') {
  const cloud = createCloudMock({ db, openId })
  const handler = loadModule('cloudfunctions/reportFeedback/index.js', {
    'wx-server-sdk': cloud
  })
  return { handler, cloud }
}

test('owner can submit report feedback without mutating the original report', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '学生' }],
    reports: [{
      _id: 'report-1',
      _openid: 'owner-1',
      studentId: 'student-1',
      subject: 'math',
      status: 'completed',
      summary: '原始报告'
    }],
    reportFeedback: []
  })
  const { handler } = loadReportFeedback(db)

  const result = await handler.main({
    action: 'createFeedback',
    reportId: 'report-1',
    type: 'wrong_bottleneck',
    targetType: 'bottleneck',
    targetId: 'LP-001',
    reason: '卡点不准确',
    note: '孩子这题其实是抄错'
  })

  assert.equal(result.success, true)
  assert.equal(db.dump('reportFeedback').length, 1)
  assert.equal(db.dump('reportFeedback')[0].status, 'submitted')
  assert.equal(db.dump('reports')[0].summary, '原始报告')
})

test('shared viewer can submit feedback but unrelated users cannot', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '学生' }],
    studentMembers: [{
      _id: 'member-1',
      studentId: 'student-1',
      memberOpenId: 'viewer-1',
      role: 'viewer',
      status: 'active'
    }],
    reports: [{
      _id: 'report-1',
      _openid: 'owner-1',
      studentId: 'student-1',
      subject: 'math',
      status: 'completed'
    }],
    reportFeedback: []
  })

  const viewer = loadReportFeedback(db, 'viewer-1')
  assert.equal((await viewer.handler.main({
    action: 'createFeedback',
    reportId: 'report-1',
    type: 'unclear_result',
    targetType: 'report',
    reason: '结果看不懂'
  })).success, true)

  const stranger = loadReportFeedback(db, 'stranger-1')
  const denied = await stranger.handler.main({
    action: 'createFeedback',
    reportId: 'report-1',
    type: 'unclear_result',
    targetType: 'report',
    reason: '无权限'
  })

  assert.equal(denied.success, false)
  assert.match(denied.error, /无权限/)
})

test('lists feedback for a report after access checks and sanitizes invalid input', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '学生' }],
    reports: [{
      _id: 'report-1',
      _openid: 'owner-1',
      studentId: 'student-1',
      subject: 'math',
      status: 'completed'
    }],
    reportFeedback: []
  })
  const { handler } = loadReportFeedback(db)

  const invalid = await handler.main({
    action: 'createFeedback',
    reportId: 'report-1',
    type: 'not_allowed',
    targetType: 'bad',
    reason: ''
  })
  assert.equal(invalid.success, false)

  await handler.main({
    action: 'createFeedback',
    reportId: 'report-1',
    type: 'wrong_question',
    targetType: 'errorDetail',
    targetId: '0',
    reason: '题目识别错'
  })

  const listed = await handler.main({ action: 'listFeedbackByReport', reportId: 'report-1' })
  assert.equal(listed.success, true)
  assert.equal(listed.items.length, 1)
  assert.equal(listed.items[0].type, 'wrong_question')
})

test('handles missing feedback collection by returning empty list and creating on submit', async () => {
  const db = createDatabase({
    students: [{ _id: 'student-1', _openid: 'owner-1', name: '学生' }],
    reports: [{
      _id: 'report-1',
      _openid: 'owner-1',
      studentId: 'student-1',
      subject: 'math',
      status: 'completed'
    }]
  }, { missingCollections: ['reportFeedback'] })
  const { handler } = loadReportFeedback(db)

  const listed = await handler.main({ action: 'listFeedbackByReport', reportId: 'report-1' })
  assert.equal(listed.success, true)
  assert.deepEqual(JSON.parse(JSON.stringify(listed.items)), [])

  const created = await handler.main({
    action: 'createFeedback',
    reportId: 'report-1',
    type: 'unclear_result',
    targetType: 'report',
    reason: '需要复核'
  })
  assert.equal(created.success, true)
  assert.equal(db.dump('reportFeedback').length, 1)
})
