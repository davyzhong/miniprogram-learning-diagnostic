#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const manifestPath = path.join(root, 'database/indexes.json')

function fail(message) {
  console.error(`[database-indexes] ${message}`)
  process.exitCode = 1
}

if (!fs.existsSync(manifestPath)) {
  fail('missing database/indexes.json')
} else {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const indexes = Array.isArray(manifest.indexes) ? manifest.indexes : []
  const analysisIndex = indexes.find(index => index.collection === 'analysisTasks')
  const expectedFields = JSON.stringify([
    { field: 'reportId', order: 'asc' },
    { field: 'createdAt', order: 'desc' }
  ])

  if (!analysisIndex || JSON.stringify(analysisIndex.fields) !== expectedFields) {
    fail('analysisTasks requires reportId ASC + createdAt DESC')
  }

  for (const index of indexes) {
    for (const source of index.requiredBy || []) {
      if (!fs.existsSync(path.join(root, source))) fail(`${index.name} references missing source ${source}`)
    }
  }

  if (process.argv.includes('--require-live-ack') && process.env.CLOUDBASE_INDEXES_VERIFIED !== '1') {
    fail('set CLOUDBASE_INDEXES_VERIFIED=1 only after every manifest index is active in CloudBase')
  }

  if (!process.exitCode) {
    console.log(`[database-indexes] ${indexes.length} required index declaration(s) verified`)
  }
}
