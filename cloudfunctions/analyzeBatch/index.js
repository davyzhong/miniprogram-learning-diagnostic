// analyzeBatch/index.js
// 单批次分析（最多5张图片），调用 CloudBase AI 返回结构化JSON
const tcb = require('@cloudbase/node-sdk');
const cloud = require('wx-server-sdk');
const { normalizePageResults } = require('./result-normalizer');
const { getSubjectName } = require('./constants');
const { BOTTLENECK_CODE_NAMES } = require('./bottleneck-name');

cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = cloud.database();
const SUBJECTS = new Set(['math', 'chinese', 'english']);
const VERIFICATION_PLAN_LIMIT = 60;

// 初始化 CloudBase AI SDK
const app = tcb.init({
  env: tcb.SYMBOL_CURRENT_ENV,
  timeout: 60000
});

// ========== 构建 Prompt ==========
function buildPrompt(subject, verificationPlan = []) {
  const subjectName = getSubjectName(subject, '数学');

  const descriptions = {
    'LP-001': '基础运算错误，如进位、借位、乘除法则错误',
    'LP-002': '通分、约分、分数加减乘除错误',
    'LP-003': '百分数与小数互化、百分数应用题错误',
    'LP-004': '长度、面积、体积、时间、货币单位换算错误',
    'LP-005': '无法将文字题转化为算式，或转化错误',
    'LP-006': '周长/面积/体积公式混淆，角度计算错误',
    'LP-007': '正负号、等号、不等号使用错误',
    'LP-008': '漏看条件、看错数字、理解错题意',
    'LP-009': '数字/字母书写潦草导致误认',
    'LP-010': '抄数字、抄符号或最后检查环节不稳定',
    'LP-101': '字词积累和基础运用需要观察',
    'LP-102': '阅读信息提取和理解表达需要观察',
    'LP-103': '作文结构和表达组织需要观察',
    'LP-104': '拼音、笔顺和基础书写需要观察',
    'LP-201': '单词识记和词义使用需要观察',
    'LP-202': '句法结构和语法规则需要观察',
    'LP-203': '英文阅读理解和信息提取需要观察',
    'LP-204': '英文句子表达和组织需要观察',
  };
  const subjectCodes = {
    math: ['LP-001', 'LP-002', 'LP-003', 'LP-004', 'LP-005', 'LP-006', 'LP-007', 'LP-008', 'LP-009', 'LP-010'],
    chinese: ['LP-101', 'LP-102', 'LP-103', 'LP-104'],
    english: ['LP-201', 'LP-202', 'LP-203', 'LP-204'],
  };
  const taxonomy = (subjectCodes[subject] || subjectCodes.math).map(code => ({
    code,
    name: BOTTLENECK_CODE_NAMES[code],
    desc: descriptions[code],
  }));

  const chineseReviewPlanItems = verificationPlan.flatMap(item => item.chineseReviewTargets || []);
  const verificationPlanLines = verificationPlan.map(item => {
    const label = item.displayName || item.lpName || item.lpCode;
    const pageCode = item.pageCode ? `pageCode=${item.pageCode}，` : '';
    const targetId = item.targetId ? `targetId=${item.targetId}，` : '';
    return `- ${pageCode}${targetId}${item.lpCode}：${label}，预期 ${item.expectedQuestionCount} 道`;
  });
  const verificationInstruction = verificationPlan.length > 0
    ? `\n## 验证试卷判定\n这是验证试卷。请先识别纸面印出的“页面编号”，并在 pageResults.pageCode 中返回；如果本页没有清楚看到页面编号，pageCode 返回空字符串。请按 pageCode + targetId/lpCode 统计证据质量，不要把不确定情况当成已改善：\n${verificationPlanLines.join('\n')}${chineseReviewPlanItems.length > 0 ? `\n\n语文错项还需要按 reviewItemId 单独统计 chineseReviewEvidence：\n${chineseReviewPlanItems.map(item => `- ${item.itemId}：targetText=${item.targetText}，预期 ${item.expectedQuestionCount} 道`).join('\n')}` : ''}\n- attemptedQuestionCount：清晰可见、已经作答、能够判断对错的题目数量\n- incorrectQuestionCount：attemptedQuestionCount 中明确答错的题目数量\n- blankQuestionCount：清晰可见但没有作答或明显空白的题目数量\n- unclearQuestionCount：被遮挡、模糊、拍摄不完整、无法判断答案是否正确的题目数量\n- missingQuestionCount：预期题目中未在图片中找到或无法归入以上类别的数量\n未作答、被遮挡、模糊或无法确认的题目不得计入 attemptedQuestionCount。`
    : '';
  const mathLearningMapInstruction = subject === 'math'
    ? `\n## 数学诊断升级字段\n数学卡点除了旧的 lpCode/lpName 外，还要尽量补充知识地图字段，无法判断时用空数组或空字符串，不要编造：\n- nodeIds：对应知识节点 ID，例如 MATH-NUM-DEC-MUL-POINT、MATH-NUM-FRACTION-DIV-RECIPROCAL、MATH-MOD-PERCENT-BASE、MATH-GEO-CYLINDER-VOLUME\n- candidateBottlenecks：细颗粒度候选卡点数组，每项包含 bottleneckId、title、evidenceStrength，可选 microValidationRequired、suggestedMicroValidation、recommendedResourceIds\n- recommendedResourceIds：推荐资源 ID。优先给“高质量锚点 + 国内补充”的组合，例如 RES-YT-FRACTION-DIV-001 + RES-BILI-FRACTION-DIV-001\n- nextActionType：resourceReview / microValidation / verificationPaper 三选一。发现漏洞时优先 resourceReview 或 microValidation，不要一上来就 verificationPaper\n- nextActionText：一句给家长看的下一步建议`
    : '';
  const mathBottleneckJsonFields = subject === 'math'
    ? `,
        "nodeIds": ["MATH-NUM-DEC-MUL-POINT"],
        "candidateBottlenecks": [{
          "bottleneckId": "BN-DEC-MUL-POINT-COUNT",
          "title": "小数乘法中小数位数累计规则不稳",
          "evidenceStrength": "medium",
          "microValidationRequired": true,
          "suggestedMicroValidation": ["8.5×3.16", "0.85×3.16"],
          "recommendedResourceIds": ["RES-BILI-DEC-MUL-001", "RES-KHAN-DEC-MUL-001"]
        }],
        "evidenceStrength": "medium",
        "nextActionType": "resourceReview",
        "nextActionText": "先用资源重学小数点定位，再做微验证。",
        "recommendedResourceIds": ["RES-BILI-DEC-MUL-001", "RES-KHAN-DEC-MUL-001"]`
    : '';
  const chineseErrorInstruction = subject === 'chinese'
    ? `\n## 语文错项抽取规则\n语文诊断必须区分“记忆型错项”和“能力型卡点”。记忆型错项要进入 chineseErrorItems，不能只停留在 LP-101/LP-104 这类粗卡点。\n记忆型错项包括：不会写的汉字、写错的词语、拼音声调错误、古诗文漏字错字、成语或日积月累错项。\n每个 chineseErrorItems 项必须尽量填写 targetText、expectedAnswer、studentAnswer、sourceContext、mistakeType、verificationMethods、relatedLpCode。\n能力型问题如阅读理解、作文结构、句式表达，可以继续放在 bottlenecks；如果有明确训练对象，也可以补充 chineseErrorItems，itemType 用 reading_skill 或 writing_skill。`
    : '';
  const chineseErrorJsonFields = subject === 'chinese'
    ? `,
      "chineseErrorItems": [{
        "itemId": "CHI-WORD-BIANLUN",
        "itemType": "word",
        "targetText": "辩论",
        "expectedAnswer": "辩论",
        "studentAnswer": "辨论",
        "sourceContext": "看拼音写词语：biàn lùn",
        "mistakeType": "形近字混淆",
        "sourceQuestion": "看拼音写词语",
        "evidenceStrength": "high",
        "verificationMethods": ["pinyin_to_word", "dictation", "context_fill"],
        "relatedLpCode": "LP-101",
        "suggestion": "区分“辩/辨/辫/瓣”的部件和语义，再做复测。"
      }]`
    : '';
  const chineseReviewEvidenceJsonFields = subject === 'chinese'
    ? `,
      "chineseReviewEvidence": [{
        "itemId": "CHI-WORD-BIANLUN",
        "targetText": "辩论",
        "attemptedQuestionCount": 1,
        "incorrectQuestionCount": 0,
        "blankQuestionCount": 0,
        "unclearQuestionCount": 0,
        "missingQuestionCount": 0
      }]`
    : '';

  return `你是一位资深${subjectName}教师，专门分析小学生的错题根因。

## 任务
分析上传的${subjectName}试卷/作业照片，识别所有错题，对每个错题给出根因分析。
${verificationInstruction}
${chineseErrorInstruction}

## 颜色规则（非常重要）
- 黑色字迹：学生原始作答
- 蓝色字迹：学生订正（如与黑色不同，说明已意识到错误）
- 红色字迹/符号：老师/家长批改标记

## 输出格式（严格JSON，不要加\`\`\`json\`\`\`包裹）
按图片分别返回结果。图片顺序与上传顺序一致，imageIndex 从 1 开始。返回一个JSON对象，格式如下：
{
      "pageResults": [
    {
      "imageIndex": 1,
      "pageCode": "验证试卷页面编号，如 MATH-V-20260616-01-P02；非验证试卷或看不清则为空",
      "ocrSummary": "本页可用于判断是否重复的题目、学生答案和批改信息摘要（300字内）",
      "summary": "本页诊断总结（50字内）",
      "bottlenecks": [{
        "lpCode": "LP-001",
        "lpName": "计算错误（加减乘除）",
        "errorCount": 1,
        "severity": "high",
        "rootCause": "进位加法不熟练",
        "suggestion": "练习连续进位"${mathBottleneckJsonFields}
      }],
      "errorDetails": [{
        "questionContent": "题目内容（简要）",
        "studentAnswer": "学生答案",
        "correctAnswer": "正确答案",
        "lpCode": "LP-001",
        "rootCause": "具体根因（一句话）",
        "suggestion": "改进建议（一句话）"
      }]${chineseErrorJsonFields},
      "verificationEvidence": [{
        "lpCode": "LP-001",
        "targetId": "细卡点或具体错项 ID；没有则为空",
        "pageCode": "本条证据所属页面编号；没有则为空",
        "attemptedQuestionCount": 3,
        "incorrectQuestionCount": 0,
        "blankQuestionCount": 0,
        "unclearQuestionCount": 0,
        "missingQuestionCount": 0
      }]${chineseReviewEvidenceJsonFields}
    }
  ]
}

## 卡点分类体系（${subjectName}）
${taxonomy.map(t => `- ${t.code}：${t.name}——${t.desc}`).join('\n')}
${mathLearningMapInstruction}

## 注意
1. severity 只能是 "high" / "medium" / "low"
2. 如果错题无法归类到现有体系，使用 "LP-XXX" 作为新卡点代码，并在 lpName 中描述
3. 只分析清晰可见的错题，模糊不清的题目跳过
4. 每一张图片都必须返回一个 pageResults 项，即使本页没有错题
5. ocrSummary 应包含足够区分本页内容的信息，但不要逐字抄录整页
6. ocrSummary 不要推断年级、学段或教材版本，只描述题目内容、学生作答和批改信息
7. 非验证试卷的 verificationEvidence 返回空数组
8. 验证试卷中，只有清晰作答且能够判断对错的题目才计入 attemptedQuestionCount；空白、模糊、缺失要分别计入 blankQuestionCount / unclearQuestionCount / missingQuestionCount
9. ${subject === 'chinese' ? '语文的记忆型错项必须输出到 chineseErrorItems；如果没有具体错项，返回空数组' : '返回纯JSON，不要有任何其他文字'}
10. 返回纯JSON，不要有任何其他文字`;
}

async function authorizeBatch({ reportId, taskId, fileIDs }) {
  if (!reportId || !taskId) {
    return { allowed: false, error: '无权执行批次分析' };
  }

  const [reportRes, taskRes] = await Promise.all([
    db.collection('reports').doc(reportId).get(),
    db.collection('analysisTasks').doc(taskId).get(),
  ]);
  const report = reportRes.data;
  const task = taskRes.data;
  if (!report || !task || task.reportId !== reportId || task.status !== 'processing') {
    return { allowed: false, error: '无权执行批次分析' };
  }
  if (report._openid && task._openid !== report._openid) {
    return { allowed: false, error: '无权执行批次分析' };
  }
  const allowedFiles = new Set(Array.isArray(task.fileIDs) ? task.fileIDs : []);
  if (fileIDs.some(fileID => !allowedFiles.has(fileID))) {
    return { allowed: false, error: '图片不属于当前分析任务' };
  }
  return { allowed: true };
}

// ========== 调用 CloudBase AI（多模态） ==========
async function callAI(imageUrls, subject, verificationPlan) {
  const prompt = buildPrompt(subject, verificationPlan);

  // 构造 messages（CloudBase AI 多模态格式）
  const content = [
    { type: 'text', text: prompt },
    ...imageUrls.map(url => ({
      type: 'image_url',
      image_url: { url }
    })),
  ];

  const ai = app.ai();
  const model = ai.createModel('cloudbase');

  const result = await model.generateText({
    model: 'hy3-preview',
    messages: [{ role: 'user', content }],
    temperature: 0.3,
  });

  return result.text;
}

// ========== 解析 AI 返回 ==========
function parseResult(aiText, expectedPageCount) {
  try {
    // 去掉可能的 ```json ``` 包裹
    const cleaned = aiText.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
    const result = JSON.parse(cleaned);
    return normalizePageResults(result, expectedPageCount);
  } catch (err) {
    throw new Error(`解析AI返回失败：${err.message}，原始内容：${aiText.substr(0, 200)}`);
  }
}

// ========== 主函数 ==========
exports.main = async (event) => {
  const { fileIDs, subject = 'math', batchIndex = 0, reportId = '', taskId = '', verificationPlan = [] } = event;

  if (!fileIDs || !Array.isArray(fileIDs) || fileIDs.length === 0) {
    return { success: false, error: 'fileIDs 不能为空' };
  }

  if (fileIDs.length > 5) {
    return { success: false, error: '单次最多处理5张图片' };
  }
  if (fileIDs.some(fileID => typeof fileID !== 'string' || !fileID.startsWith('cloud://'))) {
    return { success: false, error: '图片参数无效' };
  }
  if (!SUBJECTS.has(subject)) {
    return { success: false, error: '学科参数无效' };
  }
  if (!Array.isArray(verificationPlan)
    || verificationPlan.length > VERIFICATION_PLAN_LIMIT
    || verificationPlan.some(item =>
      !item
      || !/^(LP|BN|CHI|MATH)-[A-Za-z0-9_-]{1,100}$/.test(String(item.lpCode || item.targetId || ''))
      || !Number.isInteger(item.expectedQuestionCount)
      || item.expectedQuestionCount < 1
      || item.expectedQuestionCount > 50
    )) {
    return { success: false, error: '验证计划参数无效' };
  }

  try {
    const access = await authorizeBatch({ reportId, taskId, fileIDs });
    if (!access.allowed) {
      return { success: false, error: access.error };
    }

    // 1. 将 fileID 转成临时 URL
    console.log('获取图片临时链接...');
    const tempRes = await cloud.getTempFileURL({ fileList: fileIDs });
    const tempUrlByFileID = new Map(
      (tempRes.fileList || [])
        .filter(file => file.fileID && file.tempFileURL)
        .map(file => [file.fileID, file.tempFileURL])
    );
    if (fileIDs.some(fileID => !tempUrlByFileID.has(fileID))) {
      return { success: false, error: '部分图片无法读取，请重新上传' };
    }
    const availableFileIDs = fileIDs.slice();
    const imageUrls = availableFileIDs.map(fileID => tempUrlByFileID.get(fileID));

    console.log(`成功获取 ${imageUrls.length} 张图片的临时链接`);

    // 2. 调用 CloudBase AI
    console.log('调用 CloudBase AI 分析...');
    const aiText = await callAI(imageUrls, subject, verificationPlan);

    // 3. 解析结果
    const result = parseResult(aiText, availableFileIDs.length);

    // 4. 补充字段
    result.pageResults = result.pageResults.map((page, index) => ({
      ...page,
      fileID: availableFileIDs[page.imageIndex - 1] || availableFileIDs[index] || '',
    })).filter(page => page.fileID);
    result.batchIndex = batchIndex;
    result.analyzedFileIDs = fileIDs;
    result.timestamp = Date.now();

    return { success: true, data: result };
  } catch (err) {
    console.error('analyzeBatch 失败：', err);
    return { success: false, error: '图片分析失败，请稍后重试' };
  }
};
