// ESLint flat config（ESLint v10）
// 环境区分：
//   miniprogram/  —— 微信小程序运行时（wx/App/Page/Component 全局，CJS）
//   cloudfunctions/ —— Node.js 云函数（CJS + wx-server-sdk 经 require）
//   tests|scripts|services|cli —— Node.js 工具链（CJS；tests/scripts 的 harness 合法引用 wx mock 面）
// 门禁策略：error 阻断（no-undef、no-redeclare 等真实缺陷），warn 可见但不阻断
//   （存量 no-unused-vars / no-useless-assignment 债务，见知识库《手写实现与行业标准选型对比》）。
import js from '@eslint/js'

const recommended = js.configs.recommended.rules

const wxGlobals = {
  wx: 'readonly', App: 'readonly', Page: 'readonly', Component: 'readonly',
  Behavior: 'readonly', getApp: 'readonly', getCurrentPages: 'readonly',
  requirePlugin: 'readonly', require: 'readonly',
  module: 'writable', exports: 'writable', console: 'readonly',
  global: 'writable', globalThis: 'writable',
  setTimeout: 'readonly', clearTimeout: 'readonly',
  setInterval: 'readonly', clearInterval: 'readonly',
}

const nodeCommonJS = {
  require: 'readonly', module: 'writable', exports: 'writable',
  process: 'readonly', console: 'readonly',
  global: 'writable', globalThis: 'writable',
  Buffer: 'readonly', URL: 'readonly', URLSearchParams: 'readonly', TextEncoder: 'readonly', TextDecoder: 'readonly',
  fetch: 'readonly', __dirname: 'readonly', __filename: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly',
  setInterval: 'readonly', clearInterval: 'readonly',
  setImmediate: 'readonly', clearImmediate: 'readonly',
  queueMicrotask: 'readonly', structuredClone: 'readonly',
}

// 基线规则：recommended 起步，按项目现实调三处
const baseRules = {
  ...recommended,
  // 空 catch 是既定的 fire-and-forget 模式（如推送失败仅记日志）；其余空块仍拦截
  'no-empty': ['error', { allowEmptyCatch: true }],
  // 真实债务但量大（49 处），降 warn 供专项清理，不阻断门禁
  'no-useless-assignment': 'warn',
  // 重抛加 cause 属增强项，降 warn
  'preserve-caught-error': 'warn',
  // 存量未用变量（118 处）可见不阻断；忽略函数入参与 catch 形参（小程序生命周期签名固定）
  'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
}

export default [
  {
    ignores: [
      'node_modules/**', '**/node_modules/**',
      'tmp/**', 'cloud1-*/**', '.worktrees/**',
      'miniprogram/miniprogram_npm/**',
    ],
  },
  {
    files: ['miniprogram/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'script', globals: { ...nodeCommonJS, ...wxGlobals } },
    rules: baseRules,
  },
  {
    // 云函数无 wx 全局——云端代码调用 wx 属真实缺陷，必须被 no-undef 拦截
    files: ['cloudfunctions/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'script', globals: { ...nodeCommonJS } },
    rules: baseRules,
  },
  {
    // 工具链与测试 harness 合法引用 wx / getCurrentPages（mock 面注入）
    files: ['tests/**/*.js', 'scripts/**/*.js', 'services/**/*.js', 'cli/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'script', globals: { ...nodeCommonJS, ...wxGlobals } },
    rules: baseRules,
  },
]
