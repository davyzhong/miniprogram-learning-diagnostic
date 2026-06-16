function cleanText(value, maxLength = 120) {
  return String(value || '')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[<>`]/g, '')
    .trim()
    .slice(0, maxLength);
}

function unique(values = []) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function normalizeReviewItem(item = {}) {
  const targetText = cleanText(item.targetText || item.expectedAnswer, 120);
  const expectedAnswer = cleanText(item.expectedAnswer || item.targetText, 160);
  if (!targetText && !expectedAnswer) return null;
  return {
    itemId: cleanText(item.itemId || item.id, 100),
    itemType: cleanText(item.itemType || item.type || 'word', 40),
    targetText,
    expectedAnswer,
    lastWrongAnswer: cleanText(item.lastWrongAnswer || item.studentAnswer || item.wrongAnswer, 160),
    sourceContext: cleanText(item.sourceContext || item.context, 300),
    mistakeType: cleanText(item.mistakeType, 80),
    relatedLpCode: cleanText(item.relatedLpCode || item.lpCode || 'LP-101', 30),
    verificationMethods: unique(item.verificationMethods || []).slice(0, 5).map(value => cleanText(value, 60)),
  };
}

function reviewItemActive(item = {}) {
  return !['mastered', 'archived', 'ignored'].includes(item.status);
}

function selectChineseReviewTargets(profile = {}, targetCodes = [], limit = 10) {
  if (profile.subject && profile.subject !== 'chinese') return [];
  const targetSet = new Set(targetCodes || []);
  return (profile.chineseReviewItems || [])
    .filter(reviewItemActive)
    .map(normalizeReviewItem)
    .filter(Boolean)
    .filter(item => targetSet.size === 0
      || targetSet.has(item.itemId)
      || targetSet.has(item.relatedLpCode))
    .slice(0, Math.max(0, Number(limit) || 0));
}

function buildChineseReviewPromptBlock(targets = []) {
  if (!Array.isArray(targets) || targets.length === 0) return '';
  const lines = targets.map((item, index) => {
    const methods = item.verificationMethods && item.verificationMethods.length > 0
      ? item.verificationMethods.join('、')
      : '听写、看拼音写词语、语境填空';
    return `${index + 1}. itemId=${item.itemId || ''}；类型=${item.itemType}；targetText=${item.targetText}；正确答案=${item.expectedAnswer}；上次错答=${item.lastWrongAnswer || '未记录'}；原题语境=${item.sourceContext || '未记录'}；错误类型=${item.mistakeType || '待判断'}；建议复测=${methods}`;
  }).join('\n');

  return `\n## 语文错项复测目标\n下面是孩子真实错过的语文错项。生成语文验证卷时，必须优先围绕这些具体错项出题，而不是只围绕粗卡点泛泛出题。\n${lines}\n- 每个 targetText 至少直接考察一次。\n- 如果是字词，优先使用听写、看拼音写词语、语境填空。\n- 如果是古诗文，优先使用补写原句、上下句衔接、错字辨析。\n- 如果是成语或日积月累，优先使用补全、含义辨析、语境选择。\n- 题目的 lpCode 仍填写 relatedLpCode，便于兼容现有卡点系统；可以额外返回 reviewItemId、targetText、verificationMethod。`;
}

module.exports = {
  selectChineseReviewTargets,
  buildChineseReviewPromptBlock,
};
