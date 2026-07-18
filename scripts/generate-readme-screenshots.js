const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

function loadAutomator() {
  try {
    return require('miniprogram-automator')
  } catch (error) {
    return require('/tmp/learning-diagnostic-automator/node_modules/miniprogram-automator')
  }
}

const automator = loadAutomator()

const projectPath = path.resolve(__dirname, '..')
const cliPath = process.env.WECHAT_CLI_PATH || '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'
const outputDir = path.resolve(projectPath, 'docs/user-guide/images')
const allowedMockNames = Object.freeze(['学生示例', '孩子A', '家长A'])
const forbiddenNames = Object.freeze([
  '钟青羽',
  '钟筱雨',
  ...String(process.env.README_SCREENSHOT_FORBIDDEN_NAMES || '').split(',').map(value => value.trim()).filter(Boolean),
])
const sensitivePatterns = Object.freeze([
  /open_?id/i,
  /真实姓名|身份证|手机号|学校|班级|微信号|账号/,
  /cloud:\/\//i,
  /wxfile:\/\//i,
  /\b(?:LP|BN)-[A-Z0-9-]+\b/,
  /\b[0-9a-f]{24}\b/i,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  /\b1[3-9]\d{9}\b/,
  ...forbiddenNames.map(name => new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))),
])

const screenshots = [
  {
    id: '01-family-workbench',
    route: '/pages/index/index',
    wait: 2400,
  },
  {
    id: '02-student-profile',
    route: '/pages/student-profile/student-profile?studentId=student-demo',
    wait: 2200,
  },
  {
    id: '03-subject-workbench',
    route: '/pages/subject-home/subject-home?studentId=student-demo&subject=math&subjectName=%E6%95%B0%E5%AD%A6&studentName=%E5%AD%A6%E7%94%9F%E7%A4%BA%E4%BE%8B&grade=6',
    wait: 1800,
  },
  {
    id: '04-report',
    route: '/pages/report/report?reportId=report-demo',
    wait: 1800,
  },
  {
    id: '05-generate-verification',
    route: '/pages/generate-verification/generate-verification?studentId=student-demo&subject=math&subjectName=%E6%95%B0%E5%AD%A6&studentName=%E5%AD%A6%E7%94%9F%E7%A4%BA%E4%BE%8B',
    wait: 1800,
  },
  {
    id: '06-paper-preview',
    route: '/pages/paper-preview/paper-preview?paperId=paper-demo',
    wait: 1800,
  },
  {
    id: '07-learning-records',
    route: '/pages/upload-history/upload-history?studentId=student-demo&studentName=%E5%AD%A6%E7%94%9F%E7%A4%BA%E4%BE%8B',
    wait: 1800,
  },
  {
    id: '08-parent-management',
    route: '/pages/parent-management/parent-management?studentId=student-demo',
    wait: 1800,
  },
  { id: '09-chinese-workbench', route: '/pages/subject-home/subject-home?studentId=student-demo&subject=chinese&subjectName=%E8%AF%AD%E6%96%87&studentName=%E5%AD%A6%E7%94%9F%E7%A4%BA%E4%BE%8B&grade=6', wait: 1800 },
  { id: '10-chinese-review-detail', route: '/pages/chinese-review-detail/chinese-review-detail?studentId=student-demo&reviewItemId=demo-bianlun', wait: 1500 },
  { id: '11-chinese-skill-task', route: '/pages/chinese-skill-task/chinese-skill-task?studentId=student-demo', wait: 1500 },
  { id: '12-english-workbench', route: '/pages/subject-home/subject-home?studentId=student-demo&subject=english&subjectName=%E8%8B%B1%E8%AF%AD&studentName=%E5%AD%A6%E7%94%9F%E7%A4%BA%E4%BE%8B&grade=6', wait: 1800 },
  { id: '13-english-confusion', route: '/pages/english-confusion/english-confusion?studentId=student-demo', wait: 1500 },
  { id: '14-english-wrong-words', route: '/pages/english-wrong-words/english-wrong-words?studentId=student-demo', wait: 1500 },
]

const selectedScreenshotIds = new Set(String(process.env.README_SCREENSHOT_IDS || '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean))

async function optimizeScreenshot(filePath) {
  try {
    const sharp = require('sharp')
    await sharp(filePath)
      .resize({ width: 390 })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(`${filePath}.tmp`)
    fs.renameSync(`${filePath}.tmp`, filePath)
  } catch (error) {
    try {
      execFileSync('sips', ['-z', '753', '390', filePath], { stdio: 'ignore' })
    } catch (sipsError) {
      // sharp and sips are optional. If neither is available, keep the original
      // DevTools screenshot so this script still works in a clean environment.
    }
  }
}

async function installCloudMocks(miniProgram) {
  await miniProgram.evaluate(() => {
    const now = '2026-06-14T20:03:00+08:00'
    const ownerPermissions = {
      canView: true,
      canManageParents: true,
      canUpload: true,
      canGeneratePaper: true,
      canRetryAnalysis: true,
    }
    const viewerPermissions = {
      canView: true,
      canManageParents: false,
      canUpload: true,
      canGeneratePaper: true,
      canRetryAnalysis: true,
    }
    const student = {
      _id: 'student-demo',
      name: '学生示例',
      grade: 6,
      avatarColor: '#2f80ed',
      updatedAt: now,
    }
    const secondStudent = {
      _id: 'student-demo-2',
      name: '孩子A',
      grade: 3,
      avatarColor: '#2fc6a8',
      updatedAt: '2026-06-14T18:10:00+08:00',
    }
    const subjectProfiles = [
      {
        _id: 'profile-math',
        studentId: student._id,
        subject: 'math',
        subjectName: '数学',
        totalReports: 3,
        updatedAt: now,
        currentSummary: '数学学习线索已形成，当前建议优先复测计算基础和审题理解。',
        currentBottlenecks: [
          {
            lpCode: 'LP-001',
            lpName: '计算基础',
            subject: 'math',
            status: 'persisting',
            trend: 'persisting',
            severity: 'high',
            weight: 86,
            evidenceCount: 3,
            recentErrorCount: 9,
            firstSeenAt: '2026-06-12T09:24:00+08:00',
            lastSeenAt: now,
          },
          {
            lpCode: 'LP-008',
            lpName: '审题理解',
            subject: 'math',
            status: 'needs_verification',
            trend: 'new',
            severity: 'medium',
            weight: 62,
            evidenceCount: 2,
            recentErrorCount: 4,
            firstSeenAt: '2026-06-12T09:24:00+08:00',
            lastSeenAt: now,
          },
        ],
        pendingBottlenecks: [
          { lpCode: 'LP-001', lpName: '计算基础', severity: 'high', sinceDate: '2026-06-12T09:24:00+08:00' },
          { lpCode: 'LP-008', lpName: '审题理解', severity: 'medium', sinceDate: '2026-06-12T09:24:00+08:00' },
        ],
        improvedBottlenecks: [
          { lpCode: 'LP-005', lpName: '分数计算', improvedDate: '2026-06-14T10:06:00+08:00' },
        ],
      },
      {
        _id: 'profile-chinese',
        studentId: student._id,
        subject: 'chinese',
        subjectName: '语文',
        totalReports: 1,
        updatedAt: now,
        chineseReviewItems: [{ itemId: 'demo-bianlun', itemType: 'word', targetText: '辩论', lastWrongAnswer: '辨论', mistakeType: '形近字混淆', sourceContext: '看拼音写词语', status: 'needs_review', reviewPassCount: 0, evidenceCount: 1, suggestion: '记住“辩”与说话、争论有关。' }],
        currentBottlenecks: [{ lpCode: 'LP-201', lpName: '回原文找依据', status: 'needs_verification', errorCount: 1 }],
        pendingBottlenecks: [{ lpCode: 'LP-201', lpName: '回原文找依据', severity: 'medium' }],
        improvedBottlenecks: [],
      },
      {
        _id: 'profile-english',
        studentId: student._id,
        subject: 'english',
        subjectName: '英语',
        totalReports: 0,
        updatedAt: '',
        currentBottlenecks: [],
        pendingBottlenecks: [],
        improvedBottlenecks: [],
      },
    ]
    const secondSubjectProfiles = [
      {
        _id: 'profile-second-math',
        studentId: secondStudent._id,
        subject: 'math',
        subjectName: '数学',
        totalReports: 0,
        currentBottlenecks: [],
        pendingBottlenecks: [],
        improvedBottlenecks: [],
      },
    ]
    const reports = [
      {
        _id: 'report-demo',
        studentId: student._id,
        studentName: student.name,
        subject: 'math',
        type: 'diagnosis',
        status: 'completed',
        createdAt: now,
        evidenceTime: now,
        summary: '本次样本中计算基础再次出现，审题理解仍需继续观察。',
        totalErrors: 9,
        bottlenecks: [
          {
            lpCode: 'LP-001',
            lpName: '计算基础',
            errorCount: 6,
            severity: 'high',
            rootCause: '多位数计算和运算顺序容易混在一起，需要通过纸笔过程继续验证。',
            suggestion: '先用短题复测计算基础，再加入迁移题观察稳定性。',
          },
          {
            lpCode: 'LP-008',
            lpName: '审题理解',
            errorCount: 3,
            severity: 'medium',
            rootCause: '题目条件较多时容易漏看限制条件。',
            suggestion: '做题前先圈出关键条件，并在解题区写出数量关系。',
          },
        ],
        errorDetails: [
          {
            questionContent: '计算：456 × 23 - 780 ÷ 6',
            studentAnswer: '示例答案',
            correctAnswer: '示例正确答案',
            lpCode: 'LP-001',
            rootCause: '运算顺序和中间计算需要进一步确认。',
            suggestion: '保留竖式和验算过程。',
          },
        ],
        imageFiles: [
          {
            fileID: 'cloud://mock/demo-paper-01.jpg',
            fileName: '匿名数学试卷-01.jpg',
            ocrSummary: '匿名样例：包含计算题、应用题和老师批改痕迹。',
            isDuplicate: false,
            uploadedAt: now,
          },
        ],
        isEffective: true,
        changeSummary: '计算基础再次出现',
      },
      {
        _id: 'report-chinese-demo',
        studentId: student._id,
        studentName: student.name,
        subject: 'chinese',
        type: 'diagnosis',
        status: 'completed',
        createdAt: '2026-06-14T19:40:00+08:00',
        evidenceTime: '2026-06-14T19:40:00+08:00',
        summary: '字词原项需要复测，阅读题继续练习回原文找依据。',
        totalErrors: 3,
        bottlenecks: [
          {
            lpCode: 'LP-201',
            lpName: '回原文找依据',
            errorCount: 2,
            severity: 'medium',
            rootCause: '回答阅读题时，关键依据没有完整回到原文核对。',
            suggestion: '先圈出题干关键词，再在原文标记对应句。',
          },
        ],
        chineseErrorItems: [
          {
            itemId: 'demo-bianlun',
            itemType: 'word',
            targetText: '辩论',
            studentAnswer: '辨论',
            mistakeType: '形近字混淆',
          },
        ],
        imageFiles: [
          {
            fileID: 'cloud://mock/demo-chinese-paper-01.jpg',
            fileName: '匿名语文练习-01.jpg',
            ocrSummary: '匿名样例：包含字词辨析和阅读理解。',
            isDuplicate: false,
            uploadedAt: '2026-06-14T19:40:00+08:00',
          },
        ],
        isEffective: true,
        changeSummary: '新增字词原项复测',
      },
      {
        _id: 'verification-report-demo',
        studentId: student._id,
        studentName: student.name,
        subject: 'math',
        type: 'verification',
        status: 'completed',
        paperId: 'paper-demo',
        createdAt: '2026-06-14T21:08:00+08:00',
        evidenceTime: '2026-06-14T21:08:00+08:00',
        comparisonSummary: '计算基础已有改善，审题理解仍需继续观察。',
        verificationEvidence: [
          { lpCode: 'LP-001', expectedQuestionCount: 5, attemptedQuestionCount: 5, incorrectQuestionCount: 0, complete: true, allCorrect: true },
          { lpCode: 'LP-008', expectedQuestionCount: 5, attemptedQuestionCount: 5, incorrectQuestionCount: 2, complete: true, allCorrect: false },
        ],
        imageFiles: [
          {
            fileID: 'cloud://mock/demo-answer-01.jpg',
            fileName: '匿名验证卷作答-01.jpg',
            ocrSummary: '匿名样例：验证卷作答照片，含完整演算过程。',
            isDuplicate: false,
            uploadedAt: '2026-06-14T21:08:00+08:00',
          },
        ],
        isEffective: true,
      },
    ]
    const papers = [
      {
        _id: 'paper-demo',
        studentId: student._id,
        subject: 'math',
        type: 'verification',
        title: '数学学习卡点验证卷',
        paperCode: 'MATH-20260614-01',
        paperDisplayCode: '数学-20260614-01',
        paperDate: '2026-06-14',
        createdAt: '2026-06-14T20:20:00+08:00',
        generatedAt: '2026-06-14T20:20:00+08:00',
        bottleneckTargets: ['LP-001', 'LP-008'],
        bottleneckSummaries: ['计算基础', '审题理解'],
        questions: [
          { index: 1, content: '计算：456 × 23 - 780 ÷ 6 =', answer: '示例答案', lpCode: 'LP-001', lpName: '计算基础' },
          { index: 2, content: '一个书架有 6 层，每层放 48 本书，已经借出 79 本，还剩多少本？', answer: '示例答案', lpCode: 'LP-008', lpName: '审题理解' },
          { index: 3, content: '用简便方法计算：25 × 32 × 125 =', answer: '示例答案', lpCode: 'LP-001', lpName: '计算基础' },
          { index: 4, content: '读题后写出数量关系，再列式。', answer: '示例答案', lpCode: 'LP-008', lpName: '审题理解' },
          { index: 5, content: '迁移题：先估算，再精算。', answer: '示例答案', lpCode: 'LP-001', lpName: '计算基础' },
          { index: 6, content: '迁移题：补全条件后解答。', answer: '示例答案', lpCode: 'LP-008', lpName: '审题理解' },
        ],
        questionCount: 10,
        studentPages: 1,
        answerPages: 1,
        totalPages: 2,
        pdfFileId: 'cloud://mock/demo-paper.pdf',
      },
    ]
    const members = [
      {
        studentId: student._id,
        ownerOpenId: 'owner-openid',
        memberOpenId: 'owner-openid',
        role: 'owner',
        status: 'active',
        displayName: '家长A',
        relation: '妈妈',
        createdAt: now,
      },
      {
        studentId: student._id,
        ownerOpenId: 'owner-openid',
        memberOpenId: 'viewer-openid',
        role: 'viewer',
        status: 'active',
        displayName: '家长B',
        relation: '爸爸',
        createdAt: now,
      },
    ]

    const allStudents = [student, secondStudent]
    const allProfiles = [...subjectProfiles, ...secondSubjectProfiles]

    const matchesFilter = (item, filter = {}) => {
      if (!filter || Object.keys(filter).length === 0) return true
      return Object.keys(filter).every(key => item[key] === filter[key])
    }

    wx.cloud.callFunction = async ({ name, data = {} }) => {
      if (name === 'studentAccess') {
        if (data.action === 'getAccessibleStudents') {
          return {
            result: {
              success: true,
              students: [
                { ...student, role: 'owner', permissions: ownerPermissions },
                { ...secondStudent, role: 'owner', permissions: ownerPermissions },
              ],
            },
          }
        }
        if (data.action === 'listMembers') {
          return { result: { success: true, student, role: 'owner', permissions: ownerPermissions, members } }
        }
        if (data.action === 'createInvite') {
          return {
            result: {
              success: true,
              inviteId: 'invite-demo',
              token: 'masked-token',
              inviteCode: 'DEMO2026',
              path: '/pages/join-student/join-student?inviteId=invite-demo&token=masked-token',
              role: 'viewer',
              expiresAt: '2026-06-21T20:03:00+08:00',
            },
          }
        }
      }

      if (name === 'studentData') {
        if (data.action === 'getChineseSkillTask') return { result: { success: true, task: { id: 'find-evidence', title: '回原文找依据', method: '先圈出原文里支持答案的句子，再写一句理由。', prompt: '小明把雨伞借给同学。你从哪句话看出他乐于帮助别人？' } } }
        if (data.action === 'submitChineseSkillTask') return { result: { success: true, evidenceStatus: 'passed' } }
        if (data.action === 'getStudentDashboard') {
          if (data.studentId === secondStudent._id) {
            return {
              result: {
                success: true,
                student: secondStudent,
                permissions: ownerPermissions,
                subjectProfiles: secondSubjectProfiles,
                recentReports: [],
                recentPapers: [],
              },
            }
          }
          return {
            result: {
              success: true,
              student,
              role: 'owner',
              permissions: ownerPermissions,
              subjectProfiles,
              latestReport: reports[0],
              latestPaper: papers[0],
              recentReports: reports,
              recentPapers: papers,
            },
          }
        }
        if (data.action === 'getSubjectDashboard') {
          return {
            result: {
              success: true,
              student,
              role: 'owner',
              permissions: ownerPermissions,
              profile: subjectProfiles.find(item => item.subject === data.subject) || subjectProfiles[0],
              reports,
              papers,
            },
          }
        }
        if (data.action === 'getLearningTimeline') {
          return {
            result: {
              success: true,
              student,
              role: 'owner',
              permissions: ownerPermissions,
              reports,
              papers,
            },
          }
        }
        if (data.action === 'getReportDetail') {
          const report = reports.find(item => item._id === data.reportId) || reports[0]
          const linkedPaper = report.paperId ? papers.find(item => item._id === report.paperId) : null
          return {
            result: {
              success: true,
              student,
              role: 'owner',
              permissions: ownerPermissions,
              report,
              linkedPaper,
            },
          }
        }
        if (data.action === 'getPaperDetail') {
          return {
            result: {
              success: true,
              student,
              role: 'owner',
              permissions: ownerPermissions,
              paper: papers[0],
              latestVerificationReport: reports.find(item => item.type === 'verification') || null,
            },
          }
        }
      }

      if (name === 'englishVocabulary') {
        if (data.action === 'getVocabularySummary') return { result: { success: true, summary: { totalWords: 120, familiarity: { needsPracticeCount: 4, dueReviewCount: 2, masteredCount: 50 }, spelling: { needsPracticeCount: 3, dueReviewCount: 1 }, overall: { masteredCount: 38 } }, weakWords: [{ wordId: 'there', word: 'there', meanings: ['那里'], wrongCount: 2 }], patternCount: 1 } }
        if (data.action === 'getTodayPlan') return { result: { success: true, primaryAction: { kind: 'dictation', taskSize: 6, title: '先听写 6 个会认不会写的单词', estimatedMinutes: 8 } } }
        if (data.action === 'getConfusionPractice') return { result: { success: true, items: [{ relationId: 'there-their', words: ['there', 'their'], explanation: 'there 表示“那里”；their 表示“他们的”。', prompt: 'This is ___ classroom.', answer: 'their' }] } }
      }

      return { result: { success: false, error: `unhandled mock call ${name}:${data.action}` } }
    }

    wx.cloud.database = () => ({
      collection(name) {
        return {
          where(filter) {
            return {
              orderBy() { return this },
              limit() { return this },
              async get() {
                if (name === 'students') return { data: allStudents.filter(item => matchesFilter(item, filter)) }
                if (name === 'subjectProfiles') return { data: allProfiles.filter(item => matchesFilter(item, filter)) }
                if (name === 'reports') return { data: reports.filter(item => matchesFilter(item, filter)) }
                if (name === 'papers') return { data: papers.filter(item => matchesFilter(item, filter)) }
                return { data: [] }
              },
            }
          },
          async add({ data }) {
            return { _id: `${name}-demo-${Date.now()}`, data }
          },
          doc(id) {
            return {
              async get() {
                if (name === 'students') return { data: allStudents.find(item => item._id === id) || student }
                if (name === 'subjectProfiles') return { data: allProfiles.find(item => item._id === id) || subjectProfiles[0] }
                if (name === 'reports') return { data: reports.find(item => item._id === id) || reports[0] }
                if (name === 'papers') return { data: papers.find(item => item._id === id) || papers[0] }
                return { data: null }
              },
            }
          },
          orderBy() { return this },
          limit() { return this },
          async get() {
            if (name === 'students') return { data: allStudents }
            if (name === 'subjectProfiles') return { data: allProfiles }
            if (name === 'reports') return { data: reports }
            if (name === 'papers') return { data: papers }
            return { data: [] }
          },
        }
      },
      serverDate() { return new Date() },
    })

    wx.cloud.getTempFileURL = async ({ fileList }) => ({
      fileList: (fileList || []).map(fileID => ({
        fileID,
        tempFileURL: '/assets/images/app-logo-share.jpg',
      })),
    })
    wx.cloud.downloadFile = async () => ({ tempFilePath: '/tmp/demo.pdf' })
  })
}

async function relaunch(miniProgram, route, waitMs) {
  const page = await miniProgram.reLaunch(route)
  await page.waitFor(waitMs)
  return page
}

async function assertNoSensitiveText(page, id) {
  const root = await page.$('.page')
  if (!root) return
  const text = await root.text()
  for (const pattern of sensitivePatterns) {
    if (pattern.test(text)) {
      throw new Error(`sensitive or internal text ${pattern} found in screenshot page ${id}`)
    }
  }
}

function assertSafeRoute(item) {
  const decodedRoute = decodeURIComponent(item.route)
  for (const pattern of sensitivePatterns) {
    if (pattern.test(decodedRoute)) throw new Error(`sensitive or internal route value found for screenshot ${item.id}`)
  }
  const studentName = new URL(`https://mock.invalid${item.route}`).searchParams.get('studentName')
  if (studentName && !allowedMockNames.includes(studentName)) {
    throw new Error(`unapproved mock name "${studentName}" found in screenshot route ${item.id}`)
  }
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true })

  const miniProgram = await automator.launch({
    cliPath,
    projectPath,
    trustProject: true,
    timeout: 60000,
  })

  try {
    await installCloudMocks(miniProgram)

    const outputs = []
    for (const item of screenshots.filter(item => selectedScreenshotIds.size === 0 || selectedScreenshotIds.has(item.id))) {
      assertSafeRoute(item)
      const page = await relaunch(miniProgram, item.route, item.wait)
      await assertNoSensitiveText(page, item.id)
      const outputPath = path.join(outputDir, `${item.id}.png`)
      await miniProgram.screenshot({ path: outputPath })
      await optimizeScreenshot(outputPath)
      outputs.push(path.relative(projectPath, outputPath))
      console.log(`saved ${path.relative(projectPath, outputPath)}`)
    }

    console.log(JSON.stringify({ success: true, outputs }, null, 2))
  } finally {
    await miniProgram.close()
  }
}

main().catch(error => {
  console.error(error && (error.stack || error.message || String(error)))
  process.exit(1)
})
