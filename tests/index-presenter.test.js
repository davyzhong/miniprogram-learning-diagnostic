const test = require('node:test')
const assert = require('node:assert/strict')

const { buildLearningProfileHomeView } = require('../miniprogram/pages/index/index-presenter')
const { buildChildWorkbenchCards, buildFamilyWorkbenchHero } = require('../miniprogram/utils/child-workbench')
const { UI_ICONS, subjectIcon } = require('../miniprogram/utils/ui-icons')

const relative = () => '今天'

test('family index presenter sanitizes ID-only visible summaries without changing routes', () => {
  const view = buildLearningProfileHomeView({
    student: { _id: 'student-route-id', name: '小明' },
    profiles: [{
      subject: 'math',
      currentBottlenecks: [{ lpCode: 'LP-UNKNOWN-01', status: 'needs_verification' }]
    }],
    reports: [{
      _id: 'report-route-id',
      subject: 'math',
      type: 'diagnosis',
      status: 'completed',
      summary: '复测 BN-LEGACY-UNKNOWN-01',
      bottlenecks: [{ lpCode: 'LP-UNKNOWN-01' }]
    }],
    papers: []
  }, relative)

  assert.doesNotMatch(view.primaryReport.summary, /BN-/)
  assert.doesNotMatch(view.priorityBottlenecks[0].displayName, /LP-/)
  assert.match(view.primaryReport.url, /report-route-id/)
})

test('family index presenter sanitizes hostile diagnosis workbench judgment text', () => {
  const view = buildLearningProfileHomeView({
    student: { _id: 'student-route-id', name: '小明' },
    profiles: [{ subject: 'math', currentBottlenecks: [] }],
    reports: [{
      _id: 'report-route-id',
      subject: 'math',
      type: 'diagnosis',
      status: 'completed',
      summary: '复测 BN-WORKBENCH-LEAK-01 与 cloud://env/file'
    }],
    papers: []
  }, relative)

  assert.equal(view.diagnosisWorkbenches[0].judgment, '复测')
  assert.match(view.diagnosisWorkbenches[0].reportUrl, /report-route-id/)
})

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
  assert.equal(cards[0].diagnosisCoverageText, '已有 1/3 科诊断')
  assert.deepEqual(cards[0].diagnosisReports.map(item => item.subject), ['math'])
  assert.equal(cards[0].latestDiagnosis.title, '数学诊断报告')
  assert.match(cards[0].latestDiagnosis.url, /pages\/report\/report\?id=report-1/)

  assert.equal(cards[1].name, '弟弟')
  assert.equal(cards[1].roleText, '共同家长')
  assert.equal(cards[1].statusText, '无待办')
})

test('child workbench exposes every available subject diagnosis on the family home', () => {
  const [card] = buildChildWorkbenchCards({
    students: [{ _id: 'student-1', name: '钟青羽', grade: 6 }],
    diagnosesByStudentId: {
      'student-1': [{
        _id: 'math-report',
        subject: 'math',
        createdAt: '2026-07-15T10:00:00+08:00',
        summary: '数学诊断摘要'
      }, {
        _id: 'chinese-report',
        subject: 'chinese',
        createdAt: '2026-07-14T10:00:00+08:00',
        summary: '语文诊断摘要'
      }]
    }
  }, relative)

  assert.equal(card.diagnosisCoverageText, '已有 2/3 科诊断')
  assert.deepEqual(card.diagnosisReports.map(item => item.subject), ['math', 'chinese'])
  assert.deepEqual(card.diagnosisReports.map(item => item.dateText), ['今天', '今天'])
  assert.match(card.diagnosisReports[0].url, /math-report/)
  assert.match(card.diagnosisReports[1].url, /chinese-report/)
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

  assert.equal(hero.imageSrc, undefined)
  assert.match(hero.title, /钟青羽/)
  assert.match(hero.summary, /2 个学习卡点/)
  assert.equal(hero.actionText, '处理今日优先行动')
  assert.match(hero.url, /pages\/generate-verification\/generate-verification|pages\/subject-home\/subject-home/)
  assert.deepEqual(hero.stats.map(item => item.key), ['children', 'pendingActions', 'improvements', 'formalDiagnoses'])
})

test('shared icon map defines every family workbench semantic', () => {
  for (const key of ['VERIFICATION', 'PAPER_SUMMARY', 'DIAGNOSIS_LIST']) {
    assert.ok(UI_ICONS[key])
  }
})

test('family workbench exposes a compact icon contract without leaking internal IDs', () => {
  const cards = buildChildWorkbenchCards({
    students: [{ _id: 'student-route-id', name: '钟青羽', grade: 6 }],
    profilesByStudentId: {
      'student-route-id': [{
        subject: 'math',
        currentBottlenecks: [
          { lpCode: 'LP-UNKNOWN-01', status: 'needs_verification' },
          { lpCode: 'LP-PERSISTING-01', status: 'persisting' },
          { lpCode: 'LP-IMPROVED-01', status: 'improved' }
        ]
      }]
    },
    reportsByStudentId: {
      'student-route-id': [{
        _id: 'report-route-id',
        subject: 'math',
        type: 'diagnosis',
        status: 'completed',
        createdAt: '2026-07-12T09:00:00+08:00',
        summary: '复测 BN-UNKNOWN-01、ERR-OPAQUE-02'
      }]
    },
    papersByStudentId: {
      'student-route-id': [{
        _id: 'paper-route-id',
        subject: 'math',
        type: 'verification',
        paperDisplayCode: '数学-20260712-06',
        generatedAt: '2026-07-12T10:00:00+08:00',
        totalPages: 3,
        questions: [{}, {}, {}],
        bottleneckSummaries: ['NODE-OPAQUE-01', 'RES-OPAQUE-02']
      }]
    }
  }, relative)

  const card = cards[0]
  assert.equal(card.statusItems.length, 4)
  assert.deepEqual(card.statusItems.map(item => item.icon), [
    UI_ICONS.BOTTLENECK,
    UI_ICONS.VERIFICATION,
    UI_ICONS.PERSISTING,
    UI_ICONS.IMPROVED
  ])
  assert.ok(card.statusItems.every(item => item.shortLabel))
  assert.ok(card.priorityAction.icon)
  assert.ok(Array.isArray(card.secondaryActions))
  assert.deepEqual(card.subjectRows.map(item => item.key), ['math', 'chinese', 'english'])
  assert.deepEqual(card.subjectRows.map(item => item.icon), ['math', 'chinese', 'english'].map(subjectIcon))
  assert.equal(card.latestDiagnosis.icon, UI_ICONS.DIAGNOSIS)
  assert.equal(card.latestDiagnosis.subjectIcon, subjectIcon('math'))
  assert.deepEqual(card.quickLinks.map(item => item.icon), [
    UI_ICONS.DIAGNOSIS_LIST,
    UI_ICONS.PAPER_SUMMARY,
    UI_ICONS.KNOWLEDGE_MAP,
    UI_ICONS.TIME
  ])

  const visibleText = [
    ...card.statusItems.flatMap(item => [item.label, item.shortLabel, item.value]),
    card.priorityAction.title,
    card.priorityAction.summary,
    ...card.secondaryActions.flatMap(item => [item.title, item.summary]),
    ...card.subjectRows.flatMap(item => [item.name, item.shortName, item.summary, item.statusText]),
    card.latestValue.title,
    card.latestValue.summary,
    card.latestDiagnosis.title,
    card.latestDiagnosis.summary,
    ...card.quickLinks.flatMap(item => [item.title, item.summary])
  ].filter(Boolean).join(' ')
  assert.doesNotMatch(visibleText, /(?:BN|LP|ERR|NODE|RES|MATH)-[A-Z0-9_-]+/)
  assert.match(visibleText, /数学-20260712-06/)
  assert.match(card.priorityAction.url, /paper-route-id/)
  assert.match(card.latestDiagnosis.url, /report-route-id/)

  const hero = buildFamilyWorkbenchHero(cards)
  assert.deepEqual(hero.stats.map(item => item.key), [
    'children',
    'pendingActions',
    'improvements',
    'formalDiagnoses'
  ])
  assert.ok(hero.stats.every(item => item.icon && item.shortLabel && item.value !== undefined))
})

test('child workbench never displays an opaque-only paper fallback code', () => {
  const opaquePaperId = 'paper-route-opaque-abcdef'
  const [card] = buildChildWorkbenchCards({
    students: [{ _id: 'student-route-id', name: '钟青羽', grade: 6 }],
    papersByStudentId: {
      'student-route-id': [{
        _id: opaquePaperId,
        subject: 'math',
        type: 'verification',
        totalPages: 3,
        questions: [{}, {}]
      }]
    }
  }, relative)

  const currentPaper = card.quickLinks.find(item => item.key === 'currentPaper')
  for (const summary of [card.latestValue.summary, card.priorityAction.summary, currentPaper.summary]) {
    assert.doesNotMatch(summary, /试卷-abcdef|abcdef/)
  }
  assert.equal(card.latestValue.code, '')
  assert.match(card.latestValue.summary, /2 题/)
  assert.match(card.priorityAction.summary, /3页/)
  assert.match(currentPaper.summary, /3页 · 2题/)
  assert.match(card.latestValue.url, /paper-route-opaque-abcdef/)
  assert.match(card.priorityAction.url, /paper-route-opaque-abcdef/)
  assert.match(currentPaper.url, /paper-route-opaque-abcdef/)

  const [datedCard] = buildChildWorkbenchCards({
    students: [{ _id: 'student-route-id', name: '钟青羽', grade: 6 }],
    papersByStudentId: {
      'student-route-id': [{
        _id: opaquePaperId,
        subject: 'math',
        type: 'verification',
        generatedAt: '2026-07-13T10:00:00+08:00'
      }]
    }
  }, relative)
  assert.match(datedCard.latestValue.summary, /数学-20260713/)
  assert.match(datedCard.priorityAction.summary, /数学-20260713/)
  assert.match(datedCard.quickLinks.find(item => item.key === 'currentPaper').summary, /数学-20260713/)

  for (const codeField of ['paperDisplayCode', 'paperCode']) {
    const [opaqueSavedCard] = buildChildWorkbenchCards({
      students: [{ _id: 'student-route-id', name: '钟青羽', grade: 6 }],
      papersByStudentId: {
        'student-route-id': [{
          _id: opaquePaperId,
          subject: 'math',
          type: 'verification',
          [codeField]: '507f1f77bcf86cd799439011'
        }]
      }
    }, relative)
    const summaries = [
      opaqueSavedCard.latestValue.summary,
      opaqueSavedCard.priorityAction.summary,
      opaqueSavedCard.quickLinks.find(item => item.key === 'currentPaper').summary
    ].join(' ')
    assert.doesNotMatch(summaries, /507f1f77bcf86cd799439011|学习卡点/)
    assert.equal(opaqueSavedCard.latestValue.code, '')
  }

  const [opaqueDatedCard] = buildChildWorkbenchCards({
    students: [{ _id: 'student-route-id', name: '钟青羽', grade: 6 }],
    papersByStudentId: {
      'student-route-id': [{
        _id: opaquePaperId,
        subject: 'math',
        type: 'verification',
        paperDisplayCode: '507f1f77bcf86cd799439011',
        generatedAt: '2026-07-14T10:00:00+08:00'
      }]
    }
  }, relative)
  assert.equal(opaqueDatedCard.latestValue.code, '数学-20260714')

  for (const [codeField, code] of [
    ['paperDisplayCode', '数学-20260712-06'],
    ['paperCode', 'MATH-20260712-06']
  ]) {
    const [humanCodeCard] = buildChildWorkbenchCards({
      students: [{ _id: 'student-route-id', name: '钟青羽', grade: 6 }],
      papersByStudentId: {
        'student-route-id': [{
          _id: opaquePaperId,
          subject: 'math',
          type: 'verification',
          [codeField]: code
        }]
      }
    }, relative)
    assert.equal(humanCodeCard.latestValue.code, code)
    assert.match(humanCodeCard.priorityAction.summary, new RegExp(code))
    assert.match(humanCodeCard.quickLinks.find(item => item.key === 'currentPaper').summary, new RegExp(code))
  }
})

test('family workbench counts formal diagnosis records separately from subject coverage', () => {
  const [card] = buildChildWorkbenchCards({
    students: [{ _id: 'student-route-id', name: '钟青羽', grade: 6 }],
    reportsByStudentId: {
      'student-route-id': [{
        _id: 'math-report-1', subject: 'math', type: 'diagnosis', status: 'completed', createdAt: '2026-07-10T10:00:00+08:00'
      }, {
        _id: 'math-report-2', subject: 'math', type: 'diagnosis', status: 'completed', createdAt: '2026-07-11T10:00:00+08:00'
      }, {
        _id: 'chinese-report-1', subject: 'chinese', type: 'diagnosis', status: 'completed', createdAt: '2026-07-12T10:00:00+08:00'
      }]
    }
  }, relative)

  assert.equal(card.diagnosisCoverageCount, 2)
  assert.equal(card.formalDiagnosisCount, 3)
  const formalDiagnoses = buildFamilyWorkbenchHero([card]).stats.find(item => item.key === 'formalDiagnoses')
  assert.equal(formalDiagnoses.value, '3')
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
  assert.equal(view.nextAction.primaryText, '下载验证卷')
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

  assert.equal(view.personalHero.imageSrc, undefined)
  assert.equal(view.personalHero.actionText, '下载验证卷')
  assert.match(view.personalHero.url, /pages\/subject-home\/subject-home/)

  assert.equal(view.primaryActionCard.title, '下载数学验证试卷')
  assert.equal(view.primaryActionCard.actionText, '下载验证卷')
  assert.match(view.primaryActionCard.url, /pages\/subject-home\/subject-home/)

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

test('learning profile builds dense diagnosis workbenches only for subjects with formal reports', () => {
  const view = buildLearningProfileHomeView({
    student: { _id: 'student-1', name: '钟青羽', grade: 6 },
    profiles: [{
      subject: 'math',
      currentBottlenecks: [
        { lpCode: 'LP-001', lpName: '计算基础', status: 'improved' },
        { lpCode: 'LP-008', lpName: '审题理解', status: 'persisting' }
      ]
    }, {
      subject: 'chinese',
      currentBottlenecks: [
        { lpCode: 'CN-001', lpName: '字词辨析', status: 'needs_verification' }
      ]
    }],
    latestDiagnosisReports: [{
      _id: 'math-diagnosis',
      subject: 'math',
      type: 'diagnosis',
      status: 'completed',
      createdAt: '2026-07-13T09:30:00+08:00',
      summary: '计算基础正在改善，应用题审题仍是当前重点。',
      totalErrors: 6,
      bottlenecks: [{ lpCode: 'LP-008', lpName: '审题理解', errorCount: 2 }]
    }, {
      _id: 'chinese-diagnosis',
      subject: 'chinese',
      type: 'diagnosis',
      status: 'completed',
      createdAt: '2026-07-10T09:30:00+08:00',
      summary: '阅读概括较稳定，字词辨析需要继续巩固。',
      totalErrors: 4,
      bottlenecks: [{ lpCode: 'CN-001', lpName: '字词辨析', errorCount: 2 }]
    }],
    reports: [],
    papers: [{
      _id: 'math-paper',
      subject: 'math',
      type: 'verification',
      generationStatus: 'ready',
      createdAt: '2026-07-13T10:00:00+08:00'
    }]
  }, relative)

  assert.deepEqual(view.diagnosisWorkbenches.map(item => item.subject), ['math', 'chinese'])
  assert.equal(view.diagnosisWorkbenches.some(item => item.subject === 'english'), false)
  assert.equal(view.diagnosisWorkbenches[0].subjectIcon, subjectIcon('math'))
  assert.equal(view.diagnosisWorkbenches[0].evidenceCount, 6)
  assert.equal(view.diagnosisWorkbenches[0].improvedCount, 1)
  assert.equal(view.diagnosisWorkbenches[0].persistingCount, 1)
  assert.equal(view.diagnosisWorkbenches[0].primaryAction.text, '查看验证卷')
  assert.match(view.diagnosisWorkbenches[0].primaryAction.url, /paper-preview\/paper-preview/)
  assert.equal(view.diagnosisWorkbenches[1].waitingCount, 1)
  assert.equal(view.diagnosisWorkbenches[1].primaryAction.text, '进入语文跟进')
  assert.match(view.diagnosisWorkbenches[1].reportUrl, /report\?id=chinese-diagnosis/)
  assert.match(view.diagnosisWorkbenches[1].uploadUrl, /pages\/upload\/upload/)
})

test('learning profile accepts lightweight formal diagnosis summaries from the home endpoint', () => {
  const view = buildLearningProfileHomeView({
    student: { _id: 'student-1', name: '钟青羽', grade: 6 },
    profiles: [{ subject: 'chinese', currentBottlenecks: [] }],
    latestDiagnosisReports: [{
      _id: 'chinese-summary',
      subject: 'chinese',
      createdAt: '2026-07-15T09:30:00+08:00',
      summary: '字词辨析需要继续巩固。'
    }],
    reports: [],
    papers: []
  }, relative)

  assert.deepEqual(view.diagnosisWorkbenches.map(item => item.subject), ['chinese'])
  assert.match(view.diagnosisWorkbenches[0].reportUrl, /chinese-summary/)
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
  assert.equal(view.priorityBottlenecks[0].actionText, '查看/下载验证卷')
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
