const cloud = require('../../utils/cloud')
Page({
  data: { studentId: '', items: [], index: 0, selected: '', result: '', loading: true },
  onLoad(options = {}) {
    this.loadPractice(options).catch(() => this.setData({ loading: false }))
  },
  async loadPractice(options = {}) {
    this.setData({ studentId: options.studentId || '' })
    try { const result = await cloud.getEnglishConfusionPractice(this.data.studentId); const items = result.items || []; this.setData({ items, currentItem: items[0] || null }) } finally { this.setData({ loading: false }) }
  },
  onChoose(e) { this.setData({ selected: e.currentTarget.dataset.word || '', result: '' }) },
  onCheck() {
    const item = this.data.currentItem || {}
    this.setData({ result: this.data.selected === item.answer ? '答对了，记住这个区别。' : `正确答案是 ${item.answer}。再看一次提示。` })
  },
  onNext() { const next = this.data.index + 1; this.setData({ index: next, currentItem: this.data.items[next] || null, selected: '', result: '' }) }
})
