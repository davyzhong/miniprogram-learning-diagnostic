const cloud = require('../../utils/cloud')
const { buildMicroValidationView, buildMicroValidationResultView } = require('./micro-validation-presenter')

Page({
  data: {
    loading: true,
    submitting: false,
    errorText: '',
    studentId: '',
    studentName: '',
    targetCode: '',
    sessionId: '',
    view: null,
    resultView: null,
  },

  onLoad(options = {}) {
    const studentId = options.studentId || ''
    const studentName = decodeURIComponent(options.studentName || '')
    const targetCode = decodeURIComponent(options.targetCode || options.bottleneckId || '')
    const sessionId = options.sessionId || ''
    this.setData({ studentId, studentName, targetCode, sessionId })
    if (sessionId) {
      this.loadSession(sessionId)
    } else {
      this.generate()
    }
  },

  // 已有会话（重进/查看结果）
  async loadSession(sessionId) {
    this.setData({ loading: true, errorText: '' })
    try {
      const res = await cloud.getMicroValidation(sessionId)
      const session = (res && res.session) || {}
      this.setData({
        loading: false,
        sessionId,
        view: buildMicroValidationView({
          bnTitle: session.bnTitle,
          questions: session.questions || [],
          verdicts: session.verdicts || [],
          status: session.status,
        }),
        resultView: session.status === 'completed'
          ? buildMicroValidationResultView({
              passVerdict: session.passVerdict,
              correctCount: session.correctCount,
              totalCount: (session.questions || []).length,
              bnTitle: session.bnTitle,
            })
          : null,
      })
    } catch (error) {
      console.error('微验证加载失败', error)
      this.setData({ loading: false, errorText: '加载失败，请稍后重试' })
    }
  },

  // 新会话：围绕 targetCode 生成 3-6 道微验证小题
  async generate() {
    if (!this.data.studentId || !this.data.targetCode) {
      this.setData({ loading: false, errorText: '缺少孩子档案或目标卡点信息' })
      return
    }
    this.setData({ loading: true, errorText: '' })
    try {
      const res = await cloud.generateMicroValidation({
        studentId: this.data.studentId,
        targetCode: this.data.targetCode,
      })
      if (!res || !res.success) throw new Error((res && res.error) || '生成失败')
      this.setData({
        loading: false,
        sessionId: res.sessionId || '',
        view: buildMicroValidationView({ bnTitle: res.bnTitle, questions: res.questions || [] }),
      })
    } catch (error) {
      console.error('微验证生成失败', error)
      this.setData({ loading: false, errorText: '微验证生成失败，请稍后重试' })
    }
  },

  // 家长判定：答对/答错（判定后才显示参考答案与观察点）
  onVerdictTap(e) {
    const { index, verdict } = e.currentTarget.dataset
    const view = this.data.view
    if (!view || view.completed) return
    const verdicts = view.questions.map(q => q.verdict)
    verdicts[index] = verdict
    this.setData({
      view: buildMicroValidationView({
        bnTitle: view.bnTitle,
        questions: view.questions.map(q => ({ index: q.index, content: q.content, answer: q.answer, observation: q.observation })),
        verdicts,
      }),
    })
  },

  async onSubmit() {
    const view = this.data.view
    if (!view || !view.canSubmit || this.data.submitting) return
    this.setData({ submitting: true })
    try {
      const res = await cloud.submitMicroValidation({
        sessionId: this.data.sessionId,
        verdicts: view.questions.map(q => q.verdict),
      })
      if (!res || !res.success) throw new Error((res && res.error) || '提交失败')
      this.setData({
        submitting: false,
        view: buildMicroValidationView({
          bnTitle: view.bnTitle,
          questions: view.questions.map(q => ({ index: q.index, content: q.content, answer: q.answer, observation: q.observation })),
          verdicts: view.questions.map(q => q.verdict),
          status: 'completed',
        }),
        resultView: buildMicroValidationResultView({
          passVerdict: res.passVerdict,
          correctCount: res.correctCount,
          totalCount: res.totalCount,
          bnTitle: view.bnTitle,
        }),
      })
    } catch (error) {
      console.error('微验证提交失败', error)
      this.setData({ submitting: false })
      wx.showToast({ title: '提交失败，请重试', icon: 'none' })
    }
  },

  // 结果动作：未通过 → 去重学（生成学习任务包）；通过 → 返回
  async onResultActionTap() {
    const resultView = this.data.resultView
    if (!resultView) return
    if (resultView.passed) {
      wx.navigateBack({ fail: () => wx.navigateTo({ url: `/pages/index/index` }) })
      return
    }
    // 确认卡点：生成学习任务包去重学
    wx.showLoading({ title: '正在准备讲解…' })
    try {
      const result = await cloud.generateLearningResourcePack({
        studentId: this.data.studentId,
        subject: 'math',
        target: { bottleneckId: this.data.targetCode, lpCode: this.data.targetCode, lpName: this.data.view ? this.data.view.bnTitle : '', title: this.data.view ? this.data.view.bnTitle : '学习卡点' },
        resources: [],
      })
      wx.hideLoading()
      const packId = result && (result.packId || (result.pack && result.pack._id))
      if (result && result.success && packId) {
        wx.redirectTo({ url: `/pages/learning-resource/learning-resource?packId=${encodeURIComponent(packId)}` })
      } else {
        wx.showToast({ title: '讲解生成失败，请稍后重试', icon: 'none' })
      }
    } catch (error) {
      wx.hideLoading()
      console.error('学习任务包生成失败', error)
      wx.showToast({ title: '讲解生成失败，请稍后重试', icon: 'none' })
    }
  },

  onRetry() {
    if (this.data.sessionId) this.loadSession(this.data.sessionId)
    else this.generate()
  },
})
