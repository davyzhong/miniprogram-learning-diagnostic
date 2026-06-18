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

function drawStudentHeader(doc, subject, type, continuation = false, paperDate = '', paperDisplayCode = '', pageNumber = 1, pageCode = '') {
  const subjectName = getSubjectName(subject, '数学');
  if (continuation) {
    // 续页：试卷编号 + 页面编码，一行
    const parts = [];
    if (paperDisplayCode) parts.push(paperDisplayCode);
    if (pageCode) parts.push(pageCode);
    const headerText = parts.length ? parts.join('  ·  ') : subjectName;
    doc.fillColor(COLORS.navy).fontSize(14)
      .text(headerText, PAGE.left, PAGE.top, {
        width: PAGE.contentWidth,
        align: 'center',
      });
    drawLine(doc, PAGE.left, PAGE.top + 20, PAGE.width - PAGE.right, PAGE.top + 20, COLORS.blue, 1.5);
    return PAGE.top + 28;
  }

  // 首页标题栏：试卷编号 + 页面编码，一行不换行
  const parts = [];
  if (paperDisplayCode) parts.push(paperDisplayCode);
  if (pageCode) parts.push(pageCode);
  const headerText = parts.length ? parts.join('  ·  ') : subjectName;
  doc.fillColor(COLORS.navy).fontSize(15)
    .text(headerText, PAGE.left, PAGE.top, {
      width: PAGE.contentWidth - 90,
      align: 'left',
      lineBreak: false,
    });
  const dateText = formatPaperDate(paperDate);
  if (dateText) {
    doc.fillColor(COLORS.muted).fontSize(10)
      .text(dateText, PAGE.width - PAGE.right - 80, PAGE.top + 4, {
        width: 80, align: 'right', lineBreak: false,
      });
  }

  const fieldY = PAGE.top + 24;
  const fields = [
    { label: '姓名', x: PAGE.left + 50, lineWidth: 80 },
    { label: '班级', x: PAGE.left + 165, lineWidth: 80 },
    { label: '用时', x: PAGE.left + 280, lineWidth: 60 },
    { label: '得分', x: PAGE.left + 375, lineWidth: 50 },
  ];
  doc.fillColor(COLORS.text).fontSize(10);
  fields.forEach(field => {
    doc.text(field.label, field.x, fieldY + 2, { width: 30 });
    drawLine(doc, field.x + 32, fieldY + 12, field.x + 32 + field.lineWidth, fieldY + 12, COLORS.muted, 0.7);
  });

  const dividerY = fieldY + 20;
  drawLine(doc, PAGE.left, dividerY, PAGE.width - PAGE.right, dividerY, COLORS.blue, 1.8);
  return dividerY + 12;
}

function drawGroupBar(doc, group, index, y, type = 'verification') {
  // 轻量分组标题：无背景色块，单行文字，紧凑
  const label = `${String.fromCharCode(65 + index)}. ${group.displayName}`;
  doc.fillColor(COLORS.blue).fontSize(10)
    .text(label, PAGE.left, y, { width: PAGE.contentWidth * 0.7 });
  const modeLabel = type === 'verification' ? '验证' : '覆盖';
  doc.fillColor(COLORS.muted).fontSize(8)
    .text(`${modeLabel} · ${group.questions.length} 题`,
      PAGE.left + PAGE.contentWidth * 0.7, y + 1, {
        width: PAGE.contentWidth * 0.3,
        align: 'right',
      });
  // 轻量下划线
  drawLine(doc, PAGE.left, y + 14, PAGE.width - PAGE.right, y + 14, COLORS.pale, 0.8);
  return y + 19;
}

// 双栏布局：每行放两道题，充分利用 A4 宽度
const COLUMN_GAP = 16;
const COLUMN_WIDTH = (PAGE.contentWidth - COLUMN_GAP) / 2; // 每栏宽度 ≈ 253pt

function questionHeight(doc, question, colWidth) {
  doc.fontSize(11);
  const w = colWidth || COLUMN_WIDTH;
  const fullText = `${question.index || ''}. ${question.content || ''}`;
  const contentHeight = doc.heightOfString(fullText, {
    width: w - 6,
    lineGap: 2,
  });
  const answerHeight = contentHeight > 20 ? 56 : 48;
  return contentHeight + answerHeight + 10;
}

function drawQuestion(doc, question, y, x, colWidth) {
  const w = colWidth || COLUMN_WIDTH;
  const left = x || PAGE.left;

  // 题号 + 题目内容合并一行：1. 计算 0.25 × 0.4 = ？
  const fullText = `${question.index || ''}. ${question.content || ''}`;
  doc.fillColor(COLORS.text).fontSize(11)
    .text(fullText, left, y, {
      width: w - 4,
      lineGap: 2,
    });
  doc.fillColor(COLORS.blue).fontSize(11); // 题号颜色（被 text 覆盖，但保留链路）
  const contentHeight = doc.heightOfString(fullText, {
    width: w - 4,
    lineGap: 2,
  });

  const boxY = y + contentHeight + 4;
  const boxHeight = contentHeight > 20 ? 56 : 48;

  doc.save()
    .strokeColor(COLORS.line)
    .lineWidth(0.7)
    .dash(3, { space: 2 })
    .roundedRect(left, boxY, w - 4, boxHeight, 3)
    .stroke()
    .undash()
    .restore();
  doc.fillColor('#98A9BC').fontSize(7)
    .text('演算', left + 4, boxY + 3, { width: w - 12, lineBreak: false });

  return boxY + boxHeight + 6;
}

function drawPageNumber(doc, pageNumber, answerPage = false, pageCode = '') {
  // 页面编码已移到标题栏，页尾只保留简洁页码
  doc.fillColor(COLORS.muted).fontSize(8)
    .text(answerPage ? `答案 · 第 ${pageNumber} 页` : `第 ${pageNumber} 页`,
      PAGE.left, PAGE.height - 30, {
        width: PAGE.contentWidth,
        height: 10,
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

function drawAnswer(doc, question, y, x, colWidth) {
  const w = colWidth || COLUMN_WIDTH;
  const left = x || PAGE.left;
  const num = question.index || '';
  const lpName = summarizeBottleneckName(question.lpName);
  const answer = question.answer || '';
  const explanation = question.explanation || question.reasoning || '';

  // 把所有文本合并成一个字符串，一次性渲染，避免 PDFKit 游标覆盖
  // 格式：1. [卡点名] 答案：xxx \n 思路：xxx
  let line1 = `${num}. [${lpName}]`;
  let line2 = `答案：${answer}`;
  let line3 = explanation ? `思路：${explanation}` : '';

  // 渲染第一行（题号 + 卡点名）
  doc.fillColor(COLORS.blue).fontSize(9)
    .text(line1, left, y, { width: w - 4, lineGap: 0, lineBreak: false });
  const h1 = doc.heightOfString(line1, { width: w - 4, lineGap: 0 });

  // 渲染第二行（答案）
  doc.fillColor(COLORS.navy).fontSize(10)
    .text(line2, left, y + h1 + 2, { width: w - 4, lineGap: 1, lineBreak: false });
  const h2 = doc.heightOfString(line2, { width: w - 4, lineGap: 1 });

  // 渲染第三行（解题思路）
  let h3 = 0;
  if (line3) {
    doc.fillColor(COLORS.muted).fontSize(8.5)
      .text(line3, left, y + h1 + 2 + h2 + 3, { width: w - 4, lineGap: 1, lineBreak: true });
    h3 = doc.heightOfString(line3, { width: w - 4, lineGap: 1 });
  }

  const totalHeight = h1 + 2 + h2 + (line3 ? 3 + h3 : 0) + 8;
  // 重置 doc 内部游标到下方，避免影响后续渲染
  doc.y = y + totalHeight;
  return { y: y + totalHeight, height: totalHeight };
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
    return drawStudentHeader(doc, subject, type, true, paperDate, paperDisplayCode, pageNumber, currentStudentPageCode);
  }

  const groups = groupQuestions(questionsData.questions || []);
  let pageNumber = 1;
  let y = drawStudentHeader(doc, subject, type, false, paperDate, paperDisplayCode, 1, pageCodeFromPack(verificationPack, 1));

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
    // 分页检查：只剩不到一行空间就换页（双栏下一行约 85pt）
    if (y + 85 > PAGE.contentBottom) {
      finishStudentPage();
      doc.addPage();
      pageNumber += 1;
      y = startStudentPage(group.questions[0]);
    }
    y = drawGroupBar(doc, group, groupIndex, y, type);

    // 双栏布局：两题一行（左栏 + 右栏）
    for (let qi = 0; qi < group.questions.length; qi += 2) {
      const leftQ = group.questions[qi];
      const rightQ = group.questions[qi + 1];
      const leftHeight = questionHeight(doc, leftQ);
      const rightHeight = rightQ ? questionHeight(doc, rightQ) : 0;
      const rowHeight = Math.max(leftHeight, rightHeight);

      // 分页检查：当前行放不下就换页
      const checkHeight = Math.max(rowHeight, 75);
      const leftPageCode = questionPageCode(leftQ, verificationPack, pageNumber);
      if (
        type === 'verification'
        && currentStudentQuestionIds.length > 0
        && currentStudentPageCode
        && leftPageCode
        && leftPageCode !== currentStudentPageCode
      ) {
        finishStudentPage();
        doc.addPage();
        pageNumber += 1;
        y = startStudentPage(leftQ);
        y = drawGroupBar(doc, group, groupIndex, y, type);
      }
      if (y + checkHeight > PAGE.contentBottom) {
        finishStudentPage();
        doc.addPage();
        pageNumber += 1;
        y = startStudentPage(leftQ);
        y = drawGroupBar(doc, group, groupIndex, y, type);
      }

      // 左栏
      rememberQuestionOnStudentPage(leftQ);
      drawQuestion(doc, leftQ, y, PAGE.left, COLUMN_WIDTH);

      // 右栏（如果有配对的题）
      if (rightQ) {
        const rightPageCode = questionPageCode(rightQ, verificationPack, pageNumber);
        if (
          type === 'verification'
          && currentStudentQuestionIds.length > 0
          && currentStudentPageCode
          && rightPageCode
          && rightPageCode !== currentStudentPageCode
        ) {
          // 右栏跨 pageCode：右栏单独画在下一行（降级单栏）
          rememberQuestionOnStudentPage(leftQ);
          y += leftHeight;
          // 右题放下一行左栏
          rememberQuestionOnStudentPage(rightQ);
          drawQuestion(doc, rightQ, y, PAGE.left, COLUMN_WIDTH);
          y += questionHeight(doc, rightQ);
          continue;
        }
        rememberQuestionOnStudentPage(rightQ);
        const rightX = PAGE.left + COLUMN_WIDTH + COLUMN_GAP;
        drawQuestion(doc, rightQ, y, rightX, COLUMN_WIDTH);
      }

      y += rowHeight;
    }
  });
  finishStudentPage();

  doc.addPage();
  let answerPageNumber = 1;
  y = drawAnswerHeader(doc, subject, type, paperDate, paperDisplayCode);
  // 答案双栏：两题一行
  const allQuestions = groups.flatMap(g => g.questions);
  for (let qi = 0; qi < allQuestions.length; qi += 2) {
    const leftAns = allQuestions[qi];
    const rightAns = allQuestions[qi + 1];
    const leftResult = drawAnswer(doc, leftAns, y, PAGE.left, COLUMN_WIDTH);
    let rightHeight = 0;
    if (rightAns) {
      const rightResult = drawAnswer(doc, rightAns, y, PAGE.left + COLUMN_WIDTH + COLUMN_GAP, COLUMN_WIDTH);
      rightHeight = rightResult.height;
    }
    y += Math.max(leftResult.height, rightHeight);
    // 分页检查
    if (y + 50 > PAGE.contentBottom && qi + 2 < allQuestions.length) {
      drawPageNumber(doc, answerPageNumber, true);
      doc.addPage();
      answerPageNumber += 1;
      y = drawAnswerHeader(doc, subject, type, paperDate, paperDisplayCode);
    }
  }
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
