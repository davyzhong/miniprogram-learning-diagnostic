#!/usr/bin/env node
/**
 * DevTools CLI 环境探测
 *
 * 在跑任何 DevTools E2E / 全量页面回归前，先跑这个脚本确认：
 *   1. 微信开发者工具 CLI 是否可达
 *   2. miniprogram-automator 是否安装
 *   3. 项目能否被打开（project.config.json 是否就绪）
 *   4. DevTools 是否能成功 launch miniProgram
 *
 * 退出码：
 *   0 — 全部通过
 *   1 — 一项或多项检查失败
 *   2 — 用户没装 DevTools 或 automator（FAIL 但给修复指引）
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')

const projectPath = path.resolve(__dirname, '..')
const checks = []
let failureCount = 0
let warnCount = 0

function record(name, status, detail, hint = '') {
  checks.push({ name, status, detail, hint })
  if (status === 'FAIL') failureCount += 1
  if (status === 'WARN') warnCount += 1
  const tag = status === 'PASS' ? '✓' : status === 'WARN' ? '!' : '✗'
  const color = status === 'PASS' ? '[32m' : status === 'WARN' ? '[33m' : '[31m'
  console.log(`${color}${tag}[0m  ${name}`)
  if (detail) console.log(`     ${detail}`)
  if (hint && status !== 'PASS') console.log(`     [36m→[0m ${hint}`)
}

function defaultCliCandidates() {
  const platform = os.platform()
  const fromEnv = process.env.WECHAT_DEVTOOLS_CLI
  if (fromEnv) return [fromEnv]
  if (platform === 'darwin') {
    return [
      '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
      '/Applications/微信开发者工具.app/Contents/MacOS/cli',
      path.join(os.homedir(), 'Applications/wechatwebdevtools.app/Contents/MacOS/cli'),
    ]
  }
  if (platform === 'win32') {
    return [
      'C:\\Program Files (x86)\\Tencent\\微信开发者工具\\cli.bat',
      'C:\\Program Files\\Tencent\\微信开发者工具\\cli.bat',
    ]
  }
  return [
    '/opt/wechatwebdevtools/cli',
    '/usr/local/bin/wechat-devtools-cli',
  ]
}

// ---- 1. CLI 路径探测 ----
function probeCli() {
  const candidates = defaultCliCandidates()
  let found = null
  let tried = []
  for (const candidate of candidates) {
    tried.push(candidate)
    if (fs.existsSync(candidate)) { found = candidate; break }
  }
  if (!found) {
    record(
      'DevTools CLI 可达',
      'FAIL',
      `未在以下路径找到: ${tried.join(', ')}`,
      '从 https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html 安装微信开发者工具；或设置环境变量 WECHAT_DEVTOOLS_CLI 指向 cli 绝对路径。',
    )
    return null
  }
  let versionOutput = ''
  try {
    versionOutput = execFileSync(found, ['--version'], { encoding: 'utf8', timeout: 5000 }).trim()
  } catch (err) {
    record(
      'DevTools CLI 可达',
      'WARN',
      `找到 CLI (${found}) 但 --version 失败: ${(err.message || err).slice(0, 120)}`,
      '可能是首次运行需要打开 GUI 一次；先手动启动一次 DevTools 即可。',
    )
    return found
  }
  record('DevTools CLI 可达', 'PASS', `${found} (${versionOutput.split('\n')[0]})`)
  return found
}

// ---- 2. automator 包 ----
function probeAutomator() {
  const locations = [
    { name: 'project', mod: () => require('miniprogram-automator') },
    { name: 'global /tmp', mod: () => require('/tmp/learning-diagnostic-automator/node_modules/miniprogram-automator') },
  ]
  for (const loc of locations) {
    try {
      const m = loc.mod()
      const keys = Object.keys(m || {}).slice(0, 5)
      record(
        'miniprogram-automator',
        'PASS',
        `已加载 (${loc.name}); exports: ${keys.join(', ') || '(无)'}…`,
      )
      return m
    } catch (err) {
      // continue
    }
  }
  record(
    'miniprogram-automator',
    'FAIL',
    'require("miniprogram-automator") 失败',
    '运行 npm i --no-save miniprogram-automator@latest 安装；或在 /tmp/learning-diagnostic-automator 安装一份。',
  )
  return null
}

// ---- 3. project.config.json ----
function probeProjectConfig() {
  const configPath = path.join(projectPath, 'project.config.json')
  if (!fs.existsSync(configPath)) {
    record('project.config.json', 'FAIL', `${configPath} 不存在`, '确认项目根目录指向 miniprogram-learning-diagnostic/')
    return null
  }
  let cfg
  try { cfg = JSON.parse(fs.readFileSync(configPath, 'utf8')) } catch (err) {
    record('project.config.json', 'FAIL', `JSON 解析失败: ${err.message}`, '修复 project.config.json 后重试')
    return null
  }
  if (!cfg.appid && !cfg.miniprogramRoot) {
    record('project.config.json', 'WARN', '缺少 appid / miniprogramRoot', '微信开发者工具首次打开时手动指定')
  }
  record('project.config.json', 'PASS', `appid=${cfg.appid || '(未设)'} miniprogramRoot=${cfg.miniprogramRoot || '(未设)'}`)
  return cfg
}

// ---- 4. 模拟 launch 一次 ----
async function probeLaunch(cliPath, automator) {
  if (!cliPath && !automator) {
    record('automator.launch()', 'FAIL', 'cli 和 automator 都未就绪，跳过连通性测试', '先修复前两项再跑这个')
    return
  }
  if (!cliPath) {
    record('automator.launch()', 'FAIL', 'DevTools CLI 未就绪，跳过连通性测试', '修复 "DevTools CLI 可达" 后再跑这个')
    return
  }
  if (!automator) {
    record('automator.launch()', 'FAIL', 'miniprogram-automator 未就绪，跳过连通性测试', '修复 "miniprogram-automator" 后再跑这个')
    return
  }
  let miniProgram
  try {
    miniProgram = await automator.launch({
      cliPath,
      projectPath,
      trustProject: true,
      timeout: 30000,
    })
  } catch (err) {
    const msg = (err && (err.message || err.errMsg || String(err)) || '').slice(0, 300)
    record(
      'automator.launch()',
      'FAIL',
      `连接失败: ${msg}`,
      '可能原因: 1) DevTools 没运行 2) 安全端口未开启 (设置 → 安全 → 服务端口) 3) 防火墙拦截',
    )
    return
  }
  try {
    const info = await miniProgram.systemInfo()
    const stack = await miniProgram.pageStack()
    record(
      'automator.launch()',
      'PASS',
      `platform=${info.platform} SDK=${info.SDKVersion} model=${info.model}; 初始 pageStack 长度 ${stack.length}`,
    )
  } catch (err) {
    record('automator.launch()', 'WARN', `launch 成功但 systemInfo 失败: ${(err.message || err).slice(0, 200)}`, '建议: 重启 DevTools 后重试')
  } finally {
    try { await miniProgram.close() } catch {}
  }
}

// ---- 5. 网络/端口/防火墙 (best effort) ----
function probeNetwork() {
  if (os.platform() === 'darwin') {
    const r = spawnSync('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN'], { encoding: 'utf8', timeout: 5000 })
    if (r.status === 0 && /wechatweb|wechatwebdevtools|微信开发者工具/i.test(r.stdout)) {
      record('DevTools 进程在监听端口', 'PASS', 'lsof 看到 wechatwebdevtools 监听')
      return
    }
    record(
      'DevTools 进程在监听端口',
      'WARN',
      'lsof 未看到 wechatwebdevtools 监听',
      '请先手动打开 DevTools 一次（GUI 启动），再回到这里。',
    )
    return
  }
  record('DevTools 进程在监听端口', 'WARN', `${os.platform()} 暂未实现自动探测`, '手动确认 DevTools 已启动并开启服务端口')
}

// ---- main ----
async function main() {
  console.log('========== DevTools CLI 环境探测 ==========')
  console.log(`平台: ${os.platform()} ${os.release()}`)
  console.log(`项目: ${projectPath}`)
  console.log('')

  const cli = probeCli()
  const automator = probeAutomator()
  probeProjectConfig()
  probeNetwork()
  await probeLaunch(cli, automator)

  console.log('')
  console.log(`汇总: ${failureCount} 失败, ${warnCount} 警告, ${checks.length - failureCount - warnCount} 通过`)
  if (failureCount > 0) {
    console.log('[31m环境未就绪，请按上述提示修复后再跑 E2E。[0m')
    process.exit(1)
  }
  if (warnCount > 0) {
    console.log('[33m环境基本就绪，但有警告；可继续跑 E2E，注意观察。[0m')
    process.exit(0)
  }
  console.log('[32m环境就绪，可以跑 npm run test:e2e:fullpage。[0m')
  process.exit(0)
}

main().catch(err => {
  console.error('doctor 异常:', err && (err.stack || err.message || String(err)))
  process.exit(1)
})
