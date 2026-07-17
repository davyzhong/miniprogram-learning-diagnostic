const test = require('node:test')
const assert = require('node:assert/strict')
const {
  buildTraceableUrl,
  fallbackTraceableAction,
  isTraceableAction,
  normalizeTraceableAction
} = require('../miniprogram/utils/traceable-actions')

test('traceable actions build deterministic page urls', () => {
  assert.equal(
    buildTraceableUrl({
      type: 'subject-home',
      studentId: 'student-1',
      studentName: '钟青羽',
      grade: 6,
      subject: 'math',
      subjectName: '数学'
    }),
    '/pages/subject-home/subject-home?studentId=student-1&subject=math&subjectName=%E6%95%B0%E5%AD%A6&studentName=%E9%92%9F%E9%9D%92%E7%BE%BD&grade=6'
  )

  assert.equal(
    buildTraceableUrl({ type: 'report-detail', id: 'report-1' }),
    '/pages/report/report?id=report-1'
  )

  assert.equal(
    buildTraceableUrl({ type: 'paper-workbench', id: 'paper-1' }),
    '/pages/paper-preview/paper-preview?paperId=paper-1'
  )

  assert.equal(
    buildTraceableUrl({
      type: 'bottleneck-detail',
      studentId: 'student-1',
      subject: 'math',
      id: 'LP-001',
      studentName: '钟青羽'
    }),
    '/pages/bottleneck-detail/bottleneck-detail?studentId=student-1&subject=math&lpCode=LP-001&studentName=%E9%92%9F%E9%9D%92%E7%BE%BD'
  )

  assert.equal(
    buildTraceableUrl({
      type: 'learning-progress',
      studentId: 'student-1',
      subject: 'math',
      studentName: '钟青羽'
    }),
    '/pages/learning-progress/learning-progress?studentId=student-1&subject=math&studentName=%E9%92%9F%E9%9D%92%E7%BE%BD'
  )
})

test('traceable actions support list, permission and empty-state fallbacks', () => {
  assert.equal(
    buildTraceableUrl({
      type: 'learning-records',
      studentId: 'student-1',
      studentName: '钟青羽',
      subject: 'math',
      filter: 'pending-upload'
    }),
    '/pages/upload-history/upload-history?studentId=student-1&studentName=%E9%92%9F%E9%9D%92%E7%BE%BD&subject=math&filter=pending-upload'
  )

  assert.equal(
    buildTraceableUrl({
      type: 'permission-info',
      studentId: 'student-1',
      title: '共同家长权限'
    }),
    '/pages/parent-management/parent-management?studentId=student-1&mode=permission&title=%E5%85%B1%E5%90%8C%E5%AE%B6%E9%95%BF%E6%9D%83%E9%99%90'
  )

  assert.equal(
    buildTraceableUrl(fallbackTraceableAction('empty', {
      studentId: 'student-1',
      subject: 'math',
      title: '暂无诊断记录'
    })),
    '/pages/upload-history/upload-history?studentId=student-1&subject=math&empty=1&title=%E6%9A%82%E6%97%A0%E8%AF%8A%E6%96%AD%E8%AE%B0%E5%BD%95'
  )
})

test('traceable action normalization rejects unknown actions safely', () => {
  assert.equal(isTraceableAction({ type: 'report-detail', id: 'report-1' }), true)
  assert.equal(isTraceableAction({ type: 'unknown', id: 'x' }), false)
  assert.equal(normalizeTraceableAction(null), null)
  assert.equal(buildTraceableUrl({ type: 'unknown', id: 'x' }), null)
})
