// 由 scripts/build-math-seed-mirrors.js 自动生成，勿手改。
// 细颗粒度学习卡点库（前端版）。内容与 data/math/bottleneck-taxonomy-v2.seed.json 保持一致；
// 这里改用 module.exports，符合 miniprogram/data 下 *.seed.js 的前端加载约定。
module.exports = {
  "version": "0.2.0",
  "updatedAt": "2026-07-17",
  "subject": "math",
  "scope": "钟青羽小学数学细颗粒度学习卡点首批种子库。",
  "sourceDocs": [
    "数学试卷分析/Learning_Diagnostic_MVP_诊断报告.md",
    "数学试卷分析/钟青羽_学习卡点诊断报告_第二版.md",
    "26-数学学习地图与资源库升级计划.md"
  ],
  "bottlenecks": [
    {
      "bottleneckId": "BN-INT-MUL-PARTIAL-OMIT",
      "legacyLpCode": "LP-PRE",
      "subject": "math",
      "title": "多位数乘法拆分时遗漏部分积",
      "nodeId": "MATH-NUM-INT-MUL-PARTIAL",
      "priority": "high",
      "repairCost": "low",
      "impact": "high",
      "categoryPath": [
        "计算基础",
        "整数乘法",
        "部分积完整性"
      ],
      "symptomPatterns": [
        "28 × 204 算成 5600",
        "只计算整百或整十部分，漏加个位部分"
      ],
      "rootCauseSignals": [
        "知道乘法拆分思路",
        "没有用标记追踪每个部分积",
        "验算时不会除回去检查"
      ],
      "microValidationRules": [
        "给 3 道含 0 的三位数乘法，要求写出每个部分积。",
        "要求孩子圈出原式中每一位对应的乘积。",
        "做完后用除法验算是否回到原乘数。"
      ],
      "repairStrategy": [
        "用颜色标记每个部分积",
        "每一步计算后打勾",
        "做完用逆运算检查"
      ],
      "masteryEvidence": [
        "部分积无遗漏",
        "能解释 204 = 200 + 4",
        "72 小时后复测稳定"
      ],
      "sourceEvidence": [
        "28 × 204 = 5600，漏加 28 × 4 = 112"
      ],
      "categoryId": "MATH-CAT-CALC-RULE",
      "categoryTitle": "计算规则",
      "familyId": "MATH-FAM-INT-PARTIAL",
      "familyTitle": "整数乘法部分积",
      "verificationGrain": "fine_bottleneck",
      "recommendedPageTypes": [
        "same_family",
        "same_node",
        "mixed_review"
      ],
      "resourceStyleHints": [
        "步骤拆解",
        "部分积标记",
        "错例对比"
      ]
    },
    {
      "bottleneckId": "BN-INT-DIV-DIVISOR-SIMPLIFY",
      "legacyLpCode": "LP-OP",
      "subject": "math",
      "title": "长除法中把两位除数误简化为一位数",
      "nodeId": "MATH-NUM-INT-DIV-LONG",
      "priority": "high",
      "repairCost": "medium",
      "impact": "high",
      "categoryPath": [
        "计算基础",
        "长除法",
        "试商与商位"
      ],
      "symptomPatterns": [
        "8008 ÷ 26 算成 4004",
        "除数 26 被近似当成 2"
      ],
      "rootCauseSignals": [
        "混合运算顺序正确，但中间除法崩掉",
        "不会用商 × 除数回验"
      ],
      "microValidationRules": [
        "给 3 道两位数除法，要求写竖式。",
        "每题做完必须写商 × 除数。",
        "比较除以 2 与除以 26 的数量级差异。"
      ],
      "repairStrategy": [
        "重做长除法试商流程",
        "建立乘回去验商习惯",
        "先估算商的大概范围"
      ],
      "masteryEvidence": [
        "能完整写出竖式",
        "验商正确",
        "混合运算中中间除法稳定"
      ],
      "sourceEvidence": [
        "584 + 8008 ÷ 26 × 15 中 8008 ÷ 26 误算为 4004"
      ],
      "categoryId": "MATH-CAT-CALC-RULE",
      "categoryTitle": "计算规则",
      "familyId": "MATH-FAM-LONG-DIVISION",
      "familyTitle": "长除法试商与商位",
      "verificationGrain": "fine_bottleneck",
      "recommendedPageTypes": [
        "same_family",
        "same_node",
        "mixed_review"
      ],
      "resourceStyleHints": [
        "竖式步骤",
        "试商",
        "回验"
      ]
    },
    {
      "bottleneckId": "BN-DEC-PLACE-VALUE-WEAK",
      "legacyLpCode": "LP-FD",
      "subject": "math",
      "title": "小数位值和数量级意识不稳",
      "nodeId": "MATH-NUM-DEC-PLACE-VALUE",
      "priority": "high",
      "repairCost": "low",
      "impact": "high",
      "categoryPath": [
        "小数",
        "位值",
        "数量级"
      ],
      "symptomPatterns": [
        "2.186 和 26.86 数字相近但数量级不同",
        "不主动判断答案大概范围"
      ],
      "rootCauseSignals": [
        "能算出数字序列",
        "不能用估算发现小数点错位"
      ],
      "microValidationRules": [
        "给 5 个小数结果，判断哪个数量级合理。",
        "要求先估算再计算。",
        "让孩子说明 2.186 与 26.86 分别接近几。"
      ],
      "repairStrategy": [
        "复习小数位值",
        "每题先估算",
        "用整十整百近似判断范围"
      ],
      "masteryEvidence": [
        "能说出结果大约范围",
        "小数结果明显不合理时会停下检查"
      ],
      "sourceEvidence": [
        "8.5 × 3.16 写成 2.186"
      ],
      "categoryId": "MATH-CAT-NUMBER-SENSE",
      "categoryTitle": "数感与数量级",
      "familyId": "MATH-FAM-DECIMAL-PLACE-VALUE",
      "familyTitle": "小数位值与数量级",
      "verificationGrain": "fine_bottleneck",
      "recommendedPageTypes": [
        "same_family",
        "same_node",
        "mixed_review"
      ],
      "resourceStyleHints": [
        "位值表",
        "估算",
        "数量级判断"
      ]
    },
    {
      "bottleneckId": "BN-DEC-MUL-POINT-COUNT",
      "legacyLpCode": "LP-FD",
      "subject": "math",
      "title": "小数乘法中积的小数位数判断错误",
      "nodeId": "MATH-NUM-DEC-MUL-POINT",
      "priority": "high",
      "repairCost": "low",
      "impact": "high",
      "categoryPath": [
        "计算基础",
        "小数乘法",
        "小数点定位"
      ],
      "symptomPatterns": [
        "数字乘积正确但小数点位置错误",
        "积的小数位数数错"
      ],
      "rootCauseSignals": [
        "整数乘法可完成",
        "不能解释积为什么有几位小数"
      ],
      "microValidationRules": [
        "给 3 道数字相同、小数位数不同的乘法。",
        "要求先写整数乘积，再回填小数点。",
        "要求说出两个因数共有几位小数。"
      ],
      "repairStrategy": [
        "整数乘法和小数位数分离处理",
        "回填小数点后用估算检查",
        "写出位数计数标记"
      ],
      "masteryEvidence": [
        "3 道变式题小数点均正确",
        "能口头解释规则"
      ],
      "sourceEvidence": [
        "8.5 × 3.16 = 2.186，正确为 26.86"
      ],
      "categoryId": "MATH-CAT-CALC-RULE",
      "categoryTitle": "计算规则",
      "familyId": "MATH-FAM-DECIMAL-POINT",
      "familyTitle": "小数点定位与移动",
      "verificationGrain": "fine_bottleneck",
      "recommendedPageTypes": [
        "same_family",
        "same_node",
        "mixed_review"
      ],
      "resourceStyleHints": [
        "步骤拆解",
        "数量级估算",
        "错例对比"
      ]
    },
    {
      "bottleneckId": "BN-DEC-MUL-POINT-ESTIMATE",
      "legacyLpCode": "LP-PRE",
      "subject": "math",
      "title": "小数乘法后缺少数量级估算检查",
      "nodeId": "MATH-NUM-DEC-MUL-POINT",
      "priority": "high",
      "repairCost": "low",
      "impact": "high",
      "categoryPath": [
        "验算习惯",
        "估算",
        "小数乘法"
      ],
      "symptomPatterns": [
        "答案小数点错位但未自查",
        "结果明显小于合理范围"
      ],
      "rootCauseSignals": [
        "缺少先估再算",
        "做完不问答案是否合理"
      ],
      "microValidationRules": [
        "给出 3 个错误小数结果，让孩子找出不合理处。",
        "要求每题先写估算范围。",
        "要求判断答案应大于 20 还是小于 3。"
      ],
      "repairStrategy": [
        "每道小数乘法先估算",
        "把估算写在草稿左侧",
        "错位答案用数量级筛掉"
      ],
      "masteryEvidence": [
        "卷面出现估算痕迹",
        "能主动发现 2.186 不合理"
      ],
      "sourceEvidence": [
        "8.5 × 3.16 的正确结果应接近 8.5 × 3 = 25.5"
      ],
      "categoryId": "MATH-CAT-CALC-RULE",
      "categoryTitle": "计算规则",
      "familyId": "MATH-FAM-DECIMAL-POINT",
      "familyTitle": "小数点定位与移动",
      "verificationGrain": "fine_bottleneck",
      "recommendedPageTypes": [
        "same_family",
        "same_node",
        "mixed_review"
      ],
      "resourceStyleHints": [
        "步骤拆解",
        "数量级估算",
        "错例对比"
      ]
    },
    {
      "bottleneckId": "BN-FRACTION-ADD-DENOM-MISMATCH",
      "legacyLpCode": "LP-FD",
      "subject": "math",
      "title": "异分母分数加减通分不稳定",
      "nodeId": "MATH-NUM-FRACTION-ADD-COMMON-DENOM",
      "priority": "high",
      "repairCost": "medium",
      "impact": "high",
      "categoryPath": [
        "分数",
        "加减法",
        "通分"
      ],
      "symptomPatterns": [
        "1/4 + 1/8 算成 9/20",
        "中间分母被误换"
      ],
      "rootCauseSignals": [
        "没有先统一分母",
        "分数和小数混合时认知负荷上升"
      ],
      "microValidationRules": [
        "给 3 道异分母加减，要求写出通分过程。",
        "加入一道可直接倍数通分的题。",
        "要求解释为什么不能分子分母分别相加。"
      ],
      "repairStrategy": [
        "先找公分母",
        "画分数条理解单位必须相同",
        "分数小数混合时先统一形式"
      ],
      "masteryEvidence": [
        "通分过程清楚",
        "不会把 1/8 当成 1/5"
      ],
      "sourceEvidence": [
        "0.25 + 0.15 ÷ 3/4 × 5/8 最后加法出错"
      ],
      "categoryId": "MATH-CAT-CALC-RULE",
      "categoryTitle": "计算规则",
      "familyId": "MATH-FAM-FRACTION-COMMON-DENOM",
      "familyTitle": "异分母通分",
      "verificationGrain": "fine_bottleneck",
      "recommendedPageTypes": [
        "same_family",
        "same_node",
        "mixed_review"
      ],
      "resourceStyleHints": [
        "分数条",
        "通分步骤",
        "单位一致"
      ]
    },
    {
      "bottleneckId": "BN-FRACTION-MUL-SIMPLIFY-DIRECTION",
      "legacyLpCode": "LP-FD",
      "subject": "math",
      "title": "分数乘法约分方向错误或约分过度",
      "nodeId": "MATH-NUM-FRACTION-MUL-SIMPLIFY",
      "priority": "high",
      "repairCost": "medium",
      "impact": "medium",
      "categoryPath": [
        "分数",
        "乘法",
        "约分"
      ],
      "symptomPatterns": [
        "4/9 × 1/15 算成 2/15",
        "结果比合理范围大"
      ],
      "rootCauseSignals": [
        "约分对象不清",
        "分子分母交叉约分后没有检查大小"
      ],
      "microValidationRules": [
        "给 3 道可约分分数乘法，要求标出约分对象。",
        "要求先估计结果小于哪个分数。",
        "给一道不能约分的题观察是否乱约。"
      ],
      "repairStrategy": [
        "只允许分子与分母约分",
        "约分后回写完整过程",
        "用大小估计检查"
      ],
      "masteryEvidence": [
        "约分对象正确",
        "结果大小合理"
      ],
      "sourceEvidence": [
        "4/9 × [(5/6 - 3/4) × 4/5] 结果膨胀"
      ],
      "categoryId": "MATH-CAT-CALC-RULE",
      "categoryTitle": "计算规则",
      "familyId": "MATH-FAM-FRACTION-SIMPLIFY",
      "familyTitle": "分数约分与结果大小",
      "verificationGrain": "fine_bottleneck",
      "recommendedPageTypes": [
        "same_family",
        "same_node",
        "mixed_review"
      ],
      "resourceStyleHints": [
        "约分对象",
        "大小估计",
        "错例对比"
      ]
    },
    {
      "bottleneckId": "BN-FRACTION-DIV-RECIPROCAL-MISSING",
      "legacyLpCode": "LP-FD",
      "subject": "math",
      "title": "除以分数未稳定转换为乘倒数",
      "nodeId": "MATH-NUM-FRACTION-DIV-RECIPROCAL",
      "priority": "high",
      "repairCost": "low",
      "impact": "high",
      "categoryPath": [
        "分数",
        "除法",
        "倒数"
      ],
      "symptomPatterns": [
        "6 ÷ 7/8 得到远大于合理范围的 50",
        "没有写乘 8/7"
      ],
      "rootCauseSignals": [
        "倒数规则提取不稳定",
        "不会用乘回去验算"
      ],
      "microValidationRules": [
        "给 3 道整数除以分数。",
        "要求先改写为乘倒数再计算。",
        "做完用答案 × 除数回验。"
      ],
      "repairStrategy": [
        "用数轴解释有几个 7/8",
        "固定写 ÷a/b = ×b/a",
        "每题乘回去检查"
      ],
      "masteryEvidence": [
        "改写过程稳定",
        "能解释倒数不是机械翻转"
      ],
      "sourceEvidence": [
        "6 ÷ 7/8 写成 50"
      ],
      "categoryId": "MATH-CAT-CALC-RULE",
      "categoryTitle": "计算规则",
      "familyId": "MATH-FAM-FRACTION-DIVISION",
      "familyTitle": "分数除法与倒数",
      "verificationGrain": "fine_bottleneck",
      "recommendedPageTypes": [
        "same_family",
        "same_node",
        "mixed_review"
      ],
      "resourceStyleHints": [
        "数轴直观",
        "倒数规则",
        "包含除"
      ]
    },
    {
      "bottleneckId": "BN-FRACTION-DIV-CONCEPT-JUMPS",
      "legacyLpCode": "LP-FD",
      "subject": "math",
      "title": "分数除法概念中缺少“包含几个”的直观模型",
      "nodeId": "MATH-NUM-FRACTION-DIV-RECIPROCAL",
      "priority": "medium",
      "repairCost": "medium",
      "impact": "medium",
      "categoryPath": [
        "分数",
        "除法",
        "概念模型"
      ],
      "symptomPatterns": [
        "能背规则但迁移题不稳",
        "遇到整数除以真分数时结果大小直觉错误"
      ],
      "rootCauseSignals": [
        "不能解释为什么 6 ÷ 3/4 大于 6",
        "只会套公式"
      ],
      "microValidationRules": [
        "用线段图问 3 里面有几个 1/2。",
        "比较 6 ÷ 2 与 6 ÷ 1/2 的大小。",
        "要求孩子口头解释结果为什么变大。"
      ],
      "repairStrategy": [
        "用数轴跳格",
        "用包含除模型讲解",
        "再回到倒数算法"
      ],
      "masteryEvidence": [
        "能说出除以小于 1 的数结果会变大"
      ],
      "sourceEvidence": [
        "6 ÷ 7/8 的错误答案暴露大小直觉不足"
      ],
      "categoryId": "MATH-CAT-CALC-RULE",
      "categoryTitle": "计算规则",
      "familyId": "MATH-FAM-FRACTION-DIVISION",
      "familyTitle": "分数除法与倒数",
      "verificationGrain": "fine_bottleneck",
      "recommendedPageTypes": [
        "same_family",
        "same_node",
        "mixed_review"
      ],
      "resourceStyleHints": [
        "数轴直观",
        "倒数规则",
        "包含除"
      ]
    },
    {
      "bottleneckId": "BN-FRACTION-DECIMAL-MIXED-LOAD",
      "legacyLpCode": "LP-FD",
      "subject": "math",
      "title": "分数小数混合运算时认知负荷溢出",
      "nodeId": "MATH-NUM-FRACTION-DECIMAL-CONVERT",
      "priority": "high",
      "repairCost": "medium",
      "impact": "high",
      "categoryPath": [
        "分数小数",
        "混合运算",
        "形式统一"
      ],
      "symptomPatterns": [
        "1/3 + 0.2 被随意近似",
        "中间结果传递错误"
      ],
      "rootCauseSignals": [
        "运算顺序知道，但子运算失败",
        "没有先统一成分数或小数"
      ],
      "microValidationRules": [
        "给 3 道分数小数混合题，要求先选择统一形式。",
        "包含 1/3 这类无限小数，观察是否随意近似。",
        "要求保留中间结果。"
      ],
      "repairStrategy": [
        "先判断用分数还是小数",
        "无限小数优先保留分数",
        "降低中间步骤负荷"
      ],
      "masteryEvidence": [
        "能说明为什么 1/3 不直接写 0.3"
      ],
      "sourceEvidence": [
        "84 ÷ [(1/3 + 0.2) × 1.5] 结果偏离"
      ],
      "categoryId": "MATH-CAT-CALC-RULE",
      "categoryTitle": "计算规则",
      "familyId": "MATH-FAM-FRACTION-DECIMAL-CONVERT",
      "familyTitle": "分数小数形式统一",
      "verificationGrain": "fine_bottleneck",
      "recommendedPageTypes": [
        "same_family",
        "same_node",
        "mixed_review"
      ],
      "resourceStyleHints": [
        "形式统一",
        "无限小数",
        "混合运算"
      ]
    },
    {
      "bottleneckId": "BN-PERCENT-BASE-WHOLE-MISSING",
      "legacyLpCode": "LP-PT",
      "subject": "math",
      "title": "百分数应用中单位 1 判断错误",
      "nodeId": "MATH-MOD-PERCENT-BASE",
      "priority": "high",
      "repairCost": "medium",
      "impact": "high",
      "categoryPath": [
        "百分数",
        "应用题",
        "单位1"
      ],
      "symptomPatterns": [
        "已知优惠后价格求原价时除错方向",
        "同题先除 0.96 再除 1.05"
      ],
      "rootCauseSignals": [
        "不知道谁是基准量",
        "无法判断现价是原价的百分之几"
      ],
      "microValidationRules": [
        "给已知原价求现价、已知现价求原价的对照题。",
        "要求先圈单位 1。",
        "要求画线段图写出等量关系。"
      ],
      "repairStrategy": [
        "固定先问谁是 100%",
        "用线段图表示现价和原价",
        "再选择乘或除"
      ],
      "masteryEvidence": [
        "能稳定圈出单位 1",
        "不同表述下列式方向正确"
      ],
      "sourceEvidence": [
        "汽车含 5% 优惠后价格 47.25 万，求原价"
      ],
      "categoryId": "MATH-CAT-MODEL",
      "categoryTitle": "数量关系建模",
      "familyId": "MATH-FAM-PERCENT-BASE",
      "familyTitle": "百分数单位 1",
      "verificationGrain": "fine_bottleneck",
      "recommendedPageTypes": [
        "same_family",
        "same_node",
        "mixed_review"
      ],
      "resourceStyleHints": [
        "单位1",
        "线段图",
        "关系句"
      ]
    },
    {
      "bottleneckId": "BN-PERCENT-DISCOUNT-DIRECTION",
      "legacyLpCode": "LP-PT",
      "subject": "math",
      "title": "折扣、优惠、增长和减少的乘除方向混淆",
      "nodeId": "MATH-MOD-PERCENT-DISCOUNT",
      "priority": "high",
      "repairCost": "medium",
      "impact": "high",
      "categoryPath": [
        "百分数",
        "折扣优惠",
        "方向判断"
      ],
      "symptomPatterns": [
        "把减少 5% 当增加 5%",
        "已知结果反推原量时乘除方向反"
      ],
      "rootCauseSignals": [
        "没有写等量关系",
        "凭关键词直接套公式"
      ],
      "microValidationRules": [
        "给 4 道折扣方向题，混合已知原价和已知现价。",
        "要求写 原价 × ? = 现价。",
        "要求用答案回代验证。"
      ],
      "repairStrategy": [
        "写关系句而不是背公式",
        "用 100 元特例检验",
        "回代检查"
      ],
      "masteryEvidence": [
        "乘 0.95 和除 0.95 场景能区分"
      ],
      "sourceEvidence": [
        "47.25 万优惠题两次修改方向不同"
      ],
      "categoryId": "MATH-CAT-MODEL",
      "categoryTitle": "数量关系建模",
      "familyId": "MATH-FAM-PERCENT-BASE",
      "familyTitle": "百分数单位 1",
      "verificationGrain": "fine_bottleneck",
      "recommendedPageTypes": [
        "same_family",
        "same_node",
        "mixed_review"
      ],
      "resourceStyleHints": [
        "单位1",
        "线段图",
        "关系句"
      ]
    },
    {
      "bottleneckId": "BN-PIECEWISE-TAX-BRACKET",
      "legacyLpCode": "LP-PT",
      "subject": "math",
      "title": "分段税率中各档基数分配错误",
      "nodeId": "MATH-MOD-TAX-PIECEWISE",
      "priority": "medium",
      "repairCost": "high",
      "impact": "medium",
      "categoryPath": [
        "百分数",
        "分段函数",
        "税率"
      ],
      "symptomPatterns": [
        "稿费缴税反推总额出现明显异常非整数",
        "没有分档计算"
      ],
      "rootCauseSignals": [
        "不知道每一档只作用于该档金额",
        "减征含义可能理解反"
      ],
      "microValidationRules": [
        "给两档收费题，要求画区间。",
        "给三档税率题，先正向计算再反推。",
        "要求标出每档金额。"
      ],
      "repairStrategy": [
        "画数轴分段",
        "先练正向分段",
        "再做反向推算"
      ],
      "masteryEvidence": [
        "能清楚写出每档基数"
      ],
      "sourceEvidence": [
        "稿费缴税 672 元反推稿费总额错误"
      ],
      "categoryId": "MATH-CAT-MODEL",
      "categoryTitle": "数量关系建模",
      "familyId": "MATH-FAM-PIECEWISE",
      "familyTitle": "分段关系与税率",
      "verificationGrain": "fine_bottleneck",
      "recommendedPageTypes": [
        "same_family",
        "same_node",
        "mixed_review"
      ],
      "resourceStyleHints": [
        "分段表格",
        "区间边界",
        "应用建模"
      ]
    },
    {
      "bottleneckId": "BN-RATIO-MEANING-ORDER",
      "legacyLpCode": "LP-RP",
      "subject": "math",
      "title": "比的前项后项对象顺序不稳定",
      "nodeId": "MATH-MOD-RATIO-MEANING",
      "priority": "medium",
      "repairCost": "low",
      "impact": "medium",
      "categoryPath": [
        "比和比例",
        "比的意义",
        "对象顺序"
      ],
      "symptomPatterns": [
        "a:b 与 b:a 混用",
        "比值方向写反"
      ],
      "rootCauseSignals": [
        "没有给前项后项贴对象标签",
        "看到比例就直接交叉相乘"
      ],
      "microValidationRules": [
        "给 3 道比的对象顺序题。",
        "要求在每个数上方写对象名。",
        "反向问 b:a 是多少。"
      ],
      "repairStrategy": [
        "前项后项贴标签",
        "先读句子再写比",
        "用具体数代入检查"
      ],
      "masteryEvidence": [
        "对象顺序稳定"
      ],
      "sourceEvidence": [
        "1/a = 3/b 求 a:b 的方向错误"
      ],
      "categoryId": "MATH-CAT-MODEL",
      "categoryTitle": "数量关系建模",
      "familyId": "MATH-FAM-RATIO-MEANING",
      "familyTitle": "比的意义与参照系",
      "verificationGrain": "fine_bottleneck",
      "recommendedPageTypes": [
        "same_family",
        "same_node",
        "mixed_review"
      ],
      "resourceStyleHints": [
        "线段图",
        "对象顺序",
        "参照系"
      ]
    },
    {
      "bottleneckId": "BN-RATIO-PART-WHOLE-REFERENCE",
      "legacyLpCode": "LP-RP",
      "subject": "math",
      "title": "部分:部分与部分:整体参照系混淆",
      "nodeId": "MATH-MOD-RATIO-PART-WHOLE",
      "priority": "high",
      "repairCost": "medium",
      "impact": "high",
      "categoryPath": [
        "比和比例",
        "应用题",
        "参照系"
      ],
      "symptomPatterns": [
        "把剩余:已运 = 5:3 直接当成剩余占总量 5/8",
        "忽略已运包含多个部分"
      ],
      "rootCauseSignals": [
        "能把 5:3 转成 5/8，但不知道 8 是什么整体",
        "不画线段图"
      ],
      "microValidationRules": [
        "给部分:部分题，问每部分占整体几分之几。",
        "给部分:整体题，对比差异。",
        "要求画两段线段并标整体。"
      ],
      "repairStrategy": [
        "先问比的两边是什么",
        "再问整体是否是两边相加",
        "复杂题用方程"
      ],
      "masteryEvidence": [
        "能解释 5/8 的整体是剩余+已运"
      ],
      "sourceEvidence": [
        "运货题把剩余 5/8 与第一天 1/4 直接相减"
      ],
      "categoryId": "MATH-CAT-MODEL",
      "categoryTitle": "数量关系建模",
      "familyId": "MATH-FAM-RATIO-MEANING",
      "familyTitle": "比的意义与参照系",
      "verificationGrain": "fine_bottleneck",
      "recommendedPageTypes": [
        "same_family",
        "same_node",
        "mixed_review"
      ],
      "resourceStyleHints": [
        "线段图",
        "对象顺序",
        "参照系"
      ]
    },
    {
      "bottleneckId": "BN-RATIO-CROSS-MULTIPLY-DIRECTION",
      "legacyLpCode": "LP-RP",
      "subject": "math",
      "title": "交叉相乘方向搞反",
      "nodeId": "MATH-MOD-RATIO-PROPERTY",
      "priority": "high",
      "repairCost": "low",
      "impact": "medium",
      "categoryPath": [
        "比和比例",
        "比例性质",
        "交叉相乘"
      ],
      "symptomPatterns": [
        "1/a = 3/b 求 a:b 时方向反",
        "字母比例推理混乱"
      ],
      "rootCauseSignals": [
        "内项外项概念不稳",
        "等式变形方向不清"
      ],
      "microValidationRules": [
        "给 3 道 a/b = c/d 的交叉相乘题。",
        "要求写出哪两个相乘相等。",
        "用具体数字代入验证方向。"
      ],
      "repairStrategy": [
        "画交叉线",
        "先写乘积等式",
        "再求比"
      ],
      "masteryEvidence": [
        "字母比例方向稳定"
      ],
      "sourceEvidence": [
        "已知 1/a = 3/b，求 a:b 错"
      ],
      "categoryId": "MATH-CAT-MODEL",
      "categoryTitle": "数量关系建模",
      "familyId": "MATH-FAM-RATIO-PROPERTY",
      "familyTitle": "比例性质与穷尽判断",
      "verificationGrain": "fine_bottleneck",
      "recommendedPageTypes": [
        "same_family",
        "same_node",
        "mixed_review"
      ],
      "resourceStyleHints": [
        "比例性质",
        "穷尽检查",
        "错例对比"
      ]
    },
    {
      "bottleneckId": "BN-RATIO-PROPORTION-EXHAUSTIVE",
      "legacyLpCode": "LP-RP",
      "subject": "math",
      "title": "判断能否组成比例时未穷尽排列",
      "nodeId": "MATH-MOD-RATIO-PROPERTY",
      "priority": "medium",
      "repairCost": "low",
      "impact": "medium",
      "categoryPath": [
        "比和比例",
        "比例判断",
        "穷尽检查"
      ],
      "symptomPatterns": [
        "只试一种排列就判断不能组成比例",
        "漏选不能组成比例的选项"
      ],
      "rootCauseSignals": [
        "没有稳定验证流程",
        "含小数时交叉乘积容易出错"
      ],
      "microValidationRules": [
        "给 3 组四数，要求列出可配对方式。",
        "要求用乘积相等验证。",
        "含一组小数干扰项。"
      ],
      "repairStrategy": [
        "先排序再配对",
        "写两组乘积",
        "小数统一成整数或分数"
      ],
      "masteryEvidence": [
        "判断比例时过程完整"
      ],
      "sourceEvidence": [
        "判断哪组数不能组成比例时漏选"
      ],
      "categoryId": "MATH-CAT-MODEL",
      "categoryTitle": "数量关系建模",
      "familyId": "MATH-FAM-RATIO-PROPERTY",
      "familyTitle": "比例性质与穷尽判断",
      "verificationGrain": "fine_bottleneck",
      "recommendedPageTypes": [
        "same_family",
        "same_node",
        "mixed_review"
      ],
      "resourceStyleHints": [
        "比例性质",
        "穷尽检查",
        "错例对比"
      ]
    },
    {
      "bottleneckId": "BN-SCALE-DOUBLE-CONVERSION",
      "legacyLpCode": "LP-MOD",
      "subject": "math",
      "title": "比例尺题缺少实际距离中转框架",
      "nodeId": "MATH-MOD-RATIO-SCALE",
      "priority": "medium",
      "repairCost": "medium",
      "impact": "medium",
      "categoryPath": [
        "比例尺",
        "双重换算",
        "步骤框架"
      ],
      "symptomPatterns": [
        "已知第一张图上距离和比例尺，换第二张图时写 12 或 16",
        "没有先求实际距离"
      ],
      "rootCauseSignals": [
        "混淆图上距离和实际距离",
        "两次比例尺转换缺少中间变量"
      ],
      "microValidationRules": [
        "给 2 道两张地图比例尺换算题。",
        "要求强制写图上距离→实际距离→新图上距离。",
        "要求标单位。"
      ],
      "repairStrategy": [
        "固定三栏表",
        "先实际后图上",
        "统一单位"
      ],
      "masteryEvidence": [
        "能得到 0.75cm 一类小于原图距离的合理结果"
      ],
      "sourceEvidence": [
        "比例尺 1:400000 到 1:1600000 换算错误"
      ],
      "categoryId": "MATH-CAT-MODEL",
      "categoryTitle": "数量关系建模",
      "familyId": "MATH-FAM-SCALE",
      "familyTitle": "比例尺与实际距离",
      "verificationGrain": "fine_bottleneck",
      "recommendedPageTypes": [
        "same_family",
        "same_node",
        "mixed_review"
      ],
      "resourceStyleHints": [
        "三量关系",
        "单位统一",
        "步骤框架"
      ]
    },
    {
      "bottleneckId": "BN-UNIT-LENGTH-CM-DM-M",
      "legacyLpCode": "LP-UN",
      "subject": "math",
      "title": "题干与图示单位不一致时未统一",
      "nodeId": "MATH-MEASURE-UNIT-LENGTH",
      "priority": "high",
      "repairCost": "low",
      "impact": "high",
      "categoryPath": [
        "单位量纲",
        "长度单位",
        "cm/dm/m"
      ],
      "symptomPatterns": [
        "图示 y 轴为 cm，题目参数用 dm 时混写",
        "14cm 写成 14dm"
      ],
      "rootCauseSignals": [
        "知道单位换算，但多步骤题中忘记追踪",
        "答案单位不回看题目"
      ],
      "microValidationRules": [
        "给 3 道图示单位与题干单位不同的题。",
        "要求第一步只做单位统一。",
        "要求答案写单位并解释。"
      ],
      "repairStrategy": [
        "题目前先框单位",
        "统一单位写在第一行",
        "最后回到题目单位"
      ],
      "masteryEvidence": [
        "不再出现 10 倍单位错误"
      ],
      "sourceEvidence": [
        "圆柱注水图示 cm、题目 dm，答案单位混乱"
      ],
      "categoryId": "MATH-CAT-MEASURE",
      "categoryTitle": "单位与量纲",
      "familyId": "MATH-FAM-UNIT-CONVERT",
      "familyTitle": "单位统一与量纲判断",
      "verificationGrain": "fine_bottleneck",
      "recommendedPageTypes": [
        "same_family",
        "same_node",
        "mixed_review"
      ],
      "resourceStyleHints": [
        "进率表",
        "量纲对比",
        "真实场景"
      ]
    },
    {
      "bottleneckId": "BN-UNIT-AREA-VOLUME-DIMENSION",
      "legacyLpCode": "LP-UN",
      "subject": "math",
      "title": "面积单位与体积单位量纲敏感度不足",
      "nodeId": "MATH-MEASURE-UNIT-AREA-VOLUME",
      "priority": "high",
      "repairCost": "low",
      "impact": "high",
      "categoryPath": [
        "单位量纲",
        "面积体积",
        "维度"
      ],
      "symptomPatterns": [
        "m² 写成 cm²",
        "面积题多乘一个长度变成体积思路"
      ],
      "rootCauseSignals": [
        "不检查答案单位维度",
        "公式和单位没有联动"
      ],
      "microValidationRules": [
        "给 6 个答案单位，让孩子判断长度/面积/体积。",
        "给面积题和体积题混合判断。",
        "要求先写目标量单位。"
      ],
      "repairStrategy": [
        "目标量先写单位",
        "公式结果维度检查",
        "单位错误也算错"
      ],
      "masteryEvidence": [
        "能主动发现 m² 和 cm² 不同"
      ],
      "sourceEvidence": [
        "喷水面积题答案写 cm² 且多乘半径"
      ],
      "categoryId": "MATH-CAT-MEASURE",
      "categoryTitle": "单位与量纲",
      "familyId": "MATH-FAM-UNIT-CONVERT",
      "familyTitle": "单位统一与量纲判断",
      "verificationGrain": "fine_bottleneck",
      "recommendedPageTypes": [
        "same_family",
        "same_node",
        "mixed_review"
      ],
      "resourceStyleHints": [
        "进率表",
        "量纲对比",
        "真实场景"
      ]
    },
    {
      "bottleneckId": "BN-CIRCLE-AREA-EXTRA-R",
      "legacyLpCode": "LP-UN",
      "subject": "math",
      "title": "圆面积公式提取时多乘一个半径",
      "nodeId": "MATH-GEO-CIRCLE-AREA",
      "priority": "high",
      "repairCost": "low",
      "impact": "high",
      "categoryPath": [
        "图形与几何",
        "圆面积",
        "公式串扰"
      ],
      "symptomPatterns": [
        "πr² 后又乘 r",
        "面积题做成类似体积题"
      ],
      "rootCauseSignals": [
        "πr² 和 πr²h 在记忆中互相干扰",
        "没有先判断题目求面积还是体积"
      ],
      "microValidationRules": [
        "给 3 道圆面积和 3 道圆柱体积混合题，只判断公式。",
        "要求先写目标量：面积/体积。",
        "要求说明为什么喷水题没有高。"
      ],
      "repairStrategy": [
        "目标量驱动公式",
        "面积单位 m² 对应平方",
        "把圆和圆柱分开对比"
      ],
      "masteryEvidence": [
        "圆面积不再多乘 r"
      ],
      "sourceEvidence": [
        "水泵喷水半径 9m 求面积，算成 81π × 9"
      ],
      "categoryId": "MATH-CAT-GEOMETRY",
      "categoryTitle": "图形与空间",
      "familyId": "MATH-FAM-CIRCLE-FORMULA",
      "familyTitle": "圆周长与圆面积公式边界",
      "verificationGrain": "fine_bottleneck",
      "recommendedPageTypes": [
        "same_family",
        "same_node",
        "mixed_review"
      ],
      "resourceStyleHints": [
        "公式边界",
        "图示推导",
        "单位辨析"
      ]
    },
    {
      "bottleneckId": "BN-CIRCLE-CIRCUMFERENCE-AREA-MIX",
      "legacyLpCode": "LP-GEO",
      "subject": "math",
      "title": "圆周长、圆面积目标量混淆",
      "nodeId": "MATH-GEO-CIRCLE-CIRCUMFERENCE",
      "priority": "medium",
      "repairCost": "low",
      "impact": "medium",
      "categoryPath": [
        "图形与几何",
        "圆",
        "周长面积区分"
      ],
      "symptomPatterns": [
        "看到半径就直接套公式",
        "不知道题目求边界长度还是区域大小"
      ],
      "rootCauseSignals": [
        "不先标目标量",
        "公式记忆和题意没有连接"
      ],
      "microValidationRules": [
        "给 6 道只判断求周长还是面积的题。",
        "要求画出边界或涂色区域。",
        "再选择公式。"
      ],
      "repairStrategy": [
        "边界=周长，铺满=面积",
        "先画后算",
        "公式卡片对比"
      ],
      "masteryEvidence": [
        "能先判断目标量再计算"
      ],
      "sourceEvidence": [
        "圆相关题中公式提取不稳定"
      ],
      "categoryId": "MATH-CAT-GEOMETRY",
      "categoryTitle": "图形与空间",
      "familyId": "MATH-FAM-CIRCLE-FORMULA",
      "familyTitle": "圆周长与圆面积公式边界",
      "verificationGrain": "fine_bottleneck",
      "recommendedPageTypes": [
        "same_family",
        "same_node",
        "mixed_review"
      ],
      "resourceStyleHints": [
        "公式边界",
        "图示推导",
        "单位辨析"
      ]
    },
    {
      "bottleneckId": "BN-CYLINDER-VOLUME-FORMULA-MIX",
      "legacyLpCode": "LP-GEO",
      "subject": "math",
      "title": "圆柱体积公式与圆面积公式边界不清",
      "nodeId": "MATH-GEO-CYLINDER-VOLUME",
      "priority": "high",
      "repairCost": "medium",
      "impact": "high",
      "categoryPath": [
        "图形与几何",
        "圆柱",
        "体积公式"
      ],
      "symptomPatterns": [
        "面积题误做体积",
        "体积题单位未统一"
      ],
      "rootCauseSignals": [
        "底面积乘高模型不稳",
        "公式靠记忆而非结构理解"
      ],
      "microValidationRules": [
        "给圆面积、圆柱体积混合题，先判断是否有高。",
        "要求解释底面积乘高。",
        "给单位不一致题观察是否先换算。"
      ],
      "repairStrategy": [
        "用堆叠圆片解释体积",
        "目标量和单位一起写",
        "和圆面积对比"
      ],
      "masteryEvidence": [
        "体积题能说出底面积和高"
      ],
      "sourceEvidence": [
        "圆柱注水和喷水面积题暴露面积体积串扰"
      ],
      "categoryId": "MATH-CAT-GEOMETRY",
      "categoryTitle": "图形与空间",
      "familyId": "MATH-FAM-SOLID-GEOMETRY",
      "familyTitle": "立体图形体积与表面积",
      "verificationGrain": "fine_bottleneck",
      "recommendedPageTypes": [
        "same_family",
        "same_node",
        "mixed_review"
      ],
      "resourceStyleHints": [
        "动态演示",
        "暴露面枚举",
        "公式边界"
      ]
    },
    {
      "bottleneckId": "BN-SOLID-SURFACE-EXPOSED-FACES-OMIT",
      "legacyLpCode": "LP-GEO",
      "subject": "math",
      "title": "复杂立体表面积暴露面枚举不完整",
      "nodeId": "MATH-GEO-SOLID-SURFACE-ENUM",
      "priority": "high",
      "repairCost": "high",
      "impact": "medium",
      "categoryPath": [
        "图形与几何",
        "立体表面积",
        "暴露面枚举"
      ],
      "symptomPatterns": [
        "挖空圆柱题漏算底面或内侧面",
        "表面积少一块 16π"
      ],
      "rootCauseSignals": [
        "没有从外到内枚举",
        "只凭直觉加减面"
      ],
      "microValidationRules": [
        "给简单切割立体，要求列出所有暴露面。",
        "给挖空题，先只问新增哪些面、减少哪些面。",
        "要求用表格枚举。"
      ],
      "repairStrategy": [
        "外侧/内侧/上面/下面四栏枚举",
        "先判断增减面再计算",
        "画剖面图"
      ],
      "masteryEvidence": [
        "复杂表面积题能列完整面清单"
      ],
      "sourceEvidence": [
        "大圆柱内挖三个小圆柱，答案漏 16π"
      ],
      "categoryId": "MATH-CAT-GEOMETRY",
      "categoryTitle": "图形与空间",
      "familyId": "MATH-FAM-SOLID-GEOMETRY",
      "familyTitle": "立体图形体积与表面积",
      "verificationGrain": "fine_bottleneck",
      "recommendedPageTypes": [
        "same_family",
        "same_node",
        "mixed_review"
      ],
      "resourceStyleHints": [
        "动态演示",
        "暴露面枚举",
        "公式边界"
      ]
    },
    {
      "bottleneckId": "BN-UNIFORM-CHANGE-INTERVAL-DIFF",
      "legacyLpCode": "LP-MOD",
      "subject": "math",
      "title": "匀速变化题中误解相邻时刻差值",
      "nodeId": "MATH-MOD-UNIFORM-CHANGE",
      "priority": "high",
      "repairCost": "medium",
      "impact": "high",
      "categoryPath": [
        "应用建模",
        "匀速变化",
        "单位变化量"
      ],
      "symptomPatterns": [
        "把 1 小时内变化量再次除以 2",
        "看到两个时刻就机械求平均"
      ],
      "rootCauseSignals": [
        "不能解释 14.6 到 11.8 的差值代表什么",
        "总量÷份数思维过度泛化"
      ],
      "microValidationRules": [
        "给 3 道相邻时刻变化题，要求先说差值含义。",
        "把蜡烛、水位、路程三种情境混合验证。",
        "要求用时间轴标出每个间隔。"
      ],
      "repairStrategy": [
        "画时间轴",
        "先解释差值单位",
        "区分总变化量和单位变化量"
      ],
      "masteryEvidence": [
        "能说出相邻两时刻差值就是一个间隔的变化量",
        "不再把 2.8 再除以 2"
      ],
      "sourceEvidence": [
        "蜡烛 1 小时后余 14.6cm，2 小时后余 11.8cm，误将 2.8 ÷ 2"
      ],
      "categoryId": "MATH-CAT-MODEL",
      "categoryTitle": "数量关系建模",
      "familyId": "MATH-FAM-UNIFORM-CHANGE",
      "familyTitle": "匀速变化与单位变化量",
      "verificationGrain": "fine_bottleneck",
      "recommendedPageTypes": [
        "same_family",
        "same_node",
        "mixed_review"
      ],
      "resourceStyleHints": [
        "表格",
        "差值",
        "变化关系"
      ]
    },
    {
      "bottleneckId": "BN-META-ESTIMATION-MISSING",
      "legacyLpCode": "LP-PRE",
      "subject": "math",
      "title": "缺少答案数量级估算检查",
      "nodeId": "MATH-META-ESTIMATION-CHECK",
      "priority": "high",
      "repairCost": "low",
      "impact": "high",
      "categoryPath": [
        "验算习惯",
        "估算",
        "合理性检查"
      ],
      "symptomPatterns": [
        "明显不合理答案未停下来检查",
        "小数点错位、面积数量级错误未自查"
      ],
      "rootCauseSignals": [
        "做题结束后没有答案范围意识",
        "草稿中没有估算痕迹"
      ],
      "microValidationRules": [
        "给 5 个含明显错误答案的题，让孩子只判断是否合理。",
        "要求每道题先写估算范围，再精算。",
        "要求解释为什么 8.5 × 3.16 不可能等于 2.186。"
      ],
      "repairStrategy": [
        "每题先估后算",
        "做完问答案是否合理",
        "训练用逆运算和数量级双检查"
      ],
      "masteryEvidence": [
        "卷面出现估算痕迹",
        "能主动发现明显不合理答案"
      ],
      "sourceEvidence": [
        "8.5×3.16=2.186、三角形面积 15、5600÷28 不回到 204"
      ],
      "categoryId": "MATH-CAT-META",
      "categoryTitle": "验算与学习习惯",
      "familyId": "MATH-FAM-ESTIMATION-CHECK",
      "familyTitle": "估算与结果合理性检查",
      "verificationGrain": "fine_bottleneck",
      "recommendedPageTypes": [
        "same_family",
        "same_node",
        "mixed_review"
      ],
      "resourceStyleHints": [
        "估算流程",
        "检查清单",
        "数量级"
      ]
    },
    {
      "bottleneckId": "BN-META-INVERSE-CHECK-MISSING",
      "legacyLpCode": "LP-PRE",
      "subject": "math",
      "title": "缺少逆运算回代验算",
      "nodeId": "MATH-META-ESTIMATION-CHECK",
      "priority": "high",
      "repairCost": "low",
      "impact": "high",
      "categoryPath": [
        "验算习惯",
        "逆运算",
        "回代检查"
      ],
      "symptomPatterns": [
        "除法、比例、百分数反推题做完不回代",
        "订正后能做对但原卷无检查痕迹"
      ],
      "rootCauseSignals": [
        "知道算法但没有做完即验的自动动作",
        "不会把答案放回原题测试"
      ],
      "microValidationRules": [
        "给 3 道可快速回代的题，要求只做验算步骤。",
        "让孩子判断 50 是否可能是 6 ÷ 7/8 的答案。",
        "让孩子用 47.25 万回代优惠题。"
      ],
      "repairStrategy": [
        "建立做完即验清单",
        "除法用乘法验，反推题用答案回代",
        "在卷面固定写验算一行"
      ],
      "masteryEvidence": [
        "真实试卷中出现回代或逆运算痕迹",
        "同类错误减少"
      ],
      "sourceEvidence": [
        "多道错题可通过简单反向验证发现，但卷面无验算痕迹"
      ],
      "categoryId": "MATH-CAT-META",
      "categoryTitle": "验算与学习习惯",
      "familyId": "MATH-FAM-INVERSE-CHECK",
      "familyTitle": "逆运算回代验算",
      "verificationGrain": "fine_bottleneck",
      "recommendedPageTypes": [
        "same_family",
        "same_node",
        "mixed_review"
      ],
      "resourceStyleHints": [
        "回代",
        "逆运算",
        "草稿组织"
      ]
    },
    {
      "bottleneckId": "BN-AXIS-FOLD-MIDPOINT-DIRECTION",
      "legacyLpCode": "LP-AXIS / LP-LANG",
      "subject": "math",
      "title": "数轴折叠与延长语义中的方向/倍数判断错误",
      "nodeId": "MATH-GEO-AXIS-SYM",
      "priority": "medium",
      "repairCost": "medium",
      "impact": "medium",
      "categoryPath": [
        "图形与几何",
        "图形运动",
        "对称与方向"
      ],
      "symptomPatterns": [
        "数轴折叠使A(-10)与B(4)重合，求原点对称点，答6（应为-6）",
        "AB延长1倍到D，理解为AD=AB（应为AD=2AB），导致倍率全少1",
        "对称方向判断反：应从中点向左走，却向右走"
      ],
      "rootCauseSignals": [
        "中点能算对，但对称方向判断反",
        "把'延长n倍=总长(n+1)倍'误解为'延长到n倍'",
        "几何对称与代数方向感的转换不熟练"
      ],
      "microValidationRules": [
        "给3道数轴折叠题，要求先标中点再标对称点，画出方向箭头。",
        "给5道含'延长/增加到/增加了'关键词的题，只要求写出数量关系式。",
        "要求用具体数值代入验证倍数关系（如AB=3，延长1倍后AD应=6）。"
      ],
      "repairStrategy": [
        "先画中点，再用箭头标对称方向",
        "区分'延长n倍'(总长n+1倍)与'延长到n倍'(总长n倍)",
        "用具体数字代入验证，不依赖抽象倍率"
      ],
      "masteryEvidence": [
        "数轴折叠对称方向3题全对",
        "'延长'类语义题关系式全对",
        "72小时后倍数判断稳定"
      ],
      "sourceEvidence": [
        "ERR-037: AB延长1倍求面积倍数，答5倍（应为6倍）",
        "ERR-040: 数轴折叠原点对称，答6（应为-6）",
        "ERR-041: 数轴动点距离，答2（应为4）"
      ],
      "categoryId": "MATH-CAT-GEO-TRANSFORM",
      "categoryTitle": "图形变换",
      "familyId": "MATH-FAM-AXIS-SYM",
      "familyTitle": "数轴与对称",
      "verificationGrain": "fine_bottleneck",
      "recommendedPageTypes": [
        "same_family",
        "same_node",
        "mixed_review"
      ],
      "resourceStyleHints": [
        "方向标注",
        "中点先行",
        "语义对照"
      ]
    },
    {
      "bottleneckId": "BN-INT-DIV-QUOTIENT-PLACE",
      "legacyLpCode": "LP-OP",
      "subject": "math",
      "title": "长除法中商位与 0 占位错误",
      "nodeId": "MATH-NUM-INT-DIV-LONG",
      "priority": "high",
      "repairCost": "low",
      "impact": "high",
      "categoryPath": [
        "计算规则",
        "长除法试商与商位",
        "商位与 0 占位"
      ],
      "symptomPatterns": [
        "除到某一位不够除时商里漏写 0",
        "商的数字写串位，百位商写到十位上"
      ],
      "rootCauseSignals": [
        "会试商但不追踪当前商的是哪一位",
        "竖式中数位对不齐，凭感觉写商",
        "不用乘法回验商是否正确"
      ],
      "microValidationRules": [
        "给 3 道含中间或末尾 0 的长除法，要求标出每一位商对应的数位。",
        "做错后用 商×除数+余数 回验是否等于被除数。"
      ],
      "repairStrategy": [
        "竖式中先用占位线标出商的位置再动笔",
        "不够除先写 0 再继续，做完回验一次"
      ],
      "masteryEvidence": [
        "含 0 商的长除法连续 3 题全对",
        "能主动用乘法回验",
        "72 小时后复测稳定"
      ],
      "sourceEvidence": [
        "《Learning_Diagnostic_MVP_诊断报告》计算类错题复核：长除法商位错误（TODO 27 首批必覆盖清单）"
      ],
      "categoryId": "MATH-CAT-CALC-RULE",
      "categoryTitle": "计算规则",
      "familyId": "MATH-FAM-LONG-DIVISION",
      "familyTitle": "长除法试商与商位",
      "verificationGrain": "fine_bottleneck",
      "recommendedPageTypes": [
        "same_family",
        "same_node",
        "mixed_review"
      ],
      "resourceStyleHints": [
        "步骤拆解",
        "数位标记",
        "错例对比"
      ]
    },
    {
      "bottleneckId": "BN-GEO-RECT-PERIM-AREA-CONFUSE",
      "legacyLpCode": "LP-GEO",
      "subject": "math",
      "title": "长方形周长与面积公式混用",
      "nodeId": "MATH-GEO-PERIMETER-AREA-DISTINCT",
      "priority": "high",
      "repairCost": "low",
      "impact": "high",
      "categoryPath": [
        "图形与空间",
        "周长与面积辨析",
        "公式混用"
      ],
      "symptomPatterns": [
        "求面积时长宽相加乘 2，求周长时长乘宽",
        "单位写成 cm 与 cm² 不分"
      ],
      "rootCauseSignals": [
        "周长是边界长度、面积是覆盖面大小的概念不清",
        "记公式不理解意义，看到长和宽就套",
        "不用单位自检答案求的是什么"
      ],
      "microValidationRules": [
        "同一个长方形分别求周长和面积，并说出两个答案分别表示什么。",
        "给 3 道情境题只判断求周长还是面积，不计算。"
      ],
      "repairStrategy": [
        "用手指描边界理解周长，用铺方格理解面积",
        "写答案前先写单位，用单位自检公式选择"
      ],
      "masteryEvidence": [
        "周长面积辨析题 3 题全对",
        "能举出周长相等但面积不同的例子",
        "72 小时后复测稳定"
      ],
      "sourceEvidence": [
        "taxonomy 变体归并记录：BN-GEO-RECT-AREA-CONFUSE 等 5 个 AI 变体长期归入圆周长面积混淆，实际为长方形场景独立卡点"
      ],
      "categoryId": "MATH-CAT-GEOMETRY",
      "categoryTitle": "图形与空间",
      "familyId": "MATH-FAM-PERIMETER-AREA",
      "familyTitle": "周长与面积辨析",
      "verificationGrain": "fine_bottleneck",
      "recommendedPageTypes": [
        "same_family",
        "same_node",
        "mixed_review"
      ],
      "resourceStyleHints": [
        "概念辨析",
        "实物演示",
        "错例对比"
      ]
    },
    {
      "bottleneckId": "BN-OP-LAWS-MISAPPLY",
      "legacyLpCode": "LP-OP",
      "subject": "math",
      "title": "简便计算中运算律误用（乱凑整、错拆分）",
      "nodeId": "MATH-NUM-OP-LAWS",
      "priority": "medium",
      "repairCost": "medium",
      "impact": "high",
      "categoryPath": [
        "计算规则",
        "运算律与简便计算",
        "运算律误用"
      ],
      "symptomPatterns": [
        "把 25 × 44 拆成 25 × 40 + 4 而不是 25 × (40 + 4)",
        "减法凑整时 156 - 98 算成 156 - 100 - 2",
        "为了简算改变运算顺序导致结果错误"
      ],
      "rootCauseSignals": [
        "知道要凑整但不检查变形前后是否相等",
        "分配律与结合律混用，括号处理随意",
        "做完不回代验证简算结果"
      ],
      "microValidationRules": [
        "给 3 道可简算题，要求写出每一步用了哪条运算律。",
        "把简算结果与直接计算结果对照，不一致时找出错在哪一步。"
      ],
      "repairStrategy": [
        "先写原式=变形式的等号链再计算",
        "每用一次运算律说出名字",
        "简算后抽一题直接算对照"
      ],
      "masteryEvidence": [
        "简便计算 3 题方法正确且结果一致",
        "能解释 99 × 78 + 78 为什么是 78 × 100",
        "72 小时后复测稳定"
      ],
      "sourceEvidence": [
        "《钟青羽_学习卡点诊断报告_第二版》运算顺序与简便计算类错题复核"
      ],
      "categoryId": "MATH-CAT-CALC-RULE",
      "categoryTitle": "计算规则",
      "familyId": "MATH-FAM-OP-LAWS",
      "familyTitle": "运算律与简便计算",
      "verificationGrain": "fine_bottleneck",
      "recommendedPageTypes": [
        "same_family",
        "same_node",
        "mixed_review"
      ],
      "resourceStyleHints": [
        "步骤拆解",
        "凑整策略",
        "错例对比"
      ]
    },
    {
      "bottleneckId": "BN-DEC-MOVE-POINT-DIRECTION",
      "legacyLpCode": "LP-FD",
      "subject": "math",
      "title": "小数点移动方向与倍数对应错误",
      "nodeId": "MATH-NUM-DEC-MOVE-POINT",
      "priority": "medium",
      "repairCost": "low",
      "impact": "medium",
      "categoryPath": [
        "计算规则",
        "小数点定位与移动",
        "移动方向与倍数"
      ],
      "symptomPatterns": [
        "乘 100 小数点向左移两位",
        "除以 10 结果反而扩大 10 倍"
      ],
      "rootCauseSignals": [
        "机械背移动位数但方向感缺失",
        "不理解向左移动数变小、向右移动数变大",
        "不用数量级估算检查移动结果"
      ],
      "microValidationRules": [
        "给 3 道乘除 10/100/1000 的题，要求先说数会变大还是变小再写答案。",
        "用估算检查 0.36 × 100 的结果应该比 0.36 大多少。"
      ],
      "repairStrategy": [
        "先判断大小变化方向，再移动小数点",
        "移动后用数量级估算自检"
      ],
      "masteryEvidence": [
        "移动方向判断 3 题全对",
        "能解释向右移两位等于乘 100",
        "72 小时后复测稳定"
      ],
      "sourceEvidence": [
        "小数位值与数量级类错题复核（TODO 27 小数位值卡点族拆分）"
      ],
      "categoryId": "MATH-CAT-CALC-RULE",
      "categoryTitle": "计算规则",
      "familyId": "MATH-FAM-DECIMAL-POINT",
      "familyTitle": "小数点定位与移动",
      "verificationGrain": "fine_bottleneck",
      "recommendedPageTypes": [
        "same_family",
        "same_node",
        "mixed_review"
      ],
      "resourceStyleHints": [
        "步骤拆解",
        "数轴演示",
        "错例对比"
      ]
    },
    {
      "bottleneckId": "BN-FRACTION-UNIT-LABEL-CONFUSE",
      "legacyLpCode": "LP-FD",
      "subject": "math",
      "title": "分数带单位与不带单位（分率与具体量）混淆",
      "nodeId": "MATH-NUM-FRACTION-DIVISION-LINK",
      "priority": "medium",
      "repairCost": "medium",
      "impact": "high",
      "categoryPath": [
        "数感与数量级",
        "分数意义与单位归属",
        "分率与具体量"
      ],
      "symptomPatterns": [
        "3 米平均分成 5 段，每段是全长的 1/5 写成 3/5 米",
        "每段长几分之几米答成 1/5（漏单位）"
      ],
      "rootCauseSignals": [
        "分率（部分占整体的几分之几）与具体量（带单位的数）不分",
        "看到分数就约分，不看问题问的是率还是量",
        "不会用单位检验答案合理性"
      ],
      "microValidationRules": [
        "同一情境连续两问：每段是全长的几分之几？每段长几分之几米？",
        "判断答案 2/5 和 2/5 米各自对应哪个问题。"
      ],
      "repairStrategy": [
        "先写问题求的是率还是量，再列式",
        "答案必带单位或注明分率，用单位自检"
      ],
      "masteryEvidence": [
        "率与量两问对比题 3 组全对",
        "能解释 1/5 和 3/5 米的区别",
        "72 小时后复测稳定"
      ],
      "sourceEvidence": [
        "《Learning_Diagnostic_MVP_诊断报告》分数意义类错题复核"
      ],
      "categoryId": "MATH-CAT-NUMBER-SENSE",
      "categoryTitle": "数感与数量级",
      "familyId": "MATH-FAM-FRACTION-UNIT",
      "familyTitle": "分数意义与单位归属",
      "verificationGrain": "fine_bottleneck",
      "recommendedPageTypes": [
        "same_family",
        "same_node",
        "mixed_review"
      ],
      "resourceStyleHints": [
        "概念辨析",
        "情境对比",
        "图示建模"
      ]
    },
    {
      "bottleneckId": "BN-RATIO-ALLOCATE-PART",
      "legacyLpCode": "LP-RP",
      "subject": "math",
      "title": "按比分配中份数与总量对应错误",
      "nodeId": "MATH-NUM-RATIO-ALLOCATE",
      "priority": "high",
      "repairCost": "medium",
      "impact": "high",
      "categoryPath": [
        "数量关系建模",
        "比的意义与参照系",
        "按比分配"
      ],
      "symptomPatterns": [
        "按 2:3 分 45，直接用 45×2/3 而不是 45×2/5",
        "已知部分量求总量时份数对应错"
      ],
      "rootCauseSignals": [
        "比的前项后项对应哪两个量不清",
        "不把比转化成分率（部分占总数的几分之几）",
        "不检查分配结果之和是否等于总量"
      ],
      "microValidationRules": [
        "给 2 道按比分配题，要求先写总份数再列式。",
        "分配完成后把两份加起来核对是否等于总量。"
      ],
      "repairStrategy": [
        "先算总份数，把比化成分率再乘总量",
        "做完回加验证"
      ],
      "masteryEvidence": [
        "按比分配 3 题全对",
        "能说明 2:3 对应 2/5 和 3/5",
        "72 小时后复测稳定"
      ],
      "sourceEvidence": [
        "《钟青羽_学习卡点诊断报告_第二版》比例应用题复核：剩余与已运之比 5:3 类问题"
      ],
      "categoryId": "MATH-CAT-MODEL",
      "categoryTitle": "数量关系建模",
      "familyId": "MATH-FAM-RATIO-MEANING",
      "familyTitle": "比的意义与参照系",
      "verificationGrain": "fine_bottleneck",
      "recommendedPageTypes": [
        "same_family",
        "same_node",
        "mixed_review"
      ],
      "resourceStyleHints": [
        "数量关系图",
        "份数模型",
        "错例对比"
      ]
    },
    {
      "bottleneckId": "BN-GEO-CIRCLE-RING-FORMULA",
      "legacyLpCode": "LP-GEO",
      "subject": "math",
      "title": "圆环面积误算为 (R-r)² 乘 π",
      "nodeId": "MATH-GEO-CIRCLE-RING",
      "priority": "medium",
      "repairCost": "low",
      "impact": "medium",
      "categoryPath": [
        "图形与空间",
        "圆周长与圆面积公式边界",
        "圆环面积"
      ],
      "symptomPatterns": [
        "圆环面积算成 π(R-r)²",
        "先减半径再平方，而不是分别算两个圆面积相减"
      ],
      "rootCauseSignals": [
        "把 R²-r² 与 (R-r)² 混为一谈",
        "不理解圆环是两个圆面积的差",
        "不用估算检查（圆环面积应小于外圆面积）"
      ],
      "microValidationRules": [
        "给 2 道圆环面积题，要求分别写出外圆和内圆面积再相减。",
        "判断 π(R²-r²) 与 π(R-r)² 哪个大，并说明理由。"
      ],
      "repairStrategy": [
        "固定写法：圆环 = 大圆面积 - 小圆面积",
        "用平方差公式前先展开核对"
      ],
      "masteryEvidence": [
        "圆环面积 2 题全对",
        "能解释 R²-r² ≠ (R-r)²",
        "72 小时后复测稳定"
      ],
      "sourceEvidence": [
        "圆与扇形类错题复核（几何公式边界卡点族拆分）"
      ],
      "categoryId": "MATH-CAT-GEOMETRY",
      "categoryTitle": "图形与空间",
      "familyId": "MATH-FAM-CIRCLE-FORMULA",
      "familyTitle": "圆周长与圆面积公式边界",
      "verificationGrain": "fine_bottleneck",
      "recommendedPageTypes": [
        "same_family",
        "same_node",
        "mixed_review"
      ],
      "resourceStyleHints": [
        "图示推导",
        "公式对比",
        "错例对比"
      ]
    },
    {
      "bottleneckId": "BN-GEO-SURFACE-CUT-CHANGE",
      "legacyLpCode": "LP-GEO",
      "subject": "math",
      "title": "切割拼接后表面积增减方向与数量错误",
      "nodeId": "MATH-GEO-SURFACE-CUT-CHANGE",
      "priority": "high",
      "repairCost": "medium",
      "impact": "high",
      "categoryPath": [
        "图形与空间",
        "立体图形体积与表面积",
        "切割拼接表面积变化"
      ],
      "symptomPatterns": [
        "把长方体切成两段，以为表面积不变",
        "两个正方体拼成长方体，表面积减少量算错面数"
      ],
      "rootCauseSignals": [
        "不知道切一刀多两个面、拼一次少两个面",
        "不画图标出新增或消失的面的尺寸",
        "增减方向判断凭感觉"
      ],
      "microValidationRules": [
        "给 2 道切割题和 1 道拼接题，要求先画图标出变化的面。",
        "说出切一刀后表面积增加的是哪两个面、各多大。"
      ],
      "repairStrategy": [
        "切拼题先画图标出变化面，再算增减",
        "用 增加=两个切面、减少=两个接触面 的口诀自检"
      ],
      "masteryEvidence": [
        "切割拼接表面积题 3 题全对",
        "能解释增减的面从哪来",
        "72 小时后复测稳定"
      ],
      "sourceEvidence": [
        "《Learning_Diagnostic_MVP_诊断报告》立体图形表面积增减理解不足（TODO 27 首批必覆盖清单）"
      ],
      "categoryId": "MATH-CAT-GEOMETRY",
      "categoryTitle": "图形与空间",
      "familyId": "MATH-FAM-SOLID-GEOMETRY",
      "familyTitle": "立体图形体积与表面积",
      "verificationGrain": "fine_bottleneck",
      "recommendedPageTypes": [
        "same_family",
        "same_node",
        "mixed_review"
      ],
      "resourceStyleHints": [
        "实物切割演示",
        "图示标记",
        "错例对比"
      ]
    },
    {
      "bottleneckId": "BN-STAT-AVERAGE-REVERSE",
      "legacyLpCode": "LP-MOD",
      "subject": "math",
      "title": "由平均数反推总数或个别数据时关系颠倒",
      "nodeId": "MATH-STAT-AVERAGE-APP",
      "priority": "medium",
      "repairCost": "medium",
      "impact": "medium",
      "categoryPath": [
        "数量关系建模",
        "平均数应用与反推",
        "反推关系颠倒"
      ],
      "symptomPatterns": [
        "已知平均身高求总身高时用除法",
        "去掉一个数据后求原数据，增减方向搞反"
      ],
      "rootCauseSignals": [
        "总数=平均数×个数的关系不牢",
        "不理解平均数变动与个别数据变动的方向关系",
        "不用移多补少的直观检验"
      ],
      "microValidationRules": [
        "给 2 道反推题：由平均数求总数、去掉一个数据求新平均数。",
        "用移多补少方法解释答案为什么合理。"
      ],
      "repairStrategy": [
        "先写 总数=平均数×个数 再变形",
        "用移多补少画图检验方向"
      ],
      "masteryEvidence": [
        "平均数反推 3 题全对",
        "能解释平均数为什么不代表具体某个数据",
        "72 小时后复测稳定"
      ],
      "sourceEvidence": [
        "《钟青羽_学习卡点诊断报告_第二版》统计与平均数类错题复核"
      ],
      "categoryId": "MATH-CAT-MODEL",
      "categoryTitle": "数量关系建模",
      "familyId": "MATH-FAM-AVERAGE-APP",
      "familyTitle": "平均数应用与反推",
      "verificationGrain": "fine_bottleneck",
      "recommendedPageTypes": [
        "same_family",
        "same_node",
        "mixed_review"
      ],
      "resourceStyleHints": [
        "数量关系图",
        "移多补少演示",
        "错例对比"
      ]
    },
    {
      "bottleneckId": "BN-STAT-GRAPH-SPEED-READ",
      "legacyLpCode": "LP-LANG",
      "subject": "math",
      "title": "距离-时间图读取速度时用错线段或时间轴",
      "nodeId": "MATH-STAT-COORDINATE-SPEED",
      "priority": "medium",
      "repairCost": "medium",
      "impact": "high",
      "categoryPath": [
        "数学语言与审题",
        "统计图表读取与误读",
        "行程图读取"
      ],
      "symptomPatterns": [
        "用总路程除以局部线段的时间",
        "水平线段（停留）也读出速度",
        "读数时横轴纵轴看反"
      ],
      "rootCauseSignals": [
        "不知道速度对应线段的倾斜程度",
        "读图不先看横纵轴含义和单位",
        "水平段含义（停留）不理解"
      ],
      "microValidationRules": [
        "给一张距离-时间图，读出指定线段的速度并写出用的是哪段路程哪段时间。",
        "解释图中水平线段表示什么。"
      ],
      "repairStrategy": [
        "读图先标出横轴纵轴和单位",
        "速度=该线段路程差÷时间差，逐线段计算"
      ],
      "masteryEvidence": [
        "读图求速度 3 题全对",
        "能解释线段越陡速度越快",
        "72 小时后复测稳定"
      ],
      "sourceEvidence": [
        "《Learning_Diagnostic_MVP_诊断报告》距离-时间图读取速度错误（TODO 27 首批必覆盖清单）"
      ],
      "categoryId": "MATH-CAT-LANGUAGE",
      "categoryTitle": "数学语言与审题",
      "familyId": "MATH-FAM-CHART-READING",
      "familyTitle": "统计图表读取与误读",
      "verificationGrain": "fine_bottleneck",
      "recommendedPageTypes": [
        "same_family",
        "same_node",
        "mixed_review"
      ],
      "resourceStyleHints": [
        "读图步骤",
        "单位标注",
        "误导案例辨析"
      ]
    },
    {
      "bottleneckId": "BN-APP-EQUATION-MODEL-MISSING",
      "legacyLpCode": "LP-MOD",
      "subject": "math",
      "title": "复杂应用题缺少方程建模意识",
      "nodeId": "MATH-MOD-EQUATION-WORD-PROBLEM",
      "priority": "high",
      "repairCost": "high",
      "impact": "high",
      "categoryPath": [
        "数量关系建模",
        "方程建模意识",
        "设未知数列方程"
      ],
      "symptomPatterns": [
        "逆思维题用算术法反复试，思路混乱",
        "不会设未知数，或设了但数量关系写错"
      ],
      "rootCauseSignals": [
        "习惯算术正向思维，不会把所求设为 x",
        "找不准等量关系，文字条件翻译不成等式",
        "解完不回代原题检验"
      ],
      "microValidationRules": [
        "给 2 道逆思维应用题，要求写出 设、列、解、答 四步完整过程。",
        "把解代回原题验证条件全部成立。"
      ],
      "repairStrategy": [
        "固定四步：设未知数、找等量关系、列方程、回代检验",
        "用线段图先把数量关系画出来再写方程"
      ],
      "masteryEvidence": [
        "方程建模 2 题过程完整",
        "能说出等量关系是什么",
        "72 小时后复测稳定"
      ],
      "sourceEvidence": [
        "《Learning_Diagnostic_MVP_诊断报告》方程建模意识不足（TODO 27 首批必覆盖清单）；1/a=3/b 求 a:b 类字母关系题复核"
      ],
      "categoryId": "MATH-CAT-MODEL",
      "categoryTitle": "数量关系建模",
      "familyId": "MATH-FAM-EQUATION-MODELING",
      "familyTitle": "方程建模意识",
      "verificationGrain": "fine_bottleneck",
      "recommendedPageTypes": [
        "same_family",
        "same_node",
        "mixed_review"
      ],
      "resourceStyleHints": [
        "建模示范",
        "数量关系图",
        "算术与方程对比"
      ]
    },
    {
      "bottleneckId": "BN-PROCESS-FINAL-COPY",
      "legacyLpCode": "LP-PRE",
      "subject": "math",
      "title": "过程正确但最终答案誊写或收尾错误",
      "nodeId": "MATH-META-ESTIMATION-CHECK",
      "priority": "medium",
      "repairCost": "low",
      "impact": "medium",
      "categoryPath": [
        "验算与学习习惯",
        "过程收尾与誊写",
        "誊写收尾"
      ],
      "symptomPatterns": [
        "草稿算对但答题纸上抄错数",
        "多步题最后一步忘了写或漏单位、漏答"
      ],
      "rootCauseSignals": [
        "做完不核对誊写结果与草稿",
        "没有答完回读题目的习惯",
        "时间紧张时收尾仓促"
      ],
      "microValidationRules": [
        "给 2 道多步计算题，要求做完后单独核对誊写答案与草稿一致并写答。",
        "对照题目问题检查答案是否真正回答了所问。"
      ],
      "repairStrategy": [
        "固定收尾三步：核对誊写、补单位、写答句",
        "答完回读题目一遍"
      ],
      "masteryEvidence": [
        "多步题誊写零失误连续 3 题",
        "能主动回读题目确认所答即所问",
        "72 小时后复测稳定"
      ],
      "sourceEvidence": [
        "《Learning_Diagnostic_MVP_诊断报告》过程正确但最终答案抄写或收尾错误（TODO 27 首批必覆盖清单）"
      ],
      "categoryId": "MATH-CAT-META",
      "categoryTitle": "验算与学习习惯",
      "familyId": "MATH-FAM-PROCESS-FINISH",
      "familyTitle": "过程收尾与誊写",
      "verificationGrain": "fine_bottleneck",
      "recommendedPageTypes": [
        "same_family",
        "same_node",
        "mixed_review"
      ],
      "resourceStyleHints": [
        "检查清单",
        "过程管理示范",
        "错例对比"
      ]
    }
  ]
}
