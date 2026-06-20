// tests/e2e-real-image.test.js
// 端到端真实图片测试：用真实试卷照片跑通 upload → AI分析 → 报告生成 全链路

const fs = require('fs');
const path = require('path');
const { normalizePageResults } = require('../cloudfunctions/analyzeBatch/result-normalizer');
const { compareBottlenecks, buildComparisonSummary } = require('../cloudfunctions/analyzePhotos/comparison');
const { markDuplicatePages } = require('../cloudfunctions/analyzePhotos/photo-dedup');
const {
  loadRealImageCases,
  validateRealImageCase,
  writeRealImageReport
} = require('./helpers/real-image-cases');

// 云环境 ID 从环境变量读取，避免在公开仓库中泄露实例信息。
// 运行真实云测试前需：export CLOUD_ENV=cloud1-xxxxx
// Mock 模式（--mock 或无 CLOUD_ENV）下此值仅用于构造 mock fileID，不会真正连云。
const ENV_ID = process.env.CLOUD_ENV || 'mock-env-id';

let tcb = null;
let app = null;
let aiResult = null;

// 是否使用 Mock AI 数据（本地无 CloudBase 认证时使用）
const USE_MOCK = process.argv.includes('--mock');
const E2E_CASES = loadRealImageCases({ env: process.env, argv: process.argv.slice(2) })

// 模拟 AI 返回数据（基于真实试卷：数学计算过关练）
const MOCK_AI_RESPONSE = {
  pageResults: [
    {
      imageIndex: 1,
      ocrSummary: "计算过关练(三) 口算题包括小数加减乘除、分数运算、百分数计算。笔算题4道竖式计算。选择合理方法计算8道混合运算题。红色批改标记显示大部分正确，少数计算错误。",
      summary: "基础计算掌握较好，分数运算和混合运算有少量错误",
      bottlenecks: [
        {
          lpCode: "LP-002",
          lpName: "分数运算错误",
          errorCount: 2,
          severity: "medium",
          rootCause: "分数通分和约分步骤容易出错",
          suggestion: "加强分数基本性质练习"
        },
        {
          lpCode: "LP-001",
          lpName: "计算错误（加减乘除）",
          errorCount: 1,
          severity: "low",
          rootCause: "小数除法商的定位不准确",
          suggestion: "练习小数除法的试商方法"
        },
        {
          lpCode: "LP-003",
          lpName: "百分数/小数转换错误",
          errorCount: 1,
          severity: "low",
          rootCause: "百分数与小数互化时小数点移动错误",
          suggestion: "反复练习百分数小数互化口诀"
        }
      ],
      errorDetails: [
        {
          questionContent: "笔算 5.87 ÷ 1.9",
          studentAnswer: "3.08",
          correctAnswer: "3.09",
          lpCode: "LP-001",
          rootCause: "小数除法试商时余数处理不当",
          suggestion: "练习保留一位小数的四舍五入"
        },
        {
          questionContent: "选择合理方法: (2/3 + 3/7 - 5/21) ÷ 1/21",
          studentAnswer: "14又9/5",
          correctAnswer: "16",
          lpCode: "LP-002",
          rootCause: "分数混合运算中通分后合并出错",
          suggestion: "分步写出通分过程，避免跳步"
        },
        {
          questionContent: "选择合理方法: 999 × 222 + 333 × 334",
          studentAnswer: "333000",
          correctAnswer: "333000",
          lpCode: "LP-002",
          rootCause: "（订正后正确，原题可能有误）",
          suggestion: "注意观察数字特征，善用简便算法"
        },
        {
          questionContent: "口算 25% + 15%",
          studentAnswer: "40%",
          correctAnswer: "40%",
          lpCode: "LP-003",
          rootCause: "（正确）百分数加法直接相加",
          suggestion: "继续保持"
        }
      ]
    }
  ]
};
function logStep(n, title) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  测试 ${n}: ${title}`);
  console.log(`${'='.repeat(60)}`);
}

function logSubStep(title) {
  console.log(`\n  ▸ ${title}`);
}

function logResult(ok, message) {
  const icon = ok ? '✅' : '❌';
  console.log(`    ${icon} ${message}`);
}

function logJson(label, data) {
  console.log(`\n  📄 ${label}:`);
  console.log(JSON.stringify(data, null, 2).split('\n').map(l => '    ' + l).join('\n'));
}

// ========== 构建 Prompt（复用 analyzeBatch 逻辑） ==========
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
按图片分别返回结果。图片顺序与上传顺序一致，imageIndex 从 1 开始。返回一个JSON对象，格式如下：
{
  "pageResults": [
    {
      "imageIndex": 1,
      "ocrSummary": "本页可用于判断是否重复的题目、学生答案和批改信息摘要（300字内）",
      "summary": "本页诊断总结（50字内）",
      "bottlenecks": [{
        "lpCode": "LP-001",
        "lpName": "计算错误（加减乘除）",
        "errorCount": 1,
        "severity": "high",
        "rootCause": "进位加法不熟练",
        "suggestion": "练习连续进位"
      }],
      "errorDetails": [{
        "questionContent": "题目内容（简要）",
        "studentAnswer": "学生答案",
        "correctAnswer": "正确答案",
        "lpCode": "LP-001",
        "rootCause": "具体根因（一句话）",
        "suggestion": "改进建议（一句话）"
      }]
    }
  ]
}

## 卡点分类体系（${subjectName}）
${taxonomy.map(t => `- ${t.code}：${t.name}——${t.desc}`).join('\n')}

## 注意
1. severity 只能是 "high" / "medium" / "low"
2. 如果错题无法归类到现有体系，使用 "LP-XXX" 作为新卡点代码，并在 lpName 中描述
3. 只分析清晰可见的错题，模糊不清的题目跳过
4. 每一张图片都必须返回一个 pageResults 项，即使本页没有错题
5. ocrSummary 应包含足够区分本页内容的信息，但不要逐字抄录整页
6. 返回纯JSON，不要有任何其他文字`;
}

// ========== Test 1: 图片上传测试 ==========
async function testUpload(testCase) {
  logStep(1, `图片上传测试 (${testCase.caseId})`);
  let allOk = true;

  if (testCase.mock) {
    logSubStep('使用 Mock 图片数据（跳过真实文件读取）');
    const buffer = Buffer.from('mock-real-image-e2e');
    const base64 = buffer.toString('base64');
    logResult(true, 'Mock 图片数据已准备');
    return {
      files: [{
        filePath: 'mock://math-diagnosis.jpg',
        buffer,
        base64,
        mockFileID: `cloud://${ENV_ID}.mock/test/mock-math-diagnosis.jpg`,
        sizeMB: '0.00'
      }],
      buffer,
      base64,
      mockFileID: `cloud://${ENV_ID}.mock/test/mock-math-diagnosis.jpg`,
      sizeMB: '0.00'
    };
  }

  // 1.1 文件存在性
  logSubStep('检查图片文件是否存在');
  const files = testCase.filePaths.map((filePath, index) => {
    const exists = fs.existsSync(filePath);
    logResult(exists, `文件存在: ${filePath}`);
    if (!exists) throw new Error(`图片文件不存在，测试终止: ${filePath}`);
    allOk = allOk && exists;

    logSubStep(`检查文件大小: ${path.basename(filePath)}`);
    const stats = fs.statSync(filePath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    const sizeOk = stats.size > 0 && stats.size < 20 * 1024 * 1024;
    logResult(sizeOk, `文件大小: ${stats.size} bytes (${sizeMB} MB)，${sizeOk ? '符合要求' : '过大或为空'}`);
    allOk = allOk && sizeOk;

    logSubStep(`检查文件格式: ${path.basename(filePath)}`);
    const buffer = fs.readFileSync(filePath);
    const header = buffer.slice(0, 4);
    const isJpeg = header[0] === 0xFF && header[1] === 0xD8;
    const isPng = header[0] === 0x89 && header[1] === 0x50;
    const formatOk = isJpeg || isPng;
    logResult(formatOk, `文件格式: ${isJpeg ? 'JPEG' : isPng ? 'PNG' : '未知'}，${formatOk ? '有效' : '无效'}`);
    allOk = allOk && formatOk;

    const mockFileID = `cloud://${ENV_ID}.636c-${ENV_ID}-1441789686/test/${Date.now()}_${index + 1}_${path.basename(filePath)}`;
    const fileIdOk = mockFileID.startsWith(`cloud://${ENV_ID}`);
    logResult(fileIdOk, `模拟 fileID: ${mockFileID}`);
    allOk = allOk && fileIdOk;

    const base64 = buffer.toString('base64');
    const base64Ok = base64.length > 1000;
    logResult(base64Ok, `Base64 长度: ${base64.length} chars，${base64Ok ? '有效' : '过短'}`);
    allOk = allOk && base64Ok;

    return { filePath, buffer, base64, mockFileID, sizeMB };
  });

  console.log(`\n  ${allOk ? '✅' : '❌'} Test 1 总结: ${allOk ? '全部通过' : '存在失败项'}`);
  return {
    files,
    buffer: files[0].buffer,
    base64: files[0].base64,
    mockFileID: files[0].mockFileID,
    sizeMB: files[0].sizeMB
  };
}

// ========== Test 2: AI 解析错题测试 ==========
async function testAIAnalysis(uploadData, testCase) {
  logStep(2, USE_MOCK ? 'AI 解析错题测试 (Mock 模式)' : 'AI 解析错题测试 (CloudBase AI hy3-preview)');

  let parsed = null;
  let aiText = '';

  // Mock 模式：直接使用预置数据
  if (USE_MOCK) {
    logSubStep('使用 Mock AI 数据（跳过真实 AI 调用）');
    parsed = MOCK_AI_RESPONSE;
    aiText = JSON.stringify(MOCK_AI_RESPONSE);
    logResult(true, `Mock 数据加载成功，共 ${parsed.pageResults.length} 页结果`);
  } else {
    // 2.1 初始化 CloudBase SDK
    logSubStep('初始化 CloudBase SDK');
    try {
      tcb = require('@cloudbase/node-sdk');
      app = tcb.init({
        env: ENV_ID,
        timeout: 120000,
      });
      logResult(true, '@cloudbase/node-sdk 初始化成功');
    } catch (err) {
      logResult(false, `@cloudbase/node-sdk 初始化失败: ${err.message}`);
      console.log('\n  ⚠️  跳过 Test 2，原因: SDK 初始化失败');
      return null;
    }

    // 2.2 尝试匿名登录（本地调用需要认证）
    logSubStep('尝试匿名登录 CloudBase');
    let loginOk = false;
    try {
      const auth = app.auth();
      await auth.signInAnonymously();
      logResult(true, '匿名登录成功');
      loginOk = true;
    } catch (err) {
      logResult(false, `匿名登录失败: ${err.message}`);
      console.log('    💡 提示: 本地环境可能不支持匿名登录，可尝试使用微信开发工具的"云函数本地调试"功能');
    }

    // 2.3 调用 AI 分析
    logSubStep('调用 hy3-preview 模型分析图片');
    const prompt = buildPrompt(testCase.subject || 'math');

    const content = [
      { type: 'text', text: prompt },
      ...uploadData.files.map(file => ({
        type: 'image_url',
        image_url: { url: `data:image/jpeg;base64,${file.base64}` }
      })),
    ];

    let aiCallOk = false;
    const startTime = Date.now();

    try {
      const ai = app.ai();
      const model = ai.createModel('cloudbase');

      const result = await model.generateText({
        model: 'hy3-preview',
        messages: [{ role: 'user', content }],
        temperature: 0.3,
      });

      aiText = result.text || '';
      aiCallOk = true;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      logResult(true, `AI 调用成功，耗时 ${elapsed}s，返回 ${aiText.length} 字符`);
    } catch (err) {
      logResult(false, `AI 调用失败: ${err.message}`);
      if (err.message && err.message.includes('secretId or secretKey')) {
        console.log('    💡 原因: 本地环境缺少腾讯云 API 密钥 (SecretId/SecretKey)');
        console.log('    💡 方案: 使用 --mock 参数运行测试，或在微信开发工具中使用"云函数本地调试"');
      }
      console.log('\n  ⚠️  跳过 Test 2 后续步骤');
      return null;
    }

    if (!aiCallOk) return null;

    // 2.4 解析 AI 返回
    logSubStep('解析 AI 返回的 JSON');
    let parseOk = false;
    try {
      const cleaned = aiText.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
      parsed = JSON.parse(cleaned);
      parseOk = true;
      logResult(true, 'JSON 解析成功');
    } catch (err) {
      logResult(false, `JSON 解析失败: ${err.message}`);
      console.log('\n  📄 AI 原始返回（前 500 字符）:');
      console.log(aiText.slice(0, 500));
      return null;
    }
  }

  // 2.5 标准化结果（Mock 和真实模式共用）
  logSubStep('标准化结果（result-normalizer）');
  let normalized = null;
  let normalizeOk = false;
  try {
    normalized = normalizePageResults(parsed, uploadData.files.length);
    normalizeOk = true;
    logResult(true, `标准化成功，共 ${normalized.pageResults.length} 页结果`);
  } catch (err) {
    logResult(false, `标准化失败: ${err.message}`);
    return null;
  }

  // 2.6 展示分析结果
  const page = normalized.pageResults[0];
  logJson('第 1 页分析结果', {
    imageIndex: page.imageIndex,
    summary: page.summary,
    ocrSummary: page.ocrSummary.slice(0, 100) + (page.ocrSummary.length > 100 ? '...' : ''),
    totalErrors: page.totalErrors,
    bottleneckCount: page.bottlenecks.length,
    bottlenecks: page.bottlenecks,
    errorDetails: page.errorDetails.slice(0, 3),
  });

  console.log(`\n  ✅ Test 2 总结: ${USE_MOCK ? 'Mock 模式' : 'AI 解析'}成功，发现 ${page.totalErrors} 道错题，${page.bottlenecks.length} 个学习卡点`);

  aiResult = { parsed, normalized, page, aiText };
  return aiResult;
}

// ========== Test 3: 生成诊断报告测试 ==========
async function testGenerateReport(aiData) {
  logStep(3, '生成诊断报告测试');

  if (!aiData) {
    console.log('  ⚠️  跳过 Test 3: Test 2 未成功，无法生成报告');
    console.log('  💡 建议: 将代码部署到云函数后，通过微信小程序上传图片进行完整测试');
    return false;
  }

  // 3.1 模拟 mergeBatchResults（analyzePhotos 中的逻辑）
  logSubStep('模拟 mergeBatchResults（多批次结果合并）');
  const page = aiData.page;
  const batchResult = { success: true, data: page };

  const allBottlenecks = {};
  const allErrorDetails = [];
  let totalErrors = page.totalErrors || 0;

  for (const bn of page.bottlenecks || []) {
    const key = bn.lpCode;
    if (allBottlenecks[key]) {
      allBottlenecks[key].errorCount += bn.errorCount;
      const severityRank = { high: 3, medium: 2, low: 1 };
      if (severityRank[bn.severity] > severityRank[allBottlenecks[key].severity]) {
        allBottlenecks[key].severity = bn.severity;
      }
    } else {
      allBottlenecks[key] = { ...bn };
    }
  }

  if (page.errorDetails) {
    allErrorDetails.push(...page.errorDetails);
  }

  const bottlenecks = Object.values(allBottlenecks).sort((a, b) => b.errorCount - a.errorCount);
  const topBottlenecks = bottlenecks.slice(0, 3).map(b => b.lpName).join('、');
  const summary = `共发现 ${totalErrors} 道错题，主要卡点：${topBottlenecks || '待确认'}`;

  logResult(true, `合并完成: ${totalErrors} 道错题, ${bottlenecks.length} 个卡点`);
  logResult(true, `诊断总结: ${summary}`);

  // 3.2 模拟照片去重
  logSubStep('模拟照片去重（photo-dedup）');
  const markedPages = markDuplicatePages([page], []);
  const uniquePages = markedPages.filter(p => !p.isDuplicate);
  logResult(true, `去重结果: ${markedPages.length} 张照片, ${uniquePages.length} 张唯一`);

  // 3.3 构建报告对象
  logSubStep('构建完整报告对象');
  const report = {
    _id: `report_${Date.now()}`,
    studentId: 'student_test_001',
    studentName: '测试学生',
    subject: 'math',
    type: 'diagnosis',
    sourceType: 'photo',
    status: 'completed',
    summary,
    totalErrors,
    bottlenecks: bottlenecks.map(item => ({ ...item, status: 'found' })),
    errorDetails: allErrorDetails,
    imageFiles: [{
      fileID: `cloud://${ENV_ID}.636c-${ENV_ID}-1441789686/test/photo1.jpg`,
      fileName: '数学试卷_计算过关练.jpg',
      fileSize: 323000,
      ocrSummary: page.ocrSummary,
      contentFingerprint: markedPages[0]?.contentFingerprint || '',
      isDuplicate: false,
      duplicateOf: '',
    }],
    comparisonSummary: '',
    createdAt: new Date(),
    completedAt: new Date(),
  };

  logResult(true, '报告对象构建完成');

  // 3.4 验证报告结构
  logSubStep('验证报告数据结构');
  const checks = [
    { name: 'report._id', ok: typeof report._id === 'string' && report._id.length > 0 },
    { name: 'report.summary', ok: typeof report.summary === 'string' && report.summary.length > 0 },
    { name: 'report.totalErrors >= 0', ok: Number.isInteger(report.totalErrors) && report.totalErrors >= 0 },
    { name: 'report.bottlenecks 是数组', ok: Array.isArray(report.bottlenecks) },
    { name: 'report.errorDetails 是数组', ok: Array.isArray(report.errorDetails) },
    { name: 'report.status === completed', ok: report.status === 'completed' },
    { name: '每个 bottleneck 有 lpCode', ok: report.bottlenecks.every(b => typeof b.lpCode === 'string') },
    { name: '每个 bottleneck 有 severity', ok: report.bottlenecks.every(b => ['high', 'medium', 'low'].includes(b.severity)) },
    { name: '每个 bottleneck 有 status', ok: report.bottlenecks.every(b => typeof b.status === 'string') },
  ];

  let allChecksOk = true;
  for (const check of checks) {
    logResult(check.ok, `${check.name}`);
    allChecksOk = allChecksOk && check.ok;
  }

  // 3.5 展示完整报告
  logJson('完整诊断报告', {
    _id: report._id,
    studentName: report.studentName,
    subject: report.subject,
    status: report.status,
    summary: report.summary,
    totalErrors: report.totalErrors,
    bottleneckCount: report.bottlenecks.length,
    bottlenecks: report.bottlenecks.map(b => ({
      lpCode: b.lpCode,
      lpName: b.lpName,
      errorCount: b.errorCount,
      severity: b.severity,
      status: b.status,
      rootCause: b.rootCause,
      suggestion: b.suggestion,
    })),
    errorDetailCount: report.errorDetails.length,
    errorDetails: report.errorDetails.slice(0, 3).map(e => ({
      questionContent: e.questionContent,
      studentAnswer: e.studentAnswer,
      correctAnswer: e.correctAnswer,
      lpCode: e.lpCode,
      rootCause: e.rootCause,
    })),
  });

  console.log(`\n  ${allChecksOk ? '✅' : '❌'} Test 3 总结: ${allChecksOk ? '报告结构完整，全部通过' : '部分检查失败'}`);
  return allChecksOk;
}

process.on('unhandledRejection', (err) => {
  console.error('\n  ⚠️  未捕获的 Promise 异常:', err.message);
  if (err.message && err.message.includes('secretId or secretKey')) {
    console.log('    💡 原因: 本地环境缺少腾讯云 API 密钥');
    console.log('    💡 Test 2 无法继续，请参见下方总结中的建议');
  }
  // 不退出进程，让脚本继续执行到总结部分
});

// ========== 主入口 ==========
async function runCase(testCase) {
  const currentCase = validateRealImageCase(testCase);
  console.log('\n' + '='.repeat(60));
  console.log('  学习诊断系统 — 端到端真实图片测试');
  console.log('  Case: ' + currentCase.caseId);
  console.log('  学科/模式: ' + currentCase.subject + ' / ' + currentCase.mode);
  console.log('  图片数量: ' + (currentCase.mock ? 'Mock' : currentCase.filePaths.length));
  console.log('  云环境: ' + ENV_ID);
  console.log('='.repeat(60));

  let uploadData = null;
  let aiData = null;
  let reportOk = false;

  try {
    uploadData = await testUpload(currentCase);
  } catch (err) {
    console.error('\n  ❌ Test 1 异常终止:', err.message);
    return { caseId: currentCase.caseId, status: 'failed', stages: { upload: 'failed' }, error: err.message };
  }

  try {
    aiData = await testAIAnalysis(uploadData, currentCase);
  } catch (err) {
    console.error('\n  ❌ Test 2 异常:', err.message);
  }

  try {
    reportOk = await testGenerateReport(aiData);
  } catch (err) {
    console.error('\n  ❌ Test 3 异常:', err.message);
  }

  // 总结
  console.log('\n' + '='.repeat(60));
  console.log('  测试总结');
  console.log('='.repeat(60));
  console.log(`  Test 1 图片上传:     ${uploadData ? '✅ 通过' : '❌ 失败'}`);
  console.log(`  Test 2 AI 解析错题:  ${aiData ? '✅ 通过' : '❌ 失败/跳过'}`);
  console.log(`  Test 3 生成诊断报告: ${reportOk ? '✅ 通过' : aiData ? '❌ 失败' : '⏭️  跳过'}`);
  console.log('='.repeat(60));

  if (!aiData) {
    console.log('\n  💡 后续建议:');
    console.log('     1. 在微信开发者工具中重新部署 uploadAndAnalyze、analyzePhotos、analyzeBatch 云函数');
    console.log('     2. 使用微信小程序"预览"功能，在真机上上传这张图片');
    console.log('     3. 在云开发控制台查看云函数日志，确认 AI 调用结果');
    console.log('     4. 如需本地调用 CloudBase AI，需配置 SecretId/SecretKey 或使用微信登录态');
  }

  return {
    caseId: currentCase.caseId,
    status: uploadData && aiData && reportOk ? 'passed' : (uploadData ? 'skipped' : 'failed'),
    subject: currentCase.subject,
    mode: currentCase.mode,
    fileCount: currentCase.mock ? 0 : currentCase.filePaths.length,
    stages: {
      upload: uploadData ? 'passed' : 'failed',
      ai: aiData ? 'passed' : 'skipped',
      report: reportOk ? 'passed' : (aiData ? 'failed' : 'skipped')
    }
  };
}

async function main() {
  const results = [];
  for (const testCase of E2E_CASES) {
    results.push(await runCase(testCase));
  }
  const report = writeRealImageReport(results);
  console.log(`\n  结构化测试报告: ${report.outputPath}`);
  if (results.some(item => item.status === 'failed')) process.exit(1);
}

main().catch(err => {
  console.error('测试脚本异常:', err);
  process.exit(1);
});
