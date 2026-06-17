/**
 * 最小 Intl polyfill（仅 iOS JavaScriptCore）
 *
 * 微信增强编译器 (enhance: true) webpack 打包时注入的 core-js 模块
 * 在某些 iOS/macOS 环境会调用 Intl.DateTimeFormat。iOS JSC 引擎
 * 不支持 Intl API，导致：
 *   ReferenceError: Intl is not defined
 *   → formatRelativeTime → buildChildWorkbenchCards → 全部页面白屏
 *
 * 这个 polyfill 只覆盖 DateTimeFormat（增强编译器需要的），
 * 不做全量 Intl polyfill。
 *
 * 引用方案（已在 app.js onLaunch 首行执行）：
 *   require('./utils/intl-polyfill')
 *
 * 注意：云函数端不需要这个 polyfill（Node.js 支持 Intl）。
 *       如需验证 polyfill 是否生效：
 *       npm test tests/intl-polyfill.test.js
 */

if (typeof Intl === 'undefined') {
  global.Intl = {
    DateTimeFormat: function (locale, options) {
      const localeOpts = options || {}
      const timeZone = localeOpts.timeZone || 'Asia/Shanghai'

      function pad(n) { return String(n).padStart(2, '0') }

      const format = {
        format: function (date) {
          // 纯数学偏移 UTC+8，与 util.js beijingParts 一致
          const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000
          const shifted = new Date(date.getTime() + BEIJING_OFFSET_MS)
          const p = {
            year: shifted.getUTCFullYear(),
            month: shifted.getUTCMonth() + 1,
            day: shifted.getUTCDate(),
            hour: shifted.getUTCHours(),
            minute: shifted.getUTCMinutes(),
            second: shifted.getUTCSeconds()
          }

          let result = ''
          if (localeOpts.year === 'numeric') result += p.year
          if (localeOpts.month === '2-digit') result += (result ? '-' : '') + pad(p.month)
          if (localeOpts.day === '2-digit') result += (result ? '-' : '') + pad(p.day)
          if (localeOpts.hour === '2-digit') result += (result ? ' ' : '') + pad(p.hour)
          if (localeOpts.minute === '2-digit') result += ':' + pad(p.minute)
          if (localeOpts.second === '2-digit') result += ':' + pad(p.second)

          return result || String(p.year)
        }
      }

      return format
    }
  }

  console.log('[intl-polyfill] Intl polyfill 已注入（运行环境缺失 Intl API）')
}
