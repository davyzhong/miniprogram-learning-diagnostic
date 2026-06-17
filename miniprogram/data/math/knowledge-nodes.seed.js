// 小学数学知识节点库（前端版）。
// 内容与仓库根 data/math/knowledge-nodes.seed.json 保持一致；
// 这里改用 module.exports，符合 miniprogram/data 下 *.seed.js 的前端加载约定。
module.exports = {
  "version": "0.1.0",
  "updatedAt": "2026-06-17",
  "subject": "math",
  "scope": "小学数学自用知识地图首批高优先级节点，优先覆盖钟青羽六年级与小升初历史错题。",
  "domains": [
    "数与代数",
    "图形与几何",
    "统计与概率",
    "综合与实践"
  ],
  "nodes": [
    {
      "nodeId": "MATH-NUM-INT-MUL-PARTIAL",
      "subject": "math",
      "title": "多位数乘法中的部分积完整性",
      "domain": "数与代数",
      "gradeRange": [
        4,
        6
      ],
      "priority": "high",
      "prerequisites": [
        "MATH-NUM-INT-MUL-BASIC"
      ],
      "successors": [
        "MATH-NUM-DEC-MUL-POINT",
        "MATH-META-ESTIMATION-CHECK"
      ],
      "typicalProblems": [
        "28 × 204",
        "306 × 45",
        "125 × 408"
      ],
      "commonBottlenecks": [
        "BN-INT-MUL-PARTIAL-OMIT"
      ],
      "masteryCriteria": {
        "immediatePractice": "3 道含 0 或跨位部分积的乘法题全对。",
        "transferPractice": "能解释每个部分积对应原式中的哪一部分。",
        "spacedReview": "72 小时后同类题不再漏加部分积。"
      },
      "textbookRefs": [],
      "resourceIds": []
    },
    {
      "nodeId": "MATH-NUM-INT-DIV-LONG",
      "subject": "math",
      "title": "长除法试商与商位",
      "domain": "数与代数",
      "gradeRange": [
        4,
        6
      ],
      "priority": "high",
      "prerequisites": [
        "MATH-NUM-INT-MUL-BASIC"
      ],
      "successors": [
        "MATH-NUM-FRACTION-DIV-RECIPROCAL",
        "MATH-MOD-RATIO-SCALE"
      ],
      "typicalProblems": [
        "8008 ÷ 26",
        "7350 ÷ 25",
        "10080 ÷ 32"
      ],
      "commonBottlenecks": [
        "BN-INT-DIV-DIVISOR-SIMPLIFY"
      ],
      "masteryCriteria": {
        "immediatePractice": "能写出长除法过程，并用乘法验商。",
        "transferPractice": "在混合运算中能稳定完成中间除法。",
        "spacedReview": "间隔复测中不把两位数除数误当一位数。"
      },
      "textbookRefs": [],
      "resourceIds": []
    },
    {
      "nodeId": "MATH-NUM-DEC-PLACE-VALUE",
      "subject": "math",
      "title": "小数位值与数量级",
      "domain": "数与代数",
      "gradeRange": [
        4,
        6
      ],
      "priority": "high",
      "prerequisites": [
        "MATH-NUM-INT-PLACE-VALUE"
      ],
      "successors": [
        "MATH-NUM-DEC-MUL-POINT",
        "MATH-META-ESTIMATION-CHECK"
      ],
      "typicalProblems": [
        "2.186 与 26.86 的数量级比较",
        "0.24 的百分位含义"
      ],
      "commonBottlenecks": [
        "BN-DEC-PLACE-VALUE-WEAK"
      ],
      "masteryCriteria": {
        "immediatePractice": "能说出十分位、百分位、千分位的意义。",
        "transferPractice": "能用估算判断小数结果是否合理。",
        "spacedReview": "后续小数乘除题能主动做数量级检查。"
      },
      "textbookRefs": [],
      "resourceIds": []
    },
    {
      "nodeId": "MATH-NUM-DEC-MUL-POINT",
      "subject": "math",
      "title": "小数乘法中的小数点定位",
      "domain": "数与代数",
      "gradeRange": [
        5,
        6
      ],
      "priority": "high",
      "prerequisites": [
        "MATH-NUM-INT-MUL-PARTIAL",
        "MATH-NUM-DEC-PLACE-VALUE"
      ],
      "successors": [
        "MATH-MOD-PERCENT-DISCOUNT",
        "MATH-META-ESTIMATION-CHECK"
      ],
      "typicalProblems": [
        "8.5 × 3.16",
        "0.24 × 1.5",
        "12.5 × 0.08"
      ],
      "commonBottlenecks": [
        "BN-DEC-MUL-POINT-COUNT",
        "BN-DEC-MUL-POINT-ESTIMATE"
      ],
      "masteryCriteria": {
        "immediatePractice": "3 道同类题全对，并能说出两个因数共有几位小数。",
        "transferPractice": "能在应用题和竖式题中稳定定位小数点。",
        "spacedReview": "24/72 小时间隔复测均通过。"
      },
      "textbookRefs": [],
      "resourceIds": [
        "RES-BILI-DEC-MUL-001",
        "RES-KHAN-DEC-MUL-001"
      ]
    },
    {
      "nodeId": "MATH-NUM-FRACTION-MEANING",
      "subject": "math",
      "title": "分数的整体-部分意义",
      "domain": "数与代数",
      "gradeRange": [
        3,
        6
      ],
      "priority": "high",
      "prerequisites": [
        "MATH-NUM-INT-PLACE-VALUE"
      ],
      "successors": [
        "MATH-NUM-FRACTION-ADD-COMMON-DENOM",
        "MATH-MOD-RATIO-PART-WHOLE"
      ],
      "typicalProblems": [
        "把 1 平均分成若干份",
        "解释 3/4 的整体是谁"
      ],
      "commonBottlenecks": [
        "BN-FRACTION-WHOLE-REFERENCE"
      ],
      "masteryCriteria": {
        "immediatePractice": "能指出每个分数对应的整体。",
        "transferPractice": "能在应用题中区分整体与部分。",
        "spacedReview": "遇到比例或百分数题能先找基准量。"
      },
      "textbookRefs": [],
      "resourceIds": []
    },
    {
      "nodeId": "MATH-NUM-FRACTION-ADD-COMMON-DENOM",
      "subject": "math",
      "title": "异分母分数加减中的通分",
      "domain": "数与代数",
      "gradeRange": [
        5,
        6
      ],
      "priority": "high",
      "prerequisites": [
        "MATH-NUM-FRACTION-MEANING",
        "MATH-NUM-MULTIPLE-LCM"
      ],
      "successors": [
        "MATH-NUM-FRACTION-MIXED-OPS"
      ],
      "typicalProblems": [
        "1/4 + 1/8",
        "5/6 - 3/4",
        "2/3 + 0.25"
      ],
      "commonBottlenecks": [
        "BN-FRACTION-ADD-DENOM-MISMATCH"
      ],
      "masteryCriteria": {
        "immediatePractice": "3 道异分母加减全对，并能写出通分过程。",
        "transferPractice": "分数小数混合题中能先统一形式。",
        "spacedReview": "间隔复测中不再把分母直接相加或误换分母。"
      },
      "textbookRefs": [],
      "resourceIds": [
        "RES-BILI-FRACTION-COMMON-001",
        "RES-KHAN-FRACTION-ADD-001"
      ]
    },
    {
      "nodeId": "MATH-NUM-FRACTION-MUL-SIMPLIFY",
      "subject": "math",
      "title": "分数乘法中的约分与结果大小",
      "domain": "数与代数",
      "gradeRange": [
        5,
        6
      ],
      "priority": "high",
      "prerequisites": [
        "MATH-NUM-FRACTION-MEANING",
        "MATH-NUM-FACTOR-GCD"
      ],
      "successors": [
        "MATH-NUM-FRACTION-MIXED-OPS"
      ],
      "typicalProblems": [
        "4/9 × 1/15",
        "3/8 × 16/9"
      ],
      "commonBottlenecks": [
        "BN-FRACTION-MUL-SIMPLIFY-DIRECTION"
      ],
      "masteryCriteria": {
        "immediatePractice": "能正确跨分子分母约分，不把结果约大。",
        "transferPractice": "能用估算判断分数乘法结果应变大还是变小。",
        "spacedReview": "嵌套运算中约分方向稳定。"
      },
      "textbookRefs": [],
      "resourceIds": []
    },
    {
      "nodeId": "MATH-NUM-FRACTION-DIV-RECIPROCAL",
      "subject": "math",
      "title": "分数除法与倒数",
      "domain": "数与代数",
      "gradeRange": [
        6,
        6
      ],
      "priority": "high",
      "prerequisites": [
        "MATH-NUM-FRACTION-MEANING",
        "MATH-NUM-FRACTION-MUL-SIMPLIFY"
      ],
      "successors": [
        "MATH-MOD-RATIO-PART-WHOLE",
        "MATH-MOD-PERCENT-BASE"
      ],
      "typicalProblems": [
        "6 ÷ 7/8",
        "2/5 ÷ 7/3",
        "3 ÷ 1/4"
      ],
      "commonBottlenecks": [
        "BN-FRACTION-DIV-RECIPROCAL-MISSING",
        "BN-FRACTION-DIV-CONCEPT-JUMPS"
      ],
      "masteryCriteria": {
        "immediatePractice": "能把除以分数稳定改写为乘倒数。",
        "transferPractice": "能解释为什么除以 1/4 等于看有几个 1/4。",
        "spacedReview": "间隔复测中不再把除数近似成小数后乱算。"
      },
      "textbookRefs": [],
      "resourceIds": [
        "RES-BILI-FRACTION-DIV-001",
        "RES-KHAN-FRACTION-DIV-001",
        "RES-YT-FRACTION-DIV-001",
        "RES-YT-FRACTION-DIV-002"
      ]
    },
    {
      "nodeId": "MATH-NUM-FRACTION-DECIMAL-CONVERT",
      "subject": "math",
      "title": "分数、小数、百分数互化",
      "domain": "数与代数",
      "gradeRange": [
        5,
        6
      ],
      "priority": "high",
      "prerequisites": [
        "MATH-NUM-DEC-PLACE-VALUE",
        "MATH-NUM-FRACTION-MEANING"
      ],
      "successors": [
        "MATH-MOD-PERCENT-BASE",
        "MATH-MOD-PERCENT-DISCOUNT"
      ],
      "typicalProblems": [
        "1/3 + 0.2",
        "0.15 ÷ 3/4",
        "25% = 1/4"
      ],
      "commonBottlenecks": [
        "BN-FRACTION-DECIMAL-MIXED-LOAD"
      ],
      "masteryCriteria": {
        "immediatePractice": "能选择分数或小数形式统一计算。",
        "transferPractice": "复杂混合运算中不随意近似 1/3。",
        "spacedReview": "真实试卷中互化错误显著减少。"
      },
      "textbookRefs": [],
      "resourceIds": [
        "RES-BILI-FRAC-DEC-PERCENT-001",
        "RES-KHAN-FRAC-DEC-PERCENT-001"
      ]
    },
    {
      "nodeId": "MATH-MOD-PERCENT-BASE",
      "subject": "math",
      "title": "百分数应用中的单位 1 判断",
      "domain": "综合与实践",
      "gradeRange": [
        6,
        6
      ],
      "priority": "high",
      "prerequisites": [
        "MATH-NUM-FRACTION-MEANING",
        "MATH-NUM-FRACTION-DECIMAL-CONVERT"
      ],
      "successors": [
        "MATH-MOD-PERCENT-DISCOUNT",
        "MATH-MOD-TAX-PIECEWISE"
      ],
      "typicalProblems": [
        "已知优惠后价格求原价",
        "比原来增加百分之几",
        "求全价票的 1.5%"
      ],
      "commonBottlenecks": [
        "BN-PERCENT-BASE-WHOLE-MISSING"
      ],
      "masteryCriteria": {
        "immediatePractice": "能在题目中圈出谁是单位 1。",
        "transferPractice": "已知现价求原价、已知原价求现价都能列对式子。",
        "spacedReview": "后续百分数应用题不再反复除以 1.05 或 0.96。"
      },
      "textbookRefs": [],
      "resourceIds": [
        "RES-BILI-PERCENT-BASE-001",
        "RES-KHAN-PERCENT-001"
      ]
    },
    {
      "nodeId": "MATH-MOD-PERCENT-DISCOUNT",
      "subject": "math",
      "title": "折扣、优惠、增长和减少方向",
      "domain": "综合与实践",
      "gradeRange": [
        6,
        7
      ],
      "priority": "high",
      "prerequisites": [
        "MATH-MOD-PERCENT-BASE"
      ],
      "successors": [
        "MATH-MOD-TAX-PIECEWISE"
      ],
      "typicalProblems": [
        "含 5% 优惠后价格 47.25 万，求原价",
        "涨价 20% 后再降价 20%"
      ],
      "commonBottlenecks": [
        "BN-PERCENT-DISCOUNT-DIRECTION"
      ],
      "masteryCriteria": {
        "immediatePractice": "能判断乘 0.95、除 0.95、乘 1.05、除 1.05 的适用场景。",
        "transferPractice": "能用线段图解释现价和原价关系。",
        "spacedReview": "间隔复测中方向不再反复修改。"
      },
      "textbookRefs": [],
      "resourceIds": [
        "RES-KHAN-PERCENT-DISCOUNT-001",
        "RES-XHS-PERCENT-DISCOUNT-001"
      ]
    },
    {
      "nodeId": "MATH-MOD-TAX-PIECEWISE",
      "subject": "math",
      "title": "分段税率和分段函数",
      "domain": "综合与实践",
      "gradeRange": [
        6,
        7
      ],
      "priority": "medium",
      "prerequisites": [
        "MATH-MOD-PERCENT-BASE",
        "MATH-NUM-FRACTION-DECIMAL-CONVERT"
      ],
      "successors": [],
      "typicalProblems": [
        "稿费按三段税率反推总额",
        "阶梯水费、电费"
      ],
      "commonBottlenecks": [
        "BN-PIECEWISE-TAX-BRACKET"
      ],
      "masteryCriteria": {
        "immediatePractice": "能把总量拆到不同区间分别计算。",
        "transferPractice": "能解释每一档的基数是什么。",
        "spacedReview": "后续分段收费题列式稳定。"
      },
      "textbookRefs": [],
      "resourceIds": []
    },
    {
      "nodeId": "MATH-MOD-RATIO-MEANING",
      "subject": "math",
      "title": "比和比值的意义",
      "domain": "数与代数",
      "gradeRange": [
        6,
        6
      ],
      "priority": "high",
      "prerequisites": [
        "MATH-NUM-FRACTION-MEANING"
      ],
      "successors": [
        "MATH-MOD-RATIO-PART-WHOLE",
        "MATH-MOD-RATIO-PROPERTY"
      ],
      "typicalProblems": [
        "5:3 的意义",
        "a:b 与 b:a 的区别"
      ],
      "commonBottlenecks": [
        "BN-RATIO-MEANING-ORDER"
      ],
      "masteryCriteria": {
        "immediatePractice": "能说出比的前项后项分别代表什么。",
        "transferPractice": "能在应用题中保持比的顺序不反。",
        "spacedReview": "比例应用题中不再把对象换位。"
      },
      "textbookRefs": [],
      "resourceIds": []
    },
    {
      "nodeId": "MATH-MOD-RATIO-PART-WHOLE",
      "subject": "math",
      "title": "部分:部分与部分:整体的参照系",
      "domain": "综合与实践",
      "gradeRange": [
        6,
        6
      ],
      "priority": "high",
      "prerequisites": [
        "MATH-MOD-RATIO-MEANING",
        "MATH-NUM-FRACTION-MEANING"
      ],
      "successors": [
        "MATH-MOD-EQUATION-WORD-PROBLEM"
      ],
      "typicalProblems": [
        "剩余:已运 = 5:3",
        "男生:女生 = 3:2，男生占全班几分之几"
      ],
      "commonBottlenecks": [
        "BN-RATIO-PART-WHOLE-REFERENCE"
      ],
      "masteryCriteria": {
        "immediatePractice": "能画出两部分和整体的线段图。",
        "transferPractice": "能解释 5/8 是谁占谁。",
        "spacedReview": "后续比例应用题中先确定参照系。"
      },
      "textbookRefs": [],
      "resourceIds": [
        "RES-BILI-RATIO-PARTWHOLE-001",
        "RES-XHS-RATIO-PARTWHOLE-001"
      ]
    },
    {
      "nodeId": "MATH-MOD-RATIO-PROPERTY",
      "subject": "math",
      "title": "比例基本性质与交叉相乘",
      "domain": "数与代数",
      "gradeRange": [
        6,
        6
      ],
      "priority": "high",
      "prerequisites": [
        "MATH-MOD-RATIO-MEANING"
      ],
      "successors": [
        "MATH-MOD-RATIO-SCALE"
      ],
      "typicalProblems": [
        "判断四个数能否组成比例",
        "1/a = 3/b 求 a:b"
      ],
      "commonBottlenecks": [
        "BN-RATIO-CROSS-MULTIPLY-DIRECTION",
        "BN-RATIO-PROPORTION-EXHAUSTIVE"
      ],
      "masteryCriteria": {
        "immediatePractice": "能正确写出内项积等于外项积。",
        "transferPractice": "能处理含字母和小数的比例判断。",
        "spacedReview": "间隔复测中交叉方向不反。"
      },
      "textbookRefs": [],
      "resourceIds": []
    },
    {
      "nodeId": "MATH-MOD-RATIO-SCALE",
      "subject": "math",
      "title": "比例尺与实际距离双向换算",
      "domain": "综合与实践",
      "gradeRange": [
        6,
        6
      ],
      "priority": "medium",
      "prerequisites": [
        "MATH-MOD-RATIO-PROPERTY",
        "MATH-MEASURE-UNIT-LENGTH"
      ],
      "successors": [],
      "typicalProblems": [
        "比例尺 1:400000 图上 3cm 对应实际距离",
        "换到 1:1600000 图上距离"
      ],
      "commonBottlenecks": [
        "BN-SCALE-DOUBLE-CONVERSION"
      ],
      "masteryCriteria": {
        "immediatePractice": "能写出图上距离、实际距离、比例尺三者关系。",
        "transferPractice": "能完成实际距离到另一张图上距离的两步换算。",
        "spacedReview": "后续比例尺题不再凭感觉写 12 或 16。"
      },
      "textbookRefs": [],
      "resourceIds": []
    },
    {
      "nodeId": "MATH-MEASURE-UNIT-LENGTH",
      "subject": "math",
      "title": "长度单位 cm/dm/m 换算",
      "domain": "综合与实践",
      "gradeRange": [
        3,
        6
      ],
      "priority": "high",
      "prerequisites": [
        "MATH-NUM-DEC-PLACE-VALUE"
      ],
      "successors": [
        "MATH-MEASURE-UNIT-AREA-VOLUME",
        "MATH-MOD-RATIO-SCALE"
      ],
      "typicalProblems": [
        "14 cm = 1.4 dm",
        "图上单位 cm、题目参数 dm"
      ],
      "commonBottlenecks": [
        "BN-UNIT-LENGTH-CM-DM-M"
      ],
      "masteryCriteria": {
        "immediatePractice": "能正确换算 cm、dm、m。",
        "transferPractice": "图表和题干单位不一致时能先统一单位。",
        "spacedReview": "后续应用题中单位不再混写。"
      },
      "textbookRefs": [],
      "resourceIds": [
        "RES-BILI-UNIT-CONVERT-001",
        "RES-XHS-UNIT-CONVERT-001"
      ]
    },
    {
      "nodeId": "MATH-MEASURE-UNIT-AREA-VOLUME",
      "subject": "math",
      "title": "面积单位与体积单位量纲",
      "domain": "综合与实践",
      "gradeRange": [
        5,
        6
      ],
      "priority": "high",
      "prerequisites": [
        "MATH-MEASURE-UNIT-LENGTH"
      ],
      "successors": [
        "MATH-GEO-CIRCLE-AREA",
        "MATH-GEO-CYLINDER-VOLUME"
      ],
      "typicalProblems": [
        "m² 与 cm² 区分",
        "cm³ 与 dm³ 转换"
      ],
      "commonBottlenecks": [
        "BN-UNIT-AREA-VOLUME-DIMENSION"
      ],
      "masteryCriteria": {
        "immediatePractice": "能说出长度、面积、体积单位的维度差异。",
        "transferPractice": "几何应用题中能先统一单位再套公式。",
        "spacedReview": "后续不把 m² 写成 cm²。"
      },
      "textbookRefs": [],
      "resourceIds": []
    },
    {
      "nodeId": "MATH-GEO-TRIANGLE-AREA",
      "subject": "math",
      "title": "三角形面积公式与平移不变性",
      "domain": "图形与几何",
      "gradeRange": [
        5,
        6
      ],
      "priority": "medium",
      "prerequisites": [
        "MATH-GEO-RECTANGLE-AREA"
      ],
      "successors": [
        "MATH-GEO-TRANSFORM-AREA-INVARIANT"
      ],
      "typicalProblems": [
        "底 3 高 4 的三角形面积",
        "坐标三角形平移后面积"
      ],
      "commonBottlenecks": [
        "BN-TRIANGLE-AREA-MISSING-HALF"
      ],
      "masteryCriteria": {
        "immediatePractice": "三角形面积计算不忘除以 2。",
        "transferPractice": "坐标图中能找底和高。",
        "spacedReview": "平移题中不把平移距离代入面积。"
      },
      "textbookRefs": [],
      "resourceIds": []
    },
    {
      "nodeId": "MATH-GEO-TRANSFORM-AREA-INVARIANT",
      "subject": "math",
      "title": "平移、旋转、对称中的面积不变性",
      "domain": "图形与几何",
      "gradeRange": [
        5,
        7
      ],
      "priority": "medium",
      "prerequisites": [
        "MATH-GEO-TRIANGLE-AREA"
      ],
      "successors": [
        "MATH-GEO-ROTATION-SOLID"
      ],
      "typicalProblems": [
        "图形平移 3 格后面积",
        "旋转不改变平面图形大小"
      ],
      "commonBottlenecks": [
        "BN-TRANSFORM-AREA-DISTANCE-MISUSE"
      ],
      "masteryCriteria": {
        "immediatePractice": "能说出平移不改变面积。",
        "transferPractice": "遇到平移距离时不把它当底或高。",
        "spacedReview": "图形变换题中先判断不变量。"
      },
      "textbookRefs": [],
      "resourceIds": []
    },
    {
      "nodeId": "MATH-GEO-CIRCLE-CIRCUMFERENCE",
      "subject": "math",
      "title": "圆的周长",
      "domain": "图形与几何",
      "gradeRange": [
        6,
        6
      ],
      "priority": "medium",
      "prerequisites": [
        "MATH-GEO-CIRCLE-RADIUS-DIAMETER"
      ],
      "successors": [
        "MATH-GEO-CIRCLE-AREA"
      ],
      "typicalProblems": [
        "C = 2πr",
        "直径和半径转换"
      ],
      "commonBottlenecks": [
        "BN-CIRCLE-CIRCUMFERENCE-AREA-MIX"
      ],
      "masteryCriteria": {
        "immediatePractice": "能区分求长度还是求面积。",
        "transferPractice": "应用题中不把周长公式用于面积。",
        "spacedReview": "圆相关题目先标注目标量。"
      },
      "textbookRefs": [],
      "resourceIds": []
    },
    {
      "nodeId": "MATH-GEO-CIRCLE-AREA",
      "subject": "math",
      "title": "圆面积公式 πr²",
      "domain": "图形与几何",
      "gradeRange": [
        6,
        6
      ],
      "priority": "high",
      "prerequisites": [
        "MATH-GEO-CIRCLE-CIRCUMFERENCE",
        "MATH-MEASURE-UNIT-AREA-VOLUME"
      ],
      "successors": [
        "MATH-GEO-CYLINDER-VOLUME"
      ],
      "typicalProblems": [
        "喷水半径 9m，求清洁面积",
        "圆形草坪面积"
      ],
      "commonBottlenecks": [
        "BN-CIRCLE-AREA-EXTRA-R",
        "BN-CIRCLE-CIRCUMFERENCE-AREA-MIX"
      ],
      "masteryCriteria": {
        "immediatePractice": "能用 πr² 求圆面积，且不多乘 r。",
        "transferPractice": "能区分面积、周长、体积的公式。",
        "spacedReview": "后续圆面积题单位和公式均正确。"
      },
      "textbookRefs": [],
      "resourceIds": [
        "RES-BILI-CIRCLE-AREA-001",
        "RES-XHS-CIRCLE-AREA-001"
      ]
    },
    {
      "nodeId": "MATH-GEO-CYLINDER-VOLUME",
      "subject": "math",
      "title": "圆柱体积：底面积乘高",
      "domain": "图形与几何",
      "gradeRange": [
        6,
        7
      ],
      "priority": "high",
      "prerequisites": [
        "MATH-GEO-CIRCLE-AREA",
        "MATH-MEASURE-UNIT-AREA-VOLUME"
      ],
      "successors": [
        "MATH-GEO-CONE-VOLUME",
        "MATH-GEO-SOLID-SURFACE-ENUM"
      ],
      "typicalProblems": [
        "V = πr²h",
        "水柱体积",
        "圆柱和长方体体积模型对比"
      ],
      "commonBottlenecks": [
        "BN-CYLINDER-VOLUME-FORMULA-MIX"
      ],
      "masteryCriteria": {
        "immediatePractice": "能解释底面积乘高的含义。",
        "transferPractice": "单位不一致时能先统一单位。",
        "spacedReview": "圆面积题不再误多乘高，体积题能正确乘高。"
      },
      "textbookRefs": [],
      "resourceIds": [
        "RES-BILI-CYLINDER-VOLUME-001",
        "RES-KHAN-CYLINDER-001"
      ]
    },
    {
      "nodeId": "MATH-GEO-CONE-VOLUME",
      "subject": "math",
      "title": "圆锥体积与三分之一",
      "domain": "图形与几何",
      "gradeRange": [
        6,
        7
      ],
      "priority": "medium",
      "prerequisites": [
        "MATH-GEO-CYLINDER-VOLUME"
      ],
      "successors": [
        "MATH-GEO-ROTATION-SOLID"
      ],
      "typicalProblems": [
        "V = 1/3πr²h",
        "等底等高圆柱与圆锥体积关系"
      ],
      "commonBottlenecks": [
        "BN-CONE-VOLUME-ONE-THIRD"
      ],
      "masteryCriteria": {
        "immediatePractice": "能说出圆锥是等底等高圆柱体积的三分之一。",
        "transferPractice": "应用题中不漏乘或误乘 1/3。",
        "spacedReview": "间隔复测稳定。"
      },
      "textbookRefs": [],
      "resourceIds": []
    },
    {
      "nodeId": "MATH-GEO-SOLID-SURFACE-ENUM",
      "subject": "math",
      "title": "复杂立体表面积的暴露面枚举",
      "domain": "图形与几何",
      "gradeRange": [
        6,
        7
      ],
      "priority": "high",
      "prerequisites": [
        "MATH-GEO-CYLINDER-VOLUME",
        "MATH-GEO-CIRCLE-AREA"
      ],
      "successors": [
        "MATH-GEO-ROTATION-SOLID"
      ],
      "typicalProblems": [
        "大圆柱内挖三个小圆柱，求剩余表面积"
      ],
      "commonBottlenecks": [
        "BN-SOLID-SURFACE-EXPOSED-FACES-OMIT"
      ],
      "masteryCriteria": {
        "immediatePractice": "能按外侧、内侧、上面、下面系统枚举。",
        "transferPractice": "挖空、拼接、切割题能列出增减面。",
        "spacedReview": "不再漏算底面或内侧面。"
      },
      "textbookRefs": [],
      "resourceIds": [
        "RES-BILI-SOLID-SURFACE-001",
        "RES-XHS-SOLID-SURFACE-001"
      ]
    },
    {
      "nodeId": "MATH-GEO-ROTATION-SOLID",
      "subject": "math",
      "title": "二维图形旋转形成空间体",
      "domain": "图形与几何",
      "gradeRange": [
        6,
        7
      ],
      "priority": "medium",
      "prerequisites": [
        "MATH-GEO-TRANSFORM-AREA-INVARIANT",
        "MATH-GEO-CYLINDER-VOLUME",
        "MATH-GEO-CONE-VOLUME"
      ],
      "successors": [],
      "typicalProblems": [
        "梯形绕轴旋转求体积",
        "三角形绕顶点旋转求体积"
      ],
      "commonBottlenecks": [
        "BN-ROTATION-SOLID-SHAPE-MISIDENTIFY"
      ],
      "masteryCriteria": {
        "immediatePractice": "能先画出旋转后的立体形状。",
        "transferPractice": "不把所有旋转体都当圆柱或圆锥。",
        "spacedReview": "高阶旋转体题能至少正确识别形状。"
      },
      "textbookRefs": [],
      "resourceIds": []
    },
    {
      "nodeId": "MATH-STAT-COORDINATE-READING",
      "subject": "math",
      "title": "坐标轴与图表数据读取",
      "domain": "统计与概率",
      "gradeRange": [
        5,
        7
      ],
      "priority": "medium",
      "prerequisites": [
        "MATH-MEASURE-UNIT-LENGTH"
      ],
      "successors": [
        "MATH-MOD-RATE-DISTANCE-TIME"
      ],
      "typicalProblems": [
        "从距离-时间图读取路程变化",
        "坐标点读数"
      ],
      "commonBottlenecks": [
        "BN-CHART-POINT-READING"
      ],
      "masteryCriteria": {
        "immediatePractice": "能准确读横轴、纵轴和单位。",
        "transferPractice": "能从图中提取两点差值。",
        "spacedReview": "图表应用题不再看错单位。"
      },
      "textbookRefs": [],
      "resourceIds": []
    },
    {
      "nodeId": "MATH-MOD-RATE-DISTANCE-TIME",
      "subject": "math",
      "title": "路程、时间、速度关系",
      "domain": "综合与实践",
      "gradeRange": [
        5,
        7
      ],
      "priority": "medium",
      "prerequisites": [
        "MATH-STAT-COORDINATE-READING",
        "MATH-MEASURE-UNIT-LENGTH"
      ],
      "successors": [
        "MATH-MOD-UNIFORM-CHANGE"
      ],
      "typicalProblems": [
        "km/min 转 km/h",
        "距离-时间图求速度"
      ],
      "commonBottlenecks": [
        "BN-RATE-UNIT-CONVERSION-BREAK"
      ],
      "masteryCriteria": {
        "immediatePractice": "能写出速度 = 路程 ÷ 时间。",
        "transferPractice": "能完成 km/min 到 km/h 的单位换算。",
        "spacedReview": "图表速度题不再只凭近似写整数。"
      },
      "textbookRefs": [],
      "resourceIds": []
    },
    {
      "nodeId": "MATH-MOD-UNIFORM-CHANGE",
      "subject": "math",
      "title": "匀速变化模型中的单位变化量",
      "domain": "综合与实践",
      "gradeRange": [
        5,
        7
      ],
      "priority": "high",
      "prerequisites": [
        "MATH-MOD-RATE-DISTANCE-TIME"
      ],
      "successors": [
        "MATH-MOD-EQUATION-WORD-PROBLEM"
      ],
      "typicalProblems": [
        "蜡烛 1 小时后余 14.6cm，2 小时后余 11.8cm，求原长"
      ],
      "commonBottlenecks": [
        "BN-UNIFORM-CHANGE-INTERVAL-DIFF"
      ],
      "masteryCriteria": {
        "immediatePractice": "能说出相邻两个时刻差值就是一个时间间隔的变化量。",
        "transferPractice": "水位、蜡烛、行程等匀速变化题能识别单位变化量。",
        "spacedReview": "不再把已经是一小时差值的数再除以 2。"
      },
      "textbookRefs": [],
      "resourceIds": [
        "RES-BILI-UNIFORM-CHANGE-001",
        "RES-XHS-UNIFORM-CHANGE-001"
      ]
    },
    {
      "nodeId": "MATH-MOD-EQUATION-WORD-PROBLEM",
      "subject": "math",
      "title": "应用题中的方程建模",
      "domain": "综合与实践",
      "gradeRange": [
        5,
        7
      ],
      "priority": "high",
      "prerequisites": [
        "MATH-MOD-RATIO-PART-WHOLE",
        "MATH-MOD-UNIFORM-CHANGE"
      ],
      "successors": [],
      "typicalProblems": [
        "多条件比例应用题",
        "未知总量问题"
      ],
      "commonBottlenecks": [
        "BN-MODEL-EQUATION-AVOIDANCE"
      ],
      "masteryCriteria": {
        "immediatePractice": "能为未知总量设 x 并解释 x 的含义。",
        "transferPractice": "复杂应用题能选择方程降低认知负荷。",
        "spacedReview": "后续多条件题不再只靠算术硬凑。"
      },
      "textbookRefs": [],
      "resourceIds": []
    },
    {
      "nodeId": "MATH-META-ESTIMATION-CHECK",
      "subject": "math",
      "title": "答案数量级估算与合理性检查",
      "domain": "综合与实践",
      "gradeRange": [
        3,
        7
      ],
      "priority": "high",
      "prerequisites": [
        "MATH-NUM-DEC-PLACE-VALUE",
        "MATH-NUM-INT-MUL-PARTIAL"
      ],
      "successors": [],
      "typicalProblems": [
        "8.5 × 3.16 不可能等于 2.186",
        "5600 ÷ 28 = 200 不等于 204"
      ],
      "commonBottlenecks": [
        "BN-META-ESTIMATION-MISSING",
        "BN-META-INVERSE-CHECK-MISSING"
      ],
      "masteryCriteria": {
        "immediatePractice": "做完题能主动说出答案大概范围。",
        "transferPractice": "遇到明显不合理答案能停下来检查。",
        "spacedReview": "真实试卷中出现验算痕迹。"
      },
      "textbookRefs": [],
      "resourceIds": [
        "RES-BILI-ESTIMATION-001",
        "RES-XHS-ESTIMATION-001"
      ]
    },
    {
      "nodeId": "MATH-NUM-INT-COUNT-20",
      "title": "20以内数的认识与加减法",
      "domain": "数与代数",
      "gradeRange": [
        1,
        1
      ],
      "priority": "medium",
      "prerequisites": [],
      "typicalProblems": [
        "8+7",
        "15-9",
        "凑十法"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "20以内加减法 1 分钟 10 题全对。",
        "transferPractice": "能用凑十法解释进位加法。",
        "spacedReview": "72 小时后混合加减仍全对。"
      }
    },
    {
      "nodeId": "MATH-NUM-INT-COUNT-100",
      "title": "100以内数的认识与加减",
      "domain": "数与代数",
      "gradeRange": [
        1,
        2
      ],
      "priority": "medium",
      "prerequisites": [
        "MATH-NUM-INT-COUNT-20"
      ],
      "typicalProblems": [
        "36+28",
        "72-45"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "100以内进位退位加减 5 题全对。",
        "transferPractice": "能解释退位借 1 当 10。",
        "spacedReview": "一周后混合题准确率 ≥90%。"
      }
    },
    {
      "nodeId": "MATH-NUM-INT-PLACE-VALUE",
      "title": "万以内数的位值与读写",
      "domain": "数与代数",
      "gradeRange": [
        2,
        3
      ],
      "priority": "medium",
      "prerequisites": [
        "MATH-NUM-INT-COUNT-100"
      ],
      "typicalProblems": [
        "读 3050、写四千零八",
        "比大小"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "能正确读写含 0 的万以内数。",
        "transferPractice": "能说明每一位数字的含义。",
        "spacedReview": "能比较万以内数的大小。"
      }
    },
    {
      "nodeId": "MATH-NUM-INT-MUL-TABLE",
      "title": "乘法口诀表（表内乘法）",
      "domain": "数与代数",
      "gradeRange": [
        2,
        3
      ],
      "priority": "high",
      "prerequisites": [
        "MATH-NUM-INT-COUNT-100"
      ],
      "typicalProblems": [
        "7×8、6×9",
        "乘法口诀正背倒背"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "表内乘法 1 分钟 15 题全对。",
        "transferPractice": "能用乘法意义解释 7×8。",
        "spacedReview": "一周后口诀仍熟练。"
      }
    },
    {
      "nodeId": "MATH-NUM-INT-MUL-BASIC",
      "title": "两位数乘一位数与乘法竖式",
      "domain": "数与代数",
      "gradeRange": [
        3,
        4
      ],
      "priority": "high",
      "prerequisites": [
        "MATH-NUM-INT-MUL-TABLE",
        "MATH-NUM-INT-PLACE-VALUE"
      ],
      "typicalProblems": [
        "36×7",
        "208×4"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "两位数乘一位数竖式 5 题全对。",
        "transferPractice": "能解释每一位乘积的位置。",
        "spacedReview": "一周后仍能正确列竖式。"
      }
    },
    {
      "nodeId": "MATH-NUM-INT-DIV-BASIC",
      "title": "表内除法与有余数除法",
      "domain": "数与代数",
      "gradeRange": [
        2,
        3
      ],
      "priority": "high",
      "prerequisites": [
        "MATH-NUM-INT-MUL-TABLE"
      ],
      "typicalProblems": [
        "56÷8",
        "23÷5=4……3"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "表内除法 1 分钟 12 题全对。",
        "transferPractice": "能说明除法是乘法的逆运算。",
        "spacedReview": "有余数除法余数<除数。"
      }
    },
    {
      "nodeId": "MATH-NUM-INT-DIV-MULTI-DIGIT",
      "title": "除数是两位数的除法",
      "domain": "数与代数",
      "gradeRange": [
        4,
        5
      ],
      "priority": "high",
      "prerequisites": [
        "MATH-NUM-INT-DIV-BASIC",
        "MATH-NUM-INT-PLACE-VALUE"
      ],
      "typicalProblems": [
        "936÷24",
        "780÷15"
      ],
      "commonBottlenecks": [
        "BN-INT-DIV-DIVISOR-SIMPLIFY"
      ],
      "masteryCriteria": {
        "immediatePractice": "两位数除法竖式 5 题全对。",
        "transferPractice": "能解释试商过程和调商。",
        "spacedReview": "一周后商位和余数仍正确。"
      }
    },
    {
      "nodeId": "MATH-NUM-INT-FOUR-OP-MIX",
      "title": "四则混合运算顺序",
      "domain": "数与代数",
      "gradeRange": [
        4,
        6
      ],
      "priority": "high",
      "prerequisites": [
        "MATH-NUM-INT-MUL-BASIC",
        "MATH-NUM-INT-DIV-BASIC"
      ],
      "typicalProblems": [
        "584+8008÷26×15",
        "100-25×3"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "含括号的混合运算 5 题全对。",
        "transferPractice": "能说出先乘除后加减、先括号内。",
        "spacedReview": "72 小时后运算顺序不混。"
      }
    },
    {
      "nodeId": "MATH-NUM-INT-FACTOR-MULTIPLE",
      "title": "因数倍数与质数合数",
      "domain": "数与代数",
      "gradeRange": [
        5,
        6
      ],
      "priority": "medium",
      "prerequisites": [
        "MATH-NUM-INT-MUL-TABLE"
      ],
      "typicalProblems": [
        "36的因数有哪些",
        "判断 17 是不是质数"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "能列出 100 以内数的因数。",
        "transferPractice": "能区分质数合数、找公因数公倍数。",
        "spacedReview": "一周后最大公因数最小公倍数正确。"
      }
    },
    {
      "nodeId": "MATH-NUM-INT-GCD-LCM",
      "title": "最大公因数与最小公倍数",
      "domain": "数与代数",
      "gradeRange": [
        5,
        6
      ],
      "priority": "medium",
      "prerequisites": [
        "MATH-NUM-INT-FACTOR-MULTIPLE"
      ],
      "typicalProblems": [
        "求 12 和 18 的最大公因数",
        "求 8 和 12 的最小公倍数"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "用短除法求 GCD/LCM 5 题全对。",
        "transferPractice": "能解释 GCD 在约分中的应用。",
        "spacedReview": "一周后通分约分时能正确调用。"
      }
    },
    {
      "nodeId": "MATH-NUM-DEC-RECOGNITION",
      "title": "小数的意义与读写",
      "domain": "数与代数",
      "gradeRange": [
        3,
        4
      ],
      "priority": "medium",
      "prerequisites": [
        "MATH-NUM-INT-PLACE-VALUE"
      ],
      "typicalProblems": [
        "读 3.14、把 0.5 写成分数"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "能正确读写小数并说明位值。",
        "transferPractice": "能用分数解释小数的意义。",
        "spacedReview": "一周后小数大小比较正确。"
      }
    },
    {
      "nodeId": "MATH-NUM-DEC-ADD-SUB",
      "title": "小数加减法（小数点对齐）",
      "domain": "数与代数",
      "gradeRange": [
        4,
        5
      ],
      "priority": "medium",
      "prerequisites": [
        "MATH-NUM-DEC-RECOGNITION"
      ],
      "typicalProblems": [
        "3.75+2.6",
        "10-3.14"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "小数加减竖式 5 题全对（小数点对齐）。",
        "transferPractice": "能解释为什么要小数点对齐。",
        "spacedReview": "一周后位数不同时仍对齐。"
      }
    },
    {
      "nodeId": "MATH-NUM-DEC-DIV",
      "title": "小数除法（移动小数点）",
      "domain": "数与代数",
      "gradeRange": [
        5,
        6
      ],
      "priority": "medium",
      "prerequisites": [
        "MATH-NUM-DEC-MUL-POINT",
        "MATH-NUM-INT-DIV-MULTI-DIGIT"
      ],
      "typicalProblems": [
        "7.2÷0.15",
        "3.6÷0.04"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "除数转整数后正确移动被除数小数点。",
        "transferPractice": "能解释商不变性质。",
        "spacedReview": "一周后小数除法准确率 ≥90%。"
      }
    },
    {
      "nodeId": "MATH-NUM-FRACTION-ADD-SUB",
      "title": "同分母分数加减法",
      "domain": "数与代数",
      "gradeRange": [
        3,
        4
      ],
      "priority": "medium",
      "prerequisites": [
        "MATH-NUM-FRACTION-MEANING"
      ],
      "typicalProblems": [
        "1/5+2/5",
        "4/7-1/7"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "同分母加减 5 题全对（分母不变）。",
        "transferPractice": "能解释分母不变的道理。",
        "spacedReview": "一周后不与乘法混淆。"
      }
    },
    {
      "nodeId": "MATH-NUM-FRACTION-MUL-MEANING",
      "title": "分数乘法的意义（求一个数的几分之几）",
      "domain": "数与代数",
      "gradeRange": [
        5,
        6
      ],
      "priority": "high",
      "prerequisites": [
        "MATH-NUM-FRACTION-MEANING",
        "MATH-NUM-INT-MUL-BASIC"
      ],
      "typicalProblems": [
        "12的1/3是多少",
        "2/3×4/5"
      ],
      "commonBottlenecks": [
        "BN-FRACTION-MUL-SIMPLIFY-DIRECTION"
      ],
      "masteryCriteria": {
        "immediatePractice": "分数乘分数 5 题全对（分子乘分子）。",
        "transferPractice": "能用图示解释求一个数的几分之几。",
        "spacedReview": "一周后结果大小判断正确。"
      }
    },
    {
      "nodeId": "MATH-NUM-FRACTION-MIXED-NUMBER",
      "title": "带分数与假分数互化",
      "domain": "数与代数",
      "gradeRange": [
        5,
        6
      ],
      "priority": "medium",
      "prerequisites": [
        "MATH-NUM-FRACTION-MEANING"
      ],
      "typicalProblems": [
        "把 7/3 化成带分数",
        "2又1/4 化成假分数"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "互化 5 题全对。",
        "transferPractice": "能解释整数部分和分数部分。",
        "spacedReview": "一周后带分数运算不混。"
      }
    },
    {
      "nodeId": "MATH-NUM-FRACTION-PERCENT-BASIC",
      "title": "百分数的意义与读写",
      "domain": "数与代数",
      "gradeRange": [
        6,
        6
      ],
      "priority": "high",
      "prerequisites": [
        "MATH-NUM-FRACTION-MEANING"
      ],
      "typicalProblems": [
        "读 35%、把 0.45 写成百分数"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "能正确读写百分数并说明含义。",
        "transferPractice": "能区分百分数与分数的使用场景。",
        "spacedReview": "一周后百分数意义清晰。"
      }
    },
    {
      "nodeId": "MATH-MOD-RATIO-SIMPLIFY",
      "title": "比的化简与比值",
      "domain": "数与代数",
      "gradeRange": [
        6,
        6
      ],
      "priority": "high",
      "prerequisites": [
        "MATH-MOD-RATIO-MEANING",
        "MATH-NUM-INT-GCD-LCM"
      ],
      "typicalProblems": [
        "化简比 12:18",
        "求比值 8:2"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "化简比 5 题全对（同除以最大公因数）。",
        "transferPractice": "能区分比和比值。",
        "spacedReview": "一周后化简不混。"
      }
    },
    {
      "nodeId": "MATH-MOD-PROPORTION-SOLVE",
      "title": "解比例（内项之积=外项之积）",
      "domain": "数与代数",
      "gradeRange": [
        6,
        6
      ],
      "priority": "high",
      "prerequisites": [
        "MATH-MOD-RATIO-PROPERTY"
      ],
      "typicalProblems": [
        "2:3=6:x",
        "求比例中的未知项"
      ],
      "commonBottlenecks": [
        "BN-RATIO-CROSS-MULTIPLY-DIRECTION"
      ],
      "masteryCriteria": {
        "immediatePractice": "解比例 5 题全对。",
        "transferPractice": "能用交叉相乘解释。",
        "spacedReview": "一周后交叉相乘方向正确。"
      }
    },
    {
      "nodeId": "MATH-MOD-DIRECT-INVERSE",
      "title": "正比例与反比例判断",
      "domain": "数与代数",
      "gradeRange": [
        6,
        6
      ],
      "priority": "medium",
      "prerequisites": [
        "MATH-MOD-RATIO-MEANING",
        "MATH-MOD-UNIFORM-CHANGE"
      ],
      "typicalProblems": [
        "判断路程与时间是否成正比例",
        "判断速度一定时路程与时间关系"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "判断 5 组量的正反比例全对。",
        "transferPractice": "能用比值一定或乘积一定解释。",
        "spacedReview": "一周后判断不混。"
      }
    },
    {
      "nodeId": "MATH-ALG-EQUATION-ONE-STEP",
      "title": "一元一次方程的解法",
      "domain": "数与代数",
      "gradeRange": [
        5,
        6
      ],
      "priority": "high",
      "prerequisites": [
        "MATH-NUM-INT-FOUR-OP-MIX"
      ],
      "typicalProblems": [
        "x+15=40",
        "3x=24"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "解一元一次方程 5 题全对。",
        "transferPractice": "能说明等式性质（两边同加减乘除）。",
        "spacedReview": "一周后含括号方程仍正确。"
      }
    },
    {
      "nodeId": "MATH-ALG-EQUATION-WORD",
      "title": "列方程解应用题",
      "domain": "数与代数",
      "gradeRange": [
        5,
        6
      ],
      "priority": "high",
      "prerequisites": [
        "MATH-ALG-EQUATION-ONE-STEP",
        "MATH-MOD-EQUATION-WORD-PROBLEM"
      ],
      "typicalProblems": [
        "果园里有苹果树 x 棵，梨树比苹果树多 15 棵，共 75 棵"
      ],
      "commonBottlenecks": [
        "BN-RATIO-PART-WHOLE-REFERENCE"
      ],
      "masteryCriteria": {
        "immediatePractice": "能设未知数列方程解 5 道应用题。",
        "transferPractice": "能说明等量关系的来源。",
        "spacedReview": "一周后多条件应用题方程正确。"
      }
    },
    {
      "nodeId": "MATH-NUM-INT-BIG-NUMBER",
      "title": "大数的认识（亿以内与亿以上）",
      "domain": "数与代数",
      "gradeRange": [
        4,
        5
      ],
      "priority": "low",
      "prerequisites": [
        "MATH-NUM-INT-PLACE-VALUE"
      ],
      "typicalProblems": [
        "读 30500000",
        "亿以内数的大小比较"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "能正确读写亿以内的数。",
        "transferPractice": "能用数位顺序表说明。",
        "spacedReview": "一周后四舍五入到万位亿位正确。"
      }
    },
    {
      "nodeId": "MATH-NUM-NEGATIVE-RECOGNITION",
      "title": "负数的初步认识",
      "domain": "数与代数",
      "gradeRange": [
        6,
        6
      ],
      "priority": "medium",
      "prerequisites": [
        "MATH-NUM-INT-PLACE-VALUE"
      ],
      "typicalProblems": [
        "-3℃、海拔 -50m",
        "用正负数表示收支"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "能用正负数表示相反意义的量。",
        "transferPractice": "能在数轴上表示正负数。",
        "spacedReview": "一周后大小比较正确。"
      }
    },
    {
      "nodeId": "MATH-GEO-PLANE-RECOGNITION",
      "title": "平面图形的认识（三角形、四边形、圆）",
      "domain": "图形与几何",
      "gradeRange": [
        1,
        3
      ],
      "priority": "medium",
      "prerequisites": [],
      "typicalProblems": [
        "辨认三角形、正方形、长方形",
        "图形分类"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "能辨认常见平面图形。",
        "transferPractice": "能说明图形的特征（边、角）。",
        "spacedReview": "一周后图形分类正确。"
      }
    },
    {
      "nodeId": "MATH-GEO-SOLID-RECOGNITION",
      "title": "立体图形的认识（正方体、长方体、圆柱、球）",
      "domain": "图形与几何",
      "gradeRange": [
        1,
        2
      ],
      "priority": "low",
      "prerequisites": [],
      "typicalProblems": [
        "辨认长方体、正方体、圆柱",
        "实物对应"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "能辨认常见立体图形。",
        "transferPractice": "能说明立体和平面的对应关系。",
        "spacedReview": "一周后仍能辨认。"
      }
    },
    {
      "nodeId": "MATH-GEO-ANGLE-RECOGNITION",
      "title": "角的认识与分类（锐角、直角、钝角）",
      "domain": "图形与几何",
      "gradeRange": [
        2,
        4
      ],
      "priority": "medium",
      "prerequisites": [
        "MATH-GEO-PLANE-RECOGNITION"
      ],
      "typicalProblems": [
        "判断锐角直角钝角",
        "用三角板比角"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "能判断角的类型。",
        "transferPractice": "能用直角作标准比较大小。",
        "spacedReview": "一周后量角器量角正确。"
      }
    },
    {
      "nodeId": "MATH-GEO-TRIANGLE-CLASSIFY",
      "title": "三角形的分类与性质",
      "domain": "图形与几何",
      "gradeRange": [
        4,
        5
      ],
      "priority": "medium",
      "prerequisites": [
        "MATH-GEO-ANGLE-RECOGNITION"
      ],
      "typicalProblems": [
        "锐角三角形、直角三角形、钝角三角形分类",
        "等腰等边三角形"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "能按角和按边分类。",
        "transferPractice": "能说明内角和 180°。",
        "spacedReview": "一周后内角和计算正确。"
      }
    },
    {
      "nodeId": "MATH-GEO-QUADRILATERAL",
      "title": "四边形的分类（平行四边形、梯形）",
      "domain": "图形与几何",
      "gradeRange": [
        4,
        5
      ],
      "priority": "medium",
      "prerequisites": [
        "MATH-GEO-PLANE-RECOGNITION"
      ],
      "typicalProblems": [
        "区分平行四边形和梯形",
        "判断特殊四边形"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "能正确分类四边形。",
        "transferPractice": "能说明对边平行的特征。",
        "spacedReview": "一周后分类正确。"
      }
    },
    {
      "nodeId": "MATH-GEO-RECTANGLE-SQUARE",
      "title": "长方形与正方形的周长",
      "domain": "图形与几何",
      "gradeRange": [
        3,
        4
      ],
      "priority": "medium",
      "prerequisites": [
        "MATH-GEO-PLANE-RECOGNITION",
        "MATH-MEASURE-UNIT-LENGTH"
      ],
      "typicalProblems": [
        "求长方形周长",
        "正方形周长"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "长方形正方形周长 5 题全对。",
        "transferPractice": "能说明周长公式的来源。",
        "spacedReview": "一周后不规则图形周长也能算。"
      }
    },
    {
      "nodeId": "MATH-GEO-AREA-RECTANGLE",
      "title": "长方形与正方形面积",
      "domain": "图形与几何",
      "gradeRange": [
        3,
        4
      ],
      "priority": "high",
      "prerequisites": [
        "MATH-MEASURE-UNIT-AREA-VOLUME"
      ],
      "typicalProblems": [
        "长方形面积=长×宽",
        "正方形面积=边长×边长"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "面积计算 5 题全对。",
        "transferPractice": "能区分周长和面积。",
        "spacedReview": "一周后周长面积不混。"
      }
    },
    {
      "nodeId": "MATH-GEO-AREA-PARALLELOGRAM",
      "title": "平行四边形面积",
      "domain": "图形与几何",
      "gradeRange": [
        5,
        5
      ],
      "priority": "medium",
      "prerequisites": [
        "MATH-GEO-AREA-RECTANGLE"
      ],
      "typicalProblems": [
        "平行四边形面积=底×高"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "面积计算 5 题全对。",
        "transferPractice": "能用割补法说明公式。",
        "spacedReview": "一周后底高对应正确。"
      }
    },
    {
      "nodeId": "MATH-GEO-AREA-TRAPEZOID",
      "title": "梯形面积",
      "domain": "图形与几何",
      "gradeRange": [
        5,
        5
      ],
      "priority": "medium",
      "prerequisites": [
        "MATH-GEO-AREA-PARALLELOGRAM"
      ],
      "typicalProblems": [
        "梯形面积=(上底+下底)×高÷2"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "面积计算 5 题全对。",
        "transferPractice": "能用拼补法说明公式。",
        "spacedReview": "一周后上底下底不混。"
      }
    },
    {
      "nodeId": "MATH-GEO-AREA-COMPOSITE",
      "title": "组合图形面积",
      "domain": "图形与几何",
      "gradeRange": [
        5,
        6
      ],
      "priority": "medium",
      "prerequisites": [
        "MATH-GEO-AREA-RECTANGLE",
        "MATH-GEO-TRIANGLE-AREA"
      ],
      "typicalProblems": [
        "L形、十字形组合图形面积",
        "割补法求面积"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "组合图形面积 3 题全对。",
        "transferPractice": "能说明割补思路。",
        "spacedReview": "一周后方法选择正确。"
      }
    },
    {
      "nodeId": "MATH-GEO-RECT-SOLID-VOLUME",
      "title": "长方体与正方体体积",
      "domain": "图形与几何",
      "gradeRange": [
        5,
        6
      ],
      "priority": "high",
      "prerequisites": [
        "MATH-MEASURE-UNIT-AREA-VOLUME"
      ],
      "typicalProblems": [
        "长方体体积=长×宽×高",
        "正方体体积=棱长³"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "体积计算 5 题全对。",
        "transferPractice": "能区分体积和表面积。",
        "spacedReview": "一周后体积表面积不混。"
      }
    },
    {
      "nodeId": "MATH-GEO-RECT-SOLID-SURFACE",
      "title": "长方体与正方体表面积",
      "domain": "图形与几何",
      "gradeRange": [
        5,
        6
      ],
      "priority": "medium",
      "prerequisites": [
        "MATH-GEO-RECT-SOLID-VOLUME"
      ],
      "typicalProblems": [
        "表面积=2(ab+ah+bh)",
        "无盖无底情况"
      ],
      "commonBottlenecks": [
        "BN-SOLID-SURFACE-EXPOSED-FACES-OMIT"
      ],
      "masteryCriteria": {
        "immediatePractice": "表面积计算 5 题全对。",
        "transferPractice": "能处理缺面情况。",
        "spacedReview": "一周后暴露面判断正确。"
      }
    },
    {
      "nodeId": "MATH-GEO-CYLINDER-SURFACE",
      "title": "圆柱表面积",
      "domain": "图形与几何",
      "gradeRange": [
        6,
        6
      ],
      "priority": "medium",
      "prerequisites": [
        "MATH-GEO-CIRCLE-AREA",
        "MATH-GEO-CYLINDER-VOLUME"
      ],
      "typicalProblems": [
        "圆柱侧面积=底面周长×高",
        "表面积=侧面积+2×底面积"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "表面积计算 5 题全对。",
        "transferPractice": "能展开图说明侧面积来源。",
        "spacedReview": "一周后侧面积底面积不混。"
      }
    },
    {
      "nodeId": "MATH-GEO-SPHERE-BASIC",
      "title": "球的初步认识（初中衔接）",
      "domain": "图形与几何",
      "gradeRange": [
        6,
        6
      ],
      "priority": "low",
      "prerequisites": [
        "MATH-GEO-CIRCLE-AREA"
      ],
      "typicalProblems": [
        "辨认球体",
        "球与圆的关系"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "能辨认球体。",
        "transferPractice": "能说明球与圆的关系。",
        "spacedReview": "一周后仍能辨认。"
      }
    },
    {
      "nodeId": "MATH-GEO-TRANSFORMATION",
      "title": "图形的平移、旋转、对称",
      "domain": "图形与几何",
      "gradeRange": [
        4,
        6
      ],
      "priority": "medium",
      "prerequisites": [
        "MATH-GEO-PLANE-RECOGNITION"
      ],
      "typicalProblems": [
        "判断平移旋转",
        "画轴对称图形"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "能判断三种运动。",
        "transferPractice": "能画出平移旋转后的图形。",
        "spacedReview": "一周后运动性质清晰。"
      }
    },
    {
      "nodeId": "MATH-GEO-AXIS-SYM",
      "title": "轴对称图形",
      "domain": "图形与几何",
      "gradeRange": [
        4,
        5
      ],
      "priority": "low",
      "prerequisites": [
        "MATH-GEO-TRANSFORMATION"
      ],
      "typicalProblems": [
        "判断轴对称图形",
        "画对称轴"
      ],
      "commonBottlenecks": [
        "BN-AXIS-FOLD-MIDPOINT-DIRECTION"
      ],
      "masteryCriteria": {
        "immediatePractice": "能判断常见轴对称图形。",
        "transferPractice": "能画对称轴。",
        "spacedReview": "一周后对称轴数量正确。"
      }
    },
    {
      "nodeId": "MATH-GEO-POSITION",
      "title": "方向与位置（数对的初步）",
      "domain": "图形与几何",
      "gradeRange": [
        4,
        5
      ],
      "priority": "low",
      "prerequisites": [
        "MATH-STAT-COORDINATE-READING"
      ],
      "typicalProblems": [
        "用数对表示位置",
        "根据方向距离确定位置"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "能用数对表示位置。",
        "transferPractice": "能用方向距离确定位置。",
        "spacedReview": "一周后数对和方向正确。"
      }
    },
    {
      "nodeId": "MATH-MEASURE-LENGTH-TOOL",
      "title": "长度的测量与单位（厘米、米）",
      "domain": "综合与实践",
      "gradeRange": [
        1,
        2
      ],
      "priority": "medium",
      "prerequisites": [],
      "typicalProblems": [
        "用尺量长度",
        "cm 和 m 换算"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "能正确使用尺子测量。",
        "transferPractice": "能进行 cm 和 m 换算。",
        "spacedReview": "一周后测量读数正确。"
      }
    },
    {
      "nodeId": "MATH-MEASURE-WEIGHT",
      "title": "质量单位（克、千克、吨）",
      "domain": "综合与实践",
      "gradeRange": [
        3,
        4
      ],
      "priority": "low",
      "prerequisites": [],
      "typicalProblems": [
        "g、kg、t 换算",
        "估测质量"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "能进行质量单位换算。",
        "transferPractice": "能估测常见物体质量。",
        "spacedReview": "一周后换算正确。"
      }
    },
    {
      "nodeId": "MATH-MEASURE-TIME",
      "title": "时间单位与时间计算",
      "domain": "综合与实践",
      "gradeRange": [
        2,
        3
      ],
      "priority": "medium",
      "prerequisites": [],
      "typicalProblems": [
        "时、分、秒换算",
        "经过时间计算"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "能进行时分秒换算。",
        "transferPractice": "能计算经过时间。",
        "spacedReview": "一周后时间计算正确。"
      }
    },
    {
      "nodeId": "MATH-MEASURE-MONEY",
      "title": "人民币的认识与计算",
      "domain": "综合与实践",
      "gradeRange": [
        1,
        2
      ],
      "priority": "low",
      "prerequisites": [],
      "typicalProblems": [
        "元角分换算",
        "购物找零"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "能进行元角分换算。",
        "transferPractice": "能完成购物找零。",
        "spacedReview": "一周后找零正确。"
      }
    },
    {
      "nodeId": "MATH-MEASURE-ANGLE",
      "title": "角的度量（量角器使用）",
      "domain": "图形与几何",
      "gradeRange": [
        4,
        4
      ],
      "priority": "low",
      "prerequisites": [
        "MATH-GEO-ANGLE-RECOGNITION"
      ],
      "typicalProblems": [
        "用量角器量角",
        "画指定度数的角"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "能正确使用量角器。",
        "transferPractice": "能画指定度数的角。",
        "spacedReview": "一周后量角读数正确。"
      }
    },
    {
      "nodeId": "MATH-STAT-DATA-COLLECT",
      "title": "数据收集与整理（统计表）",
      "domain": "统计与概率",
      "gradeRange": [
        2,
        3
      ],
      "priority": "medium",
      "prerequisites": [],
      "typicalProblems": [
        "画正字统计",
        "制作统计表"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "能收集整理数据。",
        "transferPractice": "能制作简单统计表。",
        "spacedReview": "一周后数据整理正确。"
      }
    },
    {
      "nodeId": "MATH-STAT-BAR-CHART",
      "title": "条形统计图",
      "domain": "统计与概率",
      "gradeRange": [
        3,
        5
      ],
      "priority": "medium",
      "prerequisites": [
        "MATH-STAT-DATA-COLLECT"
      ],
      "typicalProblems": [
        "读条形统计图",
        "绘制条形统计图"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "能读懂条形统计图。",
        "transferPractice": "能绘制条形统计图。",
        "spacedReview": "一周后读图准确。"
      }
    },
    {
      "nodeId": "MATH-STAT-LINE-CHART",
      "title": "折线统计图",
      "domain": "统计与概率",
      "gradeRange": [
        5,
        5
      ],
      "priority": "medium",
      "prerequisites": [
        "MATH-STAT-BAR-CHART",
        "MATH-STAT-COORDINATE-READING"
      ],
      "typicalProblems": [
        "读折线统计图",
        "判断变化趋势"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "能读懂折线统计图。",
        "transferPractice": "能说明变化趋势。",
        "spacedReview": "一周后趋势判断正确。"
      }
    },
    {
      "nodeId": "MATH-STAT-AVERAGE",
      "title": "平均数的意义与计算",
      "domain": "统计与概率",
      "gradeRange": [
        4,
        5
      ],
      "priority": "medium",
      "prerequisites": [
        "MATH-NUM-INT-FOUR-OP-MIX"
      ],
      "typicalProblems": [
        "求一组数的平均数",
        "平均数应用题"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "能正确计算平均数。",
        "transferPractice": "能说明平均数的意义。",
        "spacedReview": "一周后平均数应用题正确。"
      }
    },
    {
      "nodeId": "MATH-STAT-PIE-CHART",
      "title": "扇形统计图",
      "domain": "统计与概率",
      "gradeRange": [
        6,
        6
      ],
      "priority": "medium",
      "prerequisites": [
        "MATH-STAT-BAR-CHART",
        "MATH-MOD-PERCENT-BASE"
      ],
      "typicalProblems": [
        "读扇形统计图",
        "计算各部分百分比"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "能读懂扇形统计图。",
        "transferPractice": "能说明整体与部分的关系。",
        "spacedReview": "一周后百分比计算正确。"
      }
    },
    {
      "nodeId": "MATH-STAT-POSSIBILITY",
      "title": "可能性的大小（概率初步）",
      "domain": "统计与概率",
      "gradeRange": [
        5,
        6
      ],
      "priority": "low",
      "prerequisites": [
        "MATH-NUM-FRACTION-MEANING"
      ],
      "typicalProblems": [
        "摸球可能性",
        "判断事件发生的可能性"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "能判断可能性的大小。",
        "transferPractice": "能用分数表示可能性。",
        "spacedReview": "一周后可能性比较正确。"
      }
    },
    {
      "nodeId": "MATH-APP-INTEGER-WORD",
      "title": "整数应用题（简单一步/两步）",
      "domain": "综合与实践",
      "gradeRange": [
        2,
        4
      ],
      "priority": "medium",
      "prerequisites": [
        "MATH-NUM-INT-FOUR-OP-MIX"
      ],
      "typicalProblems": [
        "求比一个数多几",
        "两步计算应用题"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "能正确解答两步应用题。",
        "transferPractice": "能说明数量关系。",
        "spacedReview": "一周后两步应用题正确。"
      }
    },
    {
      "nodeId": "MATH-APP-FRACTION-WORD",
      "title": "分数应用题（求一个数的几分之几）",
      "domain": "综合与实践",
      "gradeRange": [
        5,
        6
      ],
      "priority": "high",
      "prerequisites": [
        "MATH-NUM-FRACTION-MUL-MEANING"
      ],
      "typicalProblems": [
        "一袋米 12 千克，吃了 1/3，吃了多少",
        "比一个数多 1/4"
      ],
      "commonBottlenecks": [
        "BN-FRACTION-DECIMAL-MIXED-LOAD"
      ],
      "masteryCriteria": {
        "immediatePractice": "分数应用题 5 题全对。",
        "transferPractice": "能画线段图说明。",
        "spacedReview": "一周后单位 1 判断正确。"
      }
    },
    {
      "nodeId": "MATH-APP-PERCENT-WORD",
      "title": "百分数应用题（折扣、利率、增减）",
      "domain": "综合与实践",
      "gradeRange": [
        6,
        6
      ],
      "priority": "high",
      "prerequisites": [
        "MATH-MOD-PERCENT-BASE",
        "MATH-NUM-FRACTION-PERCENT-BASIC"
      ],
      "typicalProblems": [
        "打八折后多少钱",
        "比去年增长 15%"
      ],
      "commonBottlenecks": [
        "BN-PERCENT-BASE-WHOLE-MISSING"
      ],
      "masteryCriteria": {
        "immediatePractice": "百分数应用题 5 题全对。",
        "transferPractice": "能说明单位 1 是谁。",
        "spacedReview": "一周后增减方向正确。"
      }
    },
    {
      "nodeId": "MATH-APP-ENGINEERING",
      "title": "工程问题",
      "domain": "综合与实践",
      "gradeRange": [
        6,
        6
      ],
      "priority": "medium",
      "prerequisites": [
        "MATH-MOD-UNIFORM-CHANGE"
      ],
      "typicalProblems": [
        "甲乙合做几天完成",
        "工作效率问题"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "工程问题 3 题全对。",
        "transferPractice": "能说明总工作量设为 1。",
        "spacedReview": "一周后合作效率计算正确。"
      }
    },
    {
      "nodeId": "MATH-APP-TRAVEL",
      "title": "行程问题（相遇、追及）",
      "domain": "综合与实践",
      "gradeRange": [
        5,
        6
      ],
      "priority": "medium",
      "prerequisites": [
        "MATH-MOD-RATE-DISTANCE-TIME"
      ],
      "typicalProblems": [
        "相遇问题求时间",
        "追及问题求距离"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "相遇追及问题 3 题全对。",
        "transferPractice": "能画线段图说明。",
        "spacedReview": "一周后速度时间距离关系清晰。"
      }
    },
    {
      "nodeId": "MATH-APP-PLANT",
      "title": "植树问题",
      "domain": "综合与实践",
      "gradeRange": [
        5,
        5
      ],
      "priority": "low",
      "prerequisites": [
        "MATH-NUM-INT-FOUR-OP-MIX"
      ],
      "typicalProblems": [
        "两端都种、一端种、环形植树"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "三种植树问题各 2 题全对。",
        "transferPractice": "能说明棵数与间隔数关系。",
        "spacedReview": "一周后模型判断正确。"
      }
    },
    {
      "nodeId": "MATH-APP-CHICKEN-RABBIT",
      "title": "鸡兔同笼问题",
      "domain": "综合与实践",
      "gradeRange": [
        5,
        6
      ],
      "priority": "low",
      "prerequisites": [
        "MATH-NUM-INT-FOUR-OP-MIX"
      ],
      "typicalProblems": [
        "假设全是鸡/兔",
        "列表法、抬腿法"
      ],
      "commonBottlenecks": [],
      "masteryCriteria": {
        "immediatePractice": "鸡兔同笼 3 题全对。",
        "transferPractice": "能用假设法说明。",
        "spacedReview": "一周后方法正确。"
      }
    },
    {
      "nodeId": "MATH-APP-PROFIT",
      "title": "利润与折扣问题",
      "domain": "综合与实践",
      "gradeRange": [
        6,
        6
      ],
      "priority": "medium",
      "prerequisites": [
        "MATH-MOD-PERCENT-DISCOUNT",
        "MATH-MOD-PERCENT-BASE"
      ],
      "typicalProblems": [
        "成本售价利润率",
        "打折后盈亏"
      ],
      "commonBottlenecks": [
        "BN-PERCENT-BASE-WHOLE-MISSING"
      ],
      "masteryCriteria": {
        "immediatePractice": "利润问题 3 题全对。",
        "transferPractice": "能区分成本售价利润。",
        "spacedReview": "一周后利润率计算正确。"
      }
    }
  ]
}
