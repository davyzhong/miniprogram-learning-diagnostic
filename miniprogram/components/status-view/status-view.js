// 公共状态组件：loading / empty / error（错误态统一“文案 + 重试按钮”）
// 用法：<status-view state="error" text="加载失败" retryText="重试" bind:retry="loadData" />
const DEFAULT_TEXT = {
  loading: '加载中…',
  empty: '暂无内容',
  error: '加载失败，请稍后重试'
}

Component({
  properties: {
    state: {
      type: String,
      value: 'loading' // loading | empty | error
    },
    text: {
      type: String,
      value: ''
    },
    retryText: {
      type: String,
      value: ''
    }
  },

  data: {
    displayText: DEFAULT_TEXT.loading
  },

  observers: {
    'state, text': function (state, text) {
      this.setData({
        displayText: text || DEFAULT_TEXT[state] || DEFAULT_TEXT.loading
      })
    }
  },

  lifetimes: {
    attached() {
      this.setData({
        displayText: this.data.text || DEFAULT_TEXT[this.data.state] || DEFAULT_TEXT.loading
      })
    }
  },

  methods: {
    onRetryTap() {
      this.triggerEvent('retry')
    }
  }
})
