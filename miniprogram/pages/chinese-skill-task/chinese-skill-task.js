const cloud = require('../../utils/cloud')
Page({
  data: { studentId: '', task: null, answer: '', result: '', loading: true, submitting: false },
  onLoad(options = {}) {
    this.loadTask(options).catch(() => this.setData({ loading: false }))
  },
  async loadTask(options = {}) {
    this.setData({ studentId: options.studentId || '' })
    try {
      const result = await cloud.getChineseSkillTask(this.data.studentId)
      this.setData({ task: result.task || null })
    } catch (error) {
      wx.showToast({ title: '任务加载失败，请稍后重试', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },
  onInput(e) { this.setData({ answer: e.detail.value || '' }) },
  async onSubmit() {
    if (!this.data.answer.trim() || this.data.submitting) return
    this.setData({ submitting: true })
    try {
      const result = await cloud.submitChineseSkillTask({ studentId: this.data.studentId, taskId: this.data.task.id, answer: this.data.answer })
      this.setData({ result: result.evidenceStatus === 'passed' ? '完成得不错，明天再换一段材料练同一方法。' : '再补一句具体依据或细节，会更完整。' })
    } catch (error) {
      wx.showToast({ title: '提交失败，请稍后重试', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
