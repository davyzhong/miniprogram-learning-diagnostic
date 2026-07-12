// tests/analyze-batch-normalizer.test.js
// 验证 candidateBottlenecks 的 canonicalize 归并去重逻辑：
// AI 返回的同义变体 ID 应被归并到标准 taxonomy ID，消除卡点碎片化。
const { test } = require('node:test');
const assert = require('node:assert');
const {
  normalizeCandidateBottlenecks,
  canonicalizeBottleneckId,
  normalizeBnTitle,
} = require('../cloudfunctions/analyzeBatch/result-normalizer');

test('canonicalizeBottleneckId：标准 ID 直接返回，标记非新卡点', () => {
  const result = canonicalizeBottleneckId('BN-FRACTION-ADD-DENOM-MISMATCH', '异分母分数加减通分不稳定');
  assert.equal(result.canonicalId, 'BN-FRACTION-ADD-DENOM-MISMATCH');
  assert.equal(result.isNew, false);
});

test('canonicalizeBottleneckId：变体 ID 映射到标准 ID', () => {
  const variants = [
    'BN-FRACTION-ADD-COMMON',
    'BN-FRACTION-ADD-UNLIKE',
    'BN-FRACTION-ADD-NO-COMMON',
    'BN-FRACTION-ADD-SUB-COMMON',
    'BN-FRACTION-ADD-LCM',
    'BN-FRACTION-SUB-COMMON-ERROR',
  ];
  for (const v of variants) {
    const result = canonicalizeBottleneckId(v, '异分母分数加减通分');
    assert.equal(result.canonicalId, 'BN-FRACTION-ADD-DENOM-MISMATCH',
      `变体 ${v} 应映射到 BN-FRACTION-ADD-DENOM-MISMATCH`);
    assert.equal(result.isNew, false);
  }
});

test('canonicalizeBottleneckId：未知 ID 保留并标记为新卡点', () => {
  const result = canonicalizeBottleneckId('BN-TOTALLY-NEW-CONCEPT', '量子计算中的分数坍缩');
  assert.equal(result.canonicalId, 'BN-TOTALLY-NEW-CONCEPT');
  assert.equal(result.isNew, true);
});

test('canonicalizeBottleneckId：title 关键词匹配 taxonomy', () => {
  // AI 自创 ID 但 title 接近 taxonomy 的标准 title
  const result = canonicalizeBottleneckId('BN-CUSTOM-FRACTION-DIV', '除以分数未稳定转换为乘倒数');
  assert.equal(result.canonicalId, 'BN-FRACTION-DIV-RECIPROCAL-MISSING');
  assert.equal(result.isNew, false);
});

test('normalizeCandidateBottlenecks：7 个异分母通分变体归并为 1 个', () => {
  const items = [
    { bottleneckId: 'BN-FRACTION-ADD-COMMON', title: '异分母分数加法通分规则错误', evidenceStrength: 'high' },
    { bottleneckId: 'BN-FRACTION-ADD-UNLIKE', title: '异分母分数加减法通分规则不熟练', evidenceStrength: 'medium' },
    { bottleneckId: 'BN-FRACTION-ADD-NO-COMMON', title: '异分母分数加法未通分直接相加', evidenceStrength: 'high' },
    { bottleneckId: 'BN-FRACTION-ADD-SUB-COMMON', title: '异分母分数加减法通分不熟练', evidenceStrength: 'medium' },
    { bottleneckId: 'BN-FRACTION-ADD-LCM', title: '异分母分数加减法通分找最小公倍数', evidenceStrength: 'medium' },
    { bottleneckId: 'BN-FRACTION-ADD-UNLIKE-LCM', title: '异分母分数加减法找最小公倍数', evidenceStrength: 'medium' },
    { bottleneckId: 'BN-FRACTION-SUB-COMMON-ERROR', title: '异分母分数减法通分计算错误', evidenceStrength: 'medium' },
  ];
  const result = normalizeCandidateBottlenecks(items);
  assert.equal(result.length, 1, '7 个变体应归并为 1 个标准 BN');
  assert.equal(result[0].bottleneckId, 'BN-FRACTION-ADD-DENOM-MISMATCH');
  assert.equal(result[0].evidenceStrength, 'high', '归并后 evidenceStrength 取最强值');
});

test('normalizeCandidateBottlenecks：面积单位换算变体归并', () => {
  const items = [
    { bottleneckId: 'BN-AREA-UNIT-CONVERT', title: '面积单位换算进率混淆', evidenceStrength: 'high' },
    { bottleneckId: 'BN-AREA-CONVERT-RATE', title: '面积单位换算错误', evidenceStrength: 'medium' },
    { bottleneckId: 'BN-UNIT-AREA-CONVERT', title: '面积单位换算不稳', evidenceStrength: 'low' },
  ];
  const result = normalizeCandidateBottlenecks(items);
  assert.equal(result.length, 1, '3 个面积变体应归并为 1 个');
  assert.equal(result[0].bottleneckId, 'BN-UNIT-AREA-VOLUME-DIMENSION');
  assert.equal(result[0].evidenceStrength, 'high');
});

test('normalizeCandidateBottlenecks：不同知识点不误合并', () => {
  const items = [
    { bottleneckId: 'BN-INT-MUL-PARTIAL-OMIT', title: '多位数乘法拆分时遗漏部分积', evidenceStrength: 'high' },
    { bottleneckId: 'BN-FRACTION-ADD-DENOM-MISMATCH', title: '异分母分数加减通分不稳定', evidenceStrength: 'medium' },
    { bottleneckId: 'BN-UNIT-AREA-VOLUME-DIMENSION', title: '面积单位与体积单位量纲敏感度不足', evidenceStrength: 'low' },
  ];
  const result = normalizeCandidateBottlenecks(items);
  assert.equal(result.length, 3, '三个不同知识点不应合并');
  assert.ok(result.some(r => r.bottleneckId === 'BN-INT-MUL-PARTIAL-OMIT'));
  assert.ok(result.some(r => r.bottleneckId === 'BN-FRACTION-ADD-DENOM-MISMATCH'));
  assert.ok(result.some(r => r.bottleneckId === 'BN-UNIT-AREA-VOLUME-DIMENSION'));
});

test('normalizeCandidateBottlenecks：保留新卡点并标记 isNew', () => {
  const items = [
    { bottleneckId: 'BN-INT-MUL-PARTIAL-OMIT', title: '多位数乘法遗漏部分积', evidenceStrength: 'high' },
    { bottleneckId: 'BN-NEW-SHAPE-ROTATION', title: '图形旋转角度判断困难', evidenceStrength: 'medium' },
  ];
  const result = normalizeCandidateBottlenecks(items);
  assert.equal(result.length, 2);
  const newBn = result.find(r => r.bottleneckId === 'BN-NEW-SHAPE-ROTATION');
  assert.ok(newBn, '新卡点应保留');
  assert.equal(newBn.isNew, true, '新卡点应标记 isNew:true');
  const stdBn = result.find(r => r.bottleneckId === 'BN-INT-MUL-PARTIAL-OMIT');
  assert.equal(stdBn.isNew, false, '标准卡点不应标记 isNew');
});

test('normalizeCandidateBottlenecks：归并后 suggestedMicroValidation 取并集', () => {
  const items = [
    { bottleneckId: 'BN-FRACTION-ADD-COMMON', title: '异分母加法通分', evidenceStrength: 'medium', suggestedMicroValidation: ['1/4+1/8', '1/3+1/6'] },
    { bottleneckId: 'BN-FRACTION-ADD-UNLIKE', title: '异分母加减通分', evidenceStrength: 'high', suggestedMicroValidation: ['2/3+1/4', '1/4+1/8'] },
  ];
  const result = normalizeCandidateBottlenecks(items);
  assert.equal(result.length, 1);
  assert.equal(result[0].bottleneckId, 'BN-FRACTION-ADD-DENOM-MISMATCH');
  // 并集去重：1/4+1/8, 1/3+1/6, 2/3+1/4 = 3 个
  assert.equal(result[0].suggestedMicroValidation.length, 3);
  assert.equal(result[0].evidenceStrength, 'high');
});

test('normalizeCandidateBottlenecks：字符串形式 candidate 也应 canonicalize', () => {
  const items = ['BN-FRACTION-ADD-COMMON', 'BN-FRACTION-ADD-UNLIKE'];
  const result = normalizeCandidateBottlenecks(items);
  assert.equal(result.length, 1);
  assert.equal(result[0].bottleneckId, 'BN-FRACTION-ADD-DENOM-MISMATCH');
});

test('normalizeBnTitle：去掉后缀变体', () => {
  assert.equal(normalizeBnTitle('异分母分数加减通分规则不熟练'), '异分母分数加减通分');
  assert.equal(normalizeBnTitle('面积单位换算错误'), '面积单位换算');
  assert.equal(normalizeBnTitle('圆周长面积公式混淆'), '圆周长面积公式');
  assert.equal(normalizeBnTitle(''), '');
});

test('normalizeCandidateBottlenecks：超过 5 个不同 BN 截断为 5', () => {
  const items = [
    { bottleneckId: 'BN-INT-MUL-PARTIAL-OMIT', title: '多位数乘法遗漏部分积', evidenceStrength: 'high' },
    { bottleneckId: 'BN-INT-DIV-DIVISOR-SIMPLIFY', title: '长除法除数简化', evidenceStrength: 'medium' },
    { bottleneckId: 'BN-DEC-PLACE-VALUE-WEAK', title: '小数位值意识', evidenceStrength: 'medium' },
    { bottleneckId: 'BN-DEC-MUL-POINT-COUNT', title: '小数乘法位数', evidenceStrength: 'high' },
    { bottleneckId: 'BN-FRACTION-ADD-DENOM-MISMATCH', title: '异分母通分', evidenceStrength: 'medium' },
    { bottleneckId: 'BN-FRACTION-MUL-SIMPLIFY-DIRECTION', title: '分数乘法约分方向', evidenceStrength: 'low' },
  ];
  const result = normalizeCandidateBottlenecks(items);
  assert.equal(result.length, 5, '超过 5 个应截断为 5');
});

test('prompt 包含 taxonomy BN 清单（integration check）', () => {
  // 验证 buildPrompt 生成的 prompt 包含标准 BN 清单
  const { TAXONOMY_BN_LIST } = require('../cloudfunctions/analyzeBatch/taxonomy-bn-list');
  // 取前 3 个标准 BN ID，验证它们都能在 taxonomy-bn-list 中找到
  assert.ok(TAXONOMY_BN_LIST.length >= 28, 'taxonomy 应至少有 28 个标准 BN');
  assert.ok(TAXONOMY_BN_LIST.some(bn => bn.id === 'BN-FRACTION-ADD-DENOM-MISMATCH'));
  assert.ok(TAXONOMY_BN_LIST.some(bn => bn.id === 'BN-INT-MUL-PARTIAL-OMIT'));
  assert.ok(TAXONOMY_BN_LIST.some(bn => bn.id === 'BN-UNIT-AREA-VOLUME-DIMENSION'));
});

test('cleanAnswer 去掉 AI 塞入 correctAnswer 的括号注释', () => {
  const { normalizeErrorDetails } = require('../cloudfunctions/analyzeBatch/result-normalizer');
  const items = normalizeErrorDetails([{
    imageIndex: 1,
    questionContent: '0.4 × 0.3 = ?',
    studentAnswer: '0.12',
    correctAnswer: '0.12 (注：学生写的是0.12但被判定错，实际应为0.12，此处可能是学生书写不清或老师误判)',
    lpCode: 'LP-001',
  }]);
  assert.equal(items[0].correctAnswer, '0.12');
  assert.equal(items[0].studentAnswer, '0.12');
});

test('cleanAnswer 去掉分号后的说明', () => {
  const { normalizeErrorDetails } = require('../cloudfunctions/analyzeBatch/result-normalizer');
  const items = normalizeErrorDetails([{
    imageIndex: 2,
    questionContent: '面积',
    studentAnswer: '14/15 (过程显示直接相除未转乘倒数)',
    correctAnswer: '14/15',
    lpCode: 'LP-002',
  }]);
  assert.equal(items[0].studentAnswer, '14/15');
  assert.equal(items[0].correctAnswer, '14/15');
});

test('cleanAnswer 处理 "A 或 B" 多答案格式', () => {
  const { normalizeErrorDetails } = require('../cloudfunctions/analyzeBatch/result-normalizer');
  const items = normalizeErrorDetails([{
    imageIndex: 1,
    questionContent: '0.6×0.05',
    studentAnswer: '0.03',
    correctAnswer: '0.030 或 0.03',
    lpCode: 'LP-003',
  }]);
  assert.equal(items[0].correctAnswer, '0.030');
  assert.equal(items[0].studentAnswer, '0.03');
});

test('cleanAnswer 去掉 /。 后的推理说明', () => {
  const { normalizeErrorDetails } = require('../cloudfunctions/analyzeBatch/result-normalizer');
  const items = normalizeErrorDetails([{
    imageIndex: 2,
    questionContent: '2/5+1/3',
    studentAnswer: '11/15 /。这是典型的分子加分子分母加分母错误。)',
    correctAnswer: '11/15',
    lpCode: 'LP-002',
  }]);
  assert.equal(items[0].studentAnswer, '11/15');
  assert.equal(items[0].correctAnswer, '11/15');
});
