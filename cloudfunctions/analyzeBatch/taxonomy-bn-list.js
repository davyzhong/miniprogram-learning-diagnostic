// 自动同步的数学细卡点标准库（打包安全：云函数独立上传时 data/ 目录不会随函数上传，
// 所以把 taxonomy 的 bottleneckId/title/symptom 固化在此 JS 模块里）。
// 数据来源：data/math/bottleneck-taxonomy-v2.seed.json（40 个 BN，v0.2.0 起含首批 12 个扩充卡点）
// 同步原则：新增/修改 taxonomy seed 后，同步更新此文件并跑 tests/analyze-batch-normalizer.test.js

/**
 * 标准细卡点列表（用于注入 AI prompt，约束 AI 优先使用标准 ID）
 */
const TAXONOMY_BN_LIST = [
  { id: 'BN-INT-MUL-PARTIAL-OMIT', legacyLpCode: 'LP-001', title: '多位数乘法拆分时遗漏部分积', symptom: '只计算整百或整十部分，漏加个位部分积' },
  { id: 'BN-INT-DIV-DIVISOR-SIMPLIFY', legacyLpCode: 'LP-001', title: '长除法中把两位除数误简化为一位数', symptom: '除数被近似当成一位数导致商翻倍' },
  { id: 'BN-DEC-PLACE-VALUE-WEAK', legacyLpCode: 'LP-002', title: '小数位值和数量级意识不稳', symptom: '不主动判断答案大概范围，数字相近但数量级不同时混淆' },
  { id: 'BN-DEC-MUL-POINT-COUNT', legacyLpCode: 'LP-002', title: '小数乘法中积的小数位数判断错误', symptom: '数字乘积正确但小数点位置错误，积的小数位数数错' },
  { id: 'BN-DEC-MUL-POINT-ESTIMATE', legacyLpCode: 'LP-001', title: '小数乘法后缺少数量级估算检查', symptom: '答案小数点错位但未自查，结果明显小于合理范围' },
  { id: 'BN-FRACTION-ADD-DENOM-MISMATCH', legacyLpCode: 'LP-002', title: '异分母分数加减通分不稳定', symptom: '未找公分母或最小公倍数，中间分母被误换' },
  { id: 'BN-FRACTION-MUL-SIMPLIFY-DIRECTION', legacyLpCode: 'LP-002', title: '分数乘法约分方向错误或约分过度', symptom: '结果比合理范围大或小，约分后分母分子搞反' },
  { id: 'BN-FRACTION-DIV-RECIPROCAL-MISSING', legacyLpCode: 'LP-002', title: '除以分数未稳定转换为乘倒数', symptom: '除以分数时没有写乘倒数，结果远偏离合理范围' },
  { id: 'BN-FRACTION-DIV-CONCEPT-JUMPS', legacyLpCode: 'LP-002', title: '分数除法概念中缺少包含几个的直观模型', symptom: '能背规则但迁移题不稳，整数除以真分数时结果大小直觉错误' },
  { id: 'BN-FRACTION-DECIMAL-MIXED-LOAD', legacyLpCode: 'LP-002', title: '分数小数混合运算时认知负荷溢出', symptom: '中间结果传递错误，随意近似导致连锁出错' },
  { id: 'BN-PERCENT-BASE-WHOLE-MISSING', legacyLpCode: 'LP-003', title: '百分数应用中单位1判断错误', symptom: '已知优惠后价格求原价时除错方向' },
  { id: 'BN-PERCENT-DISCOUNT-DIRECTION', legacyLpCode: 'LP-003', title: '折扣优惠增长减少的乘除方向混淆', symptom: '把减少当增加，已知结果反推原量时乘除方向反' },
  { id: 'BN-PIECEWISE-TAX-BRACKET', legacyLpCode: 'LP-003', title: '分段税率中各档基数分配错误', symptom: '没有分档计算，总额出现明显异常非整数' },
  { id: 'BN-RATIO-MEANING-ORDER', legacyLpCode: 'LP-005', title: '比的前项后项对象顺序不稳定', symptom: '比值方向写反，a:b 与 b:a 混用' },
  { id: 'BN-RATIO-PART-WHOLE-REFERENCE', legacyLpCode: 'LP-005', title: '部分比部分与部分比整体参照系混淆', symptom: '忽略已运包含多个部分，直接当成占总量的分数' },
  { id: 'BN-RATIO-CROSS-MULTIPLY-DIRECTION', legacyLpCode: 'LP-005', title: '交叉相乘方向搞反', symptom: '字母比例推理混乱，求比例时方向反' },
  { id: 'BN-RATIO-PROPORTION-EXHAUSTIVE', legacyLpCode: 'LP-005', title: '判断能否组成比例时未穷尽排列', symptom: '只试一种排列就判断，漏选不能组成比例的选项' },
  { id: 'BN-SCALE-DOUBLE-CONVERSION', legacyLpCode: 'LP-005', title: '比例尺题缺少实际距离中转框架', symptom: '换图时没有先求实际距离，直接套比例尺' },
  { id: 'BN-UNIT-LENGTH-CM-DM-M', legacyLpCode: 'LP-004', title: '题干与图示单位不一致时未统一', symptom: 'cm 和 dm 混写，图示轴单位与题目参数不统一' },
  { id: 'BN-UNIT-AREA-VOLUME-DIMENSION', legacyLpCode: 'LP-004', title: '面积单位与体积单位量纲敏感度不足', symptom: 'm² 写成 cm²，面积题多乘一个长度变成体积思路' },
  { id: 'BN-CIRCLE-AREA-EXTRA-R', legacyLpCode: 'LP-004', title: '圆面积公式提取时多乘一个半径', symptom: 'πr² 后又乘 r，面积题做成类似体积题' },
  { id: 'BN-CIRCLE-CIRCUMFERENCE-AREA-MIX', legacyLpCode: 'LP-006', title: '圆周长圆面积目标量混淆', symptom: '看到半径就直接套公式，不知道求边界还是区域' },
  { id: 'BN-CYLINDER-VOLUME-FORMULA-MIX', legacyLpCode: 'LP-006', title: '圆柱体积公式与圆面积公式边界不清', symptom: '面积题误做体积，体积题单位未统一' },
  { id: 'BN-SOLID-SURFACE-EXPOSED-FACES-OMIT', legacyLpCode: 'LP-006', title: '复杂立体表面积暴露面枚举不完整', symptom: '挖空圆柱题漏算底面或内侧面，表面积少一块' },
  { id: 'BN-UNIFORM-CHANGE-INTERVAL-DIFF', legacyLpCode: 'LP-005', title: '匀速变化题中误解相邻时刻差值', symptom: '把1小时内变化量再次除以2，机械求平均' },
  { id: 'BN-META-ESTIMATION-MISSING', legacyLpCode: 'LP-001', title: '缺少答案数量级估算检查', symptom: '明显不合理答案未停下来检查，小数点错位未自查' },
  { id: 'BN-META-INVERSE-CHECK-MISSING', legacyLpCode: 'LP-001', title: '缺少逆运算回代验算', symptom: '除法比例百分数反推题做完不回代' },
  { id: 'BN-AXIS-FOLD-MIDPOINT-DIRECTION', legacyLpCode: 'LP-006', title: '数轴折叠与延长语义中的方向倍数判断错误', symptom: '数轴折叠对称点方向错，延长倍数理解为等长而非加倍' },
  { id: 'BN-INT-DIV-QUOTIENT-PLACE', legacyLpCode: 'LP-001', title: '长除法中商位与 0 占位错误', symptom: '不够除时商里漏写 0，商的数字写串位' },
  { id: 'BN-GEO-RECT-PERIM-AREA-CONFUSE', legacyLpCode: 'LP-006', title: '长方形周长与面积公式混用', symptom: '求面积时长宽相加乘 2，求周长时长乘宽，单位 cm/cm² 不分' },
  { id: 'BN-OP-LAWS-MISAPPLY', legacyLpCode: 'LP-001', title: '简便计算中运算律误用（乱凑整、错拆分）', symptom: '拆分配律丢括号，减法凑整方向错，简算后结果与直算不一致' },
  { id: 'BN-DEC-MOVE-POINT-DIRECTION', legacyLpCode: 'LP-002', title: '小数点移动方向与倍数对应错误', symptom: '乘 100 向左移，除以 10 结果反而扩大' },
  { id: 'BN-FRACTION-UNIT-LABEL-CONFUSE', legacyLpCode: 'LP-002', title: '分数带单位与不带单位（分率与具体量）混淆', symptom: '每段是全长的几分之几与每段长几分之几米混答' },
  { id: 'BN-RATIO-ALLOCATE-PART', legacyLpCode: 'LP-005', title: '按比分配中份数与总量对应错误', symptom: '按 2:3 分直接用 45×2/3 而不是先算总份数' },
  { id: 'BN-GEO-CIRCLE-RING-FORMULA', legacyLpCode: 'LP-006', title: '圆环面积误算为 (R-r)² 乘 π', symptom: 'R²-r² 与 (R-r)² 混淆，先减半径再平方' },
  { id: 'BN-GEO-SURFACE-CUT-CHANGE', legacyLpCode: 'LP-006', title: '切割拼接后表面积增减方向与数量错误', symptom: '切一刀不知道多两个面，拼一次少两个面的面数算错' },
  { id: 'BN-STAT-AVERAGE-REVERSE', legacyLpCode: 'LP-005', title: '由平均数反推总数或个别数据时关系颠倒', symptom: '已知平均数求总数用除法，数据变动方向搞反' },
  { id: 'BN-STAT-GRAPH-SPEED-READ', legacyLpCode: 'LP-008', title: '距离-时间图读取速度时用错线段或时间轴', symptom: '用总路程除以局部时间，水平段也读出速度' },
  { id: 'BN-APP-EQUATION-MODEL-MISSING', legacyLpCode: 'LP-005', title: '复杂应用题缺少方程建模意识', symptom: '逆思维题算术法乱试，不会设未知数列方程' },
  { id: 'BN-PROCESS-FINAL-COPY', legacyLpCode: 'LP-010', title: '过程正确但最终答案誊写或收尾错误', symptom: '草稿算对答题纸抄错，漏单位漏答句' },
];

/**
 * AI 常见变体 ID → 标准 ID 的映射。
 * AI 即使被 prompt 约束，仍可能返回同义变体 ID（如 BN-FRACTION-ADD-COMMON），
 * 这里在 result-normalizer 兜底归并到标准 ID。
 *
 * 映射来源：report 117e... 的实际 AI 输出 + 常见命名变体。
 * 维护方式：发现新的 AI 变体时，加到此映射即可。
 */
const BN_VARIANT_ALIASES = {
  // 异分母分数加减通分（BN-FRACTION-ADD-DENOM-MISMATCH 的变体）
  'BN-FRACTION-ADD-COMMON': 'BN-FRACTION-ADD-DENOM-MISMATCH',
  'BN-FRACTION-ADD-UNLIKE': 'BN-FRACTION-ADD-DENOM-MISMATCH',
  'BN-FRACTION-ADD-UNLIKE-LCM': 'BN-FRACTION-ADD-DENOM-MISMATCH',
  'BN-FRACTION-ADD-NO-COMMON': 'BN-FRACTION-ADD-DENOM-MISMATCH',
  'BN-FRACTION-ADD-LCM': 'BN-FRACTION-ADD-DENOM-MISMATCH',
  'BN-FRACTION-ADD-SUB-COMMON': 'BN-FRACTION-ADD-DENOM-MISMATCH',
  'BN-FRACTION-SUB-COMMON-ERROR': 'BN-FRACTION-ADD-DENOM-MISMATCH',
  'BN-FRACTION-ADD-DENOM': 'BN-FRACTION-ADD-DENOM-MISMATCH',
  'BN-FRACTION-ADD-MISMATCH': 'BN-FRACTION-ADD-DENOM-MISMATCH',
  'BN-FRACTION-UNLIKE-DENOM': 'BN-FRACTION-ADD-DENOM-MISMATCH',

  // 面积单位换算（BN-UNIT-AREA-VOLUME-DIMENSION 的变体）
  'BN-AREA-UNIT-CONVERT': 'BN-UNIT-AREA-VOLUME-DIMENSION',
  'BN-AREA-CONVERT-RATE': 'BN-UNIT-AREA-VOLUME-DIMENSION',
  'BN-UNIT-AREA-CONVERT': 'BN-UNIT-AREA-VOLUME-DIMENSION',
  'BN-AREA-UNIT-CONVERT-ERROR': 'BN-UNIT-AREA-VOLUME-DIMENSION',
  'BN-AREA-UNIT-RATE': 'BN-UNIT-AREA-VOLUME-DIMENSION',
  'BN-AREA-CONVERSION-RATE': 'BN-UNIT-AREA-VOLUME-DIMENSION',
  'BN-AREA-UNIT-MIX': 'BN-UNIT-AREA-VOLUME-DIMENSION',

  // 长方形周长面积公式混淆 → BN-GEO-RECT-PERIM-AREA-CONFUSE
  // （v0.2.0 起 taxonomy 已有长方形专属卡点，不再归入圆周长面积混淆）
  'BN-GEO-RECT-AREA-CONFUSE': 'BN-GEO-RECT-PERIM-AREA-CONFUSE',
  'BN-RECT-PERIM-AREA-CONFUSE': 'BN-GEO-RECT-PERIM-AREA-CONFUSE',
  'BN-GEO-RECT-FORMULA-CONFUSE': 'BN-GEO-RECT-PERIM-AREA-CONFUSE',
  'BN-GEO-RECTANGLE-FORMULA-CONFUSE': 'BN-GEO-RECT-PERIM-AREA-CONFUSE',
  'BN-RECT-AREA-PERIM-CONFUSE': 'BN-GEO-RECT-PERIM-AREA-CONFUSE',

  // 小数乘法小数点位置（BN-DEC-MUL-POINT-COUNT 的变体）
  'BN-DEC-MUL-POINT': 'BN-DEC-MUL-POINT-COUNT',
  'BN-DEC-MUL-POINT-ERROR': 'BN-DEC-MUL-POINT-COUNT',
  'BN-DEC-MUL-DECIMAL-COUNT': 'BN-DEC-MUL-POINT-COUNT',

  // 小数乘法估算（BN-DEC-MUL-POINT-ESTIMATE 的变体）
  'BN-DEC-MUL-ESTIMATE': 'BN-DEC-MUL-POINT-ESTIMATE',
  'BN-DEC-MUL-ESTIMATE-MISSING': 'BN-DEC-MUL-POINT-ESTIMATE',
};

module.exports = { TAXONOMY_BN_LIST, BN_VARIANT_ALIASES };
