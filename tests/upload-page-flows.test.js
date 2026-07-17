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


test('upload submits file metadata and navigates to report page on success', async () => {
  let submitted = null
  const cloud = {
    callUploadAndAnalyze: async payload => {
      submitted = payload
      return { success: true, reportId: 'report-1' }
    },
    getBetaAuth: async () => ({ success: true, consented: true })
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
    images: [{ tempPath: '/tmp/paper.jpg', fileName: 'paper.jpg', fileSize: 100 }],
    betaConsented: true
  })

  await page.onSubmit()
  assert.deepEqual(
    JSON.parse(JSON.stringify(submitted.imageMetas)),
    [{ fileName: 'paper.jpg', fileSize: 100 }]
  )
  assert.equal(page.data.uploadProgress, 100)
  assert.equal(wx.calls.find(call => call.name === 'showToast').payload.title, '已提交，AI 正在分析')
  // 上传成功后跳转到报告页轮询分析结果（而非 navigateBack）
  const navCalls = wx.calls.filter(call => call.name === 'navigateTo')
  assert.ok(navCalls.length > 0, 'should navigateTo to report page')
  assert.match(navCalls[0].payload.url, /pages\/report\/report\?id=report-1/)
})

test('upload hides backend details in image errors and failure toasts', async () => {
  const wx = createWxMock()
  const cloud = {
    callUploadAndAnalyze: async () => {
      throw new Error('失败 BN-ERROR-01 cloud://env/file')
    }
  }
  const { page } = loadPage('miniprogram/pages/upload/upload.js', {
    wx,
    modules: { '../../utils/cloud': cloud }
  })
  page.uploadOne = async () => 'cloud://internal/uploaded-file'
  page.setData({
    studentId: 'student-route-id',
    subject: 'math',
    images: [{ tempPath: '/tmp/paper.jpg', fileName: 'paper.jpg', fileSize: 100 }],
    betaConsented: true
  })

  await page.onSubmit()

  assert.equal(wx.calls.filter(call => call.name === 'showToast').at(-1).payload.title, '上传失败，请稍后重试')
  assert.doesNotMatch(page.data.images[0].uploadError || '', /BN-|cloud:\/\//)
  assert.equal(page.data.studentId, 'student-route-id')
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

test('upload page keeps dense text-only guidance and accessible image controls', () => {
  const wxml = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/upload/upload.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/upload/upload.wxss'), 'utf8')

  for (const label of ['光线', '铺平', '清晰', '红笔']) assert.match(wxml, new RegExp(`>${label}<`))
  assert.match(wxml, /class="delete-btn" aria-label="删除图片" catchtap="onDeleteImage" data-index="\{\{index\}\}">删除<\/view>/)
  assert.match(wxml, /class="async-state">后台分析<\/text>/)
  assert.doesNotMatch(wxml, /⌛|⏳/)
  assert.match(wxml, /bindtap="onChooseImage"/)
  assert.match(wxml, /catchtap="onDeleteImage" data-index="\{\{index\}\}"/)
  assert.match(wxml, /bindtap="onSubmit"/)
  assert.match(wxss, /\.photo-tips\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*1fr\)/s)
  assert.match(wxss, /\.async-state\s*\{/)
})

test('upload submits images with a 3-way concurrency pool while preserving order', async () => {
  let active = 0
  let maxActive = 0
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
  page.uploadOne = async (image, index) => {
    active += 1
    maxActive = Math.max(maxActive, active)
    await new Promise(resolve => setImmediate(resolve))
    active -= 1
    return `cloud://photo-${index}`
  }
  page.setData({
    studentId: 'student-1',
    subject: 'math',
    mode: 'diagnosis',
    betaConsented: true,
    images: Array.from({ length: 8 }, (_, index) => ({
      tempPath: `/tmp/p${index}.jpg`,
      fileName: `p${index}.jpg`,
      fileSize: 100
    }))
  })

  await page.onSubmit()

  assert.equal(maxActive, 3)
  assert.deepEqual(
    JSON.parse(JSON.stringify(submitted.fileIDs)),
    Array.from({ length: 8 }, (_, index) => `cloud://photo-${index}`)
  )
  assert.equal(page.data.uploadProgress, 100)
  assert.equal(page.data.uploadedCount, 8)
  assert.ok(page.data.images.every(image => image.uploaded))
})

test('upload pool lets one image fail without blocking the others', async () => {
  let analyzeCalled = false
  const cloud = {
    callUploadAndAnalyze: async () => {
      analyzeCalled = true
      return { success: true, reportId: 'report-1' }
    }
  }
  const wx = createWxMock()
  const { page } = loadPage('miniprogram/pages/upload/upload.js', {
    wx,
    modules: { '../../utils/cloud': cloud }
  })
  page.uploadOne = async (image, index) => {
    await new Promise(resolve => setImmediate(resolve))
    if (index === 1) throw new Error('network')
    return `cloud://photo-${index}`
  }
  page.setData({
    studentId: 'student-1',
    subject: 'math',
    mode: 'diagnosis',
    betaConsented: true,
    images: Array.from({ length: 4 }, (_, index) => ({
      tempPath: `/tmp/p${index}.jpg`,
      fileName: `p${index}.jpg`,
      fileSize: 100
    }))
  })

  await page.onSubmit()

  // 单张失败 → 整体不提交分析，但其他图片保留上传成果供重试复用
  assert.equal(analyzeCalled, false)
  assert.equal(page.data.images[0].uploaded, true)
  assert.equal(page.data.images[1].uploaded, undefined)
  assert.equal(page.data.images[2].uploaded, true)
  assert.equal(page.data.images[3].uploaded, true)
  assert.equal(page.data.images[1].uploadError, '上传失败，请稍后重试')
  assert.equal(page.data.submitBtnText, '重试上传并分析')
  assert.equal(wx.calls.filter(call => call.name === 'showToast').at(-1).payload.title, '上传失败，请稍后重试')
})

test('upload compresses HEIF at quality 80 and caps width at 1600px', async () => {
  const compressCalls = []
  const wx = createWxMock({
    getImageInfo: options => options.success({ width: 3000, height: 2000 }),
    compressImage: options => {
      compressCalls.push(options)
      options.success({ tempFilePath: '/tmp/paper-converted.jpg' })
    }
  })
  const { page } = loadPage('miniprogram/pages/upload/upload.js', {
    wx,
    modules: { '../../utils/cloud': {} }
  })

  const converted = await page.convertHeifToJpeg('/tmp/paper.HEIC')

  assert.equal(converted, '/tmp/paper-converted.jpg')
  assert.equal(compressCalls.length, 1)
  assert.equal(compressCalls[0].quality, 80)
  assert.equal(compressCalls[0].compressedWidth, 1600)
})

test('upload keeps HEIF resolution when the image already fits within 1600px', async () => {
  const compressCalls = []
  const wx = createWxMock({
    getImageInfo: options => options.success({ width: 1200, height: 900 }),
    compressImage: options => {
      compressCalls.push(options)
      options.success({ tempFilePath: '/tmp/paper-converted.jpg' })
    }
  })
  const { page } = loadPage('miniprogram/pages/upload/upload.js', {
    wx,
    modules: { '../../utils/cloud': {} }
  })

  await page.convertHeifToJpeg('/tmp/paper.HEIC')

  assert.equal(compressCalls[0].quality, 80)
  assert.equal(compressCalls[0].compressedWidth, undefined)
})

test('upload loads existing file names through the lightweight cloud wrapper', async () => {
  let wrapperCall = null
  const cloud = {
    listRecentImageFileNames: async (studentId, subject, limit) => {
      wrapperCall = { studentId, subject, limit }
      return ['paper-1.jpg', 'paper-2.jpg']
    },
    getReports: async () => {
      throw new Error('getReports 不应再被上传页去重读取调用')
    }
  }
  const { page } = loadPage('miniprogram/pages/upload/upload.js', {
    modules: { '../../utils/cloud': cloud }
  })
  page.setData({ studentId: 'student-1', subject: 'math' })

  await page.loadExistingFileNames()

  assert.deepEqual(wrapperCall, { studentId: 'student-1', subject: 'math', limit: 20 })
  assert.deepEqual(JSON.parse(JSON.stringify(page.data.existingFileNames)), ['paper-1.jpg', 'paper-2.jpg'])
})
