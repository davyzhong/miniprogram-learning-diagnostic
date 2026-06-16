const fs = require('fs');
const path = require('path');
const { summarizeBottleneckName } = require('./bottleneck-display');
const { getSubjectName } = require('./constants');

const COLORS = {
  navy: '#17365D',
  blue: '#245EA8',
  text: '#202733',
  muted: '#718198',
  pale: '#EAF1F8',
  chip: '#F2F6FA',
  line: '#B9C9DA',
  white: '#FFFFFF',
};

const PAGE = {
  width: 595.28,
  height: 841.89,
  left: 36,
  right: 36,
  top: 36,
  bottom: 36,
};

PAGE.contentWidth = PAGE.width - PAGE.left - PAGE.right;
PAGE.contentBottom = PAGE.height - PAGE.bottom - 18;

const DEFAULT_FONT_PATH = path.join(__dirname, 'NotoSansCJKsc-Regular.otf');

function groupQuestions(questions) {
  const groups = [];
  const byKey = new Map();

  for (const question of questions || []) {
    const key = question.lpCode || question.lpName || '综合验证';
    let group = byKey.get(key);
    if (!group) {
      group = {
        lpCode: question.lpCode || '',
        lpName: question.lpName || '综合验证',
        displayName: summarizeBottleneckName(question.lpName),
        questions: [],
      };
      byKey.set(key, group);
      groups.push(group);
    }
    group.questions.push(question);
  }

  return groups;
}

function useFont(doc, fontPath) {
  if (!fontPath || !fs.existsSync(fontPath)) {
    throw new Error('内置中文字体缺失，无法生成试卷');
  }
  doc.registerFont('Chinese', fontPath);
  doc.font('Chinese');
}

function fillRect(doc, x, y, width, height, color, radius = 0) {
  doc.save().fillColor(color);
  if (radius > 0) doc.roundedRect(x, y, width, height, radius).fill();
  else doc.rect(x, y, width, height).fill();
  doc.restore();
}

function drawLine(doc, x1, y1, x2, y2, color = COLORS.line, width = 1) {
  doc.save()
    .strokeColor(color)
    .lineWidth(width)
    .moveTo(x1, y1)
    .lineTo(x2, y2)
    .stroke()
    .restore();
}

function getPaperTitle(subject, type) {
  const subjectName = getSubjectName(subject, '数学');
  return type === 'verification' ? '学习卡点验证卷' : `${subjectName}学习诊断卷`;
}

function formatPaperDate(paperDate) {
  if (!paperDate) return '';
  const date = new Date(`${String(paperDate).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}年${month}月${day}日`;
}

function drawPaperDate(doc, paperDate, y) {
  const text = formatPaperDate(paperDate);
  if (!text) return y;
  doc.fillColor(COLORS.blue).fontSize(14)
    .text(`试卷日期：${text}`, PAGE.left, y, {
      width: PAGE.contentWidth,
      align: 'center',
    });
  return y + 22;
}

function drawPaperCode(doc, paperDisplayCode, y) {
  if (!paperDisplayCode) return y;
  doc.fillColor(COLORS.navy).fontSize(10.5)
    .text(`试卷编号：${paperDisplayCode}`, PAGE.left, y, {
      width: PAGE.contentWidth,
      align: 'right',
    });
  return y + 17;
}

function drawStudentHeader(doc, subject, type, continuation = false, paperDate = '', paperDisplayCode = '') {
  const subjectName = getSubjectName(subject, '数学');
  const title = getPaperTitle(subject, type);
  if (continuation) {
    doc.fillColor(COLORS.navy).fontSize(13)
      .text(`${title} · ${subjectName}`, PAGE.left, PAGE.top, {
        width: PAGE.contentWidth,
        align: 'center',
      });
    const codeBottom = drawPaperCode(doc, paperDisplayCode, PAGE.top + 19);
    const dividerY = paperDisplayCode ? codeBottom + 6 : 61;
    drawLine(doc, PAGE.left, dividerY, PAGE.width - PAGE.right, dividerY, COLORS.blue, 1.5);
    return dividerY + 15;
  }

  doc.fillColor(COLORS.navy).fontSize(22)
    .text(title, PAGE.left, PAGE.top + 2, {
      width: PAGE.contentWidth,
      align: 'center',
    });

  let metaY = paperDisplayCode ? drawPaperCode(doc, paperDisplayCode, 62) : 62;
  const dateBottom = drawPaperDate(doc, paperDate, metaY);
  const fieldY = (paperDate || paperDisplayCode) ? dateBottom + 4 : 78;
  const fields = [
    { label: '姓名', x: PAGE.left + 92, lineWidth: 94 },
    { label: '日期', x: PAGE.left + 230, lineWidth: 94 },
    { label: '用时', x: PAGE.left + 368, lineWidth: 94 },
  ];
  doc.fillColor(COLORS.text).fontSize(10.5);
  fields.forEach(field => {
    doc.text(field.label, field.x, fieldY, { width: 28 });
    drawLine(doc, field.x + 31, fieldY + 13, field.x + 31 + field.lineWidth, fieldY + 13, COLORS.muted, 0.7);
  });

  const dividerY = paperDate ? fieldY + 23 : 101;
  drawLine(doc, PAGE.left, dividerY, PAGE.width - PAGE.right, dividerY, COLORS.blue, 1.8);
  doc.fillColor(COLORS.text).fontSize(9.5)
    .text('请认真作答，并写出完整计算过程。完成后请花几秒检查答案是否合理。',
      PAGE.left, dividerY + 9, { width: PAGE.contentWidth, lineGap: 2 });
  return dividerY + 38;
}

function drawGroupBar(doc, group, index, y, type = 'verification') {
  fillRect(doc, PAGE.left, y, PAGE.contentWidth, 24, COLORS.pale, 3);
  const label = `${String.fromCharCode(65 + index)}. ${group.displayName}`;
  doc.fillColor(COLORS.blue).fontSize(11.5)
    .text(label, PAGE.left + 8, y + 5, { width: PAGE.contentWidth * 0.62 });
  const modeLabel = type === 'verification' ? '验证' : '覆盖';
  doc.fillColor(COLORS.muted).fontSize(8.8)
    .text(`${modeLabel} · 共 ${group.questions.length} 题`,
      PAGE.left + PAGE.contentWidth * 0.62, y + 6, {
        width: PAGE.contentWidth * 0.36 - 8,
        align: 'right',
      });
  return y + 31;
}

function questionHeight(doc, question) {
  doc.fontSize(11.5);
  const contentHeight = doc.heightOfString(question.content || '', {
    width: PAGE.contentWidth - 22,
    lineGap: 3,
  });
  const answerHeight = contentHeight > 38 ? 72 : 58;
  return 30 + contentHeight + answerHeight + 18;
}

function drawQuestion(doc, question, y) {
  const number = question.index || '';
  doc.fillColor(COLORS.blue).fontSize(14).text(String(number), PAGE.left, y, {
    width: 24,
  });

  const chipX = PAGE.left + 28;
  const chipText = summarizeBottleneckName(question.lpName);
  const chipWidth = Math.max(55, Math.min(96, chipText.length * 8 + 16));
  fillRect(doc, chipX, y + 1, chipWidth, 17, COLORS.chip, 3);
  doc.fillColor(COLORS.muted).fontSize(8.5)
    .text(chipText, chipX + 6, y + 5, { width: chipWidth - 12 });

  const contentY = y + 25;
  doc.fillColor(COLORS.text).fontSize(11.5)
    .text(question.content || '', PAGE.left, contentY, {
      width: PAGE.contentWidth,
      lineGap: 3,
    });
  const contentHeight = doc.heightOfString(question.content || '', {
    width: PAGE.contentWidth,
    lineGap: 3,
  });
  const boxY = contentY + contentHeight + 8;
  const boxHeight = contentHeight > 38 ? 72 : 58;

  doc.save()
    .strokeColor(COLORS.line)
    .lineWidth(0.8)
    .dash(4, { space: 3 })
    .roundedRect(PAGE.left, boxY, PAGE.contentWidth, boxHeight, 4)
    .stroke()
    .undash()
    .restore();
  doc.fillColor('#98A9BC').fontSize(8.2)
    .text('解题过程 / 演算区', PAGE.left + 8, boxY + 7, {
      width: PAGE.contentWidth - 16,
    });

  const bottom = boxY + boxHeight + 10;
  drawLine(doc, PAGE.left, bottom, PAGE.width - PAGE.right, bottom, COLORS.line, 0.6);
  return bottom + 9;
}

function drawPageNumber(doc, pageNumber, answerPage = false, pageCode = '') {
  if (!answerPage && pageCode) {
    doc.fillColor(COLORS.blue).fontSize(8.5)
      .text(`页面编号：${pageCode}`,
        PAGE.left, PAGE.height - 63, {
          width: PAGE.contentWidth,
          height: 12,
          align: 'center',
          lineBreak: false,
        });
  }

  doc.fillColor(COLORS.muted).fontSize(8.5)
    .text(answerPage ? `答案页 · 第 ${pageNumber} 页` : `第 ${pageNumber} 页`,
      PAGE.left, PAGE.height - 48, {
        width: PAGE.contentWidth,
        height: 12,
        align: 'center',
        lineBreak: false,
      });
}

function pageCodeFromPack(verificationPack, pageNumber) {
  const page = verificationPack && Array.isArray(verificationPack.pages)
    ? verificationPack.pages[pageNumber - 1]
    : null;
  return page && page.pageCode ? page.pageCode : '';
}

function questionPageCode(question, verificationPack, pageNumber) {
  return question.pageCode || pageCodeFromPack(verificationPack, pageNumber);
}

function drawAnswerHeader(doc, subject, type, paperDate = '', paperDisplayCode = '') {
  const subjectName = getSubjectName(subject, '数学');
  doc.fillColor(COLORS.navy).fontSize(19)
    .text(`${getPaperTitle(subject, type)} · 参考答案`, PAGE.left, PAGE.top + 2, {
      width: PAGE.contentWidth,
      align: 'center',
    });
  let cursorY = paperDisplayCode ? drawPaperCode(doc, paperDisplayCode, 58) : 60;
  const dateBottom = drawPaperDate(doc, paperDate, cursorY);
  const metaY = (paperDate || paperDisplayCode) ? dateBottom + 1 : 69;
  doc.fillColor(COLORS.muted).fontSize(9.5)
    .text('供家长 / 教师使用',
      PAGE.left, metaY, { width: PAGE.contentWidth, align: 'center' });
  doc.fillColor(COLORS.muted).fontSize(8.5)
    .text(subjectName, PAGE.left, metaY + 14, { width: PAGE.contentWidth, align: 'center' });
  drawLine(doc, PAGE.left, metaY + 29, PAGE.width - PAGE.right, metaY + 29, COLORS.blue, 1.8);
  return metaY + 47;
}

function drawAnswer(doc, question, y) {
  const answerText = `${question.index || ''}. ${question.answer || ''}`;
  doc.fillColor(COLORS.text).fontSize(10.5)
    .text(answerText, PAGE.left + 8, y + 7, {
      width: PAGE.contentWidth - 16,
      lineGap: 3,
    });
  const height = Math.max(34, doc.heightOfString(answerText, {
    width: PAGE.contentWidth - 16,
    lineGap: 3,
  }) + 16);
  doc.save()
    .strokeColor(COLORS.line)
    .lineWidth(0.6)
    .roundedRect(PAGE.left, y, PAGE.contentWidth, height, 4)
    .stroke()
    .restore();
  return y + height + 8;
}

async function generatePDF(questionsData, subject, type, options = {}) {
  const PdfDocument = options.pdfkit || require('pdfkit');
  const fontPath = options.fontPath || DEFAULT_FONT_PATH;
  const doc = new PdfDocument({
    size: 'A4',
    margins: {
      top: PAGE.top,
      bottom: PAGE.bottom,
      left: PAGE.left,
      right: PAGE.right,
    },
    bufferPages: true,
    info: {
      Title: type === 'verification' ? '学习卡点验证卷' : '学习诊断试卷',
      Author: 'AI Learning Diagnostic',
    },
  });
  const buffers = [];
  doc.on('data', buffers.push.bind(buffers));
  useFont(doc, fontPath);
  const paperDate = options.paperDate || '';
  const paperDisplayCode = options.paperDisplayCode || options.paperCode || '';
  const verificationPack = options.verificationPack || questionsData.verificationPack || null;
  const studentPageMetadata = [];
  let currentStudentPageCode = pageCodeFromPack(verificationPack, 1);
  let currentStudentQuestionIds = [];

  function rememberQuestionOnStudentPage(question) {
    const pageCode = questionPageCode(question, verificationPack, pageNumber);
    if (!currentStudentPageCode) currentStudentPageCode = pageCode;
    if (question.questionId) currentStudentQuestionIds.push(question.questionId);
  }

  function finishStudentPage() {
    const pageCode = currentStudentPageCode || pageCodeFromPack(verificationPack, pageNumber);
    drawPageNumber(doc, pageNumber, false, pageCode);
    studentPageMetadata.push({
      pageNumber,
      pageCode,
      questionIds: currentStudentQuestionIds.slice(),
    });
    currentStudentQuestionIds = [];
  }

  function startStudentPage(nextQuestion = null) {
    currentStudentPageCode = nextQuestion
      ? questionPageCode(nextQuestion, verificationPack, pageNumber)
      : pageCodeFromPack(verificationPack, pageNumber);
    return drawStudentHeader(doc, subject, type, true, paperDate, paperDisplayCode);
  }

  const groups = groupQuestions(questionsData.questions || []);
  let pageNumber = 1;
  let y = drawStudentHeader(doc, subject, type, false, paperDate, paperDisplayCode);

  groups.forEach((group, groupIndex) => {
    const firstQuestionPageCode = group.questions[0]
      ? questionPageCode(group.questions[0], verificationPack, pageNumber)
      : '';
    if (
      type === 'verification'
      && currentStudentQuestionIds.length > 0
      && currentStudentPageCode
      && firstQuestionPageCode
      && firstQuestionPageCode !== currentStudentPageCode
    ) {
      finishStudentPage();
      doc.addPage();
      pageNumber += 1;
      y = startStudentPage(group.questions[0]);
    }
    if (y + 145 > PAGE.contentBottom) {
      finishStudentPage();
      doc.addPage();
      pageNumber += 1;
      y = startStudentPage(group.questions[0]);
    }
    y = drawGroupBar(doc, group, groupIndex, y, type);

    group.questions.forEach(question => {
      const requiredHeight = questionHeight(doc, question);
      const nextPageCode = questionPageCode(question, verificationPack, pageNumber);
      if (
        type === 'verification'
        && currentStudentQuestionIds.length > 0
        && currentStudentPageCode
        && nextPageCode
        && nextPageCode !== currentStudentPageCode
      ) {
        finishStudentPage();
        doc.addPage();
        pageNumber += 1;
        y = startStudentPage(question);
        y = drawGroupBar(doc, group, groupIndex, y, type);
      }
      if (y + requiredHeight > PAGE.contentBottom) {
        finishStudentPage();
        doc.addPage();
        pageNumber += 1;
        y = startStudentPage(question);
        y = drawGroupBar(doc, group, groupIndex, y, type);
      }
      rememberQuestionOnStudentPage(question);
      y = drawQuestion(doc, question, y);
    });
  });
  finishStudentPage();

  doc.addPage();
  let answerPageNumber = 1;
  y = drawAnswerHeader(doc, subject, type, paperDate, paperDisplayCode);
  groups.forEach((group, groupIndex) => {
    if (y + 70 > PAGE.contentBottom) {
      drawPageNumber(doc, answerPageNumber, true);
      doc.addPage();
      answerPageNumber += 1;
      y = drawAnswerHeader(doc, subject, type, paperDate, paperDisplayCode);
    }
    y = drawGroupBar(doc, group, groupIndex, y, type);
    group.questions.forEach(question => {
      const answerText = `${question.index || ''}. ${question.answer || ''}`;
      const requiredHeight = Math.max(34, doc.heightOfString(answerText, {
        width: PAGE.contentWidth - 16,
        lineGap: 3,
      }) + 16) + 8;
      if (y + requiredHeight > PAGE.contentBottom) {
        drawPageNumber(doc, answerPageNumber, true);
        doc.addPage();
        answerPageNumber += 1;
        y = drawAnswerHeader(doc, subject, type, paperDate, paperDisplayCode);
        y = drawGroupBar(doc, group, groupIndex, y, type);
      }
      y = drawAnswer(doc, question, y);
    });
  });
  drawPageNumber(doc, answerPageNumber, true);

  doc.end();
  await new Promise(resolve => doc.on('end', resolve));
  return {
    buffer: Buffer.concat(buffers),
    studentPages: pageNumber,
    answerPages: answerPageNumber,
    totalPages: pageNumber + answerPageNumber,
    studentPageCodes: studentPageMetadata.map(page => page.pageCode).filter(Boolean),
    studentPageMetadata,
  };
}

module.exports = {
  generatePDF,
  groupQuestions,
  DEFAULT_FONT_PATH,
};
