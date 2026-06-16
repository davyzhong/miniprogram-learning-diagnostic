const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function setByPath(target, key, value) {
  const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.')
  let current = target
  for (let i = 0; i < parts.length - 1; i++) {
    if (current[parts[i]] === undefined) {
      current[parts[i]] = /^\d+$/.test(parts[i + 1]) ? [] : {}
    }
    current = current[parts[i]]
  }
  current[parts[parts.length - 1]] = value
}

function createWxMock(overrides = {}) {
  const calls = []
  const record = name => payload => {
    calls.push({ name, payload })
    return Promise.resolve(payload)
  }
  return {
    calls,
    showLoading: record('showLoading'),
    hideLoading: record('hideLoading'),
    showToast: record('showToast'),
    navigateTo: record('navigateTo'),
    redirectTo: record('redirectTo'),
    navigateBack: record('navigateBack'),
    setNavigationBarTitle: record('setNavigationBarTitle'),
    setNavigationBarColor: record('setNavigationBarColor'),
    setClipboardData: record('setClipboardData'),
    previewImage: record('previewImage'),
    openDocument: record('openDocument'),
    chooseMedia: () => {},
    cloud: {
      uploadFile: () => {},
      downloadFile: async () => ({ tempFilePath: '/tmp/file.pdf' }),
      ...(overrides.cloud || {})
    },
    ...overrides
  }
}

function loadPage(relativePath, options = {}) {
  const root = path.resolve(__dirname, '../..')
  const filename = path.join(root, relativePath)
  const source = fs.readFileSync(filename, 'utf8')
  const wx = options.wx || createWxMock()
  let definition = null
  const moduleCache = {}

  // Sandbox require: resolves relative paths INSIDE the sandbox so that
  // shared modules (e.g. shared-navigation.js) can access sandbox globals
  // like `wx`. Non-relative requires (node builtins, npm packages) fall
  // through to the host require.
  function sandboxRequire(request, fromDir, depth) {
    // options.modules mocks only apply at depth 0 (the page file's direct requires).
    // Deeper transitive requires use the real host modules to avoid partial mocks.
    if (depth === 0 && options.modules && Object.prototype.hasOwnProperty.call(options.modules, request)) {
      return options.modules[request]
    }
    if (!request.startsWith('.')) {
      return require(request)
    }
    const resolved = path.resolve(fromDir, request)
    if (moduleCache[resolved]) return moduleCache[resolved].exports
    if (resolved.endsWith('.json')) {
      const data = JSON.parse(fs.readFileSync(resolved, 'utf8'))
      moduleCache[resolved] = { exports: data }
      return data
    }
    const jsPath = resolved.endsWith('.js') ? resolved : resolved + '.js'
    if (!fs.existsSync(jsPath)) {
      return require(resolved)
    }
    // Modules that reference `wx` need the sandbox context (e.g. shared-navigation.js).
    // Pure utility modules (util.js, constants.js, etc.) are loaded via host require
    // to avoid breaking partial mocks at transitive depth.
    const depSource = fs.readFileSync(jsPath, 'utf8')
    if (!/\bwx\b/.test(depSource)) {
      return require(jsPath)
    }
    const mod = { exports: {} }
    moduleCache[resolved] = mod
    const depDir = path.dirname(jsPath)
    vm.runInNewContext(depSource, {
      ...sandboxGlobals,
      __filename: jsPath,
      __dirname: depDir,
      module: mod,
      exports: mod.exports,
      require: req => sandboxRequire(req, depDir, depth + 1)
    }, { filename: jsPath })
    return mod.exports
  }

  const sandboxGlobals = {
    console,
    Date: options.Date || Date,
    Promise,
    Map,
    Set,
    Array,
    Object,
    Buffer,
    JSON,
    RegExp,
    encodeURIComponent,
    decodeURIComponent,
    setTimeout: options.setTimeout || (callback => callback()),
    clearTimeout,
    wx
  }

  const sandbox = {
    ...sandboxGlobals,
    Page: config => { definition = config },
    requirePlugin: options.requirePlugin,
    require: request => sandboxRequire(request, path.dirname(filename), 0),
    __filename: filename,
    __dirname: path.dirname(filename)
  }

  vm.runInNewContext(source, sandbox, { filename })
  if (!definition) throw new Error(`${relativePath} did not register a Page`)

  const page = {
    ...definition,
    data: clone(definition.data || {}),
    setData(update) {
      for (const [key, value] of Object.entries(update)) {
        setByPath(this.data, key, value)
      }
    }
  }
  return { page, wx }
}

module.exports = {
  createWxMock,
  loadPage
}
