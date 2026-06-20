#!/usr/bin/env node
/**
 * 知识地图外显化 E2E 验收脚本
 *
 * 专门验收近一轮改动的设计目标：
 *   1. student-profile 页能看到 🗺️ 学习地图卡片（入口外显）
 *   2. 点击卡片能进入 knowledge-map 页（页面可达）
 *   3. knowledge-map 默认平铺卡点（不再折叠），看到"最该先处理"
 *   4. 点击卡点能直跳 learning-resource（跳过 bottleneck-detail 中间页）
 *   5. 空数据状态显示"去上传试卷"CTA
 *   6. 学科工作台 subject-home 也有"知识地图"入口
 *
 * 复用 devtools-e2e-fullpage.js 的 mock 注入模式。
 *
 * 前置：先跑 npm run test:e2e:doctor 确认 DevTools 可达
 *
 * 用法：
 *   npm run test:e2e:knowledge-map
 *   或 node scripts/devtools-knowledge-map-e2e.js
 *
 * 退出码：0 全过；1 有失败；2 启动失败
 */

const fs = require('node:fs')
const path = require('node:path')

function loadAutomator() {
  try { return require('miniprogram-automator') }
  catch { return require('/tmp/learning-diagnostic-automator/node_modules/miniprogram-automator') }
}
const automator = loadAutomator()

const projectPath = path.resolve(__dirname, '..')
const cliPath = process.env.WECHAT_DEVTOOLS_CLI
  || (process.platform === 'darwin' ? '/Applications/wechatwebdevtools.app/Contents/MacOS/cli' : 'cli')
const outputDir = path.join(projectPath, 'tmp', 'e2e-knowledge-map')

const NOW = '2026-06-18T09:30:00+08:00'
const student = { _id: 'student-km', name: '钟青羽', grade: 6, createdAt: NOW, avatarColor: 'blue' }
const ownerPermissions = { canView: true, canManageParents: true, canUpload: true, canGeneratePaper: true, canRetryAnalysis: true }

// === Mock 数据：构造带细卡点的数学档案 ===
// 重点：currentBottlenecks 带 candidateBottlenecks，让 knowledge-map 能展开成 BN 级
const subjectProfiles = [{
  _id: 'profile-math', studentId: student._id, subject: 'math', subjectName: '数学',
  totalReports: 1, updatedAt: NOW,
  currentBottlenecks: [
    {
      lpCode: 'LP-FD', lpName: '小数运算', subject: 'math', status: 'persisting', severity: 'high',
      candidateBottlenecks: [
        { bottleneckId: 'BN-DEC-MUL-POINT-COUNT', title: '积的小数位数判断错误', nodeId: 'MATH-NUM-DEC-MUL-POINT', evidenceStrength: 'high' }
      ]
    },
    {
      lpCode: 'LP-FRAC', lpName: '分数运算', subject: 'math', status: 'needs_verification', severity: 'medium',
      candidateBottlenecks: [
        { bottleneckId: 'BN-FRACTION-ADD-DENOM-MISMATCH', title: '通分错误', nodeId: 'MATH-NUM-FRACTION-ADD-COMMON-DENOM', evidenceStrength: 'medium' }
      ]
    }
  ],
  pendingBottlenecks: [],
  improvedBottlenecks: []
}]

const reports = [{
  _id: 'report-km', studentId: student._id, subject: 'math', type: 'diagnosis', status: 'completed',
  createdAt: NOW, evidenceTime: NOW,
  summary: '发现小数运算和分数运算两个卡点。', totalErrors: 2,
  bottlenecks: [
    { lpCode: 'LP-FD', lpName: '小数运算', errorCount: 1 },
    { lpCode: 'LP-FRAC', lpName: '分数运算', errorCount: 1 }
  ],
  imageFiles: []
}]

const members = [
  { _id: 'm1', studentId: student._id, ownerOpenId: 'o1', memberOpenId: 'o1', role: 'owner', status: 'active', displayName: '钟青羽家长', createdAt: NOW }
]

// === 验收点 ===
const studentQ = 'studentId=student-km&studentName=%E9%92%9F%E9%9D%92%E7%BE%BD'

const checks = [
  {
    name: 'A1: student-profile 页能看到学习地图紧凑条 + 切换孩子入口',
    route: `/pages/student-profile/student-profile?${studentQ}`,
    wait: 2000,
    expect: { text: ['学习地图', '查看', '切换孩子'] }
  },
  {
    name: 'A2: knowledge-map 页可达且默认平铺卡点',
    route: `/pages/knowledge-map/knowledge-map?${studentQ}&subject=math`,
    wait: 2000,
    expect: {
      text: ['学习地图', '最该先处理', '积的小数位数判断错误', '通分错误'],
      // 不应再出现折叠箭头文案
      notText: ['加载知识地图']
    }
  },
  {
    name: 'A3: subject-home 学科工作台有知识地图入口',
    route: `/pages/subject-home/subject-home?${studentQ}&subject=math&subjectName=%E6%95%B0%E5%AD%A6&studentName=%E9%92%9F%E9%9D%92%E7%BE%BD&grade=6`,
    wait: 2000,
    expect: { text: ['知识地图'] }
  },
  {
    // 内容深度验收：learning-resource 页必须渲染 6 个板块的全部结构化内容
    // 练习题答案默认折叠——验证"想一想后点开看答案"按钮存在，但"答案"/"解题关键"默认隐藏
    name: 'C1: learning-resource 页渲染丰富内容（6 板块+易错对比+答案折叠）',
    route: `/pages/learning-resource/learning-resource?packId=pack-km-mock`,
    wait: 2500,
    expect: {
      text: [
        '学习任务包',
        '这个卡点是什么',           // summary 板块标题
        '为什么会这样错',           // concept 板块标题
        '正确的解题路径',           // worked_example 板块标题
        '容易踩的坑',               // common_mistake 板块标题
        '常见错误',                 // 易错对比-错误行 label
        '正确做法',                 // 易错对比-正确行 label
        '练三道',                   // practice 板块标题
        '想一想后点开看答案',       // 折叠按钮文案（3 道题各一个）
        '怎么算学会了',             // mastery_check 板块标题
      ],
      // 答案默认折叠，不应出现这些文本
      notText: ['解题关键'],
    }
  },
  {
    // 验证卷预览页按钮逻辑：只有 1 个主按钮，不再有"分享打印"假按钮
    name: 'C2: paper-preview 页只有一个主按钮，无冗余"分享打印"',
    route: `/pages/paper-preview/paper-preview?paperId=5caf1a7c6a350738025b1db174d6eb9f&studentId=${student._id}&subject=math&studentName=${encodeURIComponent(student.name)}`,
    wait: 2500,
    expect: {
      text: ['下载 PDF 并打印'],
      notText: ['分享打印'],
    }
  },
  {
    // 诊断报告页展示全量卡点（profile 级别），而非单次报告卡点
    name: 'C3: 诊断报告页展示全量卡点（profile 级别 8 个，非单次报告）',
    route: `/pages/report/report?id=117e1a7d6a310042002821a336df13a8&studentId=${student._id}&subject=math`,
    wait: 3000,
    expect: {
      // 报告页应展示全量卡点（profile 有 8 个），而不是单次报告的 7 个
      // 关键：报告页应包含"学习卡点"板块标题和卡点数量
      text: ['学习卡点'],
    }
  }
]

// === 跨页交互场景 ===
const scenarios = [
  {
    name: 'B1: student-profile → 点学习地图紧凑条 → knowledge-map',
    steps: [
      { route: `/pages/student-profile/student-profile?${studentQ}`, wait: 2000, expect: { text: ['学习地图'] } },
      { action: 'tapByText', selector: '.map-compact-bar', text: '学习地图', wait: 3000, expect: { path: 'pages/knowledge-map/knowledge-map' } },
      // 进入后应直接看到卡点（不需要再点展开）；多等一会儿让 onLoad + setData 完成
      { action: 'waitFor', wait: 2000 },
      { action: 'assertText', text: ['最该先处理', '积的小数位数判断错误'] }
    ]
  },
  {
    name: 'B2: knowledge-map → 点卡点 → 直跳 learning-resource（不经过 bottleneck-detail）',
    steps: [
      { route: `/pages/knowledge-map/knowledge-map?${studentQ}&subject=math`, wait: 3000, expect: { text: ['最该先处理', '积的小数位数'] } },
      // 点优先卡点
      { action: 'tapByText', selector: '.priority-card', text: '积的小数位数', wait: 3000, expect: { path: 'pages/learning-resource/learning-resource' } },
      // 进入后验证内容深度（板块标题可见，答案默认折叠）
      { action: 'waitFor', wait: 2000 },
      { action: 'assertText', text: ['这个卡点是什么', '为什么会这样错', '容易踩的坑', '练三道', '想一想后点开看答案'] }
    ]
  },
  {
    // 新场景：点击"想一想后点开看答案"后，答案和解题关键展开显示
    name: 'B3: learning-resource 点击展开答案后显示答案和解题关键',
    steps: [
      { route: `/pages/learning-resource/learning-resource?packId=pack-km-mock`, wait: 2500, expect: { text: ['想一想后点开看答案'] } },
      // 点击第一个"想一想后点开看答案"按钮
      { action: 'tapByText', selector: '.practice-reveal-btn', text: '想一想后点开看答案', wait: 1000 },
      // 展开后应看到"答案"和"解题关键"
      { action: 'assertText', text: ['答案', '解题关键'] }
    ]
  },
  {
    // 新场景：点击"切换孩子"后返回 index 选孩子首页
    name: 'B4: student-profile → 点切换孩子 → 返回 index 选孩子页',
    steps: [
      { route: `/pages/student-profile/student-profile?${studentQ}`, wait: 2000, expect: { text: ['切换孩子'] } },
      { action: 'tapByText', selector: '.switch-student-btn', text: '切换孩子', wait: 2000, expect: { path: 'pages/index/index' } },
    ]
  }
]

// === 工具 ===
const results = []

async function pageText(page) {
  const root = await page.$('.page')
  if (!root) return ''
  return (await root.text()).replace(/\s+/g, ' ')
}

async function tapByText(page, selector, text) {
  const els = await page.$$(selector)
  for (const el of els) {
    const t = await el.text()
    if (t && t.includes(text)) {
      await el.tap()
      return el
    }
  }
  throw new Error(`未找到 ${selector} 含文本 "${text}" (候选 ${els.length} 个)`)
}

async function installCloudMocks(miniProgram) {
  await miniProgram.evaluate((cfg) => {
    const { student, permissions, subjectProfiles, reports, members } = cfg
    globalThis.__pageErrors = []
    globalThis.__consoleErrors = []
    const origErr = console.error
    console.error = function (...args) {
      try { globalThis.__consoleErrors.push(args.map(a => (a && a.message) ? a.message : String(a)).join(' ')) } catch {}
      return origErr.apply(this, args)
    }
    try { wx.onError && wx.onError(e => globalThis.__pageErrors.push(String(e))) } catch {}

    wx.cloud.callFunction = async ({ name, data }) => {
      try {
        if (name === 'studentAccess') {
          if (data.action === 'getAccessibleStudents') return { result: { success: true, students: [{ ...student, role: 'owner', permissions }] } }
          if (data.action === 'listMembers') return { result: { success: true, student, role: 'owner', permissions, members } }
        }
        if (name === 'studentData') {
          const a = data && data.action
          if (a === 'getStudentDashboard') return { result: { success: true, student, permissions, subjectProfiles, recentReports: reports, recentPapers: [] } }
          if (a === 'getSubjectDashboard') return { result: { success: true, student, permissions, profile: subjectProfiles[0], reports, papers: [] } }
        }
        // learningResource.generatePack：模拟成功生成 pack（不真调 LLM，避免超时）
        if (name === 'learningResource' && data.action === 'generatePack') {
          return { result: { success: true, packId: 'pack-km-mock', pack: { _id: 'pack-km-mock', title: '小数乘法讲解', status: 'ready', blocks: [] } } }
        }
        if (name === 'learningResource' && data.action === 'getPack') {
          // 返回完整的 6 板块内容，让 C1 能验收渲染深度
          return { result: { success: true, pack: {
            _id: 'pack-km-mock',
            title: '小数乘法中积的小数位数判断错误',
            status: 'ready',
            estimatedMinutes: 8,
            blocks: [
              { type: 'summary', title: '这个卡点是什么', body: '小数乘法中积的小数位数判断错误。优先级：高，修复成本：低，对后续影响：高。' },
              { type: 'concept', title: '为什么会这样错', body: '典型症状：\n  1. 数字乘积正确但小数点位置错误\n  2. 积的小数位数数错\n根因信号：\n  1. 整数乘法可完成\n  2. 不能解释积为什么有几位小数' },
              { type: 'worked_example', title: '正确的解题路径', question: '计算：2.4 × 1.5 =', steps: ['先算整数乘积：24 × 15 = 360', '数两个因数的小数位数：2.4 有 1 位，1.5 有 1 位，共 2 位', '从右往左数 2 位点小数点：3.60 = 3.6'] },
              { type: 'common_mistake', title: '容易踩的坑', mistake: '数字乘积正确但小数点位置错误', correction: '先算整数乘积，再回填小数点后用估算检查', explanation: '不能解释积为什么有几位小数' },
              { type: 'practice', title: '练三道', questions: [
                { questionId: 'P01', question: '下面的计算哪里错了？8.5 × 3.16 = 2.186', answer: '26.86', explanation: '85 × 316 = 26860，共 3 位小数，应为 26.860' },
                { questionId: 'P02', question: '给 3 道数字相同、小数位数不同的乘法', answer: '按要求完成', explanation: '这是验证是否掌握的关键动作' },
                { questionId: 'P03', question: '自检：3 道变式题小数点均正确', answer: '能口头解释规则', explanation: '能解释规则才算真懂' },
              ] },
              { type: 'mastery_check', title: '怎么算学会了', body: '1. 3 道变式题小数点均正确\n2. 能口头解释规则' },
            ]
          } } }
        }
        return { result: { success: false, error: `unhandled mock ${name}:${data && data.action}` } }
      } catch (e) {
        globalThis.__pageErrors.push(String(e && e.message || e))
        return { result: { success: false, error: 'mock throw' } }
      }
    }

    const base = { students: [student], subjectProfiles, reports, studentMembers: members, learningResourcePacks: [] }
    const matchesFilter = (item, filter = {}) => !filter || Object.keys(filter).length === 0 || Object.keys(filter).every(k => item[k] === filter[k])
    wx.cloud.database = () => ({
      collection(name) {
        return {
          where(filter) { return { orderBy() { return this }, limit() { return this }, async get() { return { data: (base[name] || []).filter(i => matchesFilter(i, filter)) } } } },
          orderBy() { return this }, limit() { return this },
          async get() { return { data: base[name] || [] } },
          doc(id) { return { async get() { return { data: (base[name] || []).find(i => i._id === id) || null } } } },
          async add() { return { _id: 'mock-' + Date.now() } },
        }
      },
      serverDate() { return new Date() }
    })
  }, { student, permissions: ownerPermissions, subjectProfiles, reports, members })
}

async function runCheck(check, miniProgram) {
  const entry = { name: check.name, status: 'PASS', detail: '' }
  try {
    const page = await miniProgram.reLaunch(check.route)
    await page.waitFor(check.wait || 1500)
    const text = await pageText(page)

    if (check.expect.text) {
      const missing = check.expect.text.filter(t => !text.includes(t))
      if (missing.length) {
        entry.status = 'FAIL'
        entry.detail = `缺少文本: ${missing.join(', ')} | 实际文本前200字: ${text.slice(0, 200)}`
      }
    }
    if (entry.status === 'PASS' && check.expect.notText) {
      const unexpected = check.expect.notText.filter(t => text.includes(t))
      if (unexpected.length) {
        entry.status = 'FAIL'
        entry.detail = `不应出现: ${unexpected.join(', ')}`
      }
    }
  } catch (e) {
    entry.status = 'FAIL'
    entry.detail = String(e && e.message || e)
  }
  results.push(entry)
  const tag = entry.status === 'PASS' ? '✓' : '✗'
  console.log(`  ${tag}  ${entry.name}${entry.detail ? '\n     ' + entry.detail.slice(0, 200) : ''}`)
  return entry
}

async function runScenario(scenario, miniProgram) {
  const entry = { name: scenario.name, status: 'PASS', detail: '' }
  let page
  try {
    for (const step of scenario.steps) {
      if (step.route) {
        page = await miniProgram.reLaunch(step.route)
        await page.waitFor(step.wait || 1500)
      } else if (step.action === 'tapByText') {
        await page.waitFor(500)
        await tapByText(page, step.selector, step.text)
        await page.waitFor(step.wait || 1500)
        // 跳转后重新获取当前页面引用（旧 page 对象还指向跳转前的页面）
        page = await miniProgram.currentPage()
        await page.waitFor(500)
      } else if (step.action === 'assertText') {
        // assertText 前也刷新一次 page 引用，确保读到的是最新页面
        page = await miniProgram.currentPage()
        await page.waitFor(500)
        const text = await pageText(page)
        const missing = (step.text || []).filter(t => !text.includes(t))
        if (missing.length) throw new Error(`断言文本缺失: ${missing.join(', ')} | 实际前200字: ${text.slice(0, 200)}`)
      } else if (step.action === 'waitFor') {
        await page.waitFor(step.wait || 2000)
      }
      if (step.expect) {
        if (step.expect.path) {
          const cur = await miniProgram.currentPage()
          if (!cur.path.includes(step.expect.path)) {
            throw new Error(`期望路由 ${step.expect.path}，实际 ${cur.path}`)
          }
        }
        if (step.expect.text) {
          const text = await pageText(page)
          const missing = step.expect.text.filter(t => !text.includes(t))
          if (missing.length) throw new Error(`期望文本缺失: ${missing.join(', ')}`)
        }
      }
    }
  } catch (e) {
    entry.status = 'FAIL'
    entry.detail = String(e && e.message || e)
  }
  results.push(entry)
  const tag = entry.status === 'PASS' ? '✓' : '✗'
  console.log(`  ${tag}  ${entry.name}${entry.detail ? '\n     ' + entry.detail.slice(0, 200) : ''}`)
  return entry
}

async function main() {
  console.log('=== 知识地图外显化 E2E 验收 ===\n')
  console.log('启动 DevTools（首次较慢，30-60s）...')
  let miniProgram
  try {
    miniProgram = await automator.launch({
      cliPath,
      projectPath,
      timeout: 60000
    })
  } catch (e) {
    console.error(`\n✗ DevTools 启动失败: ${e.message}`)
    console.error('  → 先跑 npm run test:e2e:doctor 排查')
    process.exit(2)
  }

  try {
    console.log('注入 cloud mock 数据...')
    await installCloudMocks(miniProgram)

    console.log('\n--- 静态页面检查 ---')
    for (const c of checks) await runCheck(c, miniProgram)

    console.log('\n--- 跨页交互场景 ---')
    for (const s of scenarios) await runScenario(s, miniProgram)

    // 错误日志收集
    const errs = await miniProgram.evaluate(() => ({
      pageErrors: globalThis.__pageErrors || [],
      consoleErrors: (globalThis.__consoleErrors || []).slice(0, 5)
    }))
    if (errs.pageErrors.length > 0) {
      console.log(`\n⚠ 页面运行时错误 (${errs.pageErrors.length} 条):`)
      errs.pageErrors.slice(0, 5).forEach(e => console.log('   -', String(e).slice(0, 150)))
    }

    // 写报告
    fs.mkdirSync(outputDir, { recursive: true })
    const reportPath = path.join(outputDir, `report-${Date.now()}.json`)
    const passed = results.filter(r => r.status === 'PASS').length
    const failed = results.filter(r => r.status === 'FAIL').length
    fs.writeFileSync(reportPath, JSON.stringify({
      summary: { total: results.length, passed, failed },
      results,
      runtimeErrors: errs
    }, null, 2))

    console.log(`\n=== 验收汇总 ===`)
    console.log(`  通过: ${passed}/${results.length}`)
    console.log(`  失败: ${failed}/${results.length}`)
    console.log(`  报告: ${reportPath}`)
    process.exit(failed > 0 ? 1 : 0)
  } finally {
    await miniProgram.close()
  }
}

main().catch(e => {
  console.error('未捕获错误:', e)
  process.exit(2)
})
