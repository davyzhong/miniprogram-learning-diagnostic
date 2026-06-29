const cloud = require('wx-server-sdk')
const tcb = require('@cloudbase/node-sdk')
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
const { recordUsageStart, recordUsageSuccess, recordUsageFailure } = require('./usage-ledger')

cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })
const db = cloud.database()
const app = tcb.init({
  env: tcb.SYMBOL_CURRENT_ENV,
  timeout: 60000
})
const seedVocabulary = require('./zhong-qingyu-pep-vocabulary.json')

const ACTIONS = new Set([
  'createImportBatch',
  'confirmImportBatch',
  'seedPersonalVocabulary',
  'getVocabularySummary',
  'listWords',
  'generateRecognitionSession',
  'submitRecognitionAttempt',
  'generatePaperDictationSession',
  'submitDictationPhoto',
  'analyzeDictationPhoto',
  'generatePracticeSession',
  'submitDictationAttempt',
  'submitPracticeResult'
])

function ok(data = {}) {
  return { success: true, ...data }
}

function fail(error) {
  return { success: false, error }
}

function parseJsonText(text) {
  const cleaned = String(text || '').replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim()
  return JSON.parse(cleaned || '{}')
}

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

async function extractCandidatesFromImages(pageFileIDs = [], context = {}) {
  const fileIDs = pageFileIDs
    .map(fileID => cleanText(fileID, 240))
    .filter(fileID => /^cloud:\/\//.test(fileID))
    .slice(0, 20)
  if (fileIDs.length === 0) return { words: [], patterns: [] }

  const tempRes = await cloud.getTempFileURL({ fileList: fileIDs })
  const imageUrls = (tempRes.fileList || [])
    .filter(item => item.tempFileURL)
    .map(item => item.tempFileURL)
  if (imageUrls.length === 0) return { words: [], patterns: [] }

  const prompt = `请从这组 PEP 小学英语单词句型表图片中提取词库。返回严格 JSON，不要 markdown。
来源文件：${cleanText(context.sourceFile, 200)}
默认年级：${Number(context.defaultGrade) || ''}
默认册别：${cleanText(context.defaultVolume, 20)}

要求：
1. 提取单词、中文释义、词性、单元。
2. 当前阶段只提取单词，不提取句型、时态或例句。
3. 不要编造图片中没有出现的内容。
4. 无法确认的内容留空，不要猜。

输出格式：
{
  "words": [{"word":"museum","meaning":"博物馆","partOfSpeech":"n.","unit":"Unit 1"}]
}`

  const ai = app.ai()
  const model = ai.createModel('cloudbase')

  // AI 用量记账（pending）——写入失败不阻断业务
  let eventId = null
  if (context.ledgerOpenId) {
    try {
      eventId = await recordUsageStart({
        db, openId: context.ledgerOpenId,
        eventType: 'photo_analysis',
        studentId: context.ledgerStudentId || '',
        subject: 'english',
        sourceType: 'english_session',
        cloudFunction: 'englishVocabulary',
        model: 'hy3-preview',
        imageCount: imageUrls.length
      })
    } catch (e) { console.error('[usage] recordUsageStart failed', e && e.message) }
  }

  let result
  try {
    result = await model.generateText({
      model: 'hy3-preview',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          ...imageUrls.map(url => ({ type: 'image_url', image_url: { url } }))
        ]
      }],
      temperature: 0.1
    })
    if (eventId) {
      await recordUsageSuccess({
        db, eventId, usage: result && result.usage, outputText: result && result.text,
        model: 'hy3-preview', imageCount: imageUrls.length
      }).catch(e => console.error('[usage] recordUsageSuccess failed', e && e.message))
    }
  } catch (err) {
    if (eventId) {
      await recordUsageFailure({ db, eventId, errorMessage: err && err.message, model: 'hy3-preview', imageCount: imageUrls.length })
        .catch(e => console.error('[usage] recordUsageFailure failed', e && e.message))
    }
    throw err
  }
  const parsed = parseJsonText(result.text)
  return {
    words: Array.isArray(parsed.words) ? parsed.words : [],
    patterns: []
  }
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

async function listWords(event) {
  const words = await getCollectionData('studentEnglishWords', { studentId: event.studentId })
  const status = cleanText(event.masteryStatus, 40)
  const unit = cleanText(event.unit, 40)
  const filtered = words
    .filter(item => !status || (item.masteryStatus || 'untested') === status)
    .filter(item => !unit || item.unit === unit)
  return ok({ words: filtered })
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

function normalizeDictationVerdict(value) {
  const verdict = cleanText(value, 20)
  return ['correct', 'incorrect', 'unclear'].includes(verdict) ? verdict : 'unclear'
}

function normalizeDictationOcrResults(rawResults = [], wordItems = []) {
  const byWordId = new Map()
  const byWord = new Map()
  for (const result of rawResults || []) {
    const wordId = cleanText(result.wordId, 80)
    const targetWord = cleanText(result.targetWord || result.word, 80).toLowerCase()
    if (wordId) byWordId.set(wordId, result)
    if (targetWord) byWord.set(targetWord, result)
  }
  return (wordItems || []).map(item => {
    const source = byWordId.get(item.wordId) || byWord.get(cleanText(item.word, 80).toLowerCase()) || {}
    const deterministic = judgeWrittenWord({
      targetWord: item.word,
      recognizedText: source.recognizedText || source.answer || ''
    })
    const verdict = normalizeDictationVerdict(deterministic.status)
    return {
      queueKey: cleanText(item.queueKey, 120),
      wordId: cleanText(item.wordId, 80),
      targetWord: cleanText(item.word, 80),
      recognizedText: cleanText(source.recognizedText || source.answer || '', 120),
      verdict,
      reason: deterministic.reason || cleanText(source.reason, 200) || (verdict === 'unclear' ? 'AI 未返回可判断结果' : ''),
      confidence: Math.max(0, Math.min(1, Number(deterministic.confidence) || 0)),
      editDistance: Number(deterministic.editDistance) || 0
    }
  })
}

async function analyzeDictationPhoto(event) {
  const session = await getDocument('englishPracticeSessions', event.sessionId)
  if (!session) return fail('纸面听写记录不存在')
  // IDOR 防御：用 session 自身的 studentId 反查权限
  const ownerAuth = await authorizeResourceOwner(session.studentId, event.studentId, true)
  if (!ownerAuth.allowed) return fail(ownerAuth.error)
  if (session.functionType !== 'spelling') return fail('听写记录类型不匹配')
  const photoFileIds = (session.photoFileIds || [])
    .map(item => cleanText(item, 240))
    .filter(item => /^cloud:\/\//.test(item))
  if (photoFileIds.length === 0) return fail('缺少听写纸照片')

  const tempRes = await cloud.getTempFileURL({ fileList: photoFileIds })
  const imageUrls = (tempRes.fileList || [])
    .filter(item => item.tempFileURL)
    .map(item => item.tempFileURL)
  if (imageUrls.length === 0) return fail('听写纸照片暂时无法读取')

  const wordItems = session.wordItems || []
  const candidates = wordItems.map((item, index) => ({
    index: index + 1,
    wordId: item.wordId,
    targetWord: item.word,
    meanings: item.meanings || []
  }))
  const prompt = `请批改这份小学生英语纸面听写照片。只允许在候选词范围内判断，不要新增候选词以外的单词。

候选词 JSON：
${JSON.stringify(candidates)}

判定规则：
1. 逐个候选词输出结果，保持候选词数量和 wordId。
2. recognizedText 写照片中看到的学生拼写；空白或看不清则留空。
3. verdict 只能是 correct、incorrect、unclear。
4. 只有拼写完整且与 targetWord 一致才是 correct。
5. 看不清、空白、无法对应到题号时使用 unclear。
6. 返回严格 JSON，不要 markdown。

输出格式：
{
  "results": [
    {"wordId":"word-1","targetWord":"science","recognizedText":"science","verdict":"correct","confidence":0.98,"reason":"拼写正确"}
  ]
}`
  const ai = app.ai()
  const model = ai.createModel('cloudbase')

  // AI 用量记账（pending）——写入失败不阻断业务
  let eventId = null
  try {
    const ledgerOpenId = cloud.getWXContext().OPENID
    if (ledgerOpenId) {
      eventId = await recordUsageStart({
        db, openId: ledgerOpenId,
        eventType: 'dictation_grading',
        studentId: event.studentId || '',
        subject: 'english',
        sourceId: event.sessionId || '',
        sourceType: 'english_session',
        cloudFunction: 'englishVocabulary',
        model: 'hy3-preview',
        imageCount: imageUrls.length
      })
    }
  } catch (e) { console.error('[usage] recordUsageStart failed', e && e.message) }

  let result
  try {
    result = await model.generateText({
      model: 'hy3-preview',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          ...imageUrls.map(url => ({ type: 'image_url', image_url: { url } }))
        ]
      }],
      temperature: 0.1
    })
    if (eventId) {
      await recordUsageSuccess({
        db, eventId, usage: result && result.usage, outputText: result && result.text,
        model: 'hy3-preview', imageCount: imageUrls.length
      }).catch(e => console.error('[usage] recordUsageSuccess failed', e && e.message))
    }
  } catch (err) {
    if (eventId) {
      await recordUsageFailure({ db, eventId, errorMessage: err && err.message, model: 'hy3-preview', imageCount: imageUrls.length })
        .catch(e => console.error('[usage] recordUsageFailure failed', e && e.message))
    }
    throw err
  }
  const parsed = parseJsonText(result.text)
  const results = normalizeDictationOcrResults(parsed.results || [], wordItems)
  const words = await getCollectionData('studentEnglishWords', { studentId: event.studentId })
  const byId = new Map(words.map(item => [item._id, item]))
  const reviewedAt = event.reviewedAt || new Date()

  // 性能优化：并发写库（替代串行 for await），避免 40 词 × 数百毫秒逼近云函数超时
  const updateJobs = []
  for (const item of results) {
    const word = byId.get(item.wordId)
    if (!word || item.verdict === 'unclear') continue
    const updated = applyWordDimensionAttempt(word, 'spelling', {
      judgment: { status: item.verdict },
      reviewedAt
    })
    updateJobs.push(updateDocument('studentEnglishWords', word._id, {
      familiarity: updated.familiarity,
      spelling: updated.spelling,
      overallMastery: updated.overallMastery,
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
    analysisStatus: 'completed',
    dictationResults: results,
    analyzedAt: nowDate(),
    updatedAt: nowDate()
  })

  return ok({
    sessionId: event.sessionId,
    analysisStatus: 'completed',
    results
  })
}

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
  const words = await getCollectionData('studentEnglishWords', { studentId: event.studentId })
  const word = words.find(item => item._id === event.wordId)
  if (!word) return fail('单词不存在')
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

  if (judgment.status !== 'unclear') {
    const updated = applyWordDimensionAttempt(word, 'familiarity', {
      judgment,
      reviewedAt,
      direction
    })
    await updateDocument('studentEnglishWords', word._id, {
      familiarity: updated.familiarity,
      spelling: updated.spelling,
      overallMastery: updated.overallMastery,
      masteryStatus: updated.familiarity.status,
      correctCount: updated.familiarity.correctCount,
      wrongCount: updated.familiarity.wrongCount,
      lastReviewedAt: updated.familiarity.lastTestedAt,
      nextReviewAt: updated.familiarity.nextReviewAt,
      updatedAt: nowDate()
    })
    await markVocabularySummaryDirty(event.studentId)
  }

  const attempts = [...(session.attempts || []), attempt]
  await updateDocument('englishPracticeSessions', event.sessionId, {
    status: 'in_progress',
    attempts,
    updatedAt: nowDate()
  })

  return ok({
    judgment,
    shouldRepeat: judgment.status !== 'correct',
    attempt
  })
}

async function submitDictationAttempt(event) {
  const session = await getDocument('englishPracticeSessions', event.sessionId)
  if (!session) return fail('听写记录不存在')
  // IDOR 防御：用 session 自身的 studentId 反查权限
  const ownerAuth = await authorizeResourceOwner(session.studentId, event.studentId, true)
  if (!ownerAuth.allowed) return fail(ownerAuth.error)
  const words = await getCollectionData('studentEnglishWords', { studentId: event.studentId })
  const word = words.find(item => item._id === event.wordId)
  if (!word) return fail('单词不存在')

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

  if (judgment.status !== 'unclear') {
    const updated = applyWordDictationAttempt(word, {
      judgment,
      reviewedAt
    })
    await updateDocument('studentEnglishWords', word._id, {
      masteryStatus: updated.masteryStatus,
      correctCount: updated.correctCount,
      wrongCount: updated.wrongCount,
      lastReviewedAt: updated.lastReviewedAt,
      nextReviewAt: updated.nextReviewAt,
      updatedAt: nowDate()
    })
    await markVocabularySummaryDirty(event.studentId)
  }

  const attempts = [...(session.attempts || []), attempt]
  await updateDocument('englishPracticeSessions', event.sessionId, {
    status: 'in_progress',
    attempts,
    updatedAt: nowDate()
  })

  return ok({
    judgment,
    shouldRepeat: judgment.status !== 'correct',
    attempt
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
  // 性能优化：并发写库（替代串行 for await）
  const updateJobs = []
  for (const result of event.wordResults || []) {
    const word = byId.get(result.wordId)
    if (!word) continue
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
    wordResults: event.wordResults || [],
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
    const write = !['getVocabularySummary', 'listWords'].includes(action)
    const auth = await authorize(studentId, write)
    if (!auth.allowed) return fail('无权执行该操作')

    if (action === 'createImportBatch') return createImportBatch(event, auth.openId)
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
