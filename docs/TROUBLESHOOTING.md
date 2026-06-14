# 故障排查手册（TROUBLESHOOTING）

> 更新日期：2026-06-14
> 配套文档：`SETUP.md`、`docs/TESTING.md`、`docs/TEST_MATRIX.md`
> 索引方式：按症状关键词查找；每个问题包含「症状 / 可能原因 / 排查步骤 / 解决方案」四段

---

## 1. 分析进度一直卡在 0%

**症状**
上传照片后，学科主页或报告页的进度条始终显示 0%，即使等待数分钟也不变化。

**可能原因**
- `uploadAndAnalyze` 没有成功触发 `analyzePhotos`（云函数部署缺失或调用失败）
- `analysisTasks` 集合中没有对应记录，或记录的 `totalBatches` 为 0
- `getAnalysisProgress` 因权限被拒返回错误，前端未正确处理
- 客户端轮询器已停止（超时或页面卸载）但 UI 未复位

**排查步骤**
1. 打开云开发控制台 → 日志，搜索 `uploadAndAnalyze` 与 `analyzePhotos` 的最近调用
2. 检查数据库 `analysisTasks` 集合，确认是否存在 `reportId` 匹配的记录及其 `completedBatches / totalBatches`
3. 在浏览器开发者工具 Network 面板中查看 `getAnalysisProgress` 的返回体
4. 运行本地测试验证回归：`node --test --test-name-pattern="getAnalysisProgress" tests/cloud-functions.test.js`

**解决方案**
- 若云函数未部署：右键 `cloudfunctions/uploadAndAnalyze` 与 `analyzePhotos` → 「上传并部署：云端安装依赖」
- 若 `analysisTasks` 缺失：通常是 `uploadAndAnalyze` 在写入任务前就抛错，查看其日志修复参数校验
- 若权限被拒：确认 `analysisTasks` 集合安全规则为 `doc._openid == auth.openid`，且当前用户 OPENID 正确
- 若轮询停止但 UI 卡住：检查 `subject-home.js` / `report.js` 的 `onUnload` 是否调用了 `poller.stop()` 并重置 `analysisStatus`

---

## 2. PDF 中文显示乱码/方块

**症状**
生成的试卷 PDF 或报告 PDF 中，中文字符显示为方框、问号或完全空白；英文和数字正常。

**可能原因**
- `generatePaper` 或 `generateReportPDF` 云函数目录缺少内置字体文件
- 云函数部署时未把 `NotoSansCJKsc-Regular.otf` 一起上传
- 字体文件格式不受 pdfkit 支持（仅支持 TTF/OTF）

**排查步骤**
1. 确认 `cloudfunctions/generatePaper/NotoSansCJKsc-Regular.otf` 存在且大小合理
2. 确认 `cloudfunctions/generateReportPDF/NotoSansCJKsc-Regular.otf` 存在且大小合理
3. 查看云函数日志是否有 `内置中文字体缺失` 或 `registerFont` 报错
4. 本地跑契约测试确认代码不依赖字体环境变量：`node --test --test-name-pattern="deployment configuration" tests/contracts.test.js`

**解决方案**
- 重新上传并部署 `generatePaper` / `generateReportPDF`
- 若字体文件误删，从另一云函数目录复制同名 `NotoSansCJKsc-Regular.otf`
- 避免替换成 TTC 合集字体

---

## 3. 云函数调用报错 "invalid credential"

**症状**
前端调用云函数时返回 `{ errMsg: "cloud.callFunction:fail Error: invalid credential" }`，或云函数日志显示鉴权失败。

**可能原因**
- 云开发环境未开通或未绑定当前小程序 AppID
- `project.config.json` 中的 `appid` 与云开发环境归属不一致
- 云函数部署到了错误的云环境
- 用户在未登录状态下调用（OPENID 为空）

**排查步骤**
1. 微信开发者工具顶部「云开发」按钮，确认当前环境 ID 与项目绑定
2. 检查 `project.config.json` 的 `appid` 字段
3. 云开发控制台 → 云函数列表，确认目标函数存在于当前环境
4. 在云函数入口打印 `cloud.getWXContext()`，确认 OPENID 非空

**解决方案**
- 重新绑定正确的云开发环境
- 确认 `appid` 正确后重启开发者工具
- 将云函数部署到当前环境（而非其他测试环境）
- 确保小程序已完成微信登录流程再调用云函数

---

## 4. 上传图片后一直显示"分析中"

**症状**
上传完成、进度显示 100%，但学科主页持续显示"分析中"状态，刷新也不消失。

**可能原因**
- `analyzePhotos` 执行超时或被限流，未能将 `subjectProfiles.analysisStatus` 重置为 null
- 所有批次均失败，但失败分支未清理 profile 状态（历史 bug，已有测试覆盖）
- 客户端轮询达到最大次数后停止，UI 未从"分析中"切回普通状态
- `currentAnalysisId` 指向的报告已被删除，轮询永远拿不到终态

**排查步骤**
1. 查数据库 `subjectProfiles` 中对应记录的 `analysisStatus` 与 `currentAnalysisId`
2. 查 `reports` 集合中该 `currentAnalysisId` 对应报告的 `status`（应为 completed/failed）
3. 查 `analysisTasks` 中对应任务的 `status`
4. 查看云函数日志是否有 AI 调用超时或 quota 超限

**解决方案**
- 若 profile 卡在 `analyzing` 但 report 已是终态：手动将 `analysisStatus` 置为 null、`currentAnalysisId` 置空（应急手段）
- 若 AI 超时：保持云函数超时在 60 秒以内，进入报告页点击"重试分析"；当前后台会按图片串行处理大批量上传，不应通过调高超时时间解决
- 若轮询已达上限：点击报告页的"重试分析"按钮触发 `onRetryAnalysis`
- 根因修复参考测试：`node --test --test-name-pattern="clears profile analysis state" tests/coverage-gap.test.js`

---

## 5. 小程序预览时报"云函数不存在"

**症状**
真机预览或体验版运行时，调用某个云函数返回 `cloud.callFunction:fail Error: function not found`。

**可能原因**
- 云函数未部署到当前云环境
- `project.config.json` 的 `cloudfunctionRoot` 路径错误
- 函数名拼写不一致（目录名 vs 调用名）
- 部署过程中断导致函数元数据不完整

**排查步骤**
1. 云开发控制台 → 云函数列表，确认函数存在且更新时间符合预期
2. 检查 `project.config.json` 中 `cloudfunctionRoot` 是否为 `"cloudfunctions/"`
3. 全局搜索 `callFunction({ name:` 确认调用名与目录名一致
4. 在开发者工具中右键云函数目录 → 「打开云函数控制台」查看部署状态

**解决方案**
- 重新「上传并部署：云端安装依赖」
- 修正 `project.config.json` 后重启开发者工具
- 统一命名：目录名 = 调用名 = `package.json` 中的 name
- 若部署中断，先删除云端残留函数再重新部署

---

## 6. AI 返回格式异常（JSON.parse 失败）

**症状**
`analyzeBatch` 或 `generatePaper` 抛出 `SyntaxError: Unexpected token ... in JSON at position ...`，分析失败。

**可能原因**
- CloudBase AI 返回了 Markdown 代码块包裹的 JSON（如 ` ```json ... ``` `）
- AI 在 JSON 前后附加了解释性文字
- AI 返回了截断的 JSON（超出输出长度限制）
- prompt 未明确要求纯 JSON 输出

**排查步骤**
1. 查看云函数日志中 AI 原始返回文本（建议在 `generateText` 后打日志）
2. 检查 `result-normalizer.js` 是否已处理常见包装格式
3. 确认 prompt 中包含"仅返回 JSON，不要任何额外文字"之类的约束
4. 复现时使用相同的输入图片/参数再次调用，观察是否稳定

**解决方案**
- 在解析前增加清洗步骤：去除 markdown 代码块标记、截取首个 `{` 到末尾 `}` 之间的内容
- 调整 prompt，明确输出格式与长度要求
- 对 `generatePaper` 设置足够的 `maxTokens`，避免题目列表被截断
- 加入结构化校验（如 zod/schema），不合格时自动重试一次

---

## 7. 照片去重误判（不同照片被标记为重复）

**症状**
上传多张不同内容的试卷照片，部分被标记为 `isDuplicate: true`，导致错题统计偏少。

**可能原因**
- OCR 摘要过于粗略（例如只取前 N 个字符），不同页面产生了相同摘要
- 历史报告的 OCR 摘要与新照片偶然碰撞
- 同一张照片被多次选择进入上传列表
- AI 返回的 `ocrSummary` 为空或固定模板文本

**排查步骤**
1. 查数据库中对应报告的 `imageFiles`，对比被标记为重复的照片与其"原始"照片的 `ocrSummary`
2. 查看 `analyzePhotos/photo-dedup.js` 的去重逻辑，确认比较粒度
3. 检查 AI 返回的 `pageResults[].ocrSummary` 是否有意义
4. 运行去重单元测试：`node --test tests/photo-dedup.test.js`

**解决方案**
- 改进摘要生成：让 AI 返回更详细的文本指纹（如完整 OCR 文本的哈希）
- 增加文件大小/尺寸作为辅助判断维度
- 对"全部重复"分支增加告警日志，便于事后审计
- 临时规避：让用户重新拍摄清晰度更高的照片

---

## 8. 验证报告生成失败

**症状**
上传验证试卷答案后，报告状态变为 `failed`，提示"验证分析必须关联验证试卷"或类似错误。

**可能原因**
- 上传时未传 `paperId`，或 `paperId` 对应的试卷 `type` 不是 `verification`
- 验证试卷的 `bottleneckTargets` 为空，导致无法确定验证目标
- AI 分析结果中没有识别出任何目标卡点的证据，触发"无有效验证目标"失败
- `mode: 'verification'` 但未走验证试卷流程

**排查步骤**
1. 查数据库中对应 report 的 `paperId`、`type`、`sourceType`
2. 查对应 paper 记录的 `type` 与 `bottleneckTargets`
3. 查看 `uploadAndAnalyze` 日志，确认入参校验结果
4. 运行相关测试：`node --test --test-name-pattern="verification" tests/cloud-functions.test.js`

**解决方案**
- 确保前端在验证模式下传递正确的 `paperId`
- 生成验证试卷时至少选择 1 个、最多 5 个卡点
- 若 AI 确实未识别出目标卡点错误，属于正常业务结果（学生答对了），应向用户展示"已改善"而非失败
- 检查 `analyzePhotos` 中验证失败分支的状态清理是否正确

---

## 9. 报告 PDF 下载/打开失败

**症状**
点击"下载报告 PDF"后，toast 提示失败，或下载成功但 `openDocument` 无法打开。

**可能原因**
- `generateReportPDF` 云函数执行失败（字体缺失、pdfkit 异常）
- PDF 未上传到云存储，`pdfFileId` 为空
- 临时链接过期或 `downloadFile` 网络失败
- 客户端 `wx.openDocument` 不支持该文件类型（罕见）

**排查步骤**
1. 查数据库中对应 report 的 `pdfFileId` 是否有值
2. 查云存储中该 fileID 对应的文件是否存在、大小 > 0
3. 查看 `generateReportPDF` 云函数日志
4. 在开发者工具中手动用 `wx.cloud.downloadFile` 测试该 fileID

**解决方案**
- 若 `pdfFileId` 为空：重新触发 PDF 生成（报告页再次点击下载即可）
- 若云函数失败：优先排查字体配置（见问题 2）
- 若临时链接过期：这是正常行为，重新下载即可
- 若文件损坏：删除云端残留文件后重新生成

---

## 10. 轮询超时但分析实际已完成

**症状**
前端 toast 提示"分析仍在后台进行，请稍后查看"，但稍后进入学科主页发现报告已经生成完毕。

**可能原因**
- 客户端轮询器达到 `maxAttempts`（默认 30 次 × 10s = 5 分钟）后主动放弃
- 网络抖动导致某几次轮询请求失败，消耗了重试配额
- 服务端分析确实在轮询窗口结束后才完成

**排查步骤**
1. 确认 `utils/poller.js` 的 `maxAttempts` 与 `schedule` 配置
2. 查 `analysisTasks` 中任务的 `createdAt` 与最终 `updatedAt`，计算实际耗时
3. 检查轮询期间是否有网络错误日志

**解决方案**
- 这通常是**预期行为**：设计上允许客户端停止轮询后由服务端继续完成
- 用户体验优化：进入学科主页时若检测到 `currentAnalysisId` 非空，自动重启轮询
- 若频繁超时：考虑增大 `maxAttempts` 或缩短轮询间隔
- 体验优化：学习记录和学科主页进入时继续恢复当前分析状态

---

## 11. 试卷 PDF 已下载后仍可重复下载

**症状**
试卷预览页已经下载过 PDF，但按钮仍显示「下载 PDF」，再次点击会重复下载同一份文件。

**可能原因**
- 本地下载标记没有写入 `wx.setStorageSync`
- `paper-preview` 页面没有从 `pdfFileId/fileId` 生成稳定的 storage key
- 预览模式和正式试卷模式使用了不同 fileID，导致状态无法复用
- 用户清除了小程序本地缓存

**排查步骤**
1. 在开发者工具 Storage 面板查看是否存在 `downloaded_pdf_<fileId>` 记录
2. 检查 `paper-preview.js` 的 `isPdfDownloaded()` 与 `markPdfDownloaded()` 是否正常执行
3. 运行回归测试：`node --test --test-name-pattern="paper preview remembers downloaded PDF" tests/page-flows.test.js`

**解决方案**
- 确保下载成功并打开文档后调用 `markPdfDownloaded()`
- 使用 PDF 云存储 fileID 作为下载状态 key，不使用 paperId 或页面标题
- 若用户清空缓存，允许再次下载，这是预期行为

---

## 12. 数据库权限错误（读取他人数据被拒）

**症状**
调用 `getReport`、`getAnalysisProgress` 等接口返回 `permission denied`，或返回空数组但预期有数据。

**可能原因**
- 集合安全规则配置为 `doc._openid == auth.openid`，而查询条件未带 `_openid`
- 云函数中使用管理员权限绕过规则，但客户端直连查询时被拦截
- 用户切换微信账号后，旧数据的 `_openid` 与当前不匹配
- 云函数归属校验逻辑有缺陷

**排查步骤**
1. 云开发控制台 → 数据库 → 对应集合 → 权限设置，确认规则
2. 检查出错接口的查询是否通过云函数（有管理员权限）还是客户端直连
3. 查数据库中目标文档的 `_openid` 字段
4. 运行权限相关测试：`node --test --test-name-pattern="rejects other owners" tests/cloud-functions.test.js`

**解决方案**
- 所有跨用户敏感操作必须走云函数，禁止客户端直连查询他人数据
- 云函数入口处校验 `cloud.getWXContext().OPENID === doc._openid`
- 测试环境中可用第二个微信号验证隔离性
- 若需管理员后台功能，单独建一个管理端云函数并加白名单校验

---

## 13. 内置字体部署缺失

**症状**
调用 `generatePaper` 或 `generateReportPDF` 时，日志出现 `内置中文字体缺失` 或 `registerFont` 报错，PDF 生成失败。

**可能原因**
- 云函数部署包中没有包含 `NotoSansCJKsc-Regular.otf`
- 字体文件被误删或替换为不受 pdfkit 支持的格式
- 只部署了代码文件，没有重新上传整个云函数目录

**排查步骤**
1. 确认 `cloudfunctions/generatePaper/NotoSansCJKsc-Regular.otf` 存在
2. 确认 `cloudfunctions/generateReportPDF/NotoSansCJKsc-Regular.otf` 存在
3. 在微信开发者工具中对对应云函数执行「上传并部署：云端安装依赖」

**解决方案**
- 重新部署 `generatePaper` 和 `generateReportPDF`
- 如字体文件缺失，从另一函数目录复制同名文件后再部署
- 不再配置或依赖 `FONT_FILE_ID`

---

## 14. iPhone 相册 HEIF/HEIC 照片无法上传或分析

**症状**
iPhone 相册选择的照片预览失败、上传后无法被 OCR/AI 正常分析，或同一张照片截图后可以上传。

**可能原因**
- 相册原图为 HEIF/HEIC 格式，部分预览、云存储下游或视觉模型链路不能稳定识别
- 客户端上传路径使用了 `.jpg` 扩展名，但文件内容仍是 HEIF，造成格式错配
- 当前微信版本或系统环境无法完成本地图片压缩转换

**排查步骤**
1. 查看上传页照片缩略图是否出现「已转JPG」标记
2. 若选择后提示 `HEIF无法转换，请截图上传`，说明本机转换失败
3. 检查云存储中文件路径扩展名是否为 `.jpg/.png/.webp`，避免 HEIF 内容伪装成 JPG
4. 运行回归测试：`node --test --test-name-pattern="HEIF" tests/page-flows.test.js`

**解决方案**
- 上传页会自动尝试将 `.heic/.heif` 转换为 JPG 后再加入上传队列
- 转换失败的 HEIF 不会进入上传队列，避免生成无法分析的脏报告
- 临时规避：在 iPhone 上截图后上传，或在相机设置中选择“兼容性最佳”保存为 JPEG

---

## 通用排查技巧

1. **先看自动化测试**：多数已知回归都有对应用例，先跑 `npm test` 确认是否绿
2. **云函数日志是第一手证据**：云开发控制台 → 日志 → 按函数名筛选
3. **数据库快照定位状态问题**：导出相关集合的 JSON，对比预期状态
4. **契约测试防回归**：改完代码后跑 `node --test tests/contracts.test.js`
5. **真机验收清单**：本地无法复现的问题，按 `SETUP.md` 第七章逐项验证
6. **记录新发现**：本手册未覆盖的问题，解决后请补充进来，保持手册鲜活
