// app.js
App({
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
      return
    }

    // 初始化云开发 - 使用你的云开发环境 ID
    wx.cloud.init({
      env: 'cloud1-d6gneg68m5a7a3876',  // ✅ 已更新为你的环境 ID
      traceUser: true
    })

    // 全局数据库引用
    this.db = wx.cloud.database()
    this._ = this.db.command
  },

  globalData: {
    // 当前选中的学生
    currentStudent: null,
    // 当前选中的学科
    currentSubject: null
  }
})
