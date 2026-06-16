#!/usr/bin/env node

const fs = require('node:fs')
const https = require('node:https')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const OUTPUTS = [
  path.join(ROOT, 'data/english/zhong-qingyu-pep-vocabulary.seed.json'),
  path.join(ROOT, 'cloudfunctions/englishVocabulary/zhong-qingyu-pep-vocabulary.json')
]

const SOURCES = [
  {
    key: 'pep-grade-3-upper',
    grade: 3,
    volume: '上册',
    sourceFile: 'PEP三年级上下册 英语单词句型表.pdf',
    sourceUrl: 'https://yyld.51jiaoxi.com/sanshang/rjbp_danyuan10.html'
  },
  {
    key: 'pep-grade-3-lower',
    grade: 3,
    volume: '下册',
    sourceFile: 'PEP三年级上下册 英语单词句型表.pdf',
    sourceUrl: 'https://yyld.51jiaoxi.com/sanxia/rjbp_danyuan09.html'
  },
  {
    key: 'pep-grade-4-upper',
    grade: 4,
    volume: '上册',
    sourceFile: 'PEP四年级上册 英语单词句型表.pdf',
    sourceUrl: 'https://yyld.51jiaoxi.com/sishang/rjbp_danyuan09.html'
  },
  {
    key: 'pep-grade-4-lower',
    grade: 4,
    volume: '下册',
    sourceFile: 'PEP四年级下册 英语单词句型表(1)(1).docx',
    sourceUrl: 'https://yyld.51jiaoxi.com/sixia/rjbp_danyuan09.html'
  },
  {
    key: 'pep-grade-5-upper',
    grade: 5,
    volume: '上册',
    sourceFile: 'PEP五年级上册 英语单词句型表.pdf',
    sourceUrl: 'https://yyld.51jiaoxi.com/wushang/rjbp_danyuan10.html'
  },
  {
    key: 'pep-grade-5-lower',
    grade: 5,
    volume: '下册',
    sourceFile: 'PEP五年级下册 英语单词句型表.pdf',
    sourceUrl: 'https://yyld.51jiaoxi.com/wuxia/rjbp_danyuan10.html'
  },
  {
    key: 'pep-grade-6-upper',
    grade: 6,
    volume: '上册',
    sourceFile: 'PEP六年级上册 英语单词句型表.pdf',
    sourceUrl: 'https://yyld.51jiaoxi.com/liushang/rjbp_danyuan10.html'
  }
]

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(fetchText(new URL(res.headers.location, url).toString()))
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${url}`))
        res.resume()
        return
      }
      let body = ''
      res.setEncoding('utf8')
      res.on('data', chunk => { body += chunk })
      res.on('end', () => resolve(body))
    }).on('error', reject)
  })
}

function decodeHtml(text) {
  return String(text || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function stripTags(html) {
  return decodeHtml(String(html || '').replace(/<[^>]*>/g, ' '))
    .replace(/[ \t\r\n]+/g, ' ')
    .trim()
}

function cleanWord(text) {
  return stripTags(text)
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanMeaning(text) {
  return stripTags(text)
    .replace(/^[:：]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isUnitHeading(english) {
  return /^Unit\s+\d+/i.test(english)
}

function unitText(english) {
  const match = String(english || '').match(/^Unit\s+(\d+)/i)
  return match ? `Unit ${match[1]}` : ''
}

function isVocabularyWord(english, chinese) {
  if (!english || !chinese) return false
  if (/^Appendix/i.test(english) || /^Words in each unit/i.test(english)) return false
  if (isUnitHeading(english)) return false
  if (!/[A-Za-z]/.test(english)) return false
  return true
}

function parseSource(html, source) {
  const words = []
  let unit = ''
  const pairRe = /<p class="en"[^>]*>([\s\S]*?)<\/p>\s*<p class="cn"[^>]*>([\s\S]*?)<\/p>/g
  let match
  while ((match = pairRe.exec(html))) {
    const english = cleanWord(match[1])
    const chinese = cleanMeaning(match[2])
    if (isUnitHeading(english)) {
      unit = unitText(english)
      continue
    }
    if (!isVocabularyWord(english, chinese)) continue
    words.push({
      word: english.toLowerCase(),
      displayWord: english,
      meanings: [chinese],
      meaning: chinese,
      partOfSpeech: '',
      grade: source.grade,
      volume: source.volume,
      unit,
      sourceKey: source.key,
      sourceFile: source.sourceFile,
      sourceUrl: source.sourceUrl,
      masteryStatus: 'untested',
      correctCount: 0,
      wrongCount: 0
    })
  }
  return words
}

function mergeWords(words) {
  const byIdentity = new Map()
  for (const word of words) {
    const key = [word.word, word.grade, word.volume, word.unit].join('|')
    const existing = byIdentity.get(key)
    if (!existing) {
      byIdentity.set(key, {
        ...word,
        meanings: Array.from(new Set(word.meanings)),
        sources: [{
          sourceKey: word.sourceKey,
          sourceFile: word.sourceFile,
          sourceUrl: word.sourceUrl,
          grade: word.grade,
          volume: word.volume,
          unit: word.unit
        }]
      })
      continue
    }
    existing.meanings = Array.from(new Set([...(existing.meanings || []), ...(word.meanings || [])]))
    existing.meaning = existing.meanings[0] || existing.meaning || ''
    existing.sources.push({
      sourceKey: word.sourceKey,
      sourceFile: word.sourceFile,
      sourceUrl: word.sourceUrl,
      grade: word.grade,
      volume: word.volume,
      unit: word.unit
    })
  }
  return Array.from(byIdentity.values())
    .sort((a, b) => {
      if (a.grade !== b.grade) return a.grade - b.grade
      if (a.volume !== b.volume) return a.volume === '上册' ? -1 : 1
      const unitA = Number(String(a.unit || '').replace(/\D/g, '')) || 0
      const unitB = Number(String(b.unit || '').replace(/\D/g, '')) || 0
      if (unitA !== unitB) return unitA - unitB
      return a.word.localeCompare(b.word)
    })
}

async function main() {
  const allWords = []
  const sourceSummaries = []
  for (const source of SOURCES) {
    const html = await fetchText(source.sourceUrl)
    const words = parseSource(html, source)
    sourceSummaries.push({ ...source, wordCount: words.length })
    allWords.push(...words)
    console.log(`${source.key}: ${words.length} words`)
  }

  const words = mergeWords(allWords)
  const payload = {
    version: 1,
    studentName: '钟青羽',
    subject: 'english',
    title: '钟青羽 PEP 小学英语个人词库',
    generatedAt: new Date().toISOString(),
    sourceType: 'pep-vocabulary-seed',
    sources: sourceSummaries,
    wordCount: words.length,
    words
  }

  for (const output of OUTPUTS) {
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`)
    console.log(`wrote ${output}`)
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
