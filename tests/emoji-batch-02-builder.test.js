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
const CURATION_HELPER_PATH = path.join(ROOT, 'scripts/emoji-compatibility/curate-batch-02-draft.js')
const MANIFEST_PATH = path.join(ROOT, 'scripts/emoji-compatibility/batch-02-manifest.json')
const REAL_SOURCE_CACHE = path.join(ROOT, 'tmp/emoji-compatibility-sources')
const EXPECTED_MANIFEST_SHA256 = 'd9af46c5039ab12da84529d1de92cb6d21d9905651808d7c72ba551f1fd32040'
const EXPECTED_MAPPING_SHA256 = '13e6174aeef4dbf3a3d8a8b09a178ad3cff53223261682edcffeb9581165d999'
const EXPECTED_CATEGORIES = [
  ['B02-C01', '学习与办公', 35, '书本、文具、文件、图表、记录'],
  ['B02-C02', '操作与导航', 35, '方向、播放、切换、搜索、链接'],
  ['B02-C03', '状态与时间', 35, '提醒、进度、日历、时钟、结果'],
  ['B02-C04', '面部与情绪', 35, '常见反馈、思考、困惑、鼓励'],
  ['B02-C05', '基础手势', 35, '指向、赞同、协作、书写、观察'],
  ['B02-C06', '人物与职业', 35, '学生、教师、家长、职业角色'],
  ['B02-C07', '陆地动物', 35, '宠物、野生动物、生肖相关'],
  ['B02-C08', '飞禽水生昆虫', 35, '鸟类、水生动物、昆虫'],
  ['B02-C09', '植物天气自然', 35, '植物、天气、地貌、天体'],
  ['B02-C10', '主食水果蔬菜', 35, '食材、餐食、水果、蔬菜'],
  ['B02-C11', '饮品甜点餐具', 35, '饮品、甜点、餐具、庆祝食物'],
  ['B02-C12', '体育与活动', 35, '球类、运动、奖项、户外活动'],
  ['B02-C13', '艺术音乐游戏', 35, '乐器、表演、美术、玩具、游戏'],
  ['B02-C14', '交通工具', 35, '陆海空交通、站点、出行'],
  ['B02-C15', '建筑与地点', 35, '家庭、学校、公共场所、地标'],
  ['B02-C16', '家居与日用品', 35, '家具、清洁、照明、生活用品'],
  ['B02-C17', '科技与媒体', 35, '手机、电脑、影音、通信设备'],
  ['B02-C18', '工具科学医疗', 35, '工具、实验、医疗、测量设备'],
  ['B02-C19', '服饰与个人物品', 35, '衣物、配饰、箱包、个人用品'],
  ['B02-C20', '数学图形与符号', 35, '数字、字母、数学、形状、标记'],
  ['B02-C21', '文本与 Emoji 呈现', 50, 'VS15/VS16、默认文本和默认彩色差异'],
  ['B02-C22', '肤色修饰组合', 50, '五档肤色、手势和人物修饰'],
  ['B02-C23', '性别职业 ZWJ', 50, '性别、职业、活动等连接序列'],
  ['B02-C24', '家庭关系 ZWJ', 50, '家庭、伴侣、亲子和多人组合'],
  ['B02-C25', '旗帜与标签序列', 50, '区域旗帜、特殊旗帜和 tag 序列'],
  ['B02-C26', '键帽与复杂新版', 50, '键帽、长序列、近期新增和易拆分组合']
]
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

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

function readManifest() {
  assert.equal(fs.existsSync(MANIFEST_PATH), true, 'Task 2 normative manifest must exist')
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
}

function normalizedMapping(manifest) {
  return manifest.items.map(item => ({
    id: item.id,
    sequence: item.sequence,
    categoryId: item.categoryId,
    order: item.order,
    label: item.label,
    labelSource: item.labelSource
  }))
}

function sequenceTokens(sequence) {
  return sequence.split(/\s+/).map(token => token.replace(/^U\+/, '').toUpperCase())
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
  assert.deepEqual(cldr.resolveLabel('00A9 FE0F', '版权符号'), {
    label: '版权', labelSource: 'cldr-primary'
  })
  assert.deepEqual(cldr.resolveLabel('00A9 FE0E', '版权符号', { includePresentationSuffix: true }), {
    label: '版权 文本呈现', labelSource: 'cldr-primary'
  })
  assert.deepEqual(cldr.resolveLabel('00A9 FE0F', '版权符号', { includePresentationSuffix: true }), {
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

test('Task 2 includes an isolated non-normative curation helper', () => {
  assert.equal(fs.existsSync(CURATION_HELPER_PATH), true, 'Task 2 curation helper must exist')
  const source = fs.readFileSync(CURATION_HELPER_PATH, 'utf8')
  const packageJson = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')

  assert.doesNotMatch(source, /batch-02-manifest\.json/)
  assert.doesNotMatch(source, /module\.exports|exports\./)
  assert.match(source, /tmp[\\/]+batch-02-draft\.json|tmp', 'batch-02-draft\.json/)
  assert.doesNotMatch(packageJson, /curate-batch-02-draft/)
})

test('normative manifest freezes exact metadata, quotas, rows, and public mapping', () => {
  const manifestBytes = fs.readFileSync(MANIFEST_PATH)
  const manifest = readManifest()
  const expectedCategoryIds = Array.from(
    { length: 26 },
    (_, index) => `B02-C${String(index + 1).padStart(2, '0')}`
  )

  assert.equal(manifest.id, 'B02')
  assert.equal(manifest.unicodeEmojiVersion, '17.0')
  assert.equal(manifest.cldrVersion, '48.2')
  assert.equal(manifest.count, 1000)
  assert.deepEqual(manifest.categories.map(category => category.id), expectedCategoryIds)
  assert.deepEqual(manifest.categories.map(category => category.count), [
    ...Array(20).fill(35),
    ...Array(6).fill(50)
  ])
  assert.deepEqual(
    manifest.categories.map(category => [category.id, category.name, category.count, category.riskNote]),
    EXPECTED_CATEGORIES
  )
  assert.equal(manifest.items.length, 1000)
  assert.equal(manifest.items.slice(0, 700).every(item => Number(item.categoryId.slice(-2)) <= 20), true)
  assert.equal(manifest.items.slice(700).every(item => Number(item.categoryId.slice(-2)) >= 21), true)

  const categoryById = new Map(manifest.categories.map(category => [category.id, category]))
  const ids = new Set()
  const sequences = new Set()
  manifest.items.forEach((item, index) => {
    const expectedCategoryNumber = Math.floor(index < 700 ? index / 35 : 20 + ((index - 700) / 50)) + 1
    const expectedCategoryId = `B02-C${String(Math.floor(expectedCategoryNumber)).padStart(2, '0')}`
    const expectedOrder = index < 700 ? (index % 35) + 1 : ((index - 700) % 50) + 1

    assert.equal(item.categoryId, expectedCategoryId)
    assert.equal(item.order, expectedOrder)
    assert.equal(item.id, `${expectedCategoryId}-${String(expectedOrder).padStart(3, '0')}`)
    assert.match(item.id, /^B02-C\d{2}-\d{3}$/)
    assert.equal(ids.has(item.id), false, `duplicate ID ${item.id}`)
    assert.equal(sequences.has(item.sequence), false, `duplicate sequence ${item.sequence}`)
    ids.add(item.id)
    sequences.add(item.sequence)
    assert.equal(
      [...item.glyph].map(character => `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join(' '),
      item.sequence,
      `${item.id} glyph must equal its normalized scalar sequence`
    )
    assert.equal(categoryById.get(item.categoryId).riskNote.length > 0, true)
    assert.match(item.labelSource, /^(?:cldr-primary|cldr-derived|fallback)$/)
    assert.equal(typeof item.emojiVersion, 'string')
    assert.notEqual(item.emojiVersion.trim(), '')
    assert.equal(typeof item.label, 'string')
    assert.match(item.label, /\p{Script=Han}|^(?:DNA|DVD)$/u, `${item.id} needs a parent-readable Chinese label`)
  })

  const mapping = normalizedMapping(manifest)
  assert.equal(sha256(manifestBytes), EXPECTED_MANIFEST_SHA256)
  assert.equal(sha256(Buffer.from(JSON.stringify(mapping))), EXPECTED_MAPPING_SHA256)
  assert.deepEqual(mapping, manifest.items.map(item => ({
    id: item.id,
    sequence: item.sequence,
    categoryId: item.categoryId,
    order: item.order,
    label: item.label,
    labelSource: item.labelSource
  })))
})

test('all manifest rows are source-backed and do not overlap the frozen first batch', {
  skip: ![
    'emoji-test.txt',
    'emoji-variation-sequences.txt',
    'cldr-common-48.2.zip'
  ].every(fileName => fs.existsSync(path.join(REAL_SOURCE_CACHE, fileName)))
}, () => {
  const manifest = readManifest()
  const { parseEmojiTest, parseVariationSequences, parseCldrZip, validateManifestAgainstSources } = loadValidator()
  const emojiTest = parseEmojiTest(fs.readFileSync(path.join(REAL_SOURCE_CACHE, 'emoji-test.txt'), 'utf8'))
  const variationSequences = parseVariationSequences(
    fs.readFileSync(path.join(REAL_SOURCE_CACHE, 'emoji-variation-sequences.txt'), 'utf8')
  )
  const cldr = parseCldrZip(fs.readFileSync(path.join(REAL_SOURCE_CACHE, 'cldr-common-48.2.zip')))
  const { EMOJI_CATEGORIES } = require(path.join(ROOT, 'miniprogram/pages/icon-compatibility/emoji-candidates.js'))
  const firstBatchSequences = EMOJI_CATEGORIES.flatMap(category => category.items.map(item => item.sequence))

  assert.deepEqual(validateManifestAgainstSources(manifest, {
    emojiTest,
    variationSequences,
    cldr,
    firstBatchSequences
  }), {
    total: 1000,
    practicalCount: 700,
    highRiskCount: 300
  })
})

test('C21 is exactly 25 adjacent text/Emoji presentation pairs with exact suffixes', () => {
  const items = readManifest().items.filter(item => item.categoryId === 'B02-C21')

  assert.equal(items.length, 50)
  for (let index = 0; index < items.length; index += 2) {
    const textItem = items[index]
    const emojiItem = items[index + 1]
    const textTokens = sequenceTokens(textItem.sequence)
    const emojiTokens = sequenceTokens(emojiItem.sequence)

    assert.deepEqual(textTokens.slice(0, -1), emojiTokens.slice(0, -1))
    assert.equal(textTokens.at(-1), 'FE0E')
    assert.equal(emojiTokens.at(-1), 'FE0F')
    assert.match(textItem.label, / 文本呈现$/)
    assert.match(emojiItem.label, / Emoji 呈现$/)
    assert.equal(textItem.order + 1, emojiItem.order)
  }
})

test('risk categories retain their explicit structural coverage boundaries', () => {
  const manifest = readManifest()
  const byCategory = categoryId => manifest.items.filter(item => item.categoryId === categoryId)
  const hasToken = (item, token) => sequenceTokens(item.sequence).includes(token)
  const isModifier = token => /^1F3F[B-F]$/.test(token)
  const isRegionalIndicator = token => /^1F1(?:E[6-9A-F]|F[0-9A-F])$/.test(token)
  const isTag = token => /^E00[2-7][0-9A-F]$/.test(token)

  assert.equal(byCategory('B02-C22').every(item => sequenceTokens(item.sequence).some(isModifier)), true)
  assert.equal(byCategory('B02-C23').every(item => hasToken(item, '200D')), true)
  assert.equal(byCategory('B02-C24').every(item => hasToken(item, '200D')), true)
  assert.equal(byCategory('B02-C25').every(item => {
    const tokens = sequenceTokens(item.sequence)
    return tokens.filter(isRegionalIndicator).length === 2 || tokens.some(isTag)
  }), true)
  assert.equal(byCategory('B02-C25').some(item => sequenceTokens(item.sequence).some(isTag)), true)
  assert.equal(byCategory('B02-C26').some(item => hasToken(item, '20E3')), true)

  const allTokens = manifest.items.flatMap(item => sequenceTokens(item.sequence))
  for (const required of ['FE0E', 'FE0F', '200D', '20E3']) assert.equal(allTokens.includes(required), true)
  assert.equal(allTokens.some(isModifier), true)
  assert.equal(allTokens.some(isRegionalIndicator), true)
  assert.equal(allTokens.some(isTag), true)
})
