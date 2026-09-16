// 错误台账：失败可检索（errorEvents 集合，见 docs/DATA_DICTIONARY.md）。
// 台账自身失败只记日志，绝不影响主流程。
// 注意：此文件在 analyzePhotos 与 generatePaper 各有一份相同副本（云函数根级共享文件约定）。
function createErrorLedger(db) {
  return async function logErrorEvent({ function: fnName, action = '', message = '', error = null, studentId = '', reportId = '', paperId = '' }) {
    try {
      await db.collection('errorEvents').add({
        data: {
          function: fnName,
          action,
          message,
          error: String((error && error.message) || error || ''),
          studentId: studentId || '',
          reportId: reportId || '',
          paperId: paperId || '',
          createdAt: typeof db.serverDate === 'function' ? db.serverDate() : new Date()
        }
      });
    } catch (ledgerError) {
      console.error('[errorEvents] 写入失败：', ledgerError && ledgerError.message);
    }
  };
}

module.exports = { createErrorLedger };
