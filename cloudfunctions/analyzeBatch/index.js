// analyzeBatch/index.js
// 单批次分析（最多5张图片），调用 CloudBase AI 返回结构化JSON
const tcb = require('@cloudbase/node-sdk');
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });

// 初始化 CloudBase AI SDK
const app = tcb.init({
  env: 'cloud1-d6gneg68m5a7a3876',
  timeout: 60000
});

// ========== 构建 Prompt ==========
function buildPrompt(subject) {
  const subjectName = { math: '数学', chinese: '语文', english: '英语' }[subject] || '数学';

  const bugTaxonomy = {
    math: [
      { code: 'LP-001', name: '计算错误（加减乘除）', desc: '基础运算错误，如进位、借位、乘除法则错误' },
      { code: 'LP-002', name: '分数运算错误', desc: '通分、约分、分数加减乘除错误' },
      { code: 'LP-003', name: '百分数/小数转换错误', desc: '百分数与小数互化、百分数应用题错误' },
      { code: 'LP-004', name: '单位换算错误', desc: '长度、面积、体积、时间、货币单位换算错误' },
      { code: 'LP-005', name: '应用题建模失败', desc: '无法将文字题转化为算式，或转化错误' },
      { code: 'LP-006', name: '几何概念混淆', desc: '周长/面积/体积公式混淆，角度计算错误' },
      { code: 'LP-007', name: '符号错误', desc: '正负号、等号、不等号使用错误' },
      { code: 'LP-008', name: '审题错误', desc: '漏看条件、看错数字、理解错题意' },
      { code: 'LP-009', name: '书写不规范', desc: '数字/字母书写潦草导致误认' },
      { code: 'LP-010', name: '草稿纸计算错误', desc: '草稿纸计算正确但抄写答案时出错' },
    ],
    chinese: [
      { code: 'LP-101', name: '识字量不足', desc: '生字词不认识，影响阅读理解' },
      { code: 'LP-102', name: '阅读理解偏差', desc: '未能准确理解文章主旨或细节' },
      { code: 'LP-103', name: '作文结构混乱', desc: '段落安排不合理，缺乏逻辑' },
      { code: 'LP-104', name: '拼音/笔顺错误', desc: '拼音标注或汉字书写笔顺错误' },
    ],
    english: [
      { code: 'LP-201', name: '词汇量不足', desc: '单词不认识，影响句子理解' },
      { code: 'LP-202', name: '语法错误', desc: '时态、单复数、介词使用错误' },
      { code: 'LP-203', name: '阅读理解偏差', desc: '未能准确理解英文文章' },
      { code: 'LP-204', name: '写作表达不流畅', desc: '句子结构错误，表达不地道' },
    ],
  };

  const taxonomy = bugTaxonomy[subject] || bugTaxonomy.math;

  return `你是一位资深${subjectName}教师，专门分析小学生的错题根因。

## 任务
分析上传的${subjectName}试卷/作业照片，识别所有错题，对每个错题给出根因分析。

## 颜色规则（非常重要）
- 黑色字迹：学生原始作答
- 蓝色字迹：学生订正（如与黑色不同，说明已意识到错误）
- 红色字迹/符号：老师/家长批改标记

## 输出格式（严格JSON，不要加\`\`\`json\`\`\`包裹）
返回一个JSON对象，格式如下：
{
  "summary": "一句话总结本次诊断发现（50字内）",
  "totalErrors": 12,
  "bottlenecks": [
    {
      "lpCode": "LP-001",
      "lpName": "计算错误（加减乘除）",
      "errorCount": 4,
      "severity": "high",
      "rootCause": "进位加法不熟练，连续进位时容易遗漏",
      "suggestion": "每天练习20道三位数进位加法，连续7天"
    }
  ],
  "errorDetails": [
    {
      "questionContent": "题目内容（简要）",
      "studentAnswer": "学生答案",
      "correctAnswer": "正确答案",
      "lpCode": "LP-001",
      "rootCause": "具体根因（一句话）",
      "suggestion": "改进建议（一句话）"
    }
  ]
}

## 卡点分类体系（${subjectName}）
${taxonomy.map(t => `- ${t.code}：${t.name}——${t.desc}`).join('\n')}

## 注意
1. severity 只能是 "high" / "medium" / "low"
2. 如果错题无法归类到现有体系，使用 "LP-XXX" 作为新卡点代码，并在 lpName 中描述
3. 只分析清晰可见的错题，模糊不清的题目跳过
4. 返回纯JSON，不要有任何其他文字`;
}

// ========== 调用 CloudBase AI（多模态） ==========
async function callAI(imageUrls, subject) {
  const prompt = buildPrompt(subject);

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
function parseResult(aiText) {
  try {
    // 去掉可能的 ```json ``` 包裹
    const cleaned = aiText.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`解析AI返回失败：${err.message}，原始内容：${aiText.substr(0, 200)}`);
  }
}

// ========== 主函数 ==========
exports.main = async (event) => {
  const { fileIDs, subject = 'math', batchIndex = 0, reportId = '' } = event;

  if (!fileIDs || !Array.isArray(fileIDs) || fileIDs.length === 0) {
    return { success: false, error: 'fileIDs 不能为空' };
  }

  if (fileIDs.length > 5) {
    return { success: false, error: '单次最多处理5张图片' };
  }

  try {
    // 1. 将 fileID 转成临时 URL
    console.log('获取图片临时链接...');
    const tempRes = await cloud.getTempFileURL({ fileList: fileIDs });
    const imageUrls = tempRes.fileList
      .filter(f => f.tempFileURL)
      .map(f => f.tempFileURL);

    if (imageUrls.length === 0) {
      return { success: false, error: '无法获取图片临时链接' };
    }

    console.log(`成功获取 ${imageUrls.length} 张图片的临时链接`);

    // 2. 调用 CloudBase AI
    console.log('调用 CloudBase AI 分析...');
    const aiText = await callAI(imageUrls, subject);

    // 3. 解析结果
    const result = parseResult(aiText);

    // 4. 补充字段
    result.batchIndex = batchIndex;
    result.analyzedFileIDs = fileIDs;
    result.timestamp = Date.now();

    return { success: true, data: result };
  } catch (err) {
    console.error('analyzeBatch 失败：', err);
    return { success: false, error: err.message, stack: err.stack };
  }
};
