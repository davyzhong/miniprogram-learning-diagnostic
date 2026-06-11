// generateReportPDF/index.js
// 根据报告数据生成 A4 PDF，上传云存储
const pdfkit = require('pdfkit');
const cloud = require('wx-server-sdk');
const fs = require('fs');
const path = require('path');
const os = require('os');

cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = cloud.database();

// ========== 配置常量（请修改为你的实际配置） ==========
const CONFIG = {
  // PDF 中文字体（从云存储下载）— 已填写你的字体 fileID
  FONT_FILE_ID: 'cloud://cloud1-d6gneg68m5a7a3876.636c-cloud1-d6gneg68m5a7a3876-1441789686/SimHei.ttf',
};

// ========== 获取中文字体（从云存储下载，缓存到临时目录） ==========
async function getChineseFont() {
  const fontPath = path.join(os.tmpdir(), 'chinese-font.ttf');
  if (fs.existsSync(fontPath)) {
    return fontPath;
  }

  const fontFileID = CONFIG.FONT_FILE_ID;
  if (!fontFileID) {
    console.warn('未配置 FONT_FILE_ID，中文可能无法正常显示');
    return null;
  }

  try {
    const res = await cloud.downloadFile({ fileID: fontFileID });
    fs.writeFileSync(fontPath, res.fileContent);
    console.log('中文字体下载完成：', fontPath);
    return fontPath;
  } catch (err) {
    console.error('下载中文字体失败：', err.message);
    return null;
  }
}

// ========== 生成 PDF ==========
async function generatePDF(reportData) {
  const doc = new pdfkit({ size: 'A4', margin: 50 });
  const buffers = [];
  doc.on('data', buffers.push.bind(buffers));

  // 注册中文字体
  const fontPath = await getChineseFont();
  if (fontPath) {
    doc.registerFont('Chinese', fontPath);
    doc.font('Chinese');
  } else {
    doc.font('Helvetica');
  }

  const { studentName = '同学', subject = 'math', summary = '', totalErrors = 0, bottlenecks = [], errorDetails = [], comparisonSummary = '' } = reportData;
  const subjectName = { math: '数学', chinese: '语文', english: '英语' }[subject] || '数学';
  const reportType = reportData.type === 'verification' ? '验证报告' : '诊断报告';

  // 标题
  doc.fontSize(20).text(`${subjectName}${reportType}`, { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(12).text(`学生姓名：${studentName}    日期：${new Date().toLocaleDateString()}`, { align: 'left' });
  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(1);

  // 摘要
  doc.fontSize(14).text('📊 诊断摘要', { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(11).text(summary || `共发现 ${totalErrors} 道错题`);
  doc.moveDown(1);

  // 卡点分布
  doc.fontSize(14).text('🎯 卡点分布（按错误次数排序）', { underline: true });
  doc.moveDown(0.5);

  if (bottlenecks.length === 0) {
    doc.fontSize(11).text('暂无卡点数据');
  } else {
    for (let i = 0; i < Math.min(bottlenecks.length, 10); i++) {
      const bn = bottlenecks[i];
      const severityIcon = { high: '🔴', medium: '🟡', low: '🟢' }[bn.severity] || '⚪';
      doc.fontSize(11).text(`${i + 1}. ${severityIcon} ${bn.lpName}——出现 ${bn.errorCount} 次`);
      if (bn.rootCause) {
        doc.fontSize(10).text(`   根因：${bn.rootCause}`, { indent: 20 });
      }
      if (bn.suggestion) {
        doc.fontSize(10).text(`   建议：${bn.suggestion}`, { indent: 20 });
      }
      doc.moveDown(0.3);
    }
  }
  doc.moveDown(1);

  // 错题详情（仅显示前 10 道）
  doc.fontSize(14).text('📝 错题详情（前 10 道）', { underline: true });
  doc.moveDown(0.5);

  if (!errorDetails || errorDetails.length === 0) {
    doc.fontSize(11).text('暂无错题详情');
  } else {
    const displayCount = Math.min(errorDetails.length, 10);
    for (let i = 0; i < displayCount; i++) {
      const err = errorDetails[i];
      doc.fontSize(11).text(`${i + 1}. ${err.questionContent || '题目内容未知'}`);
      doc.fontSize(10).text(`   你的答案：${err.studentAnswer || '未知'}    正确答案：${err.correctAnswer || '未知'}`);
      if (err.rootCause) {
        doc.fontSize(10).text(`   根因：${err.rootCause}`, { indent: 20 });
      }
      doc.moveDown(0.5);

      // 分页控制
      if (doc.y > 700) {
        doc.addPage();
      }
    }
  }
  doc.moveDown(1);

  // 对比摘要（如果是验证报告）
  if (comparisonSummary) {
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);
    doc.fontSize(14).text('📈 对比上次诊断', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11).text(comparisonSummary);
  }

  // 页脚
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc.fontSize(9).text(
      `学习诊断系统 生成于 ${new Date().toLocaleString()}   第 ${i + 1} 页 / 共 ${pageCount} 页`,
      { align: 'center', lineBreak: false }
    );
  }

  // 结束 PDF 生成
  doc.end();

  await new Promise(resolve => doc.on('end', resolve));
  return Buffer.concat(buffers);
}

// ========== 主函数 ==========
exports.main = async (event) => {
  const { reportId } = event;

  if (!reportId) {
    return { success: false, error: '缺少 reportId' };
  }

  try {
    // 1. 读取报告数据
    const reportRes = await db.collection('reports').doc(reportId).get();
    if (!reportRes.data || reportRes.data.length === 0) {
      return { success: false, error: '报告不存在' };
    }
    const reportData = reportRes.data;
    const currentOpenId = cloud.getWXContext().OPENID;
    if (reportData._openid && reportData._openid !== currentOpenId) {
      return { success: false, error: '无权访问该报告' };
    }

    // 2. 生成 PDF
    console.log('开始生成 PDF，reportId：', reportId);
    const pdfBuffer = await generatePDF(reportData);

    // 3. 上传到云存储
    const timestamp = Date.now();
    const cloudPath = `reports/${reportId}_${timestamp}.pdf`;
    const upload = await cloud.uploadFile({
      cloudPath,
      fileContent: pdfBuffer,
    });
    const pdfFileId = upload.fileID;

    // 4. 更新 reports 集合
    await db.collection('reports').doc(reportId).update({
      data: { pdfFileId, updatedAt: new Date() },
    });

    console.log('报告 PDF 生成完成：', pdfFileId);
    return {
      success: true,
      reportId,
      pdfFileId,
      message: 'PDF 已生成，可在报告页下载',
    };
  } catch (err) {
    console.error('generateReportPDF 失败：', err);
    return { success: false, error: '报告 PDF 生成失败，请稍后重试' };
  }
};
