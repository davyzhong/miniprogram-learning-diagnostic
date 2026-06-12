const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')

test('every registered page has its complete four-file bundle', () => {
  const app = require('../miniprogram/app.json')
  for (const page of app.pages) {
    for (const extension of ['js', 'json', 'wxml', 'wxss']) {
      assert.equal(
        fs.existsSync(path.join(root, 'miniprogram', `${page}.${extension}`)),
        true,
        `${page}.${extension} is missing`
      )
    }
  }
})

test('every WXML event handler exists on its page controller', () => {
  const pagesDir = path.join(root, 'miniprogram/pages')
  for (const directory of fs.readdirSync(pagesDir)) {
    const base = path.join(pagesDir, directory, directory)
    if (!fs.existsSync(`${base}.wxml`)) continue
    const wxml = fs.readFileSync(`${base}.wxml`, 'utf8')
    const js = fs.readFileSync(`${base}.js`, 'utf8')
    const handlers = [...wxml.matchAll(/(?:bind|catch)(?:tap|input|change|submit|longpress)="([^"]+)"/g)]
      .map(match => match[1])
    for (const handler of handlers) {
      assert.match(js, new RegExp(`\\b${handler}\\s*\\(`), `${directory} is missing ${handler}`)
    }
  }
})

test('brand illustration and logo assets exist', () => {
  const assets = [
    'miniprogram/assets/images/math-diagnostic-guide.jpg',
    'miniprogram/assets/images/app-logo-share.jpg',
    'brand-assets/app-logo.png'
  ]

  for (const asset of assets) {
    const absolutePath = path.join(root, asset)
    assert.equal(fs.existsSync(absolutePath), true, `${asset} is missing`)
    assert.ok(fs.statSync(absolutePath).size > 0, `${asset} is empty`)
  }
})
