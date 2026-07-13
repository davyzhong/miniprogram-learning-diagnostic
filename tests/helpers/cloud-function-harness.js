const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

function clone(value) {
  return value === undefined ? undefined : structuredClone(value)
}

function matches(document, filter) {
  return Object.entries(filter || {}).every(([key, value]) => {
    if (value && value.__queryOp === 'and') return value.conditions.every(condition => matches({ [key]: document[key] }, { [key]: condition }))
    if (value && value.__queryOp === 'lt') return document[key] < value.value
    if (value && value.__queryOp === 'lte') return document[key] <= value.value
    if (value && value.__queryOp === 'gt') return document[key] > value.value
    if (value && value.__queryOp === 'gte') return document[key] >= value.value
    if (value && value.__queryOp === 'in') return Array.isArray(value.values) && value.values.includes(document[key])
    return document[key] === value
  })
}

function createDatabase(initial = {}, options = {}) {
  let collections = Object.fromEntries(
    Object.entries(initial).map(([name, items]) => [name, clone(items)])
  )
  const missingCollections = new Set(options.missingCollections || [])
  let nextId = 1

  function missingCollectionError(name) {
    const error = new Error(`errCode: -502005 database collection not exists | errMsg: [ResourceNotFound] Db or Table not exist: ${name}`)
    error.errCode = -502005
    error.errMsg = `[ResourceNotFound] Db or Table not exist: ${name}`
    return error
  }

  function assertCollectionExists(name) {
    if (missingCollections.has(name)) throw missingCollectionError(name)
  }

  function getItems(name) {
    if (!collections[name]) collections[name] = []
    return collections[name]
  }

  function applyUpdate(document, data) {
    for (const [key, value] of Object.entries(data)) {
      if (value && value.__operation === 'inc') {
        document[key] = (Number(document[key]) || 0) + value.value
      } else if (value && value.__operation === 'set') {
        document[key] = clone(value.value)
      } else if (value && value.__operation === 'push') {
        if (!Array.isArray(document[key])) document[key] = []
        document[key] = [...document[key], ...value.items]
      } else {
        document[key] = clone(value)
      }
    }
  }

  function collection(name) {
    return {
      add: async ({ data }) => {
        assertCollectionExists(name)
        const items = getItems(name)
        const _id = data._id || `${name}-${nextId++}`
        if (items.some(item => item._id === _id)) {
          const error = new Error(`${name}/${_id} already exists`)
          error.errCode = -502001
          throw error
        }
        items.push({ _id, ...clone(data) })
        return { _id }
      },
      doc: id => ({
        get: async () => {
          assertCollectionExists(name)
          const items = getItems(name)
          return { data: clone(items.find(item => item._id === id)) }
        },
        update: async ({ data }) => {
          assertCollectionExists(name)
          const items = getItems(name)
          const document = items.find(item => item._id === id)
          if (!document) throw new Error(`${name}/${id} not found`)
          if (options.beforeUpdate) options.beforeUpdate({ collection: name, id, data: clone(data) })
          applyUpdate(document, data)
          return { stats: { updated: 1 } }
        }
      }),
      where: filter => {
        assertCollectionExists(name)
        const items = getItems(name)
        let selected = items.filter(item => matches(item, filter))
        let skipCount = 0
        let projection = null
        const projectedItems = items => {
          if (!projection || options.ignoreProjection) return items
          const fields = Object.keys(projection).filter(k => projection[k])
          return items.map(doc => {
            const out = {}
            for (const field of fields) {
              if (field.includes('.')) {
                const [root, child] = field.split('.')
                if (Array.isArray(doc[root])) {
                  out[root] = doc[root].map(value => (
                    value && value[child] !== undefined ? { [child]: value[child] } : {}
                  ))
                }
              } else if (field in doc) {
                out[field] = doc[field]
              }
            }
            if (projection._id !== false && doc._id !== undefined) out._id = doc._id
            return out
          })
        }
        const query = {
          orderBy(field, direction) {
            selected = selected.slice().sort((a, b) => {
              const left = new Date(a[field]).getTime()
              const right = new Date(b[field]).getTime()
              return direction === 'desc' ? right - left : left - right
            })
            return query
          },
          field(spec) {
            projection = spec
            return query
          },
          skip(count) {
            skipCount = count
            return query
          },
          limit(count) {
            selected = selected.slice(skipCount, skipCount + count)
            return query
          },
          get: async () => {
            const data = clone(projectedItems(selected))
            if (options.onQuery) {
              options.onQuery({ collection: name, data: clone(data), projection: clone(projection) })
            }
            return { data }
          }
        }
        return query
      }
    }
  }

  let transactionQueue = Promise.resolve()
  const database = {
    collection,
    runTransaction: async callback => {
      const run = transactionQueue.then(async () => {
        const snapshot = clone(collections)
        try {
          return await callback({ collection })
        } catch (error) {
          collections = snapshot
          throw error
        }
      })
      transactionQueue = run.catch(() => {})
      return run
    },
    createCollection: async name => {
      missingCollections.delete(name)
      getItems(name)
      return { errMsg: 'collection.create:ok' }
    },
    command: {
      inc: value => ({ __operation: 'inc', value }),
      set: value => ({ __operation: 'set', value }),
      push: items => ({ __operation: 'push', items: Array.isArray(items) ? items : [items] }),
      lt: value => ({ __queryOp: 'lt', value }),
      lte: value => ({ __queryOp: 'lte', value }),
      gt: value => ({ __queryOp: 'gt', value }),
      gte: value => ({ __queryOp: 'gte', value }),
      in: values => ({ __queryOp: 'in', values: clone(values || []) }),
      and: conditions => ({ __queryOp: 'and', conditions })
    },
    serverDate: () => new Date('2026-06-11T12:00:00+08:00'),
    dump: name => clone(getItems(name))
  }
  return database
}

function createCloudMock(options = {}) {
  const db = options.db || createDatabase()
  const calls = []
  return {
    SYMBOL_CURRENT_ENV: 'test',
    calls,
    init() {},
    database: () => db,
    getWXContext: () => ({ OPENID: options.openId || 'owner-1' }),
    callFunction: async payload => {
      calls.push({ name: 'callFunction', payload })
      return options.callFunction ? options.callFunction(payload) : { result: { success: true } }
    },
    getTempFileURL: async payload => options.getTempFileURL
      ? options.getTempFileURL(payload)
      : { fileList: payload.fileList.map(fileID => ({ fileID, tempFileURL: `https://temp/${fileID}` })) },
    uploadFile: async payload => {
      calls.push({ name: 'uploadFile', payload })
      return options.uploadFile ? options.uploadFile(payload) : { fileID: `cloud://${payload.cloudPath}` }
    },
    downloadFile: async payload => options.downloadFile
      ? options.downloadFile(payload)
      : { fileContent: Buffer.from('font') }
  }
}

function loadModule(relativePath, mocks = {}, globals = {}) {
  const root = path.resolve(__dirname, '../..')
  const filename = path.join(root, relativePath)
  const source = fs.readFileSync(filename, 'utf8')
  const module = { exports: {} }
  const sandbox = {
    Buffer,
    console,
    Date,
    Map,
    Set,
    Promise,
    process,
    setTimeout,
    clearTimeout,
    module,
    exports: module.exports,
    __filename: filename,
    __dirname: path.dirname(filename),
    require: request => {
      if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request]
      if (request.startsWith('.')) return require(path.resolve(path.dirname(filename), request))
      return require(request)
    },
    ...globals
  }
  vm.runInNewContext(source, sandbox, { filename })
  return module.exports
}

module.exports = {
  createCloudMock,
  createDatabase,
  loadModule
}
