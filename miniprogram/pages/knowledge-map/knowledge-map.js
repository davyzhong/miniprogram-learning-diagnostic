const cloud = require('../../utils/cloud')
const { buildKnowledgeMapPageView } = require('./knowledge-map-presenter')

Page({
  data: {
    loading: true,
    studentId: '',
    studentName: '',
    subject: 'math',
    view: null,
    errorText: '',
    // 标记当前正在生成任务包的卡点，前端做按钮 loading 态
    generatingLpCode: '',
  },

  onLoad(options = {}) {
    const studentId = options.studentId || ''
    const studentName = decodeURIComponent(options.studentName || '')
    const subject = options.subject || 'math'
    this.setData({ studentId, studentName, subject })
    this._loadPromise = this.loadData().catch(error => {
      console.error('加载知识地图失败', error)
    })
  },

  async loadData() {
    if (!this.data.studentId) {
      this.setData({ loading: false, errorText: '缺少孩子档案信息' })
      return
    }
    this.setData({ loading: true })
    try {
      // 两个请求各自先挂 rejection 处理再 Promise.all：
      // 任何一个同步抛错（如 mock 缺失方法）都不会让另一个 Promise 悬而未决。
      // 掌握状态地图是增强信息，读取失败时降级为空记录，不影响卡点主视图。
      const profilePromise = Promise.resolve()
        .then(() => cloud.getSubjectProfile(this.data.studentId, this.data.subject))
      const masteryPromise = Promise.resolve()
        .then(() => (typeof cloud.getNodeMasteryMap === 'function'
          ? cloud.getNodeMasteryMap(this.data.studentId, this.data.subject)
          : null))
        .catch(error => {
          console.warn('节点掌握地图读取失败，按空记录降级', error)
          return null
        })
      const [profile, masteryResult] = await Promise.all([profilePromise, masteryPromise])
      const masteryRecords = masteryResult && Array.isArray(masteryResult.records) ? masteryResult.records : []
      const view = buildKnowledgeMapPageView(profile || {}, this.data.subject, masteryRecords)
      this.setData({ loading: false, view, errorText: '' })
    } catch (err) {
      console.error('知识地图加载失败', err)
      this.setData({ loading: false, errorText: '加载失败，请稍后重试' })
    }
  },

  // 点击卡点：直跳 learning-resource（跳过 bottleneck-detail 中间页）
  // 与 report 页的 onBottleneckSnapshotTap 保持一致的快捷路径。
  async onBottleneckTap(e) {
    const { lpCode, lpName, bottleneckId, nodeId } = e.currentTarget.dataset
    if (!lpCode) return
    if (this.data.generatingLpCode) return // 防止重复点击

    this.setData({ generatingLpCode: lpCode })
    wx.showLoading({ title: '正在准备讲解…' })
    try {
      const result = await cloud.generateLearningResourcePack({
        studentId: this.data.studentId,
        subject: this.data.subject,
        target: {
          lpCode,
          lpName: lpName || '',
          bottleneckId: bottleneckId || lpCode,
          nodeId: nodeId || '',
          title: lpName || '学习卡点',
        },
        resources: [],
      })
      wx.hideLoading()
      const packId = result && (result.packId || (result.pack && result.pack._id))
      if (result && result.success && packId) {
        wx.navigateTo({
          url: `/pages/learning-resource/learning-resource?packId=${encodeURIComponent(packId)}`,
        })
      } else {
        wx.showToast({ title: '讲解生成失败，请稍后重试', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      console.error('知识点讲解生成失败', err)
      wx.showToast({ title: '讲解生成失败，请稍后重试', icon: 'none' })
    } finally {
      this.setData({ generatingLpCode: '' })
    }
  },

  // 空状态：引导用户上传试卷
  onUploadTap() {
    const { studentId, studentName, subject } = this.data
    wx.navigateTo({
      url: `/pages/upload/upload?mode=diagnosis&studentId=${studentId}&subject=${subject}&studentName=${encodeURIComponent(studentName || '')}`,
    })
  },
})
