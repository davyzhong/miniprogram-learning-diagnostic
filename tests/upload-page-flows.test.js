const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ROOT = path.resolve(__dirname, '..')
const { loadPageAndWait, flushAsync, waitForPageLoad, isThenable } = require('./helpers/page-flow-utils')
const { createWxMock, loadPage } = require('./helpers/page-harness')
const util = require('../miniprogram/utils/util')

test('upload selection warns about duplicate filenames but keeps the images', () => {
  const wx = createWxMock({
    chooseMedia: options => options.success({
      tempFiles: [
        { tempFilePath: '/tmp/paper.jpg', size: 100 },
        { tempFilePath: '/other/paper.jpg', size: 100 }
      ]
    })
  })
  const { page } = loadPage('miniprogram/pages/upload/upload.js', {
    wx,
    modules: { '../../utils/cloud': {} }
  })
  page.setData({ existingFileNames: ['paper.jpg'] })

  page.onChooseImage()
  assert.equal(page.data.images.length, 2)
  assert.ok(page.data.images.every(image => image.nameDuplicate))
  assert.equal(wx.calls.find(call => call.name === 'showToast').payload.title, '发现同名照片，仍可继续上传')
})

test('upload converts HEIF selections to JPEG before upload', async () => {
  let uploaded = null
  const wx = createWxMock({
    chooseMedia: options => options.success({
      tempFiles: [
        { tempFilePath: '/tmp/paper.HEIC', size: 100 }
      ]
    }),
    compressImage: options => {
      assert.equal(options.src, '/tmp/paper.HEIC')
      options.success({ tempFilePath: '/tmp/paper-converted.jpg' })
    },
    cloud: {
      uploadFile: options => {
        uploaded = options
        options.success({ fileID: 'cloud://paper-converted' })
      }
    }
  })
  const { page } = loadPage('miniprogram/pages/upload/upload.js', {
    wx,
    modules: { '../../utils/cloud': {} }
  })
  page.setData({ studentId: 'student-1', subject: 'math' })

  await page.onChooseImage()

  assert.equal(page.data.images.length, 1)
  assert.equal(page.data.images[0].tempPath, '/tmp/paper-converted.jpg')
  assert.equal(page.data.images[0].originalTempPath, '/tmp/paper.HEIC')
  assert.equal(page.data.images[0].fileName, 'paper.jpg')
  assert.equal(page.data.images[0].originalFileName, 'paper.HEIC')
  assert.equal(page.data.images[0].convertedFromHeif, true)

  const fileId = await page.uploadOne(page.data.images[0], 0)
  assert.equal(fileId, 'cloud://paper-converted')
  assert.equal(uploaded.filePath, '/tmp/paper-converted.jpg')
  assert.match(uploaded.cloudPath, /\.jpg$/)
})


test('upload submits file metadata and navigates back on success', async () => {
  let submitted = null
  const cloud = {
    callUploadAndAnalyze: async payload => {
      submitted = payload
      return { success: true, reportId: 'report-1' }
    }
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/upload/upload.js', {
    wx,
    modules: { '../../utils/cloud': cloud }
  })
  page.uploadOne = async (_, index) => `cloud://photo-${index + 1}`
  page.setData({
    studentId: 'student-1',
    subject: 'math',
    mode: 'diagnosis',
    images: [{ tempPath: '/tmp/paper.jpg', fileName: 'paper.jpg', fileSize: 100 }]
  })

  await page.onSubmit()
  assert.deepEqual(
    JSON.parse(JSON.stringify(submitted.imageMetas)),
    [{ fileName: 'paper.jpg', fileSize: 100 }]
  )
  assert.equal(page.data.uploadProgress, 100)
  assert.equal(wx.calls.find(call => call.name === 'showToast').payload.title, '已提交，AI 正在分析')
  assert.ok(wx.calls.some(call => call.name === 'navigateBack'))
})

test('verification upload page shows the paper code context', async () => {
  const cloud = {
    getPaperDetail: async paperId => ({
      paper: {
        _id: paperId,
        subject: 'math',
        type: 'verification',
        paperDisplayCode: '数学-20260613-01',
        questions: [{}, {}, {}, {}, {}, {}]
      }
    })
  }
  const { page } = loadPage('miniprogram/pages/upload/upload.js', {
    modules: { '../../utils/cloud': cloud }
  })

  await page.loadPaperContext('paper-1')

  assert.equal(page.data.paperCodeText, '数学-20260613-01')
  assert.equal(page.data.paperName, '验证试卷')
  assert.equal(page.data.paperQuestionCount, 6)
})
