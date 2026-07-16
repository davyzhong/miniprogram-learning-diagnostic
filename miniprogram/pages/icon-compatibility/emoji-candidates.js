function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(deepFreeze)
  return Object.freeze(value)
}

function unicodeSequence(glyph) {
  return [...String(glyph || '')]
    .map(char => `U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`)
    .join(' ')
}

const CATEGORY_DEFINITIONS = [
  {
    "id": "C01",
    "name": "已验证基础",
    "riskNote": "已在当前 Android 真机通过，仍需复核其他环境",
    "items": [
      {
        "id": "C01-01",
        "glyph": "🗺️",
        "label": "地图",
        "sequence": "U+1F5FA U+FE0F"
      },
      {
        "id": "C01-02",
        "glyph": "📚",
        "label": "学习记录",
        "sequence": "U+1F4DA"
      },
      {
        "id": "C01-03",
        "glyph": "📄",
        "label": "试卷",
        "sequence": "U+1F4C4"
      },
      {
        "id": "C01-04",
        "glyph": "📸",
        "label": "拍照",
        "sequence": "U+1F4F8"
      },
      {
        "id": "C01-05",
        "glyph": "📊",
        "label": "报告",
        "sequence": "U+1F4CA"
      },
      {
        "id": "C01-06",
        "glyph": "🎯",
        "label": "目标",
        "sequence": "U+1F3AF"
      },
      {
        "id": "C01-07",
        "glyph": "✅",
        "label": "完成",
        "sequence": "U+2705"
      }
    ]
  },
  {
    "id": "C02",
    "name": "学习文具",
    "riskNote": "部分较新文具可能缺字或退化为文本",
    "items": [
      {
        "id": "C02-01",
        "glyph": "📖",
        "label": "打开的书",
        "sequence": "U+1F4D6"
      },
      {
        "id": "C02-02",
        "glyph": "📕",
        "label": "红皮书",
        "sequence": "U+1F4D5"
      },
      {
        "id": "C02-03",
        "glyph": "📗",
        "label": "绿皮书",
        "sequence": "U+1F4D7"
      },
      {
        "id": "C02-04",
        "glyph": "📘",
        "label": "蓝皮书",
        "sequence": "U+1F4D8"
      },
      {
        "id": "C02-05",
        "glyph": "📙",
        "label": "橙皮书",
        "sequence": "U+1F4D9"
      },
      {
        "id": "C02-06",
        "glyph": "📓",
        "label": "笔记本",
        "sequence": "U+1F4D3"
      },
      {
        "id": "C02-07",
        "glyph": "📔",
        "label": "装饰笔记本",
        "sequence": "U+1F4D4"
      },
      {
        "id": "C02-08",
        "glyph": "📒",
        "label": "账本",
        "sequence": "U+1F4D2"
      },
      {
        "id": "C02-09",
        "glyph": "📑",
        "label": "书签页",
        "sequence": "U+1F4D1"
      },
      {
        "id": "C02-10",
        "glyph": "🔖",
        "label": "书签",
        "sequence": "U+1F516"
      },
      {
        "id": "C02-11",
        "glyph": "✏️",
        "label": "铅笔",
        "sequence": "U+270F U+FE0F"
      },
      {
        "id": "C02-12",
        "glyph": "🖊️",
        "label": "圆珠笔",
        "sequence": "U+1F58A U+FE0F"
      },
      {
        "id": "C02-13",
        "glyph": "🖋️",
        "label": "钢笔",
        "sequence": "U+1F58B U+FE0F"
      },
      {
        "id": "C02-14",
        "glyph": "📝",
        "label": "备忘录",
        "sequence": "U+1F4DD"
      },
      {
        "id": "C02-15",
        "glyph": "📐",
        "label": "三角尺",
        "sequence": "U+1F4D0"
      }
    ]
  },
  {
    "id": "C03",
    "name": "报告数据",
    "riskNote": "较新文件与办公图标可能缺字",
    "items": [
      {
        "id": "C03-01",
        "glyph": "📈",
        "label": "上升趋势",
        "sequence": "U+1F4C8"
      },
      {
        "id": "C03-02",
        "glyph": "📉",
        "label": "下降趋势",
        "sequence": "U+1F4C9"
      },
      {
        "id": "C03-03",
        "glyph": "📋",
        "label": "剪贴板",
        "sequence": "U+1F4CB"
      },
      {
        "id": "C03-04",
        "glyph": "📁",
        "label": "文件夹",
        "sequence": "U+1F4C1"
      },
      {
        "id": "C03-05",
        "glyph": "📂",
        "label": "打开文件夹",
        "sequence": "U+1F4C2"
      },
      {
        "id": "C03-06",
        "glyph": "🗂️",
        "label": "分类夹",
        "sequence": "U+1F5C2 U+FE0F"
      },
      {
        "id": "C03-07",
        "glyph": "🗃️",
        "label": "卡片盒",
        "sequence": "U+1F5C3 U+FE0F"
      },
      {
        "id": "C03-08",
        "glyph": "🗄️",
        "label": "文件柜",
        "sequence": "U+1F5C4 U+FE0F"
      },
      {
        "id": "C03-09",
        "glyph": "🔍",
        "label": "左向放大镜",
        "sequence": "U+1F50D"
      },
      {
        "id": "C03-10",
        "glyph": "🔎",
        "label": "右向放大镜",
        "sequence": "U+1F50E"
      },
      {
        "id": "C03-11",
        "glyph": "💾",
        "label": "保存",
        "sequence": "U+1F4BE"
      },
      {
        "id": "C03-12",
        "glyph": "🧾",
        "label": "收据",
        "sequence": "U+1F9FE"
      },
      {
        "id": "C03-13",
        "glyph": "🧮",
        "label": "算盘",
        "sequence": "U+1F9EE"
      },
      {
        "id": "C03-14",
        "glyph": "🏷️",
        "label": "标签",
        "sequence": "U+1F3F7 U+FE0F"
      },
      {
        "id": "C03-15",
        "glyph": "🗒️",
        "label": "线圈本",
        "sequence": "U+1F5D2 U+FE0F"
      }
    ]
  },
  {
    "id": "C04",
    "name": "操作导航",
    "riskNote": "VS16 方向符号可能退化为黑白文本",
    "items": [
      {
        "id": "C04-01",
        "glyph": "⬅️",
        "label": "向左",
        "sequence": "U+2B05 U+FE0F"
      },
      {
        "id": "C04-02",
        "glyph": "➡️",
        "label": "向右",
        "sequence": "U+27A1 U+FE0F"
      },
      {
        "id": "C04-03",
        "glyph": "⬆️",
        "label": "向上",
        "sequence": "U+2B06 U+FE0F"
      },
      {
        "id": "C04-04",
        "glyph": "⬇️",
        "label": "向下",
        "sequence": "U+2B07 U+FE0F"
      },
      {
        "id": "C04-05",
        "glyph": "↩️",
        "label": "回退",
        "sequence": "U+21A9 U+FE0F"
      },
      {
        "id": "C04-06",
        "glyph": "↪️",
        "label": "转发",
        "sequence": "U+21AA U+FE0F"
      },
      {
        "id": "C04-07",
        "glyph": "🔄",
        "label": "刷新",
        "sequence": "U+1F504"
      },
      {
        "id": "C04-08",
        "glyph": "🔁",
        "label": "循环",
        "sequence": "U+1F501"
      },
      {
        "id": "C04-09",
        "glyph": "⏪",
        "label": "快退",
        "sequence": "U+23EA"
      },
      {
        "id": "C04-10",
        "glyph": "⏩",
        "label": "快进",
        "sequence": "U+23E9"
      },
      {
        "id": "C04-11",
        "glyph": "⏫",
        "label": "快速向上",
        "sequence": "U+23EB"
      },
      {
        "id": "C04-12",
        "glyph": "⏬",
        "label": "快速向下",
        "sequence": "U+23EC"
      },
      {
        "id": "C04-13",
        "glyph": "🔗",
        "label": "链接",
        "sequence": "U+1F517"
      },
      {
        "id": "C04-14",
        "glyph": "📌",
        "label": "图钉",
        "sequence": "U+1F4CC"
      },
      {
        "id": "C04-15",
        "glyph": "📍",
        "label": "位置",
        "sequence": "U+1F4CD"
      }
    ]
  },
  {
    "id": "C05",
    "name": "状态提醒",
    "riskNote": "颜色状态点需确认颜色与形状均可辨识",
    "items": [
      {
        "id": "C05-01",
        "glyph": "☑️",
        "label": "勾选框",
        "sequence": "U+2611 U+FE0F"
      },
      {
        "id": "C05-02",
        "glyph": "❌",
        "label": "错误",
        "sequence": "U+274C"
      },
      {
        "id": "C05-03",
        "glyph": "⚠️",
        "label": "警告",
        "sequence": "U+26A0 U+FE0F"
      },
      {
        "id": "C05-04",
        "glyph": "❗",
        "label": "重要",
        "sequence": "U+2757"
      },
      {
        "id": "C05-05",
        "glyph": "❓",
        "label": "疑问",
        "sequence": "U+2753"
      },
      {
        "id": "C05-06",
        "glyph": "ℹ️",
        "label": "信息",
        "sequence": "U+2139 U+FE0F"
      },
      {
        "id": "C05-07",
        "glyph": "🔔",
        "label": "提醒",
        "sequence": "U+1F514"
      },
      {
        "id": "C05-08",
        "glyph": "🔕",
        "label": "静音",
        "sequence": "U+1F515"
      },
      {
        "id": "C05-09",
        "glyph": "⏳",
        "label": "进行中",
        "sequence": "U+23F3"
      },
      {
        "id": "C05-10",
        "glyph": "⌛",
        "label": "等待",
        "sequence": "U+231B"
      },
      {
        "id": "C05-11",
        "glyph": "🚫",
        "label": "禁止",
        "sequence": "U+1F6AB"
      },
      {
        "id": "C05-12",
        "glyph": "🟢",
        "label": "绿色状态",
        "sequence": "U+1F7E2"
      },
      {
        "id": "C05-13",
        "glyph": "🟡",
        "label": "黄色状态",
        "sequence": "U+1F7E1"
      },
      {
        "id": "C05-14",
        "glyph": "🔴",
        "label": "红色状态",
        "sequence": "U+1F534"
      },
      {
        "id": "C05-15",
        "glyph": "💡",
        "label": "提示",
        "sequence": "U+1F4A1"
      }
    ]
  },
  {
    "id": "C06",
    "name": "时间计划",
    "riskNote": "钟面和 VS16 计时器可能存在样式差异",
    "items": [
      {
        "id": "C06-01",
        "glyph": "🕐",
        "label": "一点",
        "sequence": "U+1F550"
      },
      {
        "id": "C06-02",
        "glyph": "🕒",
        "label": "三点",
        "sequence": "U+1F552"
      },
      {
        "id": "C06-03",
        "glyph": "🕕",
        "label": "六点",
        "sequence": "U+1F555"
      },
      {
        "id": "C06-04",
        "glyph": "🕘",
        "label": "九点",
        "sequence": "U+1F558"
      },
      {
        "id": "C06-05",
        "glyph": "🕛",
        "label": "十二点",
        "sequence": "U+1F55B"
      },
      {
        "id": "C06-06",
        "glyph": "⏰",
        "label": "闹钟",
        "sequence": "U+23F0"
      },
      {
        "id": "C06-07",
        "glyph": "⏱️",
        "label": "秒表",
        "sequence": "U+23F1 U+FE0F"
      },
      {
        "id": "C06-08",
        "glyph": "⏲️",
        "label": "计时器",
        "sequence": "U+23F2 U+FE0F"
      },
      {
        "id": "C06-09",
        "glyph": "📅",
        "label": "日历",
        "sequence": "U+1F4C5"
      },
      {
        "id": "C06-10",
        "glyph": "📆",
        "label": "撕页日历",
        "sequence": "U+1F4C6"
      },
      {
        "id": "C06-11",
        "glyph": "🗓️",
        "label": "线圈日历",
        "sequence": "U+1F5D3 U+FE0F"
      },
      {
        "id": "C06-12",
        "glyph": "⌚",
        "label": "手表",
        "sequence": "U+231A"
      },
      {
        "id": "C06-13",
        "glyph": "🌅",
        "label": "清晨",
        "sequence": "U+1F305"
      },
      {
        "id": "C06-14",
        "glyph": "🌇",
        "label": "傍晚",
        "sequence": "U+1F307"
      },
      {
        "id": "C06-15",
        "glyph": "🌙",
        "label": "夜晚",
        "sequence": "U+1F319"
      }
    ]
  },
  {
    "id": "C07",
    "name": "人物表情",
    "riskNote": "新版面部表情可能在旧系统缺字",
    "items": [
      {
        "id": "C07-01",
        "glyph": "😀",
        "label": "开心",
        "sequence": "U+1F600"
      },
      {
        "id": "C07-02",
        "glyph": "😃",
        "label": "高兴",
        "sequence": "U+1F603"
      },
      {
        "id": "C07-03",
        "glyph": "😄",
        "label": "大笑",
        "sequence": "U+1F604"
      },
      {
        "id": "C07-04",
        "glyph": "😁",
        "label": "喜悦",
        "sequence": "U+1F601"
      },
      {
        "id": "C07-05",
        "glyph": "😊",
        "label": "微笑",
        "sequence": "U+1F60A"
      },
      {
        "id": "C07-06",
        "glyph": "🙂",
        "label": "平和",
        "sequence": "U+1F642"
      },
      {
        "id": "C07-07",
        "glyph": "🤔",
        "label": "思考",
        "sequence": "U+1F914"
      },
      {
        "id": "C07-08",
        "glyph": "🧐",
        "label": "观察",
        "sequence": "U+1F9D0"
      },
      {
        "id": "C07-09",
        "glyph": "😌",
        "label": "安心",
        "sequence": "U+1F60C"
      },
      {
        "id": "C07-10",
        "glyph": "😐",
        "label": "一般",
        "sequence": "U+1F610"
      },
      {
        "id": "C07-11",
        "glyph": "😕",
        "label": "困惑",
        "sequence": "U+1F615"
      },
      {
        "id": "C07-12",
        "glyph": "😟",
        "label": "担心",
        "sequence": "U+1F61F"
      },
      {
        "id": "C07-13",
        "glyph": "😢",
        "label": "难过",
        "sequence": "U+1F622"
      },
      {
        "id": "C07-14",
        "glyph": "😭",
        "label": "哭泣",
        "sequence": "U+1F62D"
      },
      {
        "id": "C07-15",
        "glyph": "😤",
        "label": "坚持",
        "sequence": "U+1F624"
      }
    ]
  },
  {
    "id": "C08",
    "name": "手势动作",
    "riskNote": "手势方向与 VS16 书写符号需核对",
    "items": [
      {
        "id": "C08-01",
        "glyph": "👍",
        "label": "赞同",
        "sequence": "U+1F44D"
      },
      {
        "id": "C08-02",
        "glyph": "👎",
        "label": "否定",
        "sequence": "U+1F44E"
      },
      {
        "id": "C08-03",
        "glyph": "👏",
        "label": "鼓掌",
        "sequence": "U+1F44F"
      },
      {
        "id": "C08-04",
        "glyph": "🙌",
        "label": "庆祝",
        "sequence": "U+1F64C"
      },
      {
        "id": "C08-05",
        "glyph": "👌",
        "label": "可以",
        "sequence": "U+1F44C"
      },
      {
        "id": "C08-06",
        "glyph": "✌️",
        "label": "胜利",
        "sequence": "U+270C U+FE0F"
      },
      {
        "id": "C08-07",
        "glyph": "🤝",
        "label": "合作",
        "sequence": "U+1F91D"
      },
      {
        "id": "C08-08",
        "glyph": "🙏",
        "label": "感谢",
        "sequence": "U+1F64F"
      },
      {
        "id": "C08-09",
        "glyph": "💪",
        "label": "加油",
        "sequence": "U+1F4AA"
      },
      {
        "id": "C08-10",
        "glyph": "👀",
        "label": "观察",
        "sequence": "U+1F440"
      },
      {
        "id": "C08-11",
        "glyph": "👂",
        "label": "倾听",
        "sequence": "U+1F442"
      },
      {
        "id": "C08-12",
        "glyph": "✍️",
        "label": "书写",
        "sequence": "U+270D U+FE0F"
      },
      {
        "id": "C08-13",
        "glyph": "👆",
        "label": "向上指",
        "sequence": "U+1F446"
      },
      {
        "id": "C08-14",
        "glyph": "👇",
        "label": "向下指",
        "sequence": "U+1F447"
      },
      {
        "id": "C08-15",
        "glyph": "👉",
        "label": "向右指",
        "sequence": "U+1F449"
      }
    ]
  },
  {
    "id": "C09",
    "name": "家庭成长",
    "riskNote": "ZWJ 家庭与学生组合可能拆分成多个图形",
    "items": [
      {
        "id": "C09-01",
        "glyph": "👦",
        "label": "男孩",
        "sequence": "U+1F466"
      },
      {
        "id": "C09-02",
        "glyph": "👧",
        "label": "女孩",
        "sequence": "U+1F467"
      },
      {
        "id": "C09-03",
        "glyph": "🧒",
        "label": "儿童",
        "sequence": "U+1F9D2"
      },
      {
        "id": "C09-04",
        "glyph": "👨",
        "label": "男性家长",
        "sequence": "U+1F468"
      },
      {
        "id": "C09-05",
        "glyph": "👩",
        "label": "女性家长",
        "sequence": "U+1F469"
      },
      {
        "id": "C09-06",
        "glyph": "🧑",
        "label": "家长",
        "sequence": "U+1F9D1"
      },
      {
        "id": "C09-07",
        "glyph": "👶",
        "label": "幼儿",
        "sequence": "U+1F476"
      },
      {
        "id": "C09-08",
        "glyph": "🧑‍🎓",
        "label": "学生",
        "sequence": "U+1F9D1 U+200D U+1F393"
      },
      {
        "id": "C09-09",
        "glyph": "👨‍👩‍👧",
        "label": "三口之家女儿",
        "sequence": "U+1F468 U+200D U+1F469 U+200D U+1F467"
      },
      {
        "id": "C09-10",
        "glyph": "👨‍👩‍👦",
        "label": "三口之家儿子",
        "sequence": "U+1F468 U+200D U+1F469 U+200D U+1F466"
      },
      {
        "id": "C09-11",
        "glyph": "👩‍👧",
        "label": "母女",
        "sequence": "U+1F469 U+200D U+1F467"
      },
      {
        "id": "C09-12",
        "glyph": "👨‍👦",
        "label": "父子",
        "sequence": "U+1F468 U+200D U+1F466"
      },
      {
        "id": "C09-13",
        "glyph": "🌱",
        "label": "萌芽",
        "sequence": "U+1F331"
      },
      {
        "id": "C09-14",
        "glyph": "🌿",
        "label": "成长",
        "sequence": "U+1F33F"
      },
      {
        "id": "C09-15",
        "glyph": "🌳",
        "label": "成熟",
        "sequence": "U+1F333"
      }
    ]
  },
  {
    "id": "C10",
    "name": "自然天气",
    "riskNote": "VS16 天气符号可能退化或缺少彩色呈现",
    "items": [
      {
        "id": "C10-01",
        "glyph": "☀️",
        "label": "晴天",
        "sequence": "U+2600 U+FE0F"
      },
      {
        "id": "C10-02",
        "glyph": "🌤️",
        "label": "晴间多云",
        "sequence": "U+1F324 U+FE0F"
      },
      {
        "id": "C10-03",
        "glyph": "⛅",
        "label": "多云",
        "sequence": "U+26C5"
      },
      {
        "id": "C10-04",
        "glyph": "🌧️",
        "label": "下雨",
        "sequence": "U+1F327 U+FE0F"
      },
      {
        "id": "C10-05",
        "glyph": "⛈️",
        "label": "雷雨",
        "sequence": "U+26C8 U+FE0F"
      },
      {
        "id": "C10-06",
        "glyph": "🌈",
        "label": "彩虹",
        "sequence": "U+1F308"
      },
      {
        "id": "C10-07",
        "glyph": "⭐",
        "label": "星星",
        "sequence": "U+2B50"
      },
      {
        "id": "C10-08",
        "glyph": "🌟",
        "label": "闪亮星星",
        "sequence": "U+1F31F"
      },
      {
        "id": "C10-09",
        "glyph": "✨",
        "label": "闪光",
        "sequence": "U+2728"
      },
      {
        "id": "C10-10",
        "glyph": "🔥",
        "label": "热度",
        "sequence": "U+1F525"
      },
      {
        "id": "C10-11",
        "glyph": "💧",
        "label": "水滴",
        "sequence": "U+1F4A7"
      },
      {
        "id": "C10-12",
        "glyph": "❄️",
        "label": "雪花",
        "sequence": "U+2744 U+FE0F"
      },
      {
        "id": "C10-13",
        "glyph": "🌸",
        "label": "花朵",
        "sequence": "U+1F338"
      },
      {
        "id": "C10-14",
        "glyph": "🍀",
        "label": "幸运草",
        "sequence": "U+1F340"
      },
      {
        "id": "C10-15",
        "glyph": "🌍",
        "label": "世界",
        "sequence": "U+1F30D"
      }
    ]
  },
  {
    "id": "C11",
    "name": "生活物品",
    "riskNote": "新版设备与工具图标可能缺字",
    "items": [
      {
        "id": "C11-01",
        "glyph": "💻",
        "label": "笔记本电脑",
        "sequence": "U+1F4BB"
      },
      {
        "id": "C11-02",
        "glyph": "⌨️",
        "label": "键盘",
        "sequence": "U+2328 U+FE0F"
      },
      {
        "id": "C11-03",
        "glyph": "🖥️",
        "label": "显示器",
        "sequence": "U+1F5A5 U+FE0F"
      },
      {
        "id": "C11-04",
        "glyph": "🖨️",
        "label": "打印机",
        "sequence": "U+1F5A8 U+FE0F"
      },
      {
        "id": "C11-05",
        "glyph": "📱",
        "label": "手机",
        "sequence": "U+1F4F1"
      },
      {
        "id": "C11-06",
        "glyph": "☎️",
        "label": "电话",
        "sequence": "U+260E U+FE0F"
      },
      {
        "id": "C11-07",
        "glyph": "📷",
        "label": "相机",
        "sequence": "U+1F4F7"
      },
      {
        "id": "C11-08",
        "glyph": "🎥",
        "label": "摄像",
        "sequence": "U+1F3A5"
      },
      {
        "id": "C11-09",
        "glyph": "🔦",
        "label": "手电筒",
        "sequence": "U+1F526"
      },
      {
        "id": "C11-10",
        "glyph": "🔑",
        "label": "钥匙",
        "sequence": "U+1F511"
      },
      {
        "id": "C11-11",
        "glyph": "🔒",
        "label": "锁定",
        "sequence": "U+1F512"
      },
      {
        "id": "C11-12",
        "glyph": "🔓",
        "label": "解锁",
        "sequence": "U+1F513"
      },
      {
        "id": "C11-13",
        "glyph": "🧰",
        "label": "工具箱",
        "sequence": "U+1F9F0"
      },
      {
        "id": "C11-14",
        "glyph": "🧩",
        "label": "拼图",
        "sequence": "U+1F9E9"
      },
      {
        "id": "C11-15",
        "glyph": "🎒",
        "label": "书包",
        "sequence": "U+1F392"
      }
    ]
  },
  {
    "id": "C12",
    "name": "交通地点",
    "riskNote": "VS16 地点与交通符号可能退化为文本",
    "items": [
      {
        "id": "C12-01",
        "glyph": "🏠",
        "label": "家庭",
        "sequence": "U+1F3E0"
      },
      {
        "id": "C12-02",
        "glyph": "🏫",
        "label": "学校",
        "sequence": "U+1F3EB"
      },
      {
        "id": "C12-03",
        "glyph": "🏢",
        "label": "办公楼",
        "sequence": "U+1F3E2"
      },
      {
        "id": "C12-04",
        "glyph": "🏥",
        "label": "医院",
        "sequence": "U+1F3E5"
      },
      {
        "id": "C12-05",
        "glyph": "🏛️",
        "label": "公共机构",
        "sequence": "U+1F3DB U+FE0F"
      },
      {
        "id": "C12-06",
        "glyph": "🚗",
        "label": "汽车",
        "sequence": "U+1F697"
      },
      {
        "id": "C12-07",
        "glyph": "🚌",
        "label": "公交车",
        "sequence": "U+1F68C"
      },
      {
        "id": "C12-08",
        "glyph": "🚲",
        "label": "自行车",
        "sequence": "U+1F6B2"
      },
      {
        "id": "C12-09",
        "glyph": "🚶",
        "label": "步行",
        "sequence": "U+1F6B6"
      },
      {
        "id": "C12-10",
        "glyph": "🚉",
        "label": "车站",
        "sequence": "U+1F689"
      },
      {
        "id": "C12-11",
        "glyph": "✈️",
        "label": "飞机",
        "sequence": "U+2708 U+FE0F"
      },
      {
        "id": "C12-12",
        "glyph": "🚀",
        "label": "火箭",
        "sequence": "U+1F680"
      },
      {
        "id": "C12-13",
        "glyph": "🧭",
        "label": "指南针",
        "sequence": "U+1F9ED"
      },
      {
        "id": "C12-14",
        "glyph": "🛣️",
        "label": "道路",
        "sequence": "U+1F6E3 U+FE0F"
      },
      {
        "id": "C12-15",
        "glyph": "🏁",
        "label": "终点",
        "sequence": "U+1F3C1"
      }
    ]
  },
  {
    "id": "C13",
    "name": "图形符号",
    "riskNote": "新等号与颜色图形需确认旧 Android 支持",
    "items": [
      {
        "id": "C13-01",
        "glyph": "➕",
        "label": "加",
        "sequence": "U+2795"
      },
      {
        "id": "C13-02",
        "glyph": "➖",
        "label": "减",
        "sequence": "U+2796"
      },
      {
        "id": "C13-03",
        "glyph": "✖️",
        "label": "乘",
        "sequence": "U+2716 U+FE0F"
      },
      {
        "id": "C13-04",
        "glyph": "➗",
        "label": "除",
        "sequence": "U+2797"
      },
      {
        "id": "C13-05",
        "glyph": "🟰",
        "label": "等于",
        "sequence": "U+1F7F0"
      },
      {
        "id": "C13-06",
        "glyph": "♾️",
        "label": "无限",
        "sequence": "U+267E U+FE0F"
      },
      {
        "id": "C13-07",
        "glyph": "🔢",
        "label": "数字",
        "sequence": "U+1F522"
      },
      {
        "id": "C13-08",
        "glyph": "🔤",
        "label": "字母",
        "sequence": "U+1F524"
      },
      {
        "id": "C13-09",
        "glyph": "🔡",
        "label": "小写字母",
        "sequence": "U+1F521"
      },
      {
        "id": "C13-10",
        "glyph": "🔠",
        "label": "大写字母",
        "sequence": "U+1F520"
      },
      {
        "id": "C13-11",
        "glyph": "⭕",
        "label": "圆形",
        "sequence": "U+2B55"
      },
      {
        "id": "C13-12",
        "glyph": "🔺",
        "label": "上三角",
        "sequence": "U+1F53A"
      },
      {
        "id": "C13-13",
        "glyph": "🔻",
        "label": "下三角",
        "sequence": "U+1F53B"
      },
      {
        "id": "C13-14",
        "glyph": "🔷",
        "label": "蓝色菱形",
        "sequence": "U+1F537"
      },
      {
        "id": "C13-15",
        "glyph": "🔶",
        "label": "橙色菱形",
        "sequence": "U+1F536"
      }
    ]
  },
  {
    "id": "C14",
    "name": "组合高风险",
    "riskNote": "专门验证 VS16、ZWJ、修饰符、旗帜和键帽完整性",
    "items": [
      {
        "id": "C14-01",
        "glyph": "❤️",
        "label": "彩色爱心",
        "sequence": "U+2764 U+FE0F"
      },
      {
        "id": "C14-02",
        "glyph": "❤",
        "label": "文本爱心",
        "sequence": "U+2764"
      },
      {
        "id": "C14-03",
        "glyph": "☺️",
        "label": "彩色笑脸",
        "sequence": "U+263A U+FE0F"
      },
      {
        "id": "C14-04",
        "glyph": "☺",
        "label": "文本笑脸",
        "sequence": "U+263A"
      },
      {
        "id": "C14-05",
        "glyph": "👩🏽",
        "label": "中等肤色女性",
        "sequence": "U+1F469 U+1F3FD"
      },
      {
        "id": "C14-06",
        "glyph": "👍🏽",
        "label": "中等肤色点赞",
        "sequence": "U+1F44D U+1F3FD"
      },
      {
        "id": "C14-07",
        "glyph": "👩‍🏫",
        "label": "女教师",
        "sequence": "U+1F469 U+200D U+1F3EB"
      },
      {
        "id": "C14-08",
        "glyph": "👨‍🏫",
        "label": "男教师",
        "sequence": "U+1F468 U+200D U+1F3EB"
      },
      {
        "id": "C14-09",
        "glyph": "👩‍💻",
        "label": "女技术人员",
        "sequence": "U+1F469 U+200D U+1F4BB"
      },
      {
        "id": "C14-10",
        "glyph": "👨‍💻",
        "label": "男技术人员",
        "sequence": "U+1F468 U+200D U+1F4BB"
      },
      {
        "id": "C14-11",
        "glyph": "👨‍👩‍👧‍👦",
        "label": "四口之家",
        "sequence": "U+1F468 U+200D U+1F469 U+200D U+1F467 U+200D U+1F466"
      },
      {
        "id": "C14-12",
        "glyph": "🏳️‍🌈",
        "label": "彩虹旗",
        "sequence": "U+1F3F3 U+FE0F U+200D U+1F308"
      },
      {
        "id": "C14-13",
        "glyph": "🇨🇳",
        "label": "中国旗帜",
        "sequence": "U+1F1E8 U+1F1F3"
      },
      {
        "id": "C14-14",
        "glyph": "1️⃣",
        "label": "数字一键帽",
        "sequence": "U+0031 U+FE0F U+20E3"
      },
      {
        "id": "C14-15",
        "glyph": "#️⃣",
        "label": "井号键帽",
        "sequence": "U+0023 U+FE0F U+20E3"
      }
    ]
  }
]

CATEGORY_DEFINITIONS[0].statusText = '首批已验证'
CATEGORY_DEFINITIONS.slice(1).forEach(category => {
  category.statusText = ''
})

const EMOJI_CATEGORIES = deepFreeze(CATEGORY_DEFINITIONS)
const EMOJI_CANDIDATE_COUNT = EMOJI_CATEGORIES.reduce(
  (total, category) => total + category.items.length,
  0
)

function findCategory(categoryId) {
  return EMOJI_CATEGORIES.find(category => category.id === categoryId) || null
}

module.exports = {
  EMOJI_CATEGORIES,
  EMOJI_CANDIDATE_COUNT,
  findCategory,
  unicodeSequence
}

