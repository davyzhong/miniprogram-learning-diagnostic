# 轻量家长管理设计

日期：2026-06-13

> 更新说明：本文保留为早期家长管理设计记录。其中“第一版只开放查看权限”的设定已被后续实现替换。当前产品策略是：共同家长可以参与学习诊断相关流程，家庭成员管理仍仅限档案创建者。

## 背景

当前小程序的数据模型是“谁创建孩子档案，谁能看到”。`students`、`subjectProfiles`、`reports`、`papers` 等集合都依赖创建者的 `_openid` 做天然隔离。这个模型适合单个微信账号使用，但不符合真实家庭场景：

- 一个孩子通常有多位家长共同关注学习情况。
- 另一位家长需要用自己的微信账号查看同一个孩子的诊断资料。
- 家长希望持续查看孩子档案，而不是只接收某一次报告的截图或链接。

因此，本功能不应设计成“分享一份报告”，而应设计成“一个孩子档案可以绑定多个家长微信账号”。

## 设计目标

1. 一个孩子档案可以有多个家长成员。
2. 另一位家长通过扫码加入孩子档案。
3. 加入后，该家长能在自己的微信账号下看到同一个孩子档案。
4. 第一版只开放查看权限，避免误删、误改、权限纠纷。
5. 不复制孩子数据，所有家长看到的是同一份档案、报告、试卷和学习记录。
6. 保持 MVP 轻量，不引入完整家庭空间、多孩子家庭组织、成员分组和复杂角色系统。

## 非目标

第一版不做以下能力：

- 完整家庭空间。
- 多管理员。
- 管理员转让。
- 家庭名称、家庭头像。
- 按家庭维度管理多个孩子。
- 细粒度权限配置。
- 共享家长上传试卷或删除报告。
- 外部网页匿名查看报告。

这些能力可以后续演进，但不应进入本轮实现。

## 产品定义

### 页面命名

功能入口命名为：

```text
家长管理
```

核心操作命名为：

```text
邀请家长
```

受邀流程命名为：

```text
加入孩子档案
```

### 角色定义

第一版只保留两个角色：

| 角色 | 说明 | 权限 |
| --- | --- | --- |
| `owner` | 创建孩子档案的微信账号 | 查看、邀请家长、移除家长、后续保留上传/生成权限 |
| `viewer` | 扫码加入的家长微信账号 | 查看孩子档案、诊断报告、验证试卷、学习记录 |

暂不开放 `editor`。后续如需要让另一位家长上传试卷，可新增 `editor` 角色。

### 可见内容

`viewer` 加入后可以看到：

- 学习档案首页。
- 各学科诊断中心。
- 诊断报告详情。
- 验证报告详情。
- 验证试卷预览和下载。
- 学习记录时间线。
- 上传照片缩略图、OCR 摘要、重复记录。

`viewer` 第一版不能执行：

- 删除孩子档案。
- 修改孩子姓名、年级。
- 移除家长。
- 邀请其他家长。
- 删除报告或试卷。
- 重新分析报告。
- 上传新试卷。
- 生成验证试卷。

## 用户流程

### 1. 创建者邀请家长

入口：

```text
学习档案首页 → 管理孩子 → 家长管理
```

或：

```text
孩子档案页 → 家长管理
```

流程：

1. 创建者进入“家长管理”。
2. 页面展示当前孩子档案和已加入家长。
3. 创建者点击“邀请家长”。
4. 系统生成一个邀请二维码或微信分享卡片。
5. 创建者把二维码给另一位家长扫码。

邀请页文案：

```text
邀请家长查看钟青羽的学习档案
对方加入后，可以持续查看诊断报告、验证试卷和学习记录。
```

### 2. 受邀家长扫码加入

流程：

1. 受邀家长扫码打开小程序。
2. 小程序进入 `join-student` 页面。
3. 页面展示孩子姓名、年级、邀请人和可查看内容。
4. 受邀家长点击“确认加入”。
5. 系统创建家长成员关系。
6. 加入成功后跳转到该孩子的学习档案首页。

确认页文案：

```text
加入钟青羽的学习档案
你将以家长身份查看这个孩子的学习诊断资料。
```

加入成功文案：

```text
已加入孩子档案
之后你可以在首页看到钟青羽的学习资料。
```

### 3. 家长查看孩子档案

第二位家长重新打开小程序时：

1. 首页加载当前 openid 可访问的孩子列表。
2. 如果只有一个孩子，直接进入该孩子学习档案。
3. 如果有多个孩子，展示孩子切换入口。
4. 对于 viewer，页面隐藏管理和写操作，只保留查看路径。

## 信息架构调整

### 首页

首页不再只加载当前 `_openid` 创建的学生，而是加载“当前账号可访问的孩子档案”。

可访问范围：

```text
我创建的孩子 + 我作为家长成员加入的孩子
```

### 管理孩子

“管理孩子”页面需要区分：

- 我创建的孩子：可进入家长管理。
- 我加入的孩子：只显示“已加入，可查看”，不显示移除其他家长。

如果第一版不恢复完整学生列表页，也可以把“家长管理”入口先放在首页右上角的“管理孩子”动作中。

### 家长管理页

页面内容：

1. 孩子档案摘要。
2. 当前家长成员列表。
3. 每位家长的角色。
4. 邀请家长按钮。
5. 对 viewer 隐藏邀请和移除入口。

成员行示例：

```text
我
创建者 · 管理员

妈妈
查看权限
```

## 数据模型

### 新增集合：studentMembers

用于记录一个微信账号对某个孩子档案的访问权限。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `_id` | String | 是 | 自动生成 |
| `studentId` | String | 是 | 关联 `students._id` |
| `ownerOpenId` | String | 是 | 孩子档案创建者 openid |
| `memberOpenId` | String | 是 | 家长成员 openid |
| `role` | String | 是 | `owner` 或 `viewer` |
| `status` | String | 是 | `active` 或 `revoked` |
| `displayName` | String | 否 | 家长备注名，第一版可为空 |
| `joinedByInviteId` | String | 否 | 来源邀请 ID |
| `createdAt` | Date | 是 | 创建时间 |
| `updatedAt` | Date | 是 | 更新时间 |
| `revokedAt` | Date | 否 | 移除时间 |

约束：

- 同一个 `studentId + memberOpenId` 只能有一条 active 记录。
- 创建者也可以写入一条 `role='owner'` 的成员记录，便于统一查询。
- 为兼容旧数据，访问判断仍应支持 `student._openid === currentOpenId`。

### 新增集合：studentInvites

用于记录扫码加入邀请。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `_id` | String | 是 | 自动生成 |
| `studentId` | String | 是 | 关联 `students._id` |
| `ownerOpenId` | String | 是 | 邀请创建者 openid |
| `tokenHash` | String | 是 | 邀请 token 的哈希，不存明文 |
| `status` | String | 是 | `active`、`accepted`、`expired`、`revoked` |
| `role` | String | 是 | 第一版固定为 `viewer` |
| `expiresAt` | Date | 是 | 过期时间 |
| `acceptedByOpenId` | String | 否 | 接受邀请者 openid |
| `acceptedAt` | Date | 否 | 接受时间 |
| `createdAt` | Date | 是 | 创建时间 |
| `updatedAt` | Date | 是 | 更新时间 |

邀请有效期建议：

```text
7 天
```

扫码链接参数：

```text
pages/join-student/join-student?inviteId=xxx&token=yyy
```

安全规则：

- `token` 只在二维码/分享路径中出现。
- 数据库存 `tokenHash`，不存明文 token。
- 接受邀请时校验 `inviteId + tokenHash + status + expiresAt`。
- 邀请被接受后，第一版可直接置为 `accepted`，防止一个二维码无限扩散。
- 如果希望一个二维码允许多位家长加入，后续可新增 `maxUses / usedCount`。

## 访问控制

### 判断当前账号是否可访问某个孩子

一个 openid 可访问某个 `studentId`，满足任一条件即可：

1. `students._openid === currentOpenId`
2. `studentMembers` 存在：

```js
{
  studentId,
  memberOpenId: currentOpenId,
  status: 'active'
}
```

### 判断当前账号是否是 owner

满足任一条件即可：

1. `students._openid === currentOpenId`
2. `studentMembers` 存在：

```js
{
  studentId,
  memberOpenId: currentOpenId,
  role: 'owner',
  status: 'active'
}
```

### 权限分层

| 操作 | owner | viewer |
| --- | --- | --- |
| 查看孩子档案 | 是 | 是 |
| 查看报告 | 是 | 是 |
| 查看试卷 | 是 | 是 |
| 查看学习记录 | 是 | 是 |
| 查看上传图片摘要 | 是 | 是 |
| 上传试卷 | 是 | 否 |
| 生成验证试卷 | 是 | 否 |
| 重新分析 | 是 | 否 |
| 邀请家长 | 是 | 否 |
| 移除家长 | 是 | 否 |
| 删除孩子 | 是 | 否 |

## 技术设计

### 核心原则

不要把孩子资料复制给第二个 openid。

所有家长看到的都应该是同一份：

- `students`
- `subjectProfiles`
- `reports`
- `papers`
- `analysisTasks`
- 云存储图片和 PDF

第二位家长只是获得访问关系。

### 前端数据访问调整

当前 `miniprogram/utils/cloud.js` 里很多读取是前端直接查数据库：

- `getStudents`
- `getStudent`
- `getSubjectProfiles`
- `getReports`
- `getReport`
- `getPapers`
- `getPaper`

这些读取在共享场景下会遇到权限和数据隔离问题。第一版建议新增访问感知云函数，而不是继续让前端直接查所有集合。

新增云函数建议：

| 云函数 | 用途 |
| --- | --- |
| `getAccessibleStudents` | 返回当前账号可访问的孩子列表和当前账号角色 |
| `getStudentDashboard` | 返回某个孩子首页所需聚合数据 |
| `getSubjectDashboard` | 返回某个孩子某学科主页所需数据 |
| `getLearningTimeline` | 返回学习记录时间线 |
| `getReportDetail` | 返回报告详情 |
| `getPaperDetail` | 返回试卷详情 |
| `createStudentInvite` | owner 创建家长邀请 |
| `getStudentInvite` | 扫码后读取邀请摘要 |
| `acceptStudentInvite` | 当前 openid 接受邀请 |
| `listStudentMembers` | owner 查看成员列表 |
| `revokeStudentMember` | owner 移除 viewer |

短期也可以只先实现共享相关云函数，再逐步迁移读取。但从可靠性角度，涉及 shared read 的页面最好都走云函数。

### 写操作规则

第一版写操作继续只允许 owner：

- 上传试卷：`uploadAndAnalyze`
- 生成试卷：`generatePaper`
- 重新分析：`analyzePhotos`
- 生成报告 PDF：可允许 viewer 下载已存在 PDF；如果需要生成新 PDF，建议 owner-only 或由云函数判断是否只是读取。

写操作云函数需要增加访问校验：

```text
当前 openid 必须是 owner
```

读操作云函数需要增加访问校验：

```text
当前 openid 必须是 owner 或 active viewer
```

### 云存储访问

报告图片和 PDF 通过云存储 fileID 获取临时链接。viewer 读取图片/PDF 前，应先由云函数确认其对 `studentId` 有访问权限，再返回可用 fileID 或临时 URL。

前端不应只凭 fileID 直接请求敏感资料。

## 页面与路由

### 新增页面：parent-management

路径：

```text
pages/parent-management/parent-management
```

参数：

```text
studentId
```

职责：

- 展示孩子档案摘要。
- 展示家长成员列表。
- owner 可创建邀请。
- owner 可移除 viewer。
- viewer 只能看到当前自己拥有查看权限，不显示管理操作。

### 新增页面：join-student

路径：

```text
pages/join-student/join-student
```

参数：

```text
inviteId
token
```

职责：

- 展示邀请摘要。
- 展示可查看内容。
- 当前微信账号点击确认加入。
- 加入后跳转学习档案首页或对应孩子档案。

### 现有页面调整

#### index

从 `getStudents()` 调整为 `getAccessibleStudents()`。

首页 view model 增加：

- 当前账号对 activeStudent 的 `role`
- 是否允许管理家长
- 是否允许上传/生成试卷

#### subject-home

如果当前账号是 viewer：

- 展示最新诊断、卡点和学习记录。
- 隐藏或禁用上传、生成试卷、默认试卷等写入口。

#### report

viewer 可读报告。

需要隐藏：

- 重新分析。
- 可能引发写操作的生成动作。

是否显示“下载 PDF”取决于产品判断：

- 如果 PDF 已存在，可以允许下载。
- 如果需要现场生成 PDF，第一版建议 owner-only，避免 viewer 触发写入。

#### upload-history

viewer 可读学习记录。

照片预览需要通过访问校验后的临时 URL。

## 邀请二维码

第一版可以使用微信小程序码：

```text
scene = inviteId + token 的短码
page = pages/join-student/join-student
```

如果短期不做小程序码生成，也可以先用微信分享卡片：

```js
path: /pages/join-student/join-student?inviteId=xxx&token=yyy
```

但产品体验上，家长更容易理解“扫码加入”。因此建议接口层设计为二维码优先，分享卡片作为 fallback。

## 迁移策略

现有孩子档案没有 `studentMembers` 记录。

兼容策略：

1. 所有访问判断继续支持 `students._openid === currentOpenId`。
2. 第一次进入家长管理页时，如果没有 owner member 记录，则补建：

```js
{
  studentId,
  ownerOpenId: student._openid,
  memberOpenId: student._openid,
  role: 'owner',
  status: 'active'
}
```

3. 不需要批量迁移所有旧数据。

## 错误处理

### 邀请不存在

文案：

```text
邀请不存在或已失效
请让孩子档案的创建者重新生成邀请。
```

### 邀请过期

文案：

```text
邀请已过期
请让创建者重新生成二维码。
```

### 已经加入

文案：

```text
你已经是这个孩子档案的家长成员
```

动作：

```text
进入学习档案
```

### 创建者扫码自己的邀请

文案：

```text
你已经是这个孩子档案的创建者
```

动作：

```text
进入家长管理
```

### 无权限访问

文案：

```text
你没有访问这个孩子档案的权限
```

动作：

```text
返回首页
```

## 测试计划

### 云函数权限测试

- owner 可以创建邀请。
- viewer 不能创建邀请。
- 非成员不能读取孩子档案。
- viewer 可以读取孩子档案、报告、试卷、学习记录。
- viewer 不能上传试卷、生成试卷、重新分析。
- owner 可以移除 viewer。
- 被移除 viewer 不能继续读取资料。

### 邀请流程测试

- 有效邀请可以被接受。
- 过期邀请不能被接受。
- revoked 邀请不能被接受。
- token 不匹配不能加入。
- 同一 openid 重复接受不会创建重复 active 成员。
- 创建者扫码自己的邀请不会创建异常记录。

### 页面测试

- 首页展示 owner 创建的孩子。
- 首页展示 viewer 加入的孩子。
- viewer 进入学科主页后只能查看，写操作入口隐藏。
- viewer 能打开诊断报告。
- viewer 能打开学习记录。
- 家长管理页 owner 可看到邀请按钮。
- 家长管理页 viewer 不显示邀请和移除按钮。

### 回归测试

- 单账号单孩子场景不受影响。
- 旧数据没有 `studentMembers` 时仍能正常加载。
- `npm run verify` 通过。
- 微信开发者工具预览通过。

## 分阶段实现建议

### Phase 1：只读家长管理

实现：

- `studentMembers`
- `studentInvites`
- 邀请创建和接受
- 可访问孩子列表
- viewer 读取首页、报告、学习记录
- owner 家长管理页

不实现：

- viewer 上传。
- viewer 生成试卷。
- 完整家庭空间。

### Phase 2：协作上传

根据真实使用情况，决定是否开放：

- viewer 升级为 editor。
- editor 可上传试卷。
- editor 可生成验证试卷。

### Phase 3：完整家庭空间

当一个家庭有多个孩子、多个家长、更多协作角色时，再引入：

- `families`
- `familyMembers`
- `familyStudents`
- 家庭级成员管理。

## 最终决策

采用“轻量家长管理”：

```text
一个孩子档案，可以绑定多个家长微信账号。
另一位家长扫码加入后，可持续查看该孩子的学习资料。
第一版只提供查看权限。
```

这比单份报告分享更符合真实家庭使用场景，也比完整家庭空间更适合当前 MVP。
