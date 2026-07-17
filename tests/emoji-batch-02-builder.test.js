const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const AdmZip = require('adm-zip')

const ROOT = path.resolve(__dirname, '..')
const VALIDATOR_PATH = path.join(ROOT, 'scripts/emoji-compatibility/validate-batch-02-manifest.js')
const REAL_SOURCE_CACHE = path.join(ROOT, 'tmp/emoji-compatibility-sources')
const PUBLIC_EXPORTS = [
  'PINNED_SOURCES',
  'assertPinnedHash',
  'parseEmojiTest',
  'parseVariationSequences',
  'parseCldrZip',
  'validateManifest',
  'validateManifestAgainstSources'
]

function loadValidator() {
  delete require.cache[VALIDATOR_PATH]
  return require(VALIDATOR_PATH)
}

function cldrFixture() {
  const zip = new AdmZip()
  zip.addFile('common/annotations/zh.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8" ?>
    <ldml><annotations>
      <annotation cp="\u{1F4DA}" type="tts">课本 &amp; 资料</annotation>
      <annotation cp="\u{1F9EA}" type="tts">试管</annotation>
      <annotation cp="©" type="tts">版权</annotation>
    </annotations></ldml>`))
  zip.addFile('common/annotationsDerived/zh.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8" ?>
    <ldml><annotations>
      <annotation cp="\u{1F9EA}" type="tts">派生试管</annotation>
      <annotation cp="\u{1F9EC}" type="tts">DNA</annotation>
    </annotations></ldml>`))
  return zip.toBuffer()
}

function smallManifest(overrides = {}) {
  return {
    id: 'B02',
    unicodeEmojiVersion: '17.0',
    cldrVersion: '48.2',
    count: 1,
    categories: [{
      id: 'B02-C01',
      name: '学习与办公',
      riskNote: 'fixture risk',
      count: 1
    }],
    items: [{
      id: 'B02-C01-001',
      categoryId: 'B02-C01',
      order: 1,
      glyph: '😀',
      sequence: 'U+1F600',
      label: '咧嘴笑',
      labelSource: 'fallback',
      emojiVersion: '1.0'
    }],
    ...overrides
  }
}

test('exports the exact approved pinned source contracts', () => {
  const validator = loadValidator()
  const { PINNED_SOURCES } = validator

  assert.deepEqual(Object.keys(validator).sort(), [...PUBLIC_EXPORTS].sort())

  assert.deepEqual(PINNED_SOURCES.emojiTest, {
    url: 'https://www.unicode.org/Public/17.0.0/emoji/emoji-test.txt',
    sha256: '1d8a944f88d7952f7ef7c5167fef3c67995bcae24543949710231b03a201acda',
    fileName: 'emoji-test.txt'
  })
  assert.deepEqual(PINNED_SOURCES.variationSequences, {
    url: 'https://www.unicode.org/Public/17.0.0/ucd/emoji/emoji-variation-sequences.txt',
    sha256: 'bb3d09ef03f206012c7532dd52dc0a21c9efddba0135ea4cf0d9201b8b9bba7e',
    fileName: 'emoji-variation-sequences.txt'
  })
  assert.deepEqual(PINNED_SOURCES.cldr, {
    url: 'https://unicode.org/Public/cldr/48.2/cldr-common-48.2.zip',
    sha256: 'd2844f9dbf6124d11a7b047f5381a467902d82a673be3d658f4c0791ffa0b83b',
    fileName: 'cldr-common-48.2.zip',
    entries: {
      primary: 'common/annotations/zh.xml',
      derived: 'common/annotationsDerived/zh.xml'
    }
  })
})

test('rejects bytes that do not match a pinned checksum', () => {
  const { assertPinnedHash } = loadValidator()
  const bytes = Buffer.from('approved source bytes')
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex')

  assert.equal(assertPinnedHash(bytes, { sha256, fileName: 'fixture.txt' }), sha256)
  assert.throws(
    () => assertPinnedHash(Buffer.from('tampered'), { sha256, fileName: 'fixture.txt' }),
    /fixture\.txt checksum mismatch/
  )
})

test('parses emoji qualification, version, groups, and literal source order without selecting rows', () => {
  const { parseEmojiTest } = loadValidator()
  const records = parseEmojiTest(`# Version: 17.0
# group: Smileys & Emotion
# subgroup: face-smiling
1F600 ; fully-qualified # 😀 E1.0 grinning face
263A FE0F ; fully-qualified # ☺️ E0.6 smiling face
263A ; unqualified # ☺ E0.6 smiling face
`)

  assert.deepEqual(records, [
    {
      sequence: '1F600', glyph: '😀', qualification: 'fully-qualified', emojiVersion: '1.0',
      name: 'grinning face', group: 'Smileys & Emotion', subgroup: 'face-smiling', sourceOrder: 0
    },
    {
      sequence: '263A FE0F', glyph: '☺️', qualification: 'fully-qualified', emojiVersion: '0.6',
      name: 'smiling face', group: 'Smileys & Emotion', subgroup: 'face-smiling', sourceOrder: 1
    },
    {
      sequence: '263A', glyph: '☺', qualification: 'unqualified', emojiVersion: '0.6',
      name: 'smiling face', group: 'Smileys & Emotion', subgroup: 'face-smiling', sourceOrder: 2
    }
  ])
})

test('parses both text and emoji variation sequences in source order', () => {
  const { parseVariationSequences } = loadValidator()
  const records = parseVariationSequences(`# Version: 17.0
00A9 FE0E ; text style; # (1.1) COPYRIGHT SIGN
00A9 FE0F ; emoji style; # (1.1) COPYRIGHT SIGN
`)

  assert.deepEqual(records, [
    {
      sequence: '00A9 FE0E', baseSequence: '00A9', glyph: '©︎', presentation: 'text',
      unicodeVersion: '1.1', name: 'COPYRIGHT SIGN', sourceOrder: 0
    },
    {
      sequence: '00A9 FE0F', baseSequence: '00A9', glyph: '©️', presentation: 'emoji',
      unicodeVersion: '1.1', name: 'COPYRIGHT SIGN', sourceOrder: 1
    }
  ])
})

test('decodes CLDR XML and resolves primary, derived, fallback, and C21 suffix labels', () => {
  const { parseCldrZip } = loadValidator()
  const cldr = parseCldrZip(cldrFixture())

  assert.deepEqual(cldr.resolveLabel('1F4DA', '回退课本'), {
    label: '课本 & 资料', labelSource: 'cldr-primary'
  })
  assert.deepEqual(cldr.resolveLabel('1F9EA', '回退试管'), {
    label: '试管', labelSource: 'cldr-primary'
  })
  assert.deepEqual(cldr.resolveLabel('1F9EC', '回退 DNA'), {
    label: 'DNA', labelSource: 'cldr-derived'
  })
  assert.deepEqual(cldr.resolveLabel('1FAE0', '融化脸'), {
    label: '融化脸', labelSource: 'fallback'
  })
  assert.deepEqual(cldr.resolveLabel('00A9 FE0E', '版权符号'), {
    label: '版权 文本呈现', labelSource: 'cldr-primary'
  })
  assert.deepEqual(cldr.resolveLabel('00A9 FE0F', '版权符号'), {
    label: '版权 Emoji 呈现', labelSource: 'cldr-primary'
  })
  assert.throws(() => cldr.resolveLabel('1FAE0'), /explicit fallback label/)
})

test('importing the validator performs no network or filesystem mutations', () => {
  const originalFetch = global.fetch
  const fetchCalls = []
  const originals = new Map()
  const mutationCalls = []
  const mutators = ['writeFileSync', 'mkdirSync', 'mkdtempSync', 'copyFileSync', 'renameSync']

  global.fetch = (...args) => {
    fetchCalls.push(args)
    throw new Error('fetch must not run during import')
  }
  mutators.forEach(name => {
    originals.set(name, fs[name])
    fs[name] = (...args) => {
      mutationCalls.push([name, ...args])
      throw new Error(`${name} must not run during import`)
    }
  })

  try {
    const validator = loadValidator()
    assert.equal(typeof validator.validateManifest, 'function')
    assert.equal(typeof validator.validateManifestAgainstSources, 'function')
    assert.deepEqual(fetchCalls, [])
    assert.deepEqual(mutationCalls, [])
  } finally {
    global.fetch = originalFetch
    originals.forEach((fn, name) => { fs[name] = fn })
  }
})

test('validates small authored manifests and their fully-qualified source membership', () => {
  const { parseEmojiTest, validateManifest, validateManifestAgainstSources } = loadValidator()
  const manifest = smallManifest()
  const sourceRecords = parseEmojiTest(`# Version: 17.0
# group: Smileys & Emotion
# subgroup: face-smiling
1F600 ; fully-qualified # 😀 E1.0 grinning face
`)
  const options = { categoryCounts: [1], expectedTotal: 1, practicalCount: 1 }

  assert.deepEqual(validateManifest(manifest, options), {
    total: 1,
    practicalCount: 1,
    highRiskCount: 0
  })
  assert.deepEqual(validateManifestAgainstSources(manifest, {
    emojiTest: sourceRecords,
    variationSequences: [],
    firstBatchSequences: []
  }, options), {
    total: 1,
    practicalCount: 1,
    highRiskCount: 0
  })
  assert.throws(
    () => validateManifest(smallManifest({
      items: [{ ...manifest.items[0], glyph: '😀', sequence: 'U+1F601' }]
    }), options),
    /glyph does not match sequence/
  )
  assert.throws(
    () => validateManifest(smallManifest({
      items: [manifest.items[0], { ...manifest.items[0], id: 'B02-C01-002', order: 2 }],
      count: 2,
      categories: [{ ...manifest.categories[0], count: 2 }]
    }), { categoryCounts: [2], expectedTotal: 2, practicalCount: 2 }),
    /duplicate Unicode sequence/
  )
  assert.throws(
    () => validateManifest(smallManifest({
      items: [{ ...manifest.items[0], id: 'B02-C01-002' }]
    }), options),
    /ID\/order mismatch/
  )
})

test('CLI verifies cached pinned source checksums before manifest structure', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emoji-batch-02-cli-'))
  const manifestPath = path.join(tempDir, 'manifest.json')
  const cacheDir = path.join(tempDir, 'sources')
  fs.mkdirSync(cacheDir)
  fs.writeFileSync(manifestPath, '{}')
  Object.values({
    emojiTest: 'emoji-test.txt',
    variationSequences: 'emoji-variation-sequences.txt',
    cldr: 'cldr-common-48.2.zip'
  }).forEach(fileName => fs.writeFileSync(path.join(cacheDir, fileName), 'tampered'))

  try {
    const result = spawnSync(process.execPath, [VALIDATOR_PATH, '--verify'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        EMOJI_MANIFEST_PATH: manifestPath,
        EMOJI_SOURCE_CACHE_DIR: cacheDir,
        EMOJI_NO_NETWORK: '1'
      }
    })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /emoji-test\.txt checksum mismatch/)
    assert.doesNotMatch(result.stderr, /manifest id must be B02/)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('CLI verifies pinned sources before parsing malformed manifest JSON', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emoji-batch-02-cli-order-'))
  const manifestPath = path.join(tempDir, 'manifest.json')
  const cacheDir = path.join(tempDir, 'sources')
  fs.mkdirSync(cacheDir)
  fs.writeFileSync(manifestPath, '{ malformed manifest')
  fs.writeFileSync(path.join(cacheDir, 'emoji-test.txt'), 'tampered')

  try {
    const result = spawnSync(process.execPath, [VALIDATOR_PATH, '--verify'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        EMOJI_MANIFEST_PATH: manifestPath,
        EMOJI_SOURCE_CACHE_DIR: cacheDir,
        EMOJI_NO_NETWORK: '1'
      }
    })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /emoji-test\.txt checksum mismatch/)
    assert.doesNotMatch(result.stderr, /Unexpected token|JSON|manifest JSON/i)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('CLI rejects dangling cache symlinks without touching their targets', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emoji-batch-02-cli-symlink-'))
  const manifestPath = path.join(tempDir, 'manifest.json')
  const cacheDir = path.join(tempDir, 'sources')
  const outsideTarget = path.join(tempDir, 'outside-target.txt')
  const symlinkPath = path.join(cacheDir, 'emoji-test.txt')
  fs.mkdirSync(cacheDir)
  fs.writeFileSync(manifestPath, '{}')
  fs.symlinkSync(outsideTarget, symlinkPath)

  try {
    const result = spawnSync(process.execPath, [VALIDATOR_PATH, '--verify'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        EMOJI_MANIFEST_PATH: manifestPath,
        EMOJI_SOURCE_CACHE_DIR: cacheDir,
        EMOJI_NO_NETWORK: '1'
      }
    })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /emoji-test\.txt.*regular file|regular file.*emoji-test\.txt/i)
    assert.equal(fs.existsSync(outsideTarget), false)
    assert.equal(fs.lstatSync(symlinkPath).isSymbolicLink(), true)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('CLI reads the local real source cache before validating the manifest', {
  skip: ![
    'emoji-test.txt',
    'emoji-variation-sequences.txt',
    'cldr-common-48.2.zip'
  ].every(fileName => fs.existsSync(path.join(REAL_SOURCE_CACHE, fileName)))
}, () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emoji-batch-02-cli-real-'))
  const manifestPath = path.join(tempDir, 'manifest.json')
  fs.writeFileSync(manifestPath, '{}')

  try {
    const result = spawnSync(process.execPath, [VALIDATOR_PATH, '--verify'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        EMOJI_MANIFEST_PATH: manifestPath,
        EMOJI_SOURCE_CACHE_DIR: REAL_SOURCE_CACHE,
        EMOJI_NO_NETWORK: '1'
      }
    })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /manifest id must be B02/)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('--verify fails clearly while the Task 2 manifest is absent', () => {
  const manifestPath = path.join(ROOT, 'scripts/emoji-compatibility/batch-02-manifest.json')
  if (fs.existsSync(manifestPath)) return

  const result = spawnSync(process.execPath, [VALIDATOR_PATH, '--verify'], {
    cwd: ROOT,
    encoding: 'utf8'
  })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Task 2 manifest is missing: .*batch-02-manifest\.json/)
})
