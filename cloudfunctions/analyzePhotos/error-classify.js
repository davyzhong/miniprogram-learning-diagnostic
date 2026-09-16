// 错误分类与消息辅助（从 index.js 抽出，维持 800 行可维护性预算）。
function analysisErrorMessage(err) {
  const message = err && err.message ? err.message : String(err || '');
  return (message || '图片分析失败，请稍后重试').slice(0, 240);
}

// 可重试错误：超时、网络抖动、AI 结果解析失败 —— 这些重试有意义
function isRetryableError(err) {
  const msg = String((err && err.message) || err || '');
  if (/ESOCKETTIMEDOUT|ETIMEDOUT|ECONNRESET|ECONNREFUSED|socket hang up|EAI_AGAIN|网络超时/i.test(msg)) return true;
  if (/timeout|timed out|超时/i.test(msg)) return true;
  if (/parseResult|parse.*fail|JSON.*parse|未返回.*结果|解析失败/i.test(msg)) return true;
  if (/图片分析失败，请稍后重试/i.test(msg)) return true; // 兼容旧版 analyzeBatch 的笼统错误
  return false;
}

// 不可重试错误：验证卷不存在、归属不一致、权限问题 —— 重试也不会变好
function isNonRetryableError(err) {
  const msg = String((err && err.message) || err || '');
  if (/验证试卷|验证卷|归属不一致|没有.*卡点|试卷.*不存在|试卷.*删除/i.test(msg)) return true;
  if (/无权|未授权|权限/i.test(msg)) return true;
  return false;
}

// 判断错误是否对用户有意义（这类错误应直接展示给用户，而非笼统吞掉）
function isUserFacingAnalysisError(err) {
  const msg = String(err && err.message || '');
  // 验证试卷相关错误（getVerificationPaper 抛出的）—— 这些消息对用户有指导意义
  if (/验证试卷|验证卷|归属不一致|没有.*卡点|试卷.*不存在|试卷.*删除/i.test(msg)) return true;
  // 权限相关
  if (/无权|未授权|权限/i.test(msg)) return true;
  // 超时/网络类错误（用户应该知道是网络问题而非操作错误）
  if (/ESOCKETTIMEDOUT|ETIMEDOUT|网络超时|AI 分析超时|超时/i.test(msg)) return true;
  return false;
}

module.exports = { analysisErrorMessage, isRetryableError, isNonRetryableError, isUserFacingAnalysisError };
