#!/usr/bin/env node
const {
  diagnoseFromUpload,
  getAnalysisStatus,
  generateDiagnosticReport,
  trackBottlenecks,
  generateVerificationPaper,
  evaluateVerificationSubmission,
  buildLearningTimeline
} = require('../services/skills')
const { createFixtureAdapter } = require('./adapters/fixture')

function parseArgv(argv) {
  const positionals = []
  const options = {}

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) {
      positionals.push(token)
      continue
    }

    const key = token.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith('--')) {
      options[key] = true
    } else if (options[key] !== undefined) {
      options[key] = Array.isArray(options[key]) ? [...options[key], next] : [options[key], next]
      i += 1
    } else {
      options[key] = next
      i += 1
    }
  }

  return { positionals, options }
}

function required(options, key) {
  if (!options[key]) throw new Error(`缺少 --${key}`)
  return options[key]
}

function splitList(value) {
  if (!value) return []
  const values = Array.isArray(value) ? value : [value]
  return values.flatMap(item => String(item).split(',')).map(item => item.trim()).filter(Boolean)
}

function fileIdsFrom(options) {
  return [
    ...splitList(options['file-id']),
    ...splitList(options['file-ids'])
  ]
}

function createAdapter(options) {
  return createFixtureAdapter(options.fixture)
}

function formatText(value) {
  if (!value || typeof value !== 'object') return String(value || '')
  if (Array.isArray(value.items)) {
    return value.items.map(item => `${item.title || item.type}: ${item.summary || ''}`).join('\n')
  }
  if (Array.isArray(value.active)) {
    return value.active.map(item => `${item.name} ${item.status || ''}`.trim()).join('\n')
  }
  return JSON.stringify(value, null, 2)
}

function output(value, options) {
  if (options.format === 'json') {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
    return
  }
  process.stdout.write(`${formatText(value)}\n`)
}

async function runCommand(positionals, options, adapter) {
  const [group, action] = positionals

  if (group === 'upload' && action === 'photos') {
    return diagnoseFromUpload({
      studentId: required(options, 'student'),
      subject: options.subject || 'math',
      fileIds: fileIdsFrom(options),
      imageMetas: []
    }, adapter)
  }

  if (group === 'analyze' && action === 'status') {
    return getAnalysisStatus({ reportId: required(options, 'report') }, adapter)
  }

  if (group === 'report' && action === 'show') {
    return generateDiagnosticReport({ reportId: required(options, 'report'), format: 'json' }, adapter)
  }

  if (group === 'report' && action === 'pdf') {
    return generateDiagnosticReport({ reportId: required(options, 'report'), format: 'pdf' }, adapter)
  }

  if (group === 'bottleneck' && action === 'list') {
    return trackBottlenecks({
      studentId: required(options, 'student'),
      subject: options.subject || 'math'
    }, adapter)
  }

  if (group === 'paper' && action === 'generate') {
    return generateVerificationPaper({
      studentId: required(options, 'student'),
      subject: options.subject || 'math',
      bottleneckTargets: splitList(required(options, 'targets')),
      paperDate: options.date || ''
    }, adapter)
  }

  if (group === 'verification' && action === 'upload') {
    return evaluateVerificationSubmission({
      studentId: required(options, 'student'),
      subject: options.subject || 'math',
      paperId: required(options, 'paper'),
      answerPhotoFileIds: fileIdsFrom(options)
    }, adapter)
  }

  if (group === 'timeline' && action === 'show') {
    return buildLearningTimeline({
      studentId: required(options, 'student'),
      subject: options.subject || ''
    }, adapter)
  }

  throw new Error(`未知命令：${positionals.join(' ') || '(空)'}`)
}

async function main(argv = process.argv.slice(2)) {
  const { positionals, options } = parseArgv(argv)
  try {
    const adapter = createAdapter(options)
    const result = await runCommand(positionals, options, adapter)
    output(result, options)
    return 0
  } catch (error) {
    process.stderr.write(`${error.message || error}\n`)
    return 1
  }
}

if (require.main === module) {
  main().then(code => {
    process.exitCode = code
  })
}

module.exports = {
  parseArgv,
  runCommand,
  main
}
