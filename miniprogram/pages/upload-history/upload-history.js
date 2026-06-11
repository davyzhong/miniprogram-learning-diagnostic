const cloud = require('../../utils/cloud')
const { formatChineseDateTime } = require('../../utils/util')

function getReportPhotos(report) {
  if (Array.isArray(report.imageFiles) && report.imageFiles.length > 0) {
    return report.imageFiles
  }
  return (report.imageFileIds || []).map((fileID, index) => ({
    fileID,
    fileName: `历史照片${index + 1}`,
    fileSize: 0,
    ocrSummary: '',
    isDuplicate: false,
    duplicateOf: ''
  }))
}

Page({
  data: {
    studentId: '',
    subject: 'math',
    subjectName: '数学',
    studentName: '',
    loading: true,
    groups: []
  },

  onLoad(options) {
    this.setData({
      studentId: options.studentId || '',
      subject: options.subject || 'math',
      subjectName: decodeURIComponent(options.subjectName || '数学'),
      studentName: decodeURIComponent(options.studentName || '')
    })
    wx.setNavigationBarTitle({ title: '上传历史' })
    this.loadHistory()
  },

  async loadHistory() {
    try {
      const reports = await cloud.getReports(this.data.studentId, this.data.subject, 20)
      const reportPhotos = reports.map(report => ({
        report,
        photos: getReportPhotos(report)
      })).filter(group => group.photos.length > 0)
      const fileIDs = reportPhotos.flatMap(group => group.photos.map(photo => photo.fileID))
      const tempFiles = await cloud.getTempFileURLs(fileIDs)
      const urlByFileID = new Map(tempFiles.map(item => [item.fileID, item.tempFileURL || '']))

      const groups = reportPhotos.map(({ report, photos }) => {
        const viewPhotos = photos.map(photo => ({
          ...photo,
          tempFileURL: urlByFileID.get(photo.fileID) || '',
          summaryText: photo.ocrSummary || '此照片来自旧报告，暂无 OCR 识别摘要'
        }))
        return {
          reportId: report._id,
          reportTitle: report.type === 'verification' ? '验证报告' : '诊断报告',
          dateText: formatChineseDateTime(report.createdAt),
          photoCount: viewPhotos.length,
          duplicateCount: viewPhotos.filter(photo => photo.isDuplicate).length,
          photos: viewPhotos
        }
      })

      this.setData({ groups, loading: false })
    } catch (err) {
      console.error('加载上传历史失败', err)
      this.setData({ loading: false })
      wx.showToast({ title: '历史记录加载失败', icon: 'none' })
    }
  },

  onPreviewPhoto(e) {
    const { groupIndex, photoIndex } = e.currentTarget.dataset
    const group = this.data.groups[groupIndex]
    const photo = group && group.photos[photoIndex]
    if (!photo || !photo.tempFileURL) {
      wx.showToast({ title: '原图暂时无法预览', icon: 'none' })
      return
    }
    wx.previewImage({
      current: photo.tempFileURL,
      urls: group.photos.map(item => item.tempFileURL).filter(Boolean)
    })
  },

  onReportTap(e) {
    wx.navigateTo({ url: `/pages/report/report?id=${e.currentTarget.dataset.id}` })
  }
})
