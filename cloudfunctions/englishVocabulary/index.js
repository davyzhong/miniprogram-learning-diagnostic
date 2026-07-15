const cloud = require('wx-server-sdk')
const tcb = require('@cloudbase/node-sdk')
const crypto = require('node:crypto')
const { getStudentAccess, canReadLearning, canOperateLearning } = require('./access')
const {
  cleanText,
  normalizeImportCandidates,
  applyWordReviewResult,
  applyWordDictationAttempt,
  applyWordDimensionAttempt,
  buildVocabularySummary,
  buildDualVocabularySummary,
  selectPracticeItems,
  buildDictationItems,
  buildRecognitionItems,
  buildPaperDictationItems,
  judgeSpokenWord,
  judgeWrittenWord,
  judgeRecognitionAnswer,
  dateOnly
} = require('./english-vocabulary')
const { createEnglishVisionActions } = require('./vision-analysis')
const { createLearningViews } = require('./learning-views')

cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })
const db = cloud.database()
const app = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV, timeout: 60000 })
const seedVocabulary = require('./zhong-qingyu-pep-vocabulary.json')

// 视觉模型；hy3-preview 不支持图片。
const VISION_MODEL_ID = 'qwen3.5-plus';

const ACTIONS = new Set([
  'createImportBatch', 'confirmImportBatch', 'seedPersonalVocabulary', 'getVocabularySummary', 'listWords',
  'getTodayPlan', 'getConfusionPractice',
  'generateRecognitionSession', 'submitRecognitionAttempt', 'generatePaperDictationSession',
  'submitDictationPhoto', 'analyzeDictationPhoto', 'generatePracticeSession',
  'submitDictationAttempt', 'submitPracticeResult'
])

function ok(data = {}) {
  return { success: true, ...data }
}

function fail(error) {
  return { success: false, error }
}

const { getTodayPlan, getConfusionPractice, listWords } = createLearningViews({ getCollectionData, ok })

function nowDate() {
  return db.serverDate ? db.serverDate() : new Date()
}

async function authorize(studentId, write = false) {
  const openId = cloud.getWXContext().OPENID
  const access = await getStudentAccess(db, studentId, openId)
  const allowed = write ? canOperateLearning(access) : canReadLearning(access)
  return { access, openId, allowed }
}

// IDOR 防御：用资源自身存储的 studentId 反查权限，而非信任调用方传入的 studentId。
// 防止攻击者传自己的 studentId（通过入口 authorize）+ 别人的 sessionId/batchId 越权读写。
// 返回 { allowed, openId }；allowed=false 时附带 error。
async function authorizeResourceOwner(resourceStudentId, claimedStudentId, write = false) {
  if (!resourceStudentId) return { allowed: false, error: '资源缺少 studentId，拒绝访问' }
  // 资源的 studentId 必须与调用方声称的一致，否则说明 sessionId/batchId 与 studentId 不匹配
  if (claimedStudentId && resourceStudentId !== claimedStudentId) {
    return { allowed: false, error: '资源归属与请求不匹配' }
  }
  const openId = cloud.getWXContext().OPENID
  const access = await getStudentAccess(db, resourceStudentId, openId)
  const allowed = write ? canOperateLearning(access) : canReadLearning(access)
  return { allowed, openId, error: allowed ? '' : '无权操作该资源' }
}

async function getCollectionData(name, filter = {}) {
  try {
    const res = await db.collection(name).where(filter).get()
    return res.data || []
  } catch (error) {
    if (error && error.errCode === -502005 && db.createCollection) {
      await db.createCollection(name)
      return []
    }
    throw error
  }
}

async function addDocument(name, data) {
  try {
    return await db.collection(name).add({ data })
  } catch (error) {
    if (error && error.errCode === -502005 && db.createCollection) {
      await db.createCollection(name)
      return db.collection(name).add({ data })
    }
    throw error
  }
}

async function getDocument(name, id) {
  try {
    const res = await db.collection(name).doc(id).get()
    return res.data || null
  } catch (error) {
    if (error && error.errCode === -502005 && db.createCollection) {
      await db.createCollection(name)
      return null
    }
    throw error
  }
}

async function updateDocument(name, id, data) {
  return db.collection(name).doc(id).update({ data })
}

function attemptDocumentId(event, kind) {
  const queueIdentity = cleanText(event.queueKey, 120) || `${event.wordId}:${Number(event.retryCount) || 0}`
  const identity = cleanText(event.attemptId, 120) || [event.sessionId, queueIdentity, kind].join('|')
  return `attempt_${crypto.createHash('sha256').update(identity).digest('hex').slice(0, 32)}`
}

function attemptDocument(event, kind, attempt) {
  const _id = attemptDocumentId(event, kind)
  return {
    _id,
    attemptId: cleanText(event.attemptId, 120) || _id,
    sessionId: event.sessionId,
    studentId: event.studentId,
    kind,
    ...attempt
  }
}

async function persistAttempt(event, kind, attempt, buildWordUpdate) {
  const document = attemptDocument(event, kind, attempt)
  await getDocument('englishPracticeAttempts', document._id)
  return db.runTransaction(async transaction => {
    const attemptRef = transaction.collection('englishPracticeAttempts').doc(document._id)
    const existingRes = await attemptRef.get()
    if (existingRes.data) return { claimed: false, attempt: existingRes.data }

    const wordRef = transaction.collection('studentEnglishWords').doc(event.wordId)
    const sessionRef = transaction.collection('englishPracticeSessions').doc(event.sessionId)
    const wordRes = await wordRef.get()
    const sessionRes = await sessionRef.get()
    const currentWord = wordRes.data
    const currentSession = sessionRes.data
    if (!currentWord) throw new Error('单词不存在')
    if (!currentSession) throw new Error('练习记录不存在')
    if (currentWord.studentId !== currentSession.studentId) throw new Error('单词归属与练习记录不匹配')

    await transaction.collection('englishPracticeAttempts').add({ data: document })
    const wordUpdate = buildWordUpdate(currentWord)
    if (wordUpdate) await wordRef.update({ data: wordUpdate })
    await sessionRef.update({
      data: {
        status: 'in_progress',
        attempts: db.command.push(attempt),
        updatedAt: nowDate()
      }
    })
    return { claimed: true, attempt: document }
  })
}

async function getVocabularySummaryCache(studentId, today) {
  const caches = await getCollectionData('studentEnglishVocabularyStats', { studentId })
  return (caches || []).find(item => item.today === today && item.dirty !== true) || null
}

async function saveVocabularySummaryCache(studentId, today, payload) {
  const caches = await getCollectionData('studentEnglishVocabularyStats', { studentId })
  const cache = (caches || [])[0]
  const data = {
    studentId,
    today,
    dirty: false,
    summary: payload.summary,
    weakWords: payload.weakWords,
    patternCount: payload.patternCount,
    updatedAt: nowDate()
  }
  if (cache && cache._id) {
    await updateDocument('studentEnglishVocabularyStats', cache._id, data)
    return
  }
  await addDocument('studentEnglishVocabularyStats', {
    ...data,
    createdAt: nowDate()
  })
}

async function markVocabularySummaryDirty(studentId) {
  const caches = await getCollectionData('studentEnglishVocabularyStats', { studentId })
  await Promise.all((caches || []).map(item => updateDocument('studentEnglishVocabularyStats', item._id, {
    dirty: true,
    updatedAt: nowDate()
  })))
}

function wordIdentity(word) {
  return [
    word.word,
    word.grade || '',
    word.volume || '',
    word.unit || ''
  ].join('|')
}

function sourceIdentity(source = {}) {
  return [
    source.sourceFile || '',
    source.sourceKey || '',
    source.sourceUrl || '',
    source.pageIndex || ''
  ].join('|')
}

function mergeSources(left = [], right = []) {
  const byIdentity = new Map()
  for (const source of [...left, ...right]) {
    const key = sourceIdentity(source)
    if (!key.replace(/\|/g, '')) continue
    byIdentity.set(key, source)
  }
  return Array.from(byIdentity.values())
}

function patternIdentity(pattern) {
  return [
    pattern.pattern,
    pattern.grade || '',
    pattern.volume || '',
    pattern.unit || ''
  ].join('|')
}

async function createImportBatch(event, openId) {
  let words = Array.isArray(event.words) ? event.words : []
  let patterns = Array.isArray(event.patterns) ? event.patterns : []
  if (Array.isArray(event.pageFileIDs) && event.pageFileIDs.length > 0 && words.length === 0 && patterns.length === 0) {
    const extracted = await extractCandidatesFromImages(event.pageFileIDs, {
      sourceFile: event.sourceFile,
      defaultGrade: event.defaultGrade,
      defaultVolume: event.defaultVolume,
      ledgerOpenId: openId,
      ledgerStudentId: event.studentId
    })
    words = extracted.words
    patterns = extracted.patterns
  }
  const normalized = normalizeImportCandidates({
    studentId: event.studentId,
    batchId: '',
    sourceFile: event.sourceFile,
    defaultGrade: event.defaultGrade,
    defaultVolume: event.defaultVolume,
    words,
    patterns
  })

  const batchData = {
    _openid: openId,
    studentId: event.studentId,
    subject: 'english',
    sourceFile: cleanText(event.sourceFile, 200),
    sourceType: cleanText(event.sourceType, 40) || 'material',
    status: 'pending_review',
    candidateWords: normalized.words,
    candidatePatterns: normalized.patterns,
    wordCandidateCount: normalized.words.length,
    patternCandidateCount: normalized.patterns.length,
    createdAt: nowDate(),
    updatedAt: nowDate()
  }
  const res = await addDocument('englishImportBatches', batchData)
  const batchId = res._id
  const candidateWords = normalized.words.map(item => ({
    ...item,
    batchId,
    sources: (item.sources || []).map(source => ({ ...source, batchId }))
  }))
  const candidatePatterns = normalized.patterns.map(item => ({ ...item, batchId }))
  await updateDocument('englishImportBatches', batchId, { candidateWords, candidatePatterns })

  return ok({
    batchId,
    wordCandidateCount: candidateWords.length,
    patternCandidateCount: candidatePatterns.length
  })
}

async function upsertWords(studentId, openId, candidates) {
  const existing = await getCollectionData('studentEnglishWords', { studentId })
  const byIdentity = new Map(existing.map(item => [wordIdentity(item), item]))
  let imported = 0
  let changed = false
  for (const candidate of candidates || []) {
    const identity = wordIdentity(candidate)
    const active = {
      ...candidate,
      _openid: openId,
      studentId,
      status: 'active',
      updatedAt: nowDate()
    }
    delete active._id
    const found = byIdentity.get(identity)
    if (found) {
      const meanings = Array.from(new Set([...(found.meanings || []), ...(active.meanings || [])]))
      const sources = mergeSources(found.sources || [], active.sources || [])
      await updateDocument('studentEnglishWords', found._id, {
        meanings,
        sources,
        updatedAt: nowDate()
      })
      changed = true
    } else {
      await addDocument('studentEnglishWords', { ...active, createdAt: nowDate() })
      imported += 1
      changed = true
    }
  }
  if (changed) {
    await markVocabularySummaryDirty(studentId)
  }
  return imported
}

async function upsertPatterns(studentId, openId, candidates) {
  const existing = await getCollectionData('studentEnglishPatterns', { studentId })
  const byIdentity = new Map(existing.map(item => [patternIdentity(item), item]))
  let imported = 0
  for (const candidate of candidates || []) {
    const identity = patternIdentity(candidate)
    if (byIdentity.has(identity)) continue
    await addDocument('studentEnglishPatterns', {
      ...candidate,
      _openid: openId,
      studentId,
      status: 'active',
      createdAt: nowDate(),
      updatedAt: nowDate()
    })
    imported += 1
  }
  return imported
}

async function confirmImportBatch(event, openId) {
  const batch = await getDocument('englishImportBatches', event.batchId)
  if (!batch) return fail('导入批次不存在')
  // IDOR 防御：用 batch 自身的 studentId 反查权限，不信任 event.studentId
  const ownerAuth = await authorizeResourceOwner(batch.studentId, event.studentId, true)
  if (!ownerAuth.allowed) return fail(ownerAuth.error)
  if (batch.status !== 'pending_review') return fail('导入批次状态无效')

  const importedWordCount = await upsertWords(event.studentId, openId, batch.candidateWords || [])
  const importedPatternCount = await upsertPatterns(event.studentId, openId, batch.candidatePatterns || [])
  await updateDocument('englishImportBatches', event.batchId, {
    status: 'confirmed',
    confirmedAt: nowDate(),
    updatedAt: nowDate(),
    importedWordCount,
    importedPatternCount
  })
  return ok({ importedWordCount, importedPatternCount })
}

async function seedPersonalVocabulary(event, openId) {
  const sourceFile = seedVocabulary.title || '钟青羽 PEP 小学英语个人词库'
  const normalized = normalizeImportCandidates({
    studentId: event.studentId,
    batchId: '',
    sourceFile,
    sourceType: seedVocabulary.sourceType,
    words: seedVocabulary.words || [],
    patterns: []
  })
  if (normalized.words.length === 0) return fail('个人词库种子数据为空')

  const res = await addDocument('englishImportBatches', {
    _openid: openId,
    studentId: event.studentId,
    subject: 'english',
    sourceFile,
    sourceType: seedVocabulary.sourceType || 'pep-vocabulary-seed',
    status: 'confirmed',
    candidateWords: [],
    candidatePatterns: [],
    wordCandidateCount: normalized.words.length,
    patternCandidateCount: 0,
    sourceSummary: (seedVocabulary.sources || []).map(item => ({
      key: item.key,
      grade: item.grade,
      volume: item.volume,
      sourceFile: item.sourceFile,
      sourceUrl: item.sourceUrl,
      wordCount: item.wordCount
    })),
    createdAt: nowDate(),
    confirmedAt: nowDate(),
    updatedAt: nowDate()
  })
  const batchId = res._id
  const candidateWords = normalized.words.map(item => ({
    ...item,
    batchId,
    sources: (item.sources || []).map(source => ({ ...source, batchId }))
  }))
  const importedWordCount = await upsertWords(event.studentId, openId, candidateWords)
  await updateDocument('englishImportBatches', batchId, {
    importedWordCount,
    importedPatternCount: 0,
    updatedAt: nowDate()
  })
  return ok({
    batchId,
    importedWordCount,
    importedPatternCount: 0,
    totalSeedWords: normalized.words.length,
    sourceCount: (seedVocabulary.sources || []).length
  })
}

async function getVocabularySummaryAction(event) {
  const today = dateOnly(event.today || new Date())
  const cached = await getVocabularySummaryCache(event.studentId, today)
  if (cached) {
    return ok({
      summary: cached.summary || buildDualVocabularySummary([], today),
      weakWords: cached.weakWords || [],
      patternCount: Number(cached.patternCount) || 0,
      cacheHit: true
    })
  }
  const [words, patterns] = await Promise.all([
    getCollectionData('studentEnglishWords', { studentId: event.studentId }),
    getCollectionData('studentEnglishPatterns', { studentId: event.studentId })
  ])
  const weakWords = words
    .filter(item => (Number(item.wrongCount) || 0) > 0 || item.masteryStatus === 'needs_practice')
    .slice()
    .sort((a, b) => {
      const wrong = (Number(b.wrongCount) || 0) - (Number(a.wrongCount) || 0)
      if (wrong) return wrong
      return String(a.word || '').localeCompare(String(b.word || ''))
    })
    .slice(0, 5)
    .map(item => ({
      wordId: item._id,
      word: item.word,
      wrongCount: Number(item.wrongCount) || 0,
      meanings: item.meanings || []
    }))
  const payload = {
    summary: buildDualVocabularySummary(words, today),
    weakWords,
    patternCount: patterns.filter(item => item.status !== 'archived').length
  }
  await saveVocabularySummaryCache(event.studentId, today, payload)
  return ok(payload)
}

async function generatePracticeSession(event, openId) {
  const words = await getCollectionData('studentEnglishWords', { studentId: event.studentId })
  const wordItems = buildDictationItems(words, {
    today: event.today,
    limit: Math.min(40, Math.max(1, Number(event.wordLimit) || 20))
  })

  const res = await addDocument('englishPracticeSessions', {
    _openid: openId,
    studentId: event.studentId,
    subject: 'english',
    type: 'word-dictation',
    status: 'in_progress',
    wordItems,
    patternItems: [],
    attempts: [],
    createdAt: nowDate(),
    updatedAt: nowDate()
  })
  return ok({ sessionId: res._id, wordItems, patternItems: [] })
}

async function generateRecognitionSession(event, openId) {
  const words = await getCollectionData('studentEnglishWords', { studentId: event.studentId })
  const wordItems = buildRecognitionItems(words, {
    today: event.today,
    direction: event.direction || 'mixed',
    limit: Math.min(40, Math.max(1, Number(event.wordLimit) || 20))
  })

  const res = await addDocument('englishPracticeSessions', {
    _openid: openId,
    studentId: event.studentId,
    subject: 'english',
    functionType: 'familiarity',
    type: 'word-familiarity',
    direction: cleanText(event.direction, 20) || 'mixed',
    wordLimit: wordItems.length,
    status: 'in_progress',
    wordItems,
    patternItems: [],
    attempts: [],
    createdAt: nowDate(),
    updatedAt: nowDate()
  })
  return ok({ sessionId: res._id, wordItems, patternItems: [] })
}

async function generatePaperDictationSession(event, openId) {
  const words = await getCollectionData('studentEnglishWords', { studentId: event.studentId })
  const wordItems = buildPaperDictationItems(words, {
    today: event.today,
    limit: Math.min(40, Math.max(1, Number(event.wordLimit) || 20))
  })

  const res = await addDocument('englishPracticeSessions', {
    _openid: openId,
    studentId: event.studentId,
    subject: 'english',
    functionType: 'spelling',
    type: 'word-dictation-paper',
    wordLimit: wordItems.length,
    status: 'in_progress',
    analysisStatus: 'waiting_upload',
    wordItems,
    patternItems: [],
    attempts: [],
    photoFileIds: [],
    createdAt: nowDate(),
    updatedAt: nowDate()
  })
  return ok({ sessionId: res._id, functionType: 'spelling', wordItems, patternItems: [] })
}

async function submitDictationPhoto(event) {
  const session = await getDocument('englishPracticeSessions', event.sessionId)
  if (!session) return fail('纸面听写记录不存在')
  // IDOR 防御：用 session 自身的 studentId 反查权限
  const ownerAuth = await authorizeResourceOwner(session.studentId, event.studentId, true)
  if (!ownerAuth.allowed) return fail(ownerAuth.error)
  if (session.functionType !== 'spelling') return fail('听写记录类型不匹配')
  const incoming = Array.isArray(event.photoFileIds) ? event.photoFileIds : []
  const photoFileIds = incoming
    .map(item => cleanText(item, 240))
    .filter(item => /^cloud:\/\//.test(item))
    .slice(0, 20)
  if (photoFileIds.length === 0) return fail('缺少听写纸照片')

  await updateDocument('englishPracticeSessions', event.sessionId, {
    status: 'submitted',
    analysisStatus: 'pending_analysis',
    photoFileIds,
    durationMs: Math.max(0, Number(event.durationMs) || 0),
    submittedAt: nowDate(),
    updatedAt: nowDate()
  })

  return ok({
    sessionId: event.sessionId,
    analysisStatus: 'pending_analysis',
    photoFileIds
  })
}

const { extractCandidatesFromImages, analyzeDictationPhoto } = createEnglishVisionActions({
  cloud,
  app,
  db,
  modelId: VISION_MODEL_ID,
  cleanText,
  fail,
  ok,
  getDocument,
  getCollectionData,
  updateDocument,
  authorizeResourceOwner,
  applyWordDimensionAttempt,
  judgeWrittenWord,
  nowDate,
  markVocabularySummaryDirty,
})

function findSessionItem(session, event) {
  const items = session.wordItems || []
  return items.find(item => (
    (event.queueKey && item.queueKey === event.queueKey) ||
    (event.wordId && item.wordId === event.wordId)
  )) || null
}

async function submitRecognitionAttempt(event) {
  const session = await getDocument('englishPracticeSessions', event.sessionId)
  if (!session) return fail('熟悉度练习记录不存在')
  // IDOR 防御：用 session 自身的 studentId 反查权限
  const ownerAuth = await authorizeResourceOwner(session.studentId, event.studentId, true)
  if (!ownerAuth.allowed) return fail(ownerAuth.error)
  // 有界读取：只拉取目标 word 文档，而非整个学生词汇库
  const word = await getDocument('studentEnglishWords', event.wordId)
  if (!word || word.studentId !== event.studentId) return fail('单词不存在')
  const sessionItem = findSessionItem(session, event)
  if (!sessionItem) return fail('练习题目不存在')

  const direction = cleanText(event.direction || sessionItem.direction, 20) || 'cn2en'
  const judgment = judgeRecognitionAnswer({
    direction,
    targetWord: event.targetWord || word.word,
    meanings: word.meanings || [],
    cnSynonyms: word.cnSynonyms || [],
    recognizedText: event.recognizedText
  })
  const reviewedAt = event.reviewedAt || new Date()
  const attempt = {
    queueKey: cleanText(event.queueKey || sessionItem.queueKey, 120),
    wordId: word._id,
    targetWord: word.word,
    promptType: cleanText(event.promptType || sessionItem.promptType, 20),
    direction,
    recognizedText: cleanText(event.recognizedText, 200),
    audioFileID: cleanText(event.audioFileID, 240),
    durationMs: Math.max(0, Number(event.durationMs) || 0),
    judgment,
    retryCount: Number(event.retryCount) || 0,
    reviewedAt: dateOnly(reviewedAt),
    createdAt: nowDate()
  }

  const claim = await persistAttempt(event, 'recognition', attempt, currentWord => {
    if (judgment.status === 'unclear') return null
    const updated = applyWordDimensionAttempt(currentWord, 'familiarity', {
      judgment,
      reviewedAt,
      direction
    })
    return {
      familiarity: updated.familiarity,
      spelling: updated.spelling,
      overallMastery: updated.overallMastery,
      masteryStatus: updated.familiarity.status,
      correctCount: updated.familiarity.correctCount,
      wrongCount: updated.familiarity.wrongCount,
      lastReviewedAt: updated.familiarity.lastTestedAt,
      nextReviewAt: updated.familiarity.nextReviewAt,
      updatedAt: nowDate()
    }
  })
  if (judgment.status !== 'unclear') await markVocabularySummaryDirty(event.studentId)
  const effectiveJudgment = claim.attempt.judgment || judgment

  return ok({
    judgment: effectiveJudgment,
    shouldRepeat: effectiveJudgment.status !== 'correct',
    attempt: claim.attempt,
    duplicate: !claim.claimed
  })
}

async function submitDictationAttempt(event) {
  const session = await getDocument('englishPracticeSessions', event.sessionId)
  if (!session) return fail('听写记录不存在')
  // IDOR 防御：用 session 自身的 studentId 反查权限
  const ownerAuth = await authorizeResourceOwner(session.studentId, event.studentId, true)
  if (!ownerAuth.allowed) return fail(ownerAuth.error)
  // 有界读取：只拉取目标 word 文档，而非整个学生词汇库
  const word = await getDocument('studentEnglishWords', event.wordId)
  if (!word || word.studentId !== event.studentId) return fail('单词不存在')

  const judgment = judgeSpokenWord({
    targetWord: event.targetWord || word.word,
    recognizedText: event.recognizedText
  })
  const reviewedAt = event.reviewedAt || new Date()
  const attempt = {
    queueKey: cleanText(event.queueKey, 120),
    wordId: word._id,
    targetWord: word.word,
    promptType: cleanText(event.promptType, 20),
    recognizedText: cleanText(event.recognizedText, 200),
    audioFileID: cleanText(event.audioFileID, 240),
    judgment,
    retryCount: Number(event.retryCount) || 0,
    reviewedAt: dateOnly(reviewedAt),
    createdAt: nowDate()
  }

  const claim = await persistAttempt(event, 'dictation', attempt, currentWord => {
    if (judgment.status === 'unclear') return null
    const updated = applyWordDictationAttempt(currentWord, {
      judgment,
      reviewedAt
    })
    return {
      masteryStatus: updated.masteryStatus,
      correctCount: updated.correctCount,
      wrongCount: updated.wrongCount,
      lastReviewedAt: updated.lastReviewedAt,
      nextReviewAt: updated.nextReviewAt,
      updatedAt: nowDate()
    }
  })
  if (judgment.status !== 'unclear') await markVocabularySummaryDirty(event.studentId)
  const effectiveJudgment = claim.attempt.judgment || judgment

  return ok({
    judgment: effectiveJudgment,
    shouldRepeat: effectiveJudgment.status !== 'correct',
    attempt: claim.attempt,
    duplicate: !claim.claimed
  })
}

async function submitPracticeResult(event) {
  const session = await getDocument('englishPracticeSessions', event.sessionId)
  if (!session) return fail('练习记录不存在')
  // IDOR 防御：用 session 自身的 studentId 反查权限
  const ownerAuth = await authorizeResourceOwner(session.studentId, event.studentId, true)
  if (!ownerAuth.allowed) return fail(ownerAuth.error)
  const words = await getCollectionData('studentEnglishWords', { studentId: event.studentId })
  const byId = new Map(words.map(item => [item._id, item]))
  const wordResults = Array.isArray(event.wordResults) ? event.wordResults : []
  if (wordResults.some(result => !byId.has(cleanText(result && result.wordId, 80)))) {
    return fail('练习题目不存在')
  }
  // 性能优化：并发写库（替代串行 for await）
  const updateJobs = []
  for (const result of wordResults) {
    const word = byId.get(result.wordId)
    const updated = applyWordReviewResult(word, {
      correct: result.correct === true,
      reviewedAt: event.reviewedAt || new Date()
    })
    updateJobs.push(updateDocument('studentEnglishWords', word._id, {
      masteryStatus: updated.masteryStatus,
      correctCount: updated.correctCount,
      wrongCount: updated.wrongCount,
      lastReviewedAt: updated.lastReviewedAt,
      nextReviewAt: updated.nextReviewAt,
      updatedAt: nowDate()
    }))
  }
  const settled = await Promise.all(updateJobs)
  const updatedWordCount = settled.filter(result => result).length
  if (updatedWordCount > 0) {
    await markVocabularySummaryDirty(event.studentId)
  }
  await updateDocument('englishPracticeSessions', event.sessionId, {
    status: 'completed',
    wordResults,
    patternResults: event.patternResults || [],
    completedAt: nowDate(),
    updatedAt: nowDate()
  })
  return ok({ updatedWordCount })
}

exports.main = async (event = {}) => {
  const action = cleanText(event.action, 40)
  const studentId = cleanText(event.studentId, 80)
  if (!ACTIONS.has(action)) return fail('英语词库操作无效')
  if (!studentId) return fail('缺少 studentId')

  try {
    const write = !['getVocabularySummary', 'listWords', 'getTodayPlan', 'getConfusionPractice'].includes(action)
    const auth = await authorize(studentId, write)
    if (!auth.allowed) return fail('无权执行该操作')

    if (action === 'createImportBatch') return createImportBatch(event, auth.openId)
    if (action === 'getTodayPlan') return getTodayPlan(event)
    if (action === 'getConfusionPractice') return getConfusionPractice(event)
    if (action === 'confirmImportBatch') return confirmImportBatch(event, auth.openId)
    if (action === 'seedPersonalVocabulary') return seedPersonalVocabulary(event, auth.openId)
    if (action === 'getVocabularySummary') return getVocabularySummaryAction(event)
    if (action === 'listWords') return listWords(event)
    if (action === 'generateRecognitionSession') return generateRecognitionSession(event, auth.openId)
    if (action === 'submitRecognitionAttempt') return submitRecognitionAttempt(event)
    if (action === 'generatePaperDictationSession') return generatePaperDictationSession(event, auth.openId)
    if (action === 'submitDictationPhoto') return submitDictationPhoto(event)
    if (action === 'analyzeDictationPhoto') return analyzeDictationPhoto(event)
    if (action === 'generatePracticeSession') return generatePracticeSession(event, auth.openId)
    if (action === 'submitDictationAttempt') return submitDictationAttempt(event)
    if (action === 'submitPracticeResult') return submitPracticeResult(event)
    return fail('英语词库操作无效')
  } catch (error) {
    console.error('[englishVocabulary] failed', error)
    return fail('英语词库操作失败，请稍后重试')
  }
}
