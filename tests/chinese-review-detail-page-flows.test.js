const test = require('node:test')
const assert = require('node:assert/strict')
const { createWxMock, loadPage } = require('./helpers/page-harness')
const fs = require('node:fs')
const path = require('node:path')
const ROOT = path.resolve(__dirname, '..')

test('Chinese review pages retain original-item and task submission bindings', () => {
  const detail = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/chinese-review-detail/chinese-review-detail.wxml'), 'utf8')
  const task = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/chinese-skill-task/chinese-skill-task.wxml'), 'utf8')

  assert.match(detail, /class="page bplus-page b1-page b1-subject-chinese"/)
  assert.match(detail, /bindtap="onStartTap">开始原项复测</)
  assert.match(task, /class="page bplus-page b1-page b1-subject-chinese"/)
  assert.match(task, /value="\{\{answer\}\}" bindinput="onInput"/)
  assert.match(task, /bindtap="onSubmit" loading="\{\{submitting\}\}"/)
})

test('Chinese review detail uses readable evidence and starts a targeted original-item review', async () => {
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/chinese-review-detail/chinese-review-detail.js', {
    wx,
    modules: { '../../utils/cloud': { getSubjectProfile: async () => ({
      chineseReviewItems: [{ itemId: 'item-1', targetText: '辩论', lastWrongAnswer: '辨论', mistakeType: '形近字混淆', sourceContext: '看拼音写词语', status: 'needs_review' }]
    }) } }
  })
  await page.loadDetail({ studentId: 'student-1', reviewItemId: 'item-1' })
  assert.equal(page.data.item.title, '辩论')
  assert.equal(page.data.item.wrong, '辨论')
  assert.equal(page.data.item.stage, '原项复测')
  page.onStartTap()
  const url = wx.calls.find(call => call.name === 'navigateTo').payload.url
  assert.match(url, /subject=chinese/)
  assert.match(url, /targetCode=item-1/)
  assert.doesNotMatch(page.data.item.title, /item-1|LP-/)
})
