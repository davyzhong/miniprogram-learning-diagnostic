const path = require('node:path')

const DEFAULT_PROJECT_PATH = '/Users/qiming/Downloads/GoogleDrive/AI Learning/miniprogram-learning-diagnostic'
const DEFAULT_OUTPUT_DIR = path.join(DEFAULT_PROJECT_PATH, 'tmp', 'e2e', 'real-data')

const ROUTE_DEFINITIONS = {
  home: {
    key: 'home',
    name: '首页',
    path: () => '/pages/index/index'
  },
  profile: {
    key: 'profile',
    name: '学习档案',
    path: ({ studentId, studentName }) => `/pages/student-profile/student-profile?studentId=${encodeURIComponent(studentId)}&studentName=${encodeURIComponent(studentName || '')}`
  },
  subjectMath: {
    key: 'subjectMath',
    name: '数学工作台',
    path: ({ studentId, studentName }) => `/pages/subject-home/subject-home?studentId=${encodeURIComponent(studentId)}&subject=math&subjectName=${encodeURIComponent('数学')}&studentName=${encodeURIComponent(studentName || '')}`
  },
  bottlenecks: {
    key: 'bottlenecks',
    name: '学习卡点中心',
    path: ({ studentId, studentName }) => `/pages/bottleneck-center/bottleneck-center?studentId=${encodeURIComponent(studentId)}&studentName=${encodeURIComponent(studentName || '')}`
  },
  records: {
    key: 'records',
    name: '学习记录',
    path: ({ studentId, studentName }) => `/pages/upload-history/upload-history?studentId=${encodeURIComponent(studentId)}&studentName=${encodeURIComponent(studentName || '')}`
  },
  verification: {
    key: 'verification',
    name: '验证卷下载入口',
    path: ({ studentId, studentName }) => `/pages/generate-verification/generate-verification?studentId=${encodeURIComponent(studentId)}&subject=math&subjectName=${encodeURIComponent('数学')}&studentName=${encodeURIComponent(studentName || '')}`
  }
}

const DEFAULT_ROUTE_KEYS = ['home', 'profile', 'subjectMath', 'bottlenecks', 'records', 'verification']

function routeKeysFrom(value) {
  if (!value) return DEFAULT_ROUTE_KEYS
  return String(value).split(',').map(item => item.trim()).filter(Boolean)
}

function buildSmokeRoutes({ studentId, studentName = '', routeKeys = DEFAULT_ROUTE_KEYS }) {
  return routeKeys.map(key => {
    const definition = ROUTE_DEFINITIONS[key]
    if (!definition) {
      throw new Error(`未知烟测页面：${key}`)
    }
    return {
      key: definition.key,
      name: definition.name,
      path: definition.path({ studentId, studentName })
    }
  })
}

function parseRealDataSmokeConfig({ env = process.env, argv = process.argv.slice(2) } = {}) {
  const args = new Map()
  for (const arg of argv || []) {
    if (!arg.startsWith('--')) continue
    const [key, ...rest] = arg.slice(2).split('=')
    args.set(key, rest.join('=') || '1')
  }

  const studentId = args.get('student-id') || env.REAL_DATA_STUDENT_ID || ''
  if (!studentId) {
    throw new Error('缺少 REAL_DATA_STUDENT_ID，请指定要烟测的学生 ID')
  }

  const studentName = args.get('student-name') || env.REAL_DATA_STUDENT_NAME || ''
  const outputDir = path.resolve(args.get('output-dir') || env.REAL_DATA_SMOKE_OUTPUT_DIR || DEFAULT_OUTPUT_DIR)
  const projectPath = path.resolve(args.get('project') || env.REAL_DATA_PROJECT_PATH || DEFAULT_PROJECT_PATH)
  const routeKeys = routeKeysFrom(args.get('routes') || env.REAL_DATA_SMOKE_ROUTES)

  return {
    studentId,
    studentName,
    outputDir,
    projectPath,
    cliPath: args.get('cli-path') || env.WECHAT_DEVTOOLS_CLI || '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
    routes: buildSmokeRoutes({ studentId, studentName, routeKeys })
  }
}

module.exports = {
  DEFAULT_ROUTE_KEYS,
  ROUTE_DEFINITIONS,
  buildSmokeRoutes,
  parseRealDataSmokeConfig
}
