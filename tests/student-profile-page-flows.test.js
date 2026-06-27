const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ROOT = path.resolve(__dirname, '..')
const { loadPageAndWait, flushAsync, waitForPageLoad, isThenable } = require('./helpers/page-flow-utils')
const { createWxMock, loadPage } = require('./helpers/page-harness')
const util = require('../miniprogram/utils/util')

test('student profile page loads one child and keeps profile actions clickable', async () => {
  const wx = createWxMock()
  const cloud = {
    getStudentDashboard: async studentId => {
      assert.equal(studentId, 'student-1')
      return {
        student: { _id: 'student-1', name: '钟青羽', grade: 6 },
        permissions: { canView: true, canManageParents: true, canUpload: true, canGeneratePaper: true },
        subjectProfiles: [{
          subject: 'math',
          totalReports: 1,
          currentBottlenecks: [{ lpCode: 'LP-001', lpName: '计算错误（加减乘除）', status: 'needs_verification' }]
        }],
        recentReports: [{
          _id: 'report-1',
          subject: 'math',
          type: 'diagnosis',
          status: 'completed',
          createdAt: '2026-06-12T10:00:00Z',
          bottlenecks: [{ lpCode: 'LP-001' }]
        }],
        recentPapers: []
      }
    }
  }
  const { page } = loadPage('miniprogram/pages/student-profile/student-profile.js', {
    wx,
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { ...util, formatRelativeTime: () => '今天' }
    }
  })

  page.setData({ studentId: 'student-1' })
  await page.loadProfile()

  assert.equal(page.data.home.studentName, '钟青羽')
  assert.equal(page.data.home.nextAction.primaryText, '下载验证卷')
  page.onPrimaryReportTap()
  page.onViewAllRecords()
  page.onSubjectTap({ currentTarget: { dataset: { subject: 'math' } } })
  const urls = wx.calls.filter(call => call.name === 'navigateTo').map(call => call.payload.url)
  assert.match(urls[0], /pages\/report\/report\?id=report-1/)
  assert.match(urls[1], /pages\/upload-history\/upload-history/)
  assert.match(urls[2], /pages\/subject-home\/subject-home/)
})

test('student profile reuses a fresh dashboard snapshot on repeated loads', async () => {
  let dashboardCalls = 0
  const cloud = {
    getStudentDashboard: async studentId => {
      dashboardCalls += 1
      return {
        student: { _id: studentId, name: '钟青羽', grade: 6 },
        permissions: { canView: true, canManageParents: true, canUpload: true, canGeneratePaper: true },
        subjectProfiles: [],
        recentReports: [],
        recentPapers: []
      }
    }
  }
  const { page } = loadPage('miniprogram/pages/student-profile/student-profile.js', {
    modules: {
      '../../utils/cloud': cloud,
      '../../utils/util': { ...util, formatRelativeTime: () => '今天' }
    }
  })
  page.setData({ studentId: 'student-1' })

  await page.loadProfile()
  await page.loadProfile()

  assert.equal(dashboardCalls, 1)
  assert.equal(page.data.loading, false)
  assert.equal(page.data.home.studentName, '钟青羽')
})
