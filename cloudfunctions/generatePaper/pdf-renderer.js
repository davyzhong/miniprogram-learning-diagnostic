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
        confidenceLabel: question.confidenceLabel || '',
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

/**
 * 栏内卡点标签：只占栏宽，跟随题目。左栏/右栏各自独立。
 * 返回实际占用高度。
 */
function drawColumnGroupLabel(doc, groupName, qCount, confidenceLabel, y, x, colWidth, type = 'verification') {
  const w = colWidth || COLUMN_WIDTH;
  // 卡点名 + 右侧"验证N题"同一行
  const nameWidth = w * 0.65;
  const tagWidth = w * 0.35;
  doc.fillColor(COLORS.blue).fontSize(9);
  const nameHeight = doc.heightOfString(groupName || '', { width: nameWidth, lineGap: 1 });
  doc.text(groupName || '', x, y, { width: nameWidth, lineGap: 1 });

  const confTag = confidenceLabel ? `·${confidenceLabel}` : '';
  const modeLabel = type === 'verification' ? '验证' : '覆盖';
  doc.fillColor(COLORS.muted).fontSize(7.5)
    .text(`${modeLabel}${qCount}题${confTag}`, x + nameWidth, y + 1, {
      width: tagWidth, align: 'right',
    });

  // 下划线分隔
  drawLine(doc, x, y + nameHeight + 2, x + w - 4, y + nameHeight + 2, COLORS.pale, 0.6);
  return nameHeight + 5;
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
  // 演算区统一 52pt + 4pt 间距 + 10pt 底部
  return contentHeight + 52 + 4 + 10;
}

/**
 * 计算题目的"内容文字高度"（不含演算区），用于双栏对齐时统一文字区高度
 */
function questionContentHeight(doc, question, colWidth) {
  doc.fontSize(11);
  const w = colWidth || COLUMN_WIDTH;
  const fullText = `${question.index || ''}. ${question.content || ''}`;
  return doc.heightOfString(fullText, { width: w - 6, lineGap: 2 });
}

function drawQuestion(doc, question, y, x, colWidth, alignContentHeight) {
  const w = colWidth || COLUMN_WIDTH;
  const left = x || PAGE.left;

  // 题号 + 题目内容合并一行：1. 计算 0.25 × 0.4 = ？
  const fullText = `${question.index || ''}. ${question.content || ''}`;
  doc.fillColor(COLORS.text).fontSize(11)
    .text(fullText, left, y, {
      width: w - 4,
      lineGap: 2,
    });

  // 演算区 Y 坐标：如果有对齐高度，用对齐高度（保证左右栏演算区同一 Y 开始）
  const ownContentHeight = doc.heightOfString(fullText, { width: w - 4, lineGap: 2 });
  const contentHeight = alignContentHeight || ownContentHeight;
  const boxY = y + contentHeight + 4;
  // 演算区高度统一用 52pt（不区分长短题，保证双栏底部对齐）
  const boxHeight = 52;

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

function answerParts(question) {
  const num = question.index || '';
  const lpName = summarizeBottleneckName(question.lpName);
  const answer = question.answer || '';
  const explanation = question.explanation || question.reasoning || '';
  return {
    line1: `${num}. [${lpName}]`,
    line2: `答案：${answer}`,
    line3: explanation ? `思路：${explanation}` : '',
  };
}

function answerHeight(doc, question, colWidth) {
  const w = colWidth || COLUMN_WIDTH;
  const { line1, line2, line3 } = answerParts(question);
  doc.fontSize(9);
  const h1 = doc.heightOfString(line1, { width: w - 4, lineGap: 0 });
  doc.fontSize(10);
  const h2 = doc.heightOfString(line2, { width: w - 4, lineGap: 1 });
  let h3 = 0;
  if (line3) {
    doc.fontSize(8.5);
    h3 = doc.heightOfString(line3, { width: w - 4, lineGap: 1 });
  }
  return h1 + 2 + h2 + (line3 ? 3 + h3 : 0) + 8;
}

function drawAnswer(doc, question, y, x, colWidth) {
  const w = colWidth || COLUMN_WIDTH;
  const left = x || PAGE.left;
  const { line1, line2, line3 } = answerParts(question);

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

  // 学生页流式渲染：题目按 pageCode 分组（让同卡点题目相邻，减少标签重复），
  // 但物理分页只看实际高度——铺满一页才换页，不再以 pageCode 作为硬分页边界。
  // 这样可避免"高权重卡点挤爆前几页、低权重卡点饿死后几页"导致的大段空白。
  // pageCode 仍随题目记录到 studentPageMetadata，用于学生完成进度追踪。
  const studentQuestions = questionsData.questions || [];
  const groups = groupQuestions(studentQuestions);

  // 按 pageCode 把题目分组，保持每组内题目相邻（便于双栏配对与卡点标签去重）。
  const pagesByCode = new Map();  // pageCode → [{ group, question }]
  groups.forEach(group => {
    group.questions.forEach(question => {
      const pc = questionPageCode(question, verificationPack, 1) || 'AUTO-1';
      if (!pagesByCode.has(pc)) pagesByCode.set(pc, []);
      pagesByCode.get(pc).push({ group, question });
    });
  });

  const pageCodes = Array.from(pagesByCode.keys()).sort();
  // 把所有题目按 pageCode 顺序展平成一条连续流（不再逐 pageCode 强制换页）。
  const flowQuestions = [];
  pageCodes.forEach(pageCode => {
    const pageItems = pagesByCode.get(pageCode) || [];
    pageItems.forEach(item => flowQuestions.push(item.question));
  });

  // 统计每个 lpCode 的题目数（用于标签显示）——基于全量题目，不受分页影响。
  const lpCounts = new Map();
  const lpConfidence = new Map();
  flowQuestions.forEach(q => {
    const lp = q.lpCode || q.targetId || '';
    lpCounts.set(lp, (lpCounts.get(lp) || 0) + 1);
  });
  groups.forEach(g => {
    if (g.lpCode) lpConfidence.set(g.lpCode, g.confidenceLabel || '');
  });

  let pageNumber = 1;
  const firstPageCode = flowQuestions.length
    ? questionPageCode(flowQuestions[0], verificationPack, 1)
    : pageCodes[0] || '';
  let y = drawStudentHeader(doc, subject, type, false, paperDate, paperDisplayCode, 1, firstPageCode);

  // 左右栏各自独立跟踪 lpCode，各自画栏内卡点标签。
  let lastLeftLp = '';
  let lastRightLp = '';

  for (let qi = 0; qi < flowQuestions.length; qi += 2) {
    const leftQ = flowQuestions[qi];
    const rightQ = flowQuestions[qi + 1];
    const leftLp = leftQ.lpCode || leftQ.targetId || '';
    const rightLp = rightQ ? (rightQ.lpCode || rightQ.targetId || '') : '';

    // 1. 各栏独立判断是否需要画卡点标签
    const leftNeedsLabel = leftLp !== lastLeftLp;
    const rightNeedsLabel = rightQ && rightLp !== lastRightLp;

    // 2. 计算标签高度（各栏独立，取最大值保证对齐）
    let leftLabelH = 0, rightLabelH = 0;
    if (leftNeedsLabel) {
      doc.fontSize(9);
      leftLabelH = doc.heightOfString(leftQ.lpName || leftLp, { width: COLUMN_WIDTH * 0.65, lineGap: 1 }) + 5;
    }
    if (rightNeedsLabel) {
      doc.fontSize(9);
      rightLabelH = doc.heightOfString(rightQ.lpName || rightLp, { width: COLUMN_WIDTH * 0.65, lineGap: 1 }) + 5;
    }
    const labelHeight = Math.max(leftLabelH, rightLabelH);

    // 3. 计算题目行高
    const leftContentH = questionContentHeight(doc, leftQ);
    const rightContentH = rightQ ? questionContentHeight(doc, rightQ) : 0;
    const alignContentHeight = Math.max(leftContentH, rightContentH);
    const questionRowHeight = alignContentHeight + 52 + 4 + 10;

    // 4. 总高度 = 标签高度 + 题目高度
    const totalHeight = labelHeight + questionRowHeight;

    // 5. 高度分页检查：铺满一页才换页（不再以 pageCode 作为分页边界）
    if (y + totalHeight > PAGE.contentBottom) {
      finishStudentPage();
      doc.addPage();
      pageNumber += 1;
      y = startStudentPage(leftQ);
      // 换页后重置（跨页同卡点也重画标签，因为到了新页）
      lastLeftLp = '';
      lastRightLp = '';
      qi -= 2;
      continue;
    }

    // 6. 画左栏卡点标签（如果需要）
    if (leftNeedsLabel) {
      const conf = lpConfidence.get(leftLp) || '';
      drawColumnGroupLabel(doc,
        leftQ.lpName || leftLp, lpCounts.get(leftLp) || 1, conf,
        y, PAGE.left, COLUMN_WIDTH, type);
      lastLeftLp = leftLp;
    }

    // 7. 画右栏卡点标签（如果需要）
    if (rightNeedsLabel) {
      const conf = lpConfidence.get(rightLp) || '';
      drawColumnGroupLabel(doc,
        rightQ.lpName || rightLp, lpCounts.get(rightLp) || 1, conf,
        y, PAGE.left + COLUMN_WIDTH + COLUMN_GAP, COLUMN_WIDTH, type);
      lastRightLp = rightLp;
    }

    // 8. 题目起始 Y = 当前 Y + 标签高度
    const questionY = y + labelHeight;

    // 9. 画双栏题目
    rememberQuestionOnStudentPage(leftQ);
    drawQuestion(doc, leftQ, questionY, PAGE.left, COLUMN_WIDTH, alignContentHeight);
    if (rightQ) {
      rememberQuestionOnStudentPage(rightQ);
      drawQuestion(doc, rightQ, questionY, PAGE.left + COLUMN_WIDTH + COLUMN_GAP, COLUMN_WIDTH, alignContentHeight);
    }
    y += totalHeight;
  }
  finishStudentPage();

  doc.addPage();
  let answerPageNumber = 1;
  y = drawAnswerHeader(doc, subject, type, paperDate, paperDisplayCode);
  // 答案双栏：两题一行
  const allQuestions = groups.flatMap(g => g.questions);
  for (let qi = 0; qi < allQuestions.length; qi += 2) {
    const leftAns = allQuestions[qi];
    const rightAns = allQuestions[qi + 1];
    const leftHeight = answerHeight(doc, leftAns, COLUMN_WIDTH);
    const rightHeight = rightAns ? answerHeight(doc, rightAns, COLUMN_WIDTH) : 0;
    const rowHeight = Math.max(leftHeight, rightHeight);
    if (y + rowHeight > PAGE.contentBottom && qi > 0) {
      drawPageNumber(doc, answerPageNumber, true);
      doc.addPage();
      answerPageNumber += 1;
      y = drawAnswerHeader(doc, subject, type, paperDate, paperDisplayCode);
    }
    const leftResult = drawAnswer(doc, leftAns, y, PAGE.left, COLUMN_WIDTH);
    let drawnRightHeight = 0;
    if (rightAns) {
      const rightResult = drawAnswer(doc, rightAns, y, PAGE.left + COLUMN_WIDTH + COLUMN_GAP, COLUMN_WIDTH);
      drawnRightHeight = rightResult.height;
    }
    y += Math.max(leftResult.height, drawnRightHeight);
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
