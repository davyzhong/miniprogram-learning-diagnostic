// analyzePhotos/index.js
// 主控函数：拆分单图批次、严格串行续跑 analyzeBatch、合并结果、更新数据库、推送通知
const cloud = require('wx-server-sdk');
const { compareBottlenecks, buildComparisonSummary } = require('./comparison');
const { markDuplicatePages } = require('./photo-dedup');
const { buildProfileSummary } = require('./profile-summary');
const { buildReportQuality } = require('./report-quality');
const { aggregateVerificationEvidence, aggregateChineseReviewEvidence, buildVerificationPlan } = require('./verification-evidence');
const {
  splitFileBatches,
  assertUsableBatchResults,
  batchFailureSummary,
  collectPageResults,
  mergeBatchResults,
  buildImageFiles,
} = require('./pipeline');
const { triggerAutoVerificationPaper } = require('./auto-verification');

cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const SUBJECTS = new Set(['math', 'chinese', 'english']);
const STALE_TASK_MS = 10 * 60 * 1000;
// 批量大小：analyzeBatch 支持单批最多 5 张图片（多模态 AI），每批 5 张可将
// 串行调用次数从 N 降到 N/5。3 批/调用让续跑机制每轮做更多有效工作。
// qwen3.5-plus 单张图处理 ~15s，5 张/批会超过 60 秒云函数超时。
// 所有模式统一用 1 张/批，靠续跑机制完成剩余批次。
const ANALYSIS_BATCH_SIZE = 1;
const MAX_CONCURRENT_BATCHES = 1;
const MAX_BATCHES_PER_INVOCATION = 3;
// 增加重试次数：超时是最常见失败原因，3 次尝试（含指数退避）覆盖大部分瞬时抖动
const MAX_BATCH_ATTEMPTS = 3;
// 指数退避：600ms → 3000ms → 8000ms（第 1 次重试等 600ms，第 2 次等 3s，第 3 次等 8s）
const BATCH_RETRY_DELAYS_MS = [600, 3000, 8000];
// analyzeBatch 调用超时：留 5s 缓冲到 60s 函数超时，避免云函数自身被杀
const ANALYZE_BATCH_TIMEOUT_MS = 55000;
const REANALYSIS_TOKEN = process.env.MATH_REANALYSIS_TOKEN || '';

// 验证模式假阳性过滤器：把学生答案和标准答案归一化为可比字符串。
// 0.12 → "0.12"，1/2 → "0.5"，8.50 → "8.5"，去掉等号/单位等噪音。
function normalizeForCompare(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let s = raw.trim();
  // 去掉 = 号前缀、单位（cm²/m²/平方米/平方厘米等）、空格
  s = s.replace(/^.*?=\s*/, '')
    .replace(/(平方)?(厘米|米|分米|千米|毫米|厘米|公顷|亩|立方米|立方分米|立方厘米|m²|m³|cm²|cm|m|dm|km|mm|㎡|平方)+$/gi, '')
    .replace(/[a-zA-Z²³]+$/g, '')
    .trim();
  // 尝试分数 → 小数
  const fracMatch = s.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (fracMatch) {
    const num = parseFloat(fracMatch[1]);
    const den = parseFloat(fracMatch[2]);
    if (den !== 0) {
      const dec = num / den;
      // 用 toString 避免浮点尾差：1/3 → "0.3333333333333333"，但 1/2 → "0.5"
      return String(Math.round(dec * 1e10) / 1e10);
    }
  }
  // 纯小数/整数：去掉末尾多余的零
  const numMatch = s.match(/^(-?\d+(?:\.\d+)?)$/);
  if (numMatch) {
    return String(parseFloat(numMatch[1]));
  }
  // 其他：原样返回（带算式的如 "0.8×50=40" 不做归一化，保留给 AI 判断）
  return s;
}

// 题目文本归一化：用于把 AI 返回的 questionContent 与 paper.questions 的 content 匹配。
// 去掉题号前缀（"14." "计算："）、空格、标点，只保留核心文字和数字。
function normalizeForLookup(text) {
  if (!text) return '';
  return String(text)
    .replace(/^[\d]+[.、）)\s]*/, '')   // 去掉题号 "14." "23、"
    .replace(/^(计算|求|问)[：:，,]?\s*/g, '') // 去掉"计算："前缀
    .replace(/\s+/g, '')                  // 去掉所有空格
    .replace(/[？?！!。，,.；;：:（）()]/g, '') // 去掉标点
    .toLowerCase();
}

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

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function failedBatchDebugMessage(failedBatches = []) {
  const detail = failedBatches
    .slice(0, 3)
    .map(item => `第${item.batchIndex + 1}批${item.error ? `：${item.error}` : ''}`)
    .join('；');
  return detail ? `存在未完成的图片分析批次（${detail}）` : '';
}

function learningMapProfileFields(item = {}) {
  return {
    nodeIds: item.nodeIds || [],
    candidateBottlenecks: item.candidateBottlenecks || [],
    recommendedResourceIds: item.recommendedResourceIds || [],
    resourcePlan: item.resourcePlan || [],
    evidenceStrength: item.evidenceStrength || '',
    nextActionType: item.nextActionType || '',
    nextActionText: item.nextActionText || '',
  };
}

function isTrustedReanalysisRequest(event = {}) {
  return Boolean(REANALYSIS_TOKEN && event.reanalysisToken === REANALYSIS_TOKEN);
}

function reanalysisSourceReportId(report = {}) {
  return report.originalReportId
    || (report.reanalysis && report.reanalysis.sourceReportId)
    || (report.mathReanalysis && report.mathReanalysis.sourceReportId)
    || '';
}

function reanalysisSourceReportIds(report = {}) {
  return Array.from(new Set([
    reanalysisSourceReportId(report),
    ...((report.reanalysis && report.reanalysis.sourceReportIds) || []),
    ...((report.mathReanalysis && report.mathReanalysis.sourceReportIds) || []),
  ].filter(Boolean)));
}

// ========== 更新 subjectProfiles ==========
async function getSubjectProfile(studentId, subject) {
  const profileRes = await db.collection('subjectProfiles')
    .where({ studentId })
    .get();
  return profileRes.data.find(item => item.subject === subject) || null;
}

async function updateSubjectProfile(profile, profileSummary, reportId) {
  if (!profile) {
    console.warn('未找到 subjectProfile');
    return;
  }

  const pendingBottlenecks = profileSummary.currentBottlenecks
    .filter(item => item.status !== 'improved')
    .map(item => ({
      lpCode: item.lpCode,
      lpName: item.lpName,
      severity: item.severity || 'medium',
      sinceDate: item.firstSeenAt || new Date(),
      ...learningMapProfileFields(item),
    }));
  const improvedBottlenecks = profileSummary.currentBottlenecks
    .filter(item => item.status === 'improved')
    .map(item => ({
      lpCode: item.lpCode,
      lpName: item.lpName,
      improvedDate: item.lastSeenAt || new Date(),
      ...learningMapProfileFields(item),
    }));

  await db.collection('subjectProfiles').doc(profile._id).update({
    data: {
      currentSummary: profileSummary.currentSummary,
      currentBottlenecks: profileSummary.currentBottlenecks,
      chineseReviewItems: profileSummary.chineseReviewItems || profile.chineseReviewItems || [],
      nextAction: profileSummary.nextAction,
      latestEffectiveReportId: reportId,
      diagnosisUpdatedAt: new Date(),
      pendingBottlenecks,
      improvedBottlenecks,
      totalReports: _.inc(1),
      analysisStatus: null,
      currentAnalysisId: '',
      updatedAt: new Date(),
    },
  });
}

async function clearSubjectProfileAnalysis(studentId, subject) {
  if (!studentId || !subject) return;
  const profileRes = await db.collection('subjectProfiles')
    .where({ studentId })
    .get();
  const profile = profileRes.data.find(item => item.subject === subject);
  if (!profile) return;

  await db.collection('subjectProfiles').doc(profile._id).update({
    data: {
      analysisStatus: null,
      currentAnalysisId: '',
      updatedAt: new Date(),
    },
  });
}

async function getPreviousReport(studentId, subject, options = {}) {
  const excludeReportIds = new Set((options.excludeReportIds || []).filter(Boolean));
  const res = await db.collection('reports')
    .where({
      studentId,
      subject,
      status: 'completed',
    })
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();

  return res.data
    .filter(item => !excludeReportIds.has(item._id))
    .filter(item => !item.isArchived && !item.archivedAt)
    .find(item => Array.isArray(item.bottlenecks) && item.bottlenecks.length > 0) || null;
}

async function getHistoricalPhotos(studentId, subject, options = {}) {
  const excludeReportIds = new Set((options.excludeReportIds || []).filter(Boolean));
  const res = await db.collection('reports')
    .where({
      studentId,
      subject,
      status: 'completed',
    })
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();

  return res.data
    .filter(item => !excludeReportIds.has(item._id))
    .filter(item => !item.isArchived && !item.archivedAt)
    .flatMap(item => Array.isArray(item.imageFiles) ? item.imageFiles : []);
}

/**
 * 一次性查询历史报告，同时派生 previousReport 和 historicalPhotos。
 * 替代分别调用 getHistoricalPhotos + getPreviousReport 的重复查询（P1-9）。
 */
async function getHistoricalContext(studentId, subject, options = {}) {
  const excludeReportIds = new Set((options.excludeReportIds || []).filter(Boolean));
  const res = await db.collection('reports')
    .where({
      studentId,
      subject,
      status: 'completed',
    })
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();

  const validReports = res.data
    .filter(item => !excludeReportIds.has(item._id))
    .filter(item => !item.isArchived && !item.archivedAt);

  return {
    historicalPhotos: validReports.flatMap(item => Array.isArray(item.imageFiles) ? item.imageFiles : []),
    previousReport: validReports.find(item => Array.isArray(item.bottlenecks) && item.bottlenecks.length > 0) || null,
  };
}

async function getVerificationPaper(report) {
  if (!report.paperId) {
    throw new Error('验证报告没有关联验证试卷，请重新从最新的验证卷上传答题');
  }
  let paperRes
  try {
    paperRes = await db.collection('papers').doc(report.paperId).get();
  } catch (e) {
    throw new Error(`关联的验证试卷（${report.paperId}）无法读取：${e.message || '试卷可能已被删除'}`);
  }
  const paper = paperRes.data;
  if (!paper) {
    throw new Error(`关联的验证试卷（${report.paperId}）不存在，可能已被更新替换，请使用最新的验证卷重新上传答题`);
  }
  if (paper.studentId !== report.studentId) {
    throw new Error('关联验证试卷与学生归属不一致，请重新生成验证卷');
  }
  if (paper._openid && report._openid && paper._openid !== report._openid) {
    throw new Error('关联验证试卷归属不一致，请使用自己档案下的验证卷');
  }
  const targets = Array.isArray(paper.bottleneckTargets) ? paper.bottleneckTargets : [];
  if (paper.type !== 'verification') {
    throw new Error('关联的试卷类型不是验证试卷，请使用验证卷上传答题');
  }
  if (targets.length === 0) {
    throw new Error('关联验证试卷没有学习卡点，请重新生成验证卷');
  }
  return { paper, targets, plan: buildVerificationPlan(paper) };
}

// ========== 推送订阅消息（预留，暂未实现 sendSubscribeMessage 云函数） ==========
async function sendNotification(studentId, reportId, subject) {
  // TODO: 订阅消息推送需要用户在小程序前端授权后才能发送。
  // 目前 sendSubscribeMessage 云函数尚未创建，此处仅记录日志，不发起调用。
  return { studentId, reportId, subject };
}

async function getAnalysisTask(taskId) {
  if (!taskId) return null;
  const taskRes = await db.collection('analysisTasks').doc(taskId).get();
  return taskRes.data || null;
}

function taskMatchesReportOwner(task, report, reportId) {
  return Boolean(task
    && report
    && task.reportId === reportId
    && task.status === 'processing'
    && (!report._openid || task._openid === report._openid));
}

async function loadReportContext(reportId, continuationTaskId = '', options = {}) {
  const reportRes = await db.collection('reports').doc(reportId).get();
  const report = reportRes.data;
  const currentOpenId = cloud.getWXContext().OPENID;
  const trustedReanalysis = Boolean(options.trustedReanalysis);

  if (!report) {
    return { earlyResult: { success: false, error: '报告不存在' } };
  }
  if (trustedReanalysis) {
    // Authorized maintenance reanalysis is triggered by an admin script with MATH_REANALYSIS_TOKEN.
  } else if (report._openid && currentOpenId) {
    if (report._openid !== currentOpenId) {
      return { earlyResult: { success: false, error: '无权访问该报告' } };
    }
  } else if (continuationTaskId) {
    const task = await getAnalysisTask(continuationTaskId);
    if (!taskMatchesReportOwner(task, report, reportId)) {
      return { earlyResult: { success: false, error: '无权访问该报告' } };
    }
  } else if (report._openid && !currentOpenId) {
    return { earlyResult: { success: false, error: '无权访问该报告' } };
  } else {
    // 兜底：report 无 _openid（旧数据/异常数据）且当前调用无用户上下文（内部 callFunction），
    // 又非 trusted reanalysis、无 continuationTaskId —— 权限链完全断裂，必须拒绝。
    return { earlyResult: { success: false, error: '无法验证报告归属，拒绝分析' } };
  }

  const subject = SUBJECTS.has(report.subject) ? report.subject : 'math';
  const studentId = report.studentId;
  const mode = report.type === 'verification' ? 'verification' : 'diagnosis';
  const fileIDs = report.imageFileIds || [];

  return { report, currentOpenId, subject, studentId, mode, fileIDs };
}

async function finishAlreadyCompletedReport(reportId, report, subject) {
  if (report.status !== 'completed') return null;

  if (report.isEffective && !report.profileAppliedAt) {
    const profile = await getSubjectProfile(report.studentId, subject);
    if (profile && profile.latestEffectiveReportId !== reportId) {
      const profileSummary = buildProfileSummary(profile, report, report.completedAt || new Date());
      await updateSubjectProfile(profile, profileSummary, reportId);
    }
    await db.collection('reports').doc(reportId).update({
      data: { profileAppliedAt: new Date() },
    });
  }
  return { success: true, reportId, message: '报告已经分析完成' };
}

async function recoverStaleAnalysisTask(reportId) {
  const existingTasksRes = await db.collection('analysisTasks')
    .where({ reportId })
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();
  const existingTasks = existingTasksRes.data || [];
  const processingTask = existingTasks.find(task => task.status === 'processing');

  if (!processingTask) return null;

  const age = Date.now() - new Date(processingTask.updatedAt || processingTask.createdAt).getTime();
  if (age < STALE_TASK_MS) {
    return { success: true, reportId, message: '分析任务已经启动' };
  }

  // Stale task：续跑机制断了，但已有进度（completedBatches/batchResults）仍有价值。
  // 返回 staleTaskId 让调用方通过 loadAnalysisTask 恢复进度，而不是丢弃重建。
  console.log(`[recoverStale] 检测到 stale task ${processingTask._id}，已完成 ${processingTask.completedBatches || 0}/${processingTask.totalBatches || '?'} 批，将恢复进度`);
  return { staleTaskId: processingTask._id };
}

async function createAnalysisTask({ reportId, totalBatches, fileIDs, mode, subject, studentId, openid }) {
  await db.collection('reports').doc(reportId).update({
    data: {
      status: 'analyzing',
      error: '',
      debugError: '',
      partialSuccess: false,
      analysisWarning: '',
      failedBatchCount: 0,
      failedImageFiles: [],
      updatedAt: new Date(),
    },
  });

  const taskRes = await db.collection('analysisTasks').add({
    data: {
      reportId,
      totalBatches,
      completedBatches: 0,
      status: 'processing',
      fileIDs,
      mode,
      subject,
      studentId,
      _openid: openid,
      nextBatchIndex: 0,
      batchResults: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  return taskRes._id;
}

async function loadAnalysisTask(taskId, reportId) {
  if (!taskId) return null;
  const task = await getAnalysisTask(taskId);
  if (!task || task.reportId !== reportId || task.status !== 'processing') {
    throw new Error('分析任务不存在或已结束');
  }
  return task;
}

function mergeStoredBatchResults(storedResults = [], batchResults = [], offset = 0) {
  const merged = Array.isArray(storedResults) ? storedResults.slice() : [];
  batchResults.forEach((result, index) => {
    merged[offset + index] = result;
  });
  return merged;
}

async function persistBatchProgress({ taskId, batchResults, nextBatchIndex }) {
  await db.collection('analysisTasks').doc(taskId).update({
    data: {
      batchResults,
      nextBatchIndex,
      updatedAt: new Date(),
    },
  });
}

function scheduleAnalysisContinuation({ reportId, taskId }, retryCount = 0) {
  const MAX_CONTINUATION_RETRIES = 5;
  cloud.callFunction({
    name: 'analyzePhotos',
    data: {
      reportId,
      taskId,
      continuation: true,
    },
    timeout: 55000,
  }).then(res => {
    if (res && res.result && res.result.success) return;
    // 续跑返回非成功，重试
    if (retryCount < MAX_CONTINUATION_RETRIES) {
      console.warn(`续跑返回非成功，${2000}ms 后重试（第 ${retryCount + 1}/${MAX_CONTINUATION_RETRIES} 次）`);
      setTimeout(() => scheduleAnalysisContinuation({ reportId, taskId }, retryCount + 1), 2000);
    } else {
      console.error('续跑 analyzePhotos 多次失败，放弃');
    }
  }).catch(err => {
    console.error(`续跑 analyzePhotos 失败（第 ${retryCount} 次）：`, err);
    // 续跑网络失败，重试
    if (retryCount < MAX_CONTINUATION_RETRIES) {
      setTimeout(() => scheduleAnalysisContinuation({ reportId, taskId }, retryCount + 1), 2000);
    } else {
      console.error('续跑 analyzePhotos 多次网络失败，放弃');
    }
  });
}

async function runAnalyzeBatches({ batches, batchOffset = 0, totalBatches, subject, reportId, verificationPaper, taskId }) {
  const batchResults = new Array(batches.length);
  let nextIndex = 0;

  async function runOne(i) {
    const globalIndex = batchOffset + i;
    console.log(`处理第 ${globalIndex + 1}/${totalBatches} 批，共 ${batches[i].length} 张`);
    let lastError = '';
    for (let attempt = 1; attempt <= MAX_BATCH_ATTEMPTS; attempt += 1) {
      try {
        const res = await cloud.callFunction({
          name: 'analyzeBatch',
          data: {
            fileIDs: batches[i],
            subject,
            batchIndex: globalIndex,
            reportId,
            taskId,
            verificationPlan: verificationPaper ? verificationPaper.plan : [],
          },
          timeout: ANALYZE_BATCH_TIMEOUT_MS,
        });
        const result = res.result || { success: false, error: '图片分析失败，请稍后重试' };
        if (result.success) {
          batchResults[i] = attempt > 1
            ? { ...result, retryAttempt: attempt }
            : result;
          break;
        }
        // 业务返回失败
        lastError = analysisErrorMessage(result.error);
        // 不可重试错误（验证卷不存在等）直接放弃，不再浪费时间
        if (isNonRetryableError(result.error) || attempt === MAX_BATCH_ATTEMPTS) {
          batchResults[i] = { success: false, error: lastError };
          break;
        }
        console.warn(`第 ${globalIndex + 1} 批第 ${attempt} 次返回失败，准备重试：${lastError}`);
      } catch (err) {
        lastError = analysisErrorMessage(err);
        console.error(`第 ${globalIndex + 1} 批第 ${attempt} 次处理失败：`, err);
        // 不可重试错误直接放弃
        if (isNonRetryableError(err) || attempt === MAX_BATCH_ATTEMPTS) {
          batchResults[i] = { success: false, error: lastError };
          break;
        }
      }
      // 指数退避：第 1 次重试等 600ms，第 2 次等 3s，第 3 次等 8s
      const delayMs = BATCH_RETRY_DELAYS_MS[attempt - 1] || 8000;
      console.log(`第 ${globalIndex + 1} 批等待 ${delayMs}ms 后重试（第 ${attempt}/${MAX_BATCH_ATTEMPTS} 次）`);
      await wait(delayMs);
    }

    if (!batchResults[i]) {
      batchResults[i] = { success: false, error: lastError || '图片分析失败，请稍后重试' };
    }
    // 设计说明：每批完成即更新 completedBatches，供前端轮询展示实时进度。
    // 用当前批次的 globalIndex+1 作为绝对值（而非 inc），避免续跑恢复后重复计数。
    await db.collection('analysisTasks').doc(taskId).update({
      data: { completedBatches: globalIndex + 1 },
    }).catch(err => {
      console.error('更新分析进度失败：', err);
    });
  }

  async function worker() {
    while (nextIndex < batches.length) {
      const i = nextIndex;
      nextIndex += 1;
      await runOne(i);
    }
  }

  const workerCount = Math.min(MAX_CONCURRENT_BATCHES, batches.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return batchResults;
}

async function buildAnalysisArtifacts({ reportId, report, fileIDs, batches, subject, studentId, mode, verificationPaper, batchResults }) {
  assertUsableBatchResults(batchResults);

  const pageResults = collectPageResults(batchResults);
  const failedBatches = batchFailureSummary(batchResults, batches);
  const failedImageFiles = failedBatches.flatMap(item => item.fileIDs.map(fileID => ({
    fileID,
    batchIndex: item.batchIndex,
    error: item.error,
  })));
  const historicalContext = await getHistoricalContext(studentId, subject, {
    excludeReportIds: [reportId, ...reanalysisSourceReportIds(report)],
  });
  const historicalPhotos = historicalContext.historicalPhotos;
  const markedPages = markDuplicatePages(pageResults, historicalPhotos);
  const uniquePages = markedPages.filter(page => !page.isDuplicate);
  const merged = mergeBatchResults(
    uniquePages.map(page => ({ success: true, data: page })),
    subject
  );
  const imageFiles = buildImageFiles({
    fileIDs,
    initialImageFiles: Array.isArray(report.imageFiles) ? report.imageFiles : [],
    markedPages,
    report: { ...report, failedImageFiles },
  });
  let previousReport = null;
  let verificationTargets = [];
  let comparisonSummary = '';
  const partialSuccess = failedBatches.length > 0;
  const analysisWarning = partialSuccess
    ? `${fileIDs.length - failedImageFiles.length}/${fileIDs.length} 张照片完成分析，${failedImageFiles.length} 张照片因超时或服务异常未纳入。`
    : '';

  if (uniquePages.length === 0) {
    merged.summary = '本次照片均疑似重复，未更新学习卡点';
    comparisonSummary = '本次照片均疑似重复，未更新学习卡点。';
  } else if (mode === 'verification') {
    // 验证模式后端硬过滤：
    // 1. 用验证卷 paper.questions 的标准答案替换 AI 返回的 correctAnswer，
    //    防止 AI 自己算错标准答案导致假阳性。
    // 2. 丢弃 studentAnswer 与（权威）correctAnswer 数值相等的条目。
    if (Array.isArray(merged.errorDetails) && merged.errorDetails.length > 0) {
      const paperQuestions = (verificationPaper.paper && Array.isArray(verificationPaper.paper.questions))
        ? verificationPaper.paper.questions : [];
      // 构建 questionContent → answer 的查找表（按 content/stem/question 字段匹配）
      const answerByContent = new Map();
      for (const q of paperQuestions) {
        const content = String(q.content || q.question || q.stem || '').trim();
        const answer = String(q.answer || q.correctAnswer || '').trim();
        if (content && answer) {
          answerByContent.set(normalizeForLookup(content), answer);
        }
      }

      if (answerByContent.size > 0) {
        merged.errorDetails = merged.errorDetails.map(item => {
          const key = normalizeForLookup(String(item.questionContent || ''));
          const authoritativeAnswer = answerByContent.get(key);
          if (authoritativeAnswer) {
            return { ...item, correctAnswer: authoritativeAnswer };
          }
          return item;
        });
      }

      const beforeCount = merged.errorDetails.length;
      // 收集验证卷所有标准答案的归一化集合，用于交叉验证
      const allCorrectAnswers = new Set();
      for (const q of paperQuestions) {
        const ans = normalizeForCompare(String(q.answer || q.correctAnswer || ''));
        if (ans) allCorrectAnswers.add(ans);
      }

      merged.errorDetails = merged.errorDetails.filter(item => {
        const sa = normalizeForCompare(item.studentAnswer);
        const ca = normalizeForCompare(item.correctAnswer);
        if (!sa || !ca) return true; // 无法比较的保留
        // 防线 1：studentAnswer 与 correctAnswer 数值相等 → 假阳性，丢弃
        if (sa === ca) return false;
        // 防线 2：AI OCR 误读修正——如果 studentAnswer 恰好等于验证卷中某道题的标准答案，
        // 说明学生写对了但 AI 读错了手写体（如把 7/12 读成 2/7），丢弃
        if (allCorrectAnswers.has(sa)) {
          console.log(`[verification] OCR 误读修正：studentAnswer="${item.studentAnswer}" 恰好匹配验证卷某题标准答案，判定为 AI 读错手写体，丢弃`);
          return false;
        }
        return true;
      });
      const removed = beforeCount - merged.errorDetails.length;
      if (removed > 0) {
        console.log(`[verification] 硬过滤移除 ${removed} 个数值匹配的假阳性错题`);
        // 重新计算 totalErrors
        merged.totalErrors = Math.max(0, (merged.totalErrors || 0) - removed);
      }
    }
    previousReport = historicalContext.previousReport;
    verificationTargets = verificationPaper.targets;
    const verificationEvidence = aggregateVerificationEvidence(verificationPaper.plan, uniquePages);
    const passedCodes = verificationEvidence.filter(item => item.evidenceStatus === 'passed').map(item => item.lpCode);
    merged.bottlenecks = compareBottlenecks(
      previousReport ? previousReport.bottlenecks : [],
      merged.bottlenecks,
      passedCodes
    );
    comparisonSummary = buildComparisonSummary(merged.bottlenecks);
    merged.verificationEvidence = verificationEvidence;
    merged.chineseReviewEvidence = aggregateChineseReviewEvidence(verificationPaper.plan, uniquePages);
    merged.verificationPageEvidence = buildVerificationPageEvidence(uniquePages);
    merged.verificationPageCodes = merged.verificationPageEvidence.map(item => item.pageCode);
  } else {
    merged.bottlenecks = merged.bottlenecks.map(item => ({ ...item, status: 'found' }));
  }

  const quality = buildReportQuality({
    report,
    uniquePages,
    merged,
    failedBatches,
    verificationEvidence: merged.verificationEvidence || [],
    allPhotosDuplicate: uniquePages.length === 0,
  });

  const profile = await getSubjectProfile(studentId, subject);
  const profileSummary = buildProfileSummary(profile || {}, {
    _id: reportId,
    type: mode,
    totalErrors: merged.totalErrors,
    bottlenecks: merged.bottlenecks,
    chineseErrorItems: merged.chineseErrorItems || [],
    verificationTargets,
    verificationEvidence: merged.verificationEvidence || [],
    chineseReviewEvidence: merged.chineseReviewEvidence || [],
    allPhotosDuplicate: uniquePages.length === 0,
  }, report.evidenceTime || report.createdAt || new Date());
  if (quality.status === 'insufficient') {
    profileSummary.isEffective = false;
    profileSummary.changeSummary = quality.reasons[0] || '本次样本不足，未更新学习卡点';
  }

  return {
    merged,
    quality,
    imageFiles,
    previousReport,
    comparisonSummary,
    verificationTargets,
    profile,
    profileSummary,
    partialSuccess,
    analysisWarning,
    failedBatches,
    failedImageFiles,
  };
}

function buildVerificationPageEvidence(pages = []) {
  const byPageCode = new Map();
  for (const page of pages || []) {
    const evidenceItems = Array.isArray(page.verificationEvidence) ? page.verificationEvidence : [];
    const pageCodeFromPage = page.pageCode || '';
    if (pageCodeFromPage && !byPageCode.has(pageCodeFromPage)) {
      byPageCode.set(pageCodeFromPage, {
        pageCode: pageCodeFromPage,
        fileIDs: new Set(),
        targetIds: new Set(),
        attemptedQuestionCount: 0,
        incorrectQuestionCount: 0,
        blankQuestionCount: 0,
        unclearQuestionCount: 0,
        missingQuestionCount: 0,
      });
    }

    for (const evidence of evidenceItems) {
      const pageCode = evidence.pageCode || pageCodeFromPage;
      if (!pageCode) continue;
      if (!byPageCode.has(pageCode)) {
        byPageCode.set(pageCode, {
          pageCode,
          fileIDs: new Set(),
          targetIds: new Set(),
          attemptedQuestionCount: 0,
          incorrectQuestionCount: 0,
          blankQuestionCount: 0,
          unclearQuestionCount: 0,
          missingQuestionCount: 0,
        });
      }
      const total = byPageCode.get(pageCode);
      if (page.fileID) total.fileIDs.add(page.fileID);
      const targetId = evidence.targetId || evidence.lpCode || '';
      if (targetId) total.targetIds.add(targetId);
      total.attemptedQuestionCount += Math.max(0, Number(evidence.attemptedQuestionCount) || 0);
      total.incorrectQuestionCount += Math.max(0, Number(evidence.incorrectQuestionCount) || 0);
      total.blankQuestionCount += Math.max(0, Number(evidence.blankQuestionCount) || 0);
      total.unclearQuestionCount += Math.max(0, Number(evidence.unclearQuestionCount) || 0);
      total.missingQuestionCount += Math.max(0, Number(evidence.missingQuestionCount) || 0);
    }

    if (pageCodeFromPage && page.fileID) {
      byPageCode.get(pageCodeFromPage).fileIDs.add(page.fileID);
    }
  }

  return Array.from(byPageCode.values()).map(item => ({
    ...item,
    fileIDs: Array.from(item.fileIDs),
    targetIds: Array.from(item.targetIds),
  }));
}

async function writeCompletedAnalysis({ reportId, studentId, subject, merged, quality, imageFiles, previousReport, comparisonSummary, verificationTargets, profile, profileSummary, partialSuccess, analysisWarning, failedBatches, failedImageFiles }) {
  await db.collection('reports').doc(reportId).update({
    data: {
      status: 'completed',
      error: '',
      summary: merged.summary,
      totalErrors: merged.totalErrors,
      bottlenecks: merged.bottlenecks,
      errorDetails: merged.errorDetails,
      chineseErrorItems: merged.chineseErrorItems || [],
      imageFiles,
      previousReportId: previousReport ? previousReport._id : '',
      comparisonSummary,
      verificationTargets,
      verificationEvidence: merged.verificationEvidence || [],
      chineseReviewEvidence: merged.chineseReviewEvidence || [],
      verificationPageCodes: merged.verificationPageCodes || [],
      verificationPageEvidence: merged.verificationPageEvidence || [],
      quality: _.set(quality),
      isEffective: profileSummary.isEffective,
      changeSummary: profileSummary.changeSummary,
      partialSuccess,
      analysisWarning,
      failedBatchCount: failedBatches.length,
      failedImageFiles,
      debugError: partialSuccess ? failedBatchDebugMessage(failedBatches) : '',
      completedAt: merged.completedAt,
    },
  });

  if (profileSummary.isEffective) {
    await updateSubjectProfile(profile, profileSummary, reportId);
    await db.collection('reports').doc(reportId).update({
      data: { profileAppliedAt: new Date() },
    });
  } else {
    await clearSubjectProfileAnalysis(studentId, subject);
  }
}

async function markAnalysisTaskCompleted(taskId, artifacts = {}) {
  await db.collection('analysisTasks').doc(taskId).update({
    data: {
      status: 'completed',
      partialSuccess: Boolean(artifacts.partialSuccess),
      warning: artifacts.analysisWarning || '',
      failedBatchCount: artifacts.failedBatches ? artifacts.failedBatches.length : 0,
      completedAt: new Date(),
    },
  });
}

// ========== 主函数 ==========
exports.main = async (event) => {
  const { reportId, taskId: continuationTaskId } = event;
  let taskId = '';
  let staleTaskId = '';
  let report = null;

  if (!reportId) {
    return { success: false, error: '缺少 reportId' };
  }

  try {
    const context = await loadReportContext(reportId, continuationTaskId, {
      trustedReanalysis: isTrustedReanalysisRequest(event),
    });
    if (context.earlyResult) return context.earlyResult;

    ({ report } = context);
    const { currentOpenId, fileIDs, subject, studentId, mode } = context;

    const completedResult = await finishAlreadyCompletedReport(reportId, report, subject);
    if (completedResult) return completedResult;

    const verificationPaper = mode === 'verification' ? await getVerificationPaper(report) : null;
    if (fileIDs.length === 0) {
      return { success: false, error: '报告中没有待分析图片' };
    }

    // qwen3.5-plus 单张图处理 ~15s，批次过大超过 60 秒云函数超时。
    // ANALYSIS_BATCH_SIZE=1，靠续跑机制完成剩余批次。
    const batchSizeMode = ANALYSIS_BATCH_SIZE;
    const batches = splitFileBatches(fileIDs, batchSizeMode);
    const totalBatches = batches.length;
    console.log(`共 ${fileIDs.length} 张图片，拆分为 ${totalBatches} 批`);

    let task = null;
    if (continuationTaskId) {
      task = await loadAnalysisTask(continuationTaskId, reportId);
      taskId = task._id;
    } else {
      const activeTaskResult = await recoverStaleAnalysisTask(reportId);
      if (activeTaskResult && activeTaskResult.success) return activeTaskResult;
      if (activeTaskResult && activeTaskResult.staleTaskId) {
        staleTaskId = activeTaskResult.staleTaskId;
      }
    }

    if (task) {
      // 已通过 continuation 或 stale 恢复
    } else if (staleTaskId) {
      // 恢复 stale task 的已有进度，不丢弃 batchResults
      task = await loadAnalysisTask(staleTaskId, reportId);
      taskId = task._id;
      console.log(`[recoverStale] 从第 ${task.nextBatchIndex || 0} 批恢复`);
    } else {
      taskId = await createAnalysisTask({
        reportId,
        totalBatches,
        fileIDs,
        mode,
        subject,
        studentId,
        openid: report._openid || currentOpenId,
      });
      task = { _id: taskId, batchResults: [], nextBatchIndex: 0 };
    }

    const startBatchIndex = Math.max(0, Number(task.nextBatchIndex) || 0);
    // ANALYSIS_BATCH_SIZE=1，每次调用只跑 1 批，靠续跑机制完成剩余批次
    const batchesPerRun = ANALYSIS_BATCH_SIZE;
    const runBatches = batches.slice(startBatchIndex, startBatchIndex + batchesPerRun);
    if (runBatches.length === 0 && startBatchIndex < totalBatches) {
      throw new Error('分析任务批次进度异常');
    }

    const batchResults = await runAnalyzeBatches({
      batches: runBatches,
      batchOffset: startBatchIndex,
      totalBatches,
      subject,
      reportId,
      verificationPaper,
      taskId,
    });
    const allBatchResults = mergeStoredBatchResults(task.batchResults, batchResults, startBatchIndex);
    const nextBatchIndex = startBatchIndex + runBatches.length;

    await persistBatchProgress({
      taskId,
      batchResults: allBatchResults,
      nextBatchIndex,
    });

    if (nextBatchIndex < totalBatches) {
      scheduleAnalysisContinuation({ reportId, taskId });
      return {
        success: true,
        reportId,
        status: 'processing',
        message: `已完成 ${nextBatchIndex}/${totalBatches} 批，继续分析中`,
      };
    }

    const artifacts = await buildAnalysisArtifacts({
      reportId,
      report,
      fileIDs,
      batches,
      subject,
      studentId,
      mode,
      verificationPaper,
      batchResults: allBatchResults,
    });

    await writeCompletedAnalysis({
      reportId,
      studentId,
      subject,
      ...artifacts,
    });

    // 验证报告完成后，回写验证卷状态为 completed（修复断裂 C）
    if (mode === 'verification' && report && report.paperId) {
      try {
        await db.collection('papers').doc(report.paperId).update({
          data: {
            verificationStatus: 'completed',
            verificationReportId: reportId,
            verifiedAt: new Date(),
          },
        });
      } catch (e) {
        console.warn('[analyzePhotos] 回写 paper.verificationStatus 失败:', e.message);
      }
    }

    await markAnalysisTaskCompleted(taskId, artifacts);

    // 诊断报告完成后，自动触发验证卷生成；前端不再负责手动生成或分批推进。
    if (mode !== 'verification' && artifacts.profileSummary && artifacts.profileSummary.isEffective) {
      const pendingCount = (artifacts.profile && artifacts.profile.pendingBottlenecks || []).length;
      if (pendingCount > 0) {
        const currentOpenId = cloud.getWXContext().OPENID;
        try {
          await triggerAutoVerificationPaper(cloud, db, {
            reportId,
            studentId,
            subject,
            profile: artifacts.profile,
            openId: currentOpenId,
          });
        } catch (err) {
          console.warn('[auto-verification] 异常:', err.message);
        }
      }
    }

    sendNotification(studentId, reportId, subject).catch(err => console.error('推送异常：', err));

    return {
      success: true,
      reportId,
      totalErrors: artifacts.merged.totalErrors,
      bottleneckCount: artifacts.merged.bottlenecks.length,
      summary: artifacts.merged.summary,
      partialSuccess: artifacts.partialSuccess,
      warning: artifacts.analysisWarning,
    };
  } catch (err) {
    console.error('analyzePhotos 失败：', err);
    const debugError = analysisErrorMessage(err);
    // 对用户可读的错误（如验证试卷不存在），直接用原始消息而非笼统的"图片分析失败"
    const userError = isUserFacingAnalysisError(err) ? debugError : '图片分析失败，请稍后重试';

    // 更新 reports 状态为 failed
    if (reportId) {
      await db.collection('reports').doc(reportId).update({
        data: { status: 'failed', error: userError, debugError, updatedAt: new Date() },
      }).catch(() => {});
    }
    if (taskId) {
      await db.collection('analysisTasks').doc(taskId).update({
        data: { status: 'failed', error: debugError, completedAt: new Date() },
      }).catch(() => {});
    }
    if (report) {
      await clearSubjectProfileAnalysis(report.studentId, report.subject).catch(() => {});
    }

    return { success: false, error: userError, reportId };
  }
};
