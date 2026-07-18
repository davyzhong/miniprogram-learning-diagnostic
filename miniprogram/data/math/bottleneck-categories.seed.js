// 由 scripts/build-math-seed-mirrors.js 自动生成，勿手改。
// 小学数学学习卡点粗类与卡点家族治理库（前端版）。内容与 data/math/bottleneck-categories.seed.json 保持一致；
// 这里改用 module.exports，符合 miniprogram/data 下 *.seed.js 的前端加载约定。
module.exports = {
  "version": "0.1.0",
  "updatedAt": "2026-07-17",
  "subject": "math",
  "scope": "小学数学学习卡点粗类与卡点家族治理库。粗类用于展示、调度和资源讲法选择；细卡点仍是诊断与修复原子。",
  "categories": [
    {
      "categoryId": "MATH-CAT-CALC-RULE",
      "title": "计算规则",
      "shortTitle": "计算规则",
      "description": "孩子知道大方向，但具体运算规则、步骤或规则调用不稳定。",
      "diagnosticRole": "用于归纳一组规则性细卡点，不作为最终诊断原子。",
      "displayRole": "在报告和数学工作台中作为计算类卡点分组。",
      "verificationRole": "适合生成同类规则专项页，观察规则迁移和混淆。",
      "resourceRole": "优先选择步骤拆解、可视化规则和易错对比类资源。",
      "defaultPageType": "same_category",
      "displayOrder": 10
    },
    {
      "categoryId": "MATH-CAT-NUMBER-SENSE",
      "title": "数感与数量级",
      "shortTitle": "数感数量级",
      "description": "对数位、大小、估算范围和结果合理性判断不稳。",
      "diagnosticRole": "用于识别答案数量级、大小直觉和数位意义问题。",
      "displayRole": "帮助家长看到孩子是否缺少先估后算的意识。",
      "verificationRole": "适合加入估算、比较和解释题。",
      "resourceRole": "优先选择数轴、位值表、估算和错例判断资源。",
      "defaultPageType": "micro_confirm",
      "displayOrder": 20
    },
    {
      "categoryId": "MATH-CAT-MODEL",
      "title": "数量关系建模",
      "shortTitle": "数量建模",
      "description": "从文字题、比例关系或变化关系中抽取模型不稳定。",
      "diagnosticRole": "用于归纳单位 1、比和比例、比例尺、行程变化等建模问题。",
      "displayRole": "帮助家长区分是真不会算，还是不会建关系。",
      "verificationRole": "适合生成关系句、线段图、方程和变式应用题。",
      "resourceRole": "优先选择关系图、线段图、单位 1 解释和情境对比资源。",
      "defaultPageType": "same_family",
      "displayOrder": 30
    },
    {
      "categoryId": "MATH-CAT-GEOMETRY",
      "title": "图形与空间",
      "shortTitle": "图形空间",
      "description": "图形性质、周长面积体积和空间枚举不稳定。",
      "diagnosticRole": "用于归纳平面图形、圆、圆柱、立体表面积等问题。",
      "displayRole": "帮助家长看到公式边界和空间想象问题。",
      "verificationRole": "适合生成图形辨析、公式选择、画图和暴露面枚举题。",
      "resourceRole": "优先选择图示推导、动态演示和公式边界对比资源。",
      "defaultPageType": "same_node",
      "displayOrder": 40
    },
    {
      "categoryId": "MATH-CAT-MEASURE",
      "title": "单位与量纲",
      "shortTitle": "单位量纲",
      "description": "单位进率、单位统一、面积体积量纲和实际量感不稳定。",
      "diagnosticRole": "用于归纳长度、面积、体积、质量、时间等单位问题。",
      "displayRole": "帮助家长看到单位换算是否是独立短板。",
      "verificationRole": "适合生成统一单位、进率换算和量纲判断题。",
      "resourceRole": "优先选择进率表、量纲对比和真实场景资源。",
      "defaultPageType": "same_family",
      "displayOrder": 50
    },
    {
      "categoryId": "MATH-CAT-LANGUAGE",
      "title": "数学语言与审题",
      "shortTitle": "数学审题",
      "description": "条件提取、问法识别、符号含义和表达转换不稳定。",
      "diagnosticRole": "用于归纳读题、符号、括号和表达式理解问题。",
      "displayRole": "帮助家长区分阅读理解问题和数学规则问题。",
      "verificationRole": "适合生成找条件、改写关系句和符号解释题。",
      "resourceRole": "优先选择题意拆解、关键词辨析和表达转换资源。",
      "defaultPageType": "micro_confirm",
      "displayOrder": 60
    },
    {
      "categoryId": "MATH-CAT-META",
      "title": "验算与学习习惯",
      "shortTitle": "验算习惯",
      "description": "抄写、草稿组织、逆运算回代和做完检查不稳定。",
      "diagnosticRole": "用于归纳跨知识点出现的检查和表达习惯问题。",
      "displayRole": "帮助家长看到错误是否来自最后一步检查缺失。",
      "verificationRole": "适合在每页加入估算、回代或自查要求。",
      "resourceRole": "优先选择流程卡、检查清单和错题复盘示范资源。",
      "defaultPageType": "mixed_review",
      "displayOrder": 70
    },
    {
      "categoryId": "MATH-CAT-GEO-TRANSFORM",
      "title": "图形变换",
      "shortTitle": "图形变换",
      "description": "对称、平移、旋转、折叠等图形变换中的方向与数量判断不稳。",
      "diagnosticRole": "用于识别图形运动中的方向感、对称判断和倍数语义问题。",
      "displayRole": "帮助家长看到孩子是否在图形变换的方向和数量关系上出错。",
      "verificationRole": "适合加入方向标注、中点先行和语义对照专项题。",
      "resourceRole": "优先选择方向标注、动态演示和语义对照类资源。",
      "defaultPageType": "same_family",
      "displayOrder": 45
    }
  ],
  "families": [
    {
      "familyId": "MATH-FAM-INT-PARTIAL",
      "categoryId": "MATH-CAT-CALC-RULE",
      "title": "整数乘法部分积",
      "nodeIds": [
        "MATH-NUM-INT-MUL-PARTIAL"
      ],
      "verificationTemplate": "要求写出拆分、部分积和合并过程。",
      "resourceStyleHints": [
        "步骤拆解",
        "部分积标记",
        "错例对比"
      ]
    },
    {
      "familyId": "MATH-FAM-LONG-DIVISION",
      "categoryId": "MATH-CAT-CALC-RULE",
      "title": "长除法试商与商位",
      "nodeIds": [
        "MATH-NUM-INT-DIV-LONG"
      ],
      "verificationTemplate": "要求先估商范围，再写竖式并乘回验商。",
      "resourceStyleHints": [
        "竖式步骤",
        "试商",
        "回验"
      ]
    },
    {
      "familyId": "MATH-FAM-DECIMAL-PLACE-VALUE",
      "categoryId": "MATH-CAT-NUMBER-SENSE",
      "title": "小数位值与数量级",
      "nodeIds": [
        "MATH-NUM-DEC-PLACE-VALUE"
      ],
      "verificationTemplate": "要求说明小数接近几，并判断答案数量级。",
      "resourceStyleHints": [
        "位值表",
        "估算",
        "数量级判断"
      ]
    },
    {
      "familyId": "MATH-FAM-DECIMAL-POINT",
      "categoryId": "MATH-CAT-CALC-RULE",
      "title": "小数点定位与移动",
      "nodeIds": [
        "MATH-NUM-DEC-MUL-POINT",
        "MATH-NUM-DEC-DIV-POINT",
        "MATH-NUM-DEC-DIV-QUOTIENT"
      ],
      "verificationTemplate": "先估算数量级，再计算，再解释小数点为什么在这里。",
      "resourceStyleHints": [
        "步骤拆解",
        "数量级估算",
        "错例对比"
      ]
    },
    {
      "familyId": "MATH-FAM-FRACTION-COMMON-DENOM",
      "categoryId": "MATH-CAT-CALC-RULE",
      "title": "异分母通分",
      "nodeIds": [
        "MATH-NUM-FRACTION-ADD-COMMON-DENOM"
      ],
      "verificationTemplate": "要求写出公分母、分子同步变化和最终加减。",
      "resourceStyleHints": [
        "分数条",
        "通分步骤",
        "单位一致"
      ]
    },
    {
      "familyId": "MATH-FAM-FRACTION-SIMPLIFY",
      "categoryId": "MATH-CAT-CALC-RULE",
      "title": "分数约分与结果大小",
      "nodeIds": [
        "MATH-NUM-FRACTION-MUL-SIMPLIFY"
      ],
      "verificationTemplate": "要求标出约分对象，并判断结果大小是否合理。",
      "resourceStyleHints": [
        "约分对象",
        "大小估计",
        "错例对比"
      ]
    },
    {
      "familyId": "MATH-FAM-FRACTION-DIVISION",
      "categoryId": "MATH-CAT-CALC-RULE",
      "title": "分数除法与倒数",
      "nodeIds": [
        "MATH-NUM-FRACTION-DIV-RECIPROCAL"
      ],
      "verificationTemplate": "要求解释除以分数表示包含几个，再改写为乘倒数。",
      "resourceStyleHints": [
        "数轴直观",
        "倒数规则",
        "包含除"
      ]
    },
    {
      "familyId": "MATH-FAM-FRACTION-DECIMAL-CONVERT",
      "categoryId": "MATH-CAT-CALC-RULE",
      "title": "分数小数形式统一",
      "nodeIds": [
        "MATH-NUM-FRACTION-DECIMAL-CONVERT"
      ],
      "verificationTemplate": "要求先选择统一形式，再保留中间过程。",
      "resourceStyleHints": [
        "形式统一",
        "无限小数",
        "混合运算"
      ]
    },
    {
      "familyId": "MATH-FAM-PERCENT-BASE",
      "categoryId": "MATH-CAT-MODEL",
      "title": "百分数单位 1",
      "nodeIds": [
        "MATH-MOD-PERCENT-BASE",
        "MATH-MOD-PERCENT-DISCOUNT"
      ],
      "verificationTemplate": "要求圈出谁是单位 1，并写出原价、现价或变化量关系。",
      "resourceStyleHints": [
        "单位1",
        "线段图",
        "关系句"
      ]
    },
    {
      "familyId": "MATH-FAM-PIECEWISE",
      "categoryId": "MATH-CAT-MODEL",
      "title": "分段关系与税率",
      "nodeIds": [
        "MATH-MOD-TAX-PIECEWISE"
      ],
      "verificationTemplate": "要求逐段列出基数、税率和对应金额。",
      "resourceStyleHints": [
        "分段表格",
        "区间边界",
        "应用建模"
      ]
    },
    {
      "familyId": "MATH-FAM-RATIO-MEANING",
      "categoryId": "MATH-CAT-MODEL",
      "title": "比的意义与参照系",
      "nodeIds": [
        "MATH-MOD-RATIO-MEANING",
        "MATH-MOD-RATIO-PART-WHOLE"
      ],
      "verificationTemplate": "要求写清比的前项后项分别指谁，以及是部分比部分还是部分比整体。",
      "resourceStyleHints": [
        "线段图",
        "对象顺序",
        "参照系"
      ]
    },
    {
      "familyId": "MATH-FAM-RATIO-PROPERTY",
      "categoryId": "MATH-CAT-MODEL",
      "title": "比例性质与穷尽判断",
      "nodeIds": [
        "MATH-MOD-RATIO-PROPERTY"
      ],
      "verificationTemplate": "要求写出内项外项、交叉相乘，并穷尽可能排列。",
      "resourceStyleHints": [
        "比例性质",
        "穷尽检查",
        "错例对比"
      ]
    },
    {
      "familyId": "MATH-FAM-SCALE",
      "categoryId": "MATH-CAT-MODEL",
      "title": "比例尺与实际距离",
      "nodeIds": [
        "MATH-MOD-RATIO-SCALE"
      ],
      "verificationTemplate": "要求先建立图上距离、实际距离和比例尺的中转框架。",
      "resourceStyleHints": [
        "三量关系",
        "单位统一",
        "步骤框架"
      ]
    },
    {
      "familyId": "MATH-FAM-UNIT-CONVERT",
      "categoryId": "MATH-CAT-MEASURE",
      "title": "单位统一与量纲判断",
      "nodeIds": [
        "MATH-MEASURE-UNIT-LENGTH",
        "MATH-MEASURE-UNIT-AREA-VOLUME"
      ],
      "verificationTemplate": "要求先统一单位，再判断长度、面积、体积对应几次进率。",
      "resourceStyleHints": [
        "进率表",
        "量纲对比",
        "真实场景"
      ]
    },
    {
      "familyId": "MATH-FAM-CIRCLE-FORMULA",
      "categoryId": "MATH-CAT-GEOMETRY",
      "title": "圆周长与圆面积公式边界",
      "nodeIds": [
        "MATH-GEO-CIRCLE-AREA",
        "MATH-GEO-CIRCLE-CIRCUMFERENCE"
      ],
      "verificationTemplate": "要求先判断目标量是周长还是面积，再写公式和单位。",
      "resourceStyleHints": [
        "公式边界",
        "图示推导",
        "单位辨析"
      ]
    },
    {
      "familyId": "MATH-FAM-SOLID-GEOMETRY",
      "categoryId": "MATH-CAT-GEOMETRY",
      "title": "立体图形体积与表面积",
      "nodeIds": [
        "MATH-GEO-CYLINDER-VOLUME",
        "MATH-GEO-SOLID-SURFACE-ENUM"
      ],
      "verificationTemplate": "要求区分体积和表面积，并枚举实际暴露的面。",
      "resourceStyleHints": [
        "动态演示",
        "暴露面枚举",
        "公式边界"
      ]
    },
    {
      "familyId": "MATH-FAM-UNIFORM-CHANGE",
      "categoryId": "MATH-CAT-MODEL",
      "title": "匀速变化与单位变化量",
      "nodeIds": [
        "MATH-MOD-UNIFORM-CHANGE"
      ],
      "verificationTemplate": "要求明确相邻时刻差值、单位时间变化量和总变化量。",
      "resourceStyleHints": [
        "表格",
        "差值",
        "变化关系"
      ]
    },
    {
      "familyId": "MATH-FAM-ESTIMATION-CHECK",
      "categoryId": "MATH-CAT-META",
      "title": "估算与结果合理性检查",
      "nodeIds": [
        "MATH-META-ESTIMATION-CHECK"
      ],
      "verificationTemplate": "要求每题先写估算范围，再用结果回看是否合理。",
      "resourceStyleHints": [
        "估算流程",
        "检查清单",
        "数量级"
      ]
    },
    {
      "familyId": "MATH-FAM-INVERSE-CHECK",
      "categoryId": "MATH-CAT-META",
      "title": "逆运算回代验算",
      "nodeIds": [
        "MATH-META-ESTIMATION-CHECK"
      ],
      "verificationTemplate": "要求用逆运算或回代验证答案。",
      "resourceStyleHints": [
        "回代",
        "逆运算",
        "草稿组织"
      ]
    },
    {
      "familyId": "MATH-FAM-READING-CONDITION",
      "categoryId": "MATH-CAT-LANGUAGE",
      "title": "条件提取与问法识别",
      "nodeIds": [],
      "verificationTemplate": "要求圈出已知条件、问题目标和关键词。",
      "resourceStyleHints": [
        "读题拆解",
        "关键词",
        "关系句"
      ]
    },
    {
      "familyId": "MATH-FAM-AXIS-SYM",
      "categoryId": "MATH-CAT-GEO-TRANSFORM",
      "title": "数轴与对称",
      "nodeIds": [
        "MATH-GEO-AXIS-SYM"
      ],
      "verificationTemplate": "先标中点，再用箭头标对称方向，最后代入数值验证倍数。",
      "resourceStyleHints": [
        "方向标注",
        "中点先行",
        "语义对照"
      ]
    },
    {
      "familyId": "MATH-FAM-PERIMETER-AREA",
      "categoryId": "MATH-CAT-GEOMETRY",
      "title": "周长与面积辨析",
      "nodeIds": [
        "MATH-GEO-PERIMETER-AREA-DISTINCT"
      ],
      "verificationTemplate": "给出同一图形，分别求周长和面积，并要求说明两者含义差别。",
      "resourceStyleHints": [
        "概念辨析",
        "实物演示",
        "错例对比"
      ]
    },
    {
      "familyId": "MATH-FAM-OP-LAWS",
      "categoryId": "MATH-CAT-CALC-RULE",
      "title": "运算律与简便计算",
      "nodeIds": [
        "MATH-NUM-OP-LAWS"
      ],
      "verificationTemplate": "给出必须也能简算的式子，要求写出用了哪条运算律。",
      "resourceStyleHints": [
        "步骤拆解",
        "凑整策略",
        "错例对比"
      ]
    },
    {
      "familyId": "MATH-FAM-FRACTION-UNIT",
      "categoryId": "MATH-CAT-NUMBER-SENSE",
      "title": "分数意义与单位归属",
      "nodeIds": [
        "MATH-NUM-FRACTION-DIVISION-LINK",
        "MATH-NUM-FRACTION-MEANING"
      ],
      "verificationTemplate": "同一情境分别回答带单位与不带单位两问，并说明区别。",
      "resourceStyleHints": [
        "概念辨析",
        "情境对比",
        "图示建模"
      ]
    },
    {
      "familyId": "MATH-FAM-AVERAGE-APP",
      "categoryId": "MATH-CAT-MODEL",
      "title": "平均数应用与反推",
      "nodeIds": [
        "MATH-STAT-AVERAGE-APP",
        "MATH-STAT-AVERAGE"
      ],
      "verificationTemplate": "由平均数反推总数，再变动一个数据求新平均数。",
      "resourceStyleHints": [
        "数量关系图",
        "移多补少演示",
        "错例对比"
      ]
    },
    {
      "familyId": "MATH-FAM-CHART-READING",
      "categoryId": "MATH-CAT-LANGUAGE",
      "title": "统计图表读取与误读",
      "nodeIds": [
        "MATH-STAT-COORDINATE-SPEED",
        "MATH-STAT-DATA-MISLEAD",
        "MATH-STAT-COORDINATE-READING"
      ],
      "verificationTemplate": "给出距离-时间图，读出指定线段的速度并解释水平段含义。",
      "resourceStyleHints": [
        "读图步骤",
        "单位标注",
        "误导案例辨析"
      ]
    },
    {
      "familyId": "MATH-FAM-EQUATION-MODELING",
      "categoryId": "MATH-CAT-MODEL",
      "title": "方程建模意识",
      "nodeIds": [
        "MATH-MOD-EQUATION-WORD-PROBLEM",
        "MATH-ALG-EQUATION-WORD"
      ],
      "verificationTemplate": "给一道逆思维应用题，要求先设未知数列方程再求解。",
      "resourceStyleHints": [
        "建模示范",
        "数量关系图",
        "算术与方程对比"
      ]
    },
    {
      "familyId": "MATH-FAM-PROCESS-FINISH",
      "categoryId": "MATH-CAT-META",
      "title": "过程收尾与誊写",
      "nodeIds": [
        "MATH-META-ESTIMATION-CHECK"
      ],
      "verificationTemplate": "给多步计算题，要求最后单独核对誊写的最终答案与草稿一致。",
      "resourceStyleHints": [
        "检查清单",
        "过程管理示范",
        "错例对比"
      ]
    }
  ]
}
