const test = require('node:test')
const assert = require('node:assert/strict')
const { createWxMock, loadPage } = require('./helpers/page-harness')

test('Chinese review detail uses readable evidence and starts a targeted original-item review', async () => {
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/chinese-review-detail/chinese-review-detail.js', {
    wx,
    modules: { '../../utils/cloud': { getSubjectProfile: async () => ({
      chineseReviewItems: [{ itemId: 'item-1', targetText: '辩论', lastWrongAnswer: '辨论', mistakeType: '形近字混淆', sourceContext: '看拼音写词语', status: 'needs_review' }]
    }) } }
  })
  await page.onLoad({ studentId: 'student-1', reviewItemId: 'item-1' })
  assert.equal(page.data.item.title, '辩论')
  assert.equal(page.data.item.wrong, '辨论')
  assert.equal(page.data.item.stage, '原项复测')
  page.onStartTap()
  const url = wx.calls.find(call => call.name === 'navigateTo').payload.url
  assert.match(url, /subject=chinese/)
  assert.match(url, /targetCode=item-1/)
  assert.doesNotMatch(page.data.item.title, /item-1|LP-/)
})
