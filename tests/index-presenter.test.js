const test = require('node:test')
const assert = require('node:assert/strict')

const { buildLearningProfileHomeView } = require('../miniprogram/pages/index/index-presenter')
const { buildChildWorkbenchCards, buildFamilyWorkbenchHero } = require('../miniprogram/utils/child-workbench')

const relative = () => '今天'

test('child workbench cards combine pending actions and subject rows for multiple children', () => {
  const cards = buildChildWorkbenchCards({
    students: [{
      _id: 'student-1',
      name: '钟青羽',
      grade: 6,
      memberCount: 2,
      role: 'owner'
    }, {
      _id: 'student-2',
      name: '弟弟',
      grade: 3,
      role: 'viewer'
    }],
    profilesByStudentId: {
      'student-1': [{
        subject: 'math',
        totalReports: 2,
        hidden: false,
        updatedAt: '2026-06-12T10:00:00+08:00',
        currentBottlenecks: [
          { lpCode: 'LP-001', status: 'needs_verification' },
          { lpCode: 'LP-008', status: 'persisting' },
          { lpCode: 'LP-009', status: 'improved' }
        ]
      }, {
        subject: 'chinese',
        hidden: true
      }]
    },
    reportsByStudentId: {
      'student-1': [{
        _id: 'report-1',
        subject: 'math',
        status: 'completed',
        type: 'diagnosis',
        createdAt: '2026-06-12T11:00:00+08:00',
        bottlenecks: [{ lpCode: 'LP-001' }, { lpCode: 'LP-008' }],
        imageFiles: [{ fileID: 'cloud://a' }]
      }]
    },
    papersByStudentId: {
      'student-1': [{
        _id: 'paper-1',
        subject: 'math',
        type: 'verification',
        paperDisplayCode: '数学-20260612-04',
        createdAt: '2026-06-12T12:00:00+08:00',
        questions: [{}, {}, {}, {}, {}, {}],
        bottleneckSummaries: ['计算基础', '审题理解']
      }]
    }
  }, relative)

  assert.equal(cards.length, 2)
  assert.equal(cards[0].name, '钟青羽')
  assert.equal(cards[0].statusItems.find(item => item.key === 'pendingVerification').value, '2')
  assert.equal(cards[0].statusItems.find(item => item.key === 'pendingUpload').value, '1')
  assert.equal(cards[0].statusItems.find(item => item.key === 'improved').value, '1')
  assert.equal(cards[0].subjectRows[0].name, '数学')
  assert.equal(cards[0].subjectRows[0].summary, '计算基础、审题理解')
  assert.equal(cards[0].subjectRows[1].statusText, '隐藏')
  assert.equal(cards[0].nextAction.title, '下一步')
  assert.match(cards[0].nextAction.url, /paper-preview\/paper-preview/)
  assert.match(cards[0].nextAction.url, /paperId=paper-1/)
  assert.match(cards[0].profileUrl, /pages\/student-profile\/student-profile/)
  assert.match(cards[0].profileUrl, /studentId=student-1/)

  assert.equal(cards[1].name, '弟弟')
  assert.equal(cards[1].roleText, '共同家长')
  assert.equal(cards[1].statusText, '无待办')
})

test('child workbench latest paper summary stays compact when many targets are covered', () => {
  const bottleneckSummaries = Array.from({ length: 26 }, (_, index) => `训练点${index + 1}`)
  const cards = buildChildWorkbenchCards({
    students: [{ _id: 'student-1', name: '钟青羽', grade: 6 }],
    papersByStudentId: {
      'student-1': [{
        _id: 'paper-many-targets',
        subject: 'math',
        type: 'verification',
        paperDisplayCode: '数学-20260620-01',
        createdAt: '2026-06-20T10:00:00+08:00',
        questions: Array.from({ length: 59 }, () => ({})),
        bottleneckSummaries
      }]
    }
  }, relative)

  assert.equal(cards[0].latestValue.summary, '编号 数学-20260620-01 · 59 题 · 覆盖 26 个训练点')
  assert.equal(cards[0].latestValue.summary.includes('训练点1、训练点2、训练点3'), false)
})

test('family child workbench sorts Qingyu before Xiaoyu and other children', () => {
  const cards = buildChildWorkbenchCards({
    students: [{
      _id: 'student-xiaoyu',
      name: '钟筱雨',
      grade: 2,
      createdAt: '2026-06-20T09:00:00+08:00'
    }, {
      _id: 'student-other',
      name: '小明',
      grade: 4,
      createdAt: '2026-06-20T10:00:00+08:00'
    }, {
      _id: 'student-qingyu',
      name: '钟青羽',
      grade: 6,
      createdAt: '2026-06-19T10:00:00+08:00'
    }]
  }, relative)

  assert.deepEqual(cards.map(card => card.name), ['钟青羽', '钟筱雨', '小明'])
})

test('family child card exposes actionable dashboard sections without long verification text', () => {
  const longSummaries = [
    '小数乘法中小数位数累计规则不稳',
    '除数是小数的除法中被除数小数点移动规则不熟练',
    '小数除法商与补零规则不熟练',
    '异分母分数加减法通分规则不熟练',
    '面积单位换算进率记忆不稳'
  ]
  const cards = buildChildWorkbenchCards({
    students: [{
      _id: 'student-1',
      name: '钟青羽',
      grade: 6,
      createdAt: '2026-06-19T10:00:00+08:00'
    }],
    profilesByStudentId: {
      'student-1': [{
        subject: 'math',
        totalReports: 3,
        updatedAt: '2026-06-20T10:00:00+08:00',
        currentBottlenecks: [
          { lpCode: 'LP-001', lpName: '计算基础', status: 'needs_verification' },
          { lpCode: 'LP-004', lpName: '面积单位换算', status: 'persisting' },
          { lpCode: 'LP-002', lpName: '分数运算', status: 'needs_verification' }
        ]
      }, {
        subject: 'chinese',
        totalReports: 1,
        updatedAt: '2026-06-20T09:00:00+08:00',
        currentBottlenecks: [
          { lpCode: 'LP-104', lpName: '拼音笔顺', status: 'needs_verification' },
          { lpCode: 'LP-101', lpName: '识字词语', status: 'needs_verification' }
        ]
      }, {
        subject: 'english',
        totalReports: 0,
        currentBottlenecks: []
      }]
    },
    reportsByStudentId: {
      'student-1': [{
        _id: 'report-1',
        subject: 'math',
        type: 'diagnosis',
        status: 'completed',
        isEffective: true,
        createdAt: '2026-06-20T08:00:00+08:00',
        summary: '数学完整诊断报告'
      }]
    },
    papersByStudentId: {
      'student-1': [{
        _id: 'paper-1',
        subject: 'math',
        type: 'verification',
        paperDisplayCode: '数学-20260620-01',
        createdAt: '2026-06-20T11:00:00+08:00',
        totalPages: 17,
        questions: Array.from({ length: 59 }, () => ({})),
        bottleneckSummaries: longSummaries
      }]
    }
  }, relative)

  const card = cards[0]
  assert.equal(card.priorityAction.title, '上传数学验证卷作答照片')
  assert.equal(card.priorityAction.actionText, '进入试卷')
  assert.match(card.priorityAction.url, /pages\/paper-preview\/paper-preview/)
  assert.match(card.priorityAction.summary, /数学-20260620-01/)
  assert.match(card.priorityAction.summary, /17页/)
  assert.match(card.priorityAction.summary, /59题/)
  assert.doesNotMatch(card.priorityAction.summary, /小数乘法中小数位数累计规则不稳/)

  assert.deepEqual(card.secondaryActions.map(item => item.subject), ['chinese', 'english'])
  assert.ok(card.secondaryActions.every(item => item.url))

  assert.deepEqual(card.quickLinks.map(item => item.key), [
    'latestReport',
    'currentPaper',
    'knowledgeMap',
    'learningRecords'
  ])
  assert.ok(card.quickLinks.every(item => item.url))
  assert.equal(card.quickLinks.find(item => item.key === 'currentPaper').summary, '数学-20260620-01 · 17页 · 59题')

  assert.equal(card.subjectRows[0].summary, '计算基础、面积单位换算、分数运算')
  assert.equal(card.subjectRows[1].summary, '拼音笔顺、识字词语')
  assert.equal(card.subjectRows[2].summary, '未开始，可从认词练习进入')
  assert.ok(card.subjectRows.every(item => item.url))
})

test('family workbench hero turns the household overview into a real action entry', () => {
  const cards = buildChildWorkbenchCards({
    students: [{
      _id: 'student-qingyu',
      name: '钟青羽',
      grade: 6
    }, {
      _id: 'student-xiaoyu',
      name: '钟筱雨',
      grade: 2
    }],
    profilesByStudentId: {
      'student-qingyu': [{
        subject: 'math',
        currentBottlenecks: [
          { lpCode: 'LP-001', lpName: '计算基础', status: 'needs_verification' },
          { lpCode: 'LP-004', lpName: '面积单位换算', status: 'persisting' }
        ]
      }]
    }
  }, relative)

  const hero = buildFamilyWorkbenchHero(cards)

  assert.equal(hero.imageSrc, '/assets/images/math-diagnostic-guide.jpg')
  assert.match(hero.title, /钟青羽/)
  assert.match(hero.summary, /2 个学习卡点/)
  assert.equal(hero.actionText, '处理今日优先行动')
  assert.match(hero.url, /pages\/generate-verification\/generate-verification|pages\/subject-home\/subject-home/)
  assert.deepEqual(hero.stats.map(item => item.label), ['孩子', '待办', '待验证'])
})

test('child workbench cards put sixth-grade Qingyu before Xiaoyu regardless source order', () => {
  const cards = buildChildWorkbenchCards({
    students: [{
      _id: 'student-xiaoyu',
      name: '钟筱雨',
      grade: 2,
      createdAt: '2026-06-20T10:00:00+08:00'
    }, {
      _id: 'student-qingyu',
      name: '钟青宇',
      grade: 6,
      createdAt: '2026-06-19T10:00:00+08:00'
    }]
  }, relative)

  assert.deepEqual(cards.map(card => card.name), ['钟青宇', '钟筱雨'])
})

test('learning profile home summarizes a math-only diagnosis', () => {
  const view = buildLearningProfileHomeView({
    student: { _id: 'student-1', name: '钟青羽', grade: 6 },
    profiles: [{
      subject: 'math',
      subjectName: '数学',
      totalReports: 1,
      updatedAt: '2026-06-12T14:20:00+08:00',
      currentBottlenecks: [
        { lpCode: 'LP-001', lpName: '计算错误（加减乘除）', status: 'needs_verification' },
        { lpCode: 'LP-008', lpName: '审题错误', status: 'needs_verification' }
      ]
    }, {
      subject: 'chinese',
      subjectName: '语文',
      totalReports: 0,
      currentBottlenecks: []
    }, {
      subject: 'english',
      subjectName: '英语',
      totalReports: 0,
      currentBottlenecks: []
    }],
    reports: [{
      _id: 'report-1',
      subject: 'math',
      type: 'diagnosis',
      status: 'completed',
      isEffective: true,
      createdAt: '2026-06-12T14:20:00+08:00',
      imageFiles: [{ fileID: 'cloud://a' }, { fileID: 'cloud://b' }],
      bottlenecks: [
        { lpCode: 'LP-001', lpName: '计算错误（加减乘除）' },
        { lpCode: 'LP-008', lpName: '审题错误' }
      ]
    }],
    papers: []
  }, relative)

  assert.equal(view.studentName, '钟青羽')
  assert.equal(view.gradeText, '6年级')
  assert.equal(view.headline, '数学学习线索已形成，其他学科仍待补充样本')
  assert.equal(view.sampleCoverageText, '样本覆盖：已分析数学试卷；语文、英语暂无有效诊断记录。')
  assert.deepEqual(view.metrics.map(item => [item.label, item.value]), [
    ['待验证', '2'],
    ['有效报告', '1'],
    ['最近更新', '今天']
  ])
  assert.equal(view.priorityHighlights[0].title, '数学有 2 个学习卡点待验证')
  assert.equal(view.priorityHighlights[0].summary, '重点关注：计算基础、审题理解')
  assert.equal(view.priorityHighlights[0].actionText, '进入数学工作台')
  assert.equal(view.recentRecords[0].kind, 'diagnosis-report')
  assert.equal(view.recentRecords[0].title, '数学诊断报告')
  assert.equal(view.recentRecords[0].summary, '今天 · 发现 2 条学习观察')
  assert.equal(view.recentRecords[0].metaText, '关注 计算基础、审题理解 · 诊断结果')
  assert.equal(view.nextAction.primaryText, '生成纸面验证卷')
  assert.deepEqual(view.subjects.map(item => [item.name, item.statusText]), [
    ['数学', '已有观察'],
    ['语文', '待采样'],
    ['英语', '待采样']
  ])
  assert.equal(view.isEmpty, false)
})

test('learning profile home surfaces the latest effective report as a primary report card', () => {
  const view = buildLearningProfileHomeView({
    student: { _id: 'student-1', name: '钟青羽', grade: 6 },
    profiles: [{
      subject: 'math',
      totalReports: 2,
      currentBottlenecks: [
        { lpCode: 'LP-001', lpName: '计算错误（加减乘除）', status: 'needs_verification' },
        { lpCode: 'LP-008', lpName: '审题错误', status: 'needs_verification' }
      ]
    }],
    reports: [{
      _id: 'report-old',
      subject: 'math',
      type: 'diagnosis',
      status: 'completed',
      createdAt: '2026-06-11T10:00:00+08:00',
      bottlenecks: [{ lpCode: 'LP-001', lpName: '计算错误（加减乘除）' }],
      imageFiles: [{ fileID: 'cloud://old-photo' }]
    }, {
      _id: 'report-latest',
      subject: 'math',
      type: 'diagnosis',
      status: 'completed',
      isEffective: true,
      createdAt: '2026-06-12T09:30:00+08:00',
      evidenceTime: '2026-06-12T09:10:00+08:00',
      summary: '发现计算基础和审题理解两个学习卡点',
      totalErrors: 5,
      bottlenecks: [
        { lpCode: 'LP-001', lpName: '计算错误（加减乘除）' },
        { lpCode: 'LP-008', lpName: '审题错误' }
      ],
      imageFiles: [{ fileID: 'cloud://a' }, { fileID: 'cloud://b' }]
    }],
    papers: []
  }, relative)

  assert.equal(view.primaryReport.reportId, 'report-latest')
  assert.equal(view.primaryReport.title, '最新数学诊断报告')
  assert.equal(view.primaryReport.summary, '发现计算基础和审题理解两个学习卡点')
  assert.equal(view.primaryReport.generatedAtText, '2026年6月12日 9:30')
  assert.equal(view.primaryReport.evidenceTimeText, '2026年6月12日 9:10')
  assert.equal(view.primaryReport.findingText, '共发现 5 道相关错题，主要卡点：计算基础、审题理解')
  assert.equal(view.primaryReport.bottleneckText, '计算基础、审题理解')
  assert.equal(view.primaryReport.evidenceText, '2 张照片 · 5 道相关错题')
  assert.deepEqual(view.primaryReport.infoRows, [
    { label: '报告生成', value: '2026年6月12日 9:30' },
    { label: '证据时间', value: '2026年6月12日 9:10' }
  ])
  assert.equal(view.primaryReport.actionText, '阅读完整报告')
})

test('learning profile home exposes an actionable personal workbench contract', () => {
  const view = buildLearningProfileHomeView({
    student: { _id: 'student-1', name: '钟青羽', grade: 6 },
    profiles: [{
      subject: 'math',
      totalReports: 2,
      updatedAt: '2026-06-20T10:00:00+08:00',
      currentBottlenecks: [
        { lpCode: 'LP-001', lpName: '计算错误（加减乘除）', status: 'needs_verification' },
        { lpCode: 'LP-008', lpName: '审题错误', status: 'persisting' }
      ]
    }, {
      subject: 'chinese',
      totalReports: 1,
      currentBottlenecks: []
    }, {
      subject: 'english',
      totalReports: 0,
      currentBottlenecks: []
    }],
    reports: [{
      _id: 'report-latest',
      subject: 'math',
      type: 'diagnosis',
      status: 'completed',
      isEffective: true,
      createdAt: '2026-06-20T09:30:00+08:00',
      summary: '发现计算基础和审题理解需要继续观察',
      totalErrors: 6,
      bottlenecks: [
        { lpCode: 'LP-001', lpName: '计算错误（加减乘除）' },
        { lpCode: 'LP-008', lpName: '审题错误' }
      ],
      imageFiles: [{ fileID: 'cloud://a' }]
    }],
    papers: []
  }, relative)

  assert.equal(view.personalHero.imageSrc, '/assets/images/student-profile-hero.png')
  assert.equal(view.personalHero.actionText, '生成纸面验证卷')
  assert.match(view.personalHero.url, /pages\/generate-verification\/generate-verification/)

  assert.equal(view.primaryActionCard.title, '优先完成数学验证试卷')
  assert.equal(view.primaryActionCard.actionText, '生成纸面验证卷')
  assert.match(view.primaryActionCard.url, /pages\/generate-verification\/generate-verification/)

  assert.equal(view.reportPanel.title, '最新数学诊断报告')
  assert.equal(view.reportPanel.actionText, '阅读完整报告')
  assert.match(view.reportPanel.url, /pages\/report\/report\?id=report-latest/)

  assert.deepEqual(view.personalActionQueue.map(item => item.key), [
    'bottleneckCenter',
    'uploadEvidence',
    'knowledgeMap',
    'learningRecords'
  ])
  assert.ok(view.personalActionQueue.every(item => item.url))

  assert.deepEqual(view.subjects.map(item => item.actionText), [
    '进入数学工作台',
    '进入语文工作台',
    '进入英语工作台'
  ])
  assert.ok(view.subjects.every(item => item.url))
})

test('learning profile primary report prefers the latest diagnosis over a newer verification feedback', () => {
  const view = buildLearningProfileHomeView({
    student: { _id: 'student-1', name: '钟青羽', grade: 6 },
    profiles: [{
      subject: 'math',
      currentBottlenecks: [{ lpCode: 'LP-001', status: 'needs_verification' }]
    }],
    reports: [{
      _id: 'diagnosis-report',
      subject: 'math',
      type: 'diagnosis',
      status: 'completed',
      createdAt: '2026-06-12T09:30:00+08:00',
      summary: '诊断发现计算基础需要继续观察',
      totalErrors: 5,
      bottlenecks: [{ lpCode: 'LP-001', lpName: '计算错误（加减乘除）' }]
    }, {
      _id: 'verification-report',
      subject: 'math',
      type: 'verification',
      status: 'completed',
      createdAt: '2026-06-12T10:30:00+08:00',
      comparisonSummary: '验证反馈显示部分改善'
    }],
    papers: []
  }, relative)

  assert.equal(view.primaryReport.reportId, 'diagnosis-report')
  assert.equal(view.primaryReport.title, '最新数学诊断报告')
  assert.equal(view.recentRecords[0].kind, 'verification-report')
})

test('learning profile home surfaces priority bottlenecks below the primary report', () => {
  const view = buildLearningProfileHomeView({
    student: { _id: 'student-1', name: '钟青羽', grade: 6 },
    profiles: [{
      subject: 'math',
      subjectName: '数学',
      currentBottlenecks: [
        { lpCode: 'LP-001', status: 'persisting', trend: 'persisting', weight: 80, recentErrorCount: 5, evidenceCount: 3 },
        { lpCode: 'LP-008', status: 'improved', trend: 'declining', weight: 35, verificationPassCount: 1 }
      ]
    }],
    reports: [],
    papers: []
  }, relative)

  assert.equal(view.priorityBottlenecks.length, 2)
  assert.equal(view.priorityBottlenecks[0].displayName, '计算基础')
  assert.equal(view.priorityBottlenecks[0].actionText, '生成纸面验证卷')
  assert.equal(view.priorityBottlenecks[0].subjectName, '数学')
  assert.equal(view.bottleneckStats.activeCount, 1)
  assert.equal(view.bottleneckStats.improvedCount, 1)
  assert.equal(view.hasBottleneckBoard, true)
})

test('learning profile home exposes an empty first-use state', () => {
  const view = buildLearningProfileHomeView({
    student: { _id: 'student-1', name: '钟青羽', grade: 6 },
    profiles: [
      { subject: 'math', totalReports: 0, updatedAt: '2026-06-12T10:00:00+08:00', currentBottlenecks: [] },
      { subject: 'chinese', totalReports: 0, updatedAt: '2026-06-12T10:00:00+08:00', currentBottlenecks: [] },
      { subject: 'english', totalReports: 0, updatedAt: '2026-06-12T10:00:00+08:00', currentBottlenecks: [] }
    ],
    reports: [],
    papers: []
  }, relative)

  assert.equal(view.headline, '还没有形成有效学习观察')
  assert.equal(view.sampleCoverageText, '样本覆盖：暂无有效诊断记录。')
  assert.deepEqual(view.subjects.map(item => item.statusText), ['待采样', '待采样', '待采样'])
  assert.equal(view.nextAction.primaryText, '上传第一份试卷')
  assert.equal(view.metrics.some(item => item.label === '已改善'), false)
  assert.equal(view.isEmpty, false)
})

test('learning profile home shows improvement metric only when improvement exists', () => {
  const view = buildLearningProfileHomeView({
    student: { _id: 'student-1', name: '钟青羽', grade: 6 },
    profiles: [{
      subject: 'math',
      subjectName: '数学',
      totalReports: 2,
      updatedAt: '2026-06-12T14:20:00+08:00',
      currentBottlenecks: [
        { lpCode: 'LP-001', lpName: '计算错误（加减乘除）', status: 'improved' }
      ]
    }],
    reports: [
      { _id: 'report-1', subject: 'math', type: 'diagnosis', status: 'completed', createdAt: '2026-06-11T10:00:00+08:00' },
      { _id: 'report-2', subject: 'math', type: 'verification', status: 'completed', createdAt: '2026-06-12T14:20:00+08:00' }
    ],
    papers: []
  }, relative)

  assert.equal(view.headline, '近期验证显示部分学习观察已有改善')
  assert.ok(view.metrics.some(item => item.label === '已改善' && item.value === '1'))
  assert.equal(view.priorityHighlights[0].statusText, '已有改善')
  assert.equal(view.nextAction.primaryText, '上传新试卷')
})

test('learning profile recent records include generated verification papers in time order', () => {
  const view = buildLearningProfileHomeView({
    student: { _id: 'student-1', name: '钟青羽', grade: 6 },
    profiles: [{
      subject: 'math',
      totalReports: 1,
      currentBottlenecks: [{ lpCode: 'LP-001', status: 'needs_verification' }]
    }],
    reports: [{
      _id: 'report-1',
      subject: 'math',
      type: 'diagnosis',
      status: 'completed',
      isEffective: true,
      createdAt: '2026-06-11T10:00:00+08:00',
      bottlenecks: [{ lpCode: 'LP-001' }]
    }],
    papers: [{
      _id: 'paper-1',
      subject: 'math',
      type: 'verification',
      paperDisplayCode: '数学-20260611-01',
      createdAt: '2026-06-11T11:00:00+08:00',
      questions: [{}, {}, {}],
      bottleneckSummaries: ['计算基础'],
      totalPages: 2
    }]
  }, relative)

  assert.equal(view.recentRecords[0].kind, 'verification-paper')
  assert.equal(view.recentRecords[0].title, '数学验证试卷')
  assert.equal(view.recentRecords[0].summary, '今天 · 编号 数学-20260611-01 · 3 题 · 覆盖 计算基础')
  assert.equal(view.recentRecords[1].kind, 'diagnosis-report')
})

test('learning profile recent records suppress default diagnostic papers', () => {
  const view = buildLearningProfileHomeView({
    student: { _id: 'student-1', name: '钟青羽', grade: 6 },
    profiles: [{
      subject: 'math',
      totalReports: 1,
      currentBottlenecks: [{ lpCode: 'LP-001', status: 'needs_verification' }]
    }],
    reports: [],
    papers: [{
      _id: 'default-paper',
      subject: 'math',
      type: 'default-diagnosis',
      createdAt: '2026-06-11T09:00:00+08:00'
    }, {
      _id: 'paper-1',
      subject: 'math',
      type: 'verification',
      paperDisplayCode: '数学-20260611-01',
      createdAt: '2026-06-11T11:00:00+08:00',
      questions: [{}, {}],
      bottleneckSummaries: ['计算基础']
    }]
  }, relative)

  assert.equal(view.recentRecords.some(record => record.paperId === 'default-paper'), false)
  assert.equal(view.recentRecords.some(record => record.paperId === 'paper-1'), true)
  assert.equal(view.recentRecords[0].paperCode, '数学-20260611-01')
})
