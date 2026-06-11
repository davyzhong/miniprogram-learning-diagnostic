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
    navigateBack: record('navigateBack'),
    setNavigationBarTitle: record('setNavigationBarTitle'),
    setNavigationBarColor: record('setNavigationBarColor'),
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

  const sandbox = {
    console,
    Date: options.Date || Date,
    Promise,
    Map,
    Set,
    encodeURIComponent,
    decodeURIComponent,
    setTimeout: options.setTimeout || (callback => callback()),
    clearTimeout,
    wx,
    Page: config => { definition = config },
    require: request => {
      if (options.modules && Object.prototype.hasOwnProperty.call(options.modules, request)) {
        return options.modules[request]
      }
      return require(path.resolve(path.dirname(filename), request))
    }
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
