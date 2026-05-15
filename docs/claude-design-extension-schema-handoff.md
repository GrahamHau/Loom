# Claude Design 交接：插件前端适配字段 Schema

> 目标：让 Claude Design 优化 Loom Chrome 插件前端视觉，同时不破坏 Codex 后续原封不动读回、合并、上线的能力。  
> 关联方案：`docs/field-schema-refactor.md`  
> 交付包：`.codex-artifacts/loom-extension-claude-design-schema-pack.zip`

## 真实目标

这次不是让 Claude Design 重做一个新插件，也不是让它改后端 schema。真正目标是：

1. 插件前端要跟上新的字段系统：从固定 `brand/category/scenarios/painpoints/innovation`，过渡到 `settings.fields` + 实体 `tag_values`。
2. 设计优化必须能回填到真实插件源码，不要产出脱离运行代码的静态稿。
3. Claude Design 修改后，Codex 能按文件 diff 直接读回，不需要重新猜页面结构、重画交互、重接接口。

最小交付线：Claude Design 只优化 `sidepanel` 与 `options` 的可视体验，并保留所有接口字段、`data-*` 绑定、Chrome extension 运行结构。

## 当前代码判断

新的 Web 前端和后端已经开始落字段 schema：

- `server/field-config.js` 定义了 `DEFAULT_FIELDS`，核心字段是 `brand`、`host`、`category`、`scenarios`、`painpoints`、`innovation`、`custom_tags`。
- `server/index.js` 已有 `/api/fields`、`/api/fields/catalog`、`POST/PATCH/DELETE /api/fields/:key` 等接口。
- `server/repository.js` 已经兼容 `tag_values`，同时保留老字段 `brand/category/tags/innovation/scenarios/painpoints`。
- `src/legacy/screens.jsx` 已经在 Web 端详情页和 Settings 里做 schema 化渲染。

插件侧目前还停在旧模型：

- `loom-extension/sidepanel/sidepanel.js` 只从 `/api/bootstrap` 读取 `settings.tag_groups`。
- 插件内状态叫 `tagGroups`，没有独立的 `fields`。
- 竞品采集只渲染 `品牌`、`品类`，缺少新字段 `主机 host`，也没有按实体字段动态渲染。
- 保存 payload 只传旧字段，没有显式构造 `tag_values`。
- `options` 页仍显示“字段映射”，但它是旧的简单字段名映射，不是新的字段 schema 管理入口。

## 插件需要改哪里

### 1. Side Panel 数据层

文件：`loom-extension/sidepanel/sidepanel.js`

建议新增或调整：

- `state.fields`：优先存 `settings.fields`。
- `state.tagGroups`：作为 legacy fallback 保留，不能立即删。
- `loadTagGroups()` 改成 `loadFieldSchema()` 或保留函数名但内部同时读取：
  - `settings.fields`
  - `settings.tag_groups`
  - `settings.llm_configured`
- 增加 `normalizeFieldsForExtension(settings)`：
  - 如果有 `settings.fields`，用它。
  - 如果没有，按旧 `tag_groups` 转成字段数组。
  - 字段结构保持：`key/name/tone/multi/official/entities/options/legacyKey`。

### 2. Side Panel 表单草稿

文件：`loom-extension/sidepanel/sidepanel.js`

`buildDraft()` 需要读取和写入 `tag_values`：

竞品：

```js
tag_values: {
  brand: ["Ulanzi"],
  host: ["DJI Osmo Pocket 3"],
  category: ["三脚架"],
  scenarios: ["Vlog/自拍"],
  painpoints: ["安装固定麻烦"],
  custom_tags: ["便携"]
}
```

需求：

```js
tag_values: {
  innovation: ["使用方式创新"],
  scenarios: ["旅行拍摄"],
  painpoints: ["设备太多"],
  custom_tags: ["磁吸"]
}
```

兼容规则：

- 读：优先 `item.tag_values[fieldKey]`，没有再读旧字段。
- 写：保存时必须带 `tag_values`。
- 旧字段继续带上：`brand/category/tags/innovation/scenarios/painpoints`，方便后端和旧数据兼容。

### 3. Side Panel 渲染层

文件：`loom-extension/sidepanel/sidepanel.js`、`loom-extension/sidepanel/sidepanel.css`

竞品模式需要从固定两项变成字段 schema 渲染：

- 固定字段区保留：标题、图片、平台信息、价格、评分、月销、卖点、摘要、备注。
- 标签字段区用 `fields.filter(field => field.entities.includes("competitor"))`。
- 至少必须显示：`品牌 brand`、`主机 host`、`品类 category`。
- `host` 是单选，视觉上和 `brand/category` 一致。
- `scenarios/painpoints/custom_tags` 如启用 competitor，也应能显示。

需求模式同理：

- 固定字段区保留：标题、作者、正文、评论、来源链接、备注。
- 标签字段区用 `fields.filter(field => field.entities.includes("inspiration"))`。
- 至少显示：`innovation/scenarios/painpoints`。

建议抽函数：

- `fieldValueForDraft(item, field)`
- `setFieldValue(fieldKey, values)`
- `schemaFieldSelect(field, item)`
- `entityFields(entity)`

### 4. Tag Picker / Option 新建

文件：`loom-extension/sidepanel/sidepanel.js`

现在 `ensureTagOption()` 是 PATCH `/api/settings` 写回 `tag_groups`。Schema 完整上线后应该改成：

- 优先调用 `POST /api/fields/:key/options`，body 为 `{ value }`。
- 如果接口失败或 schema 不存在，再 fallback 到旧 `/api/settings` 写 `tag_groups`。

这样插件不会绕过新的字段管理体系。

### 5. 保存 payload

文件：`loom-extension/sidepanel/sidepanel.js`

`productPayload()` 增加：

```js
tag_values: normalizeDraftTagValues(item, "competitor")
```

并把旧字段从 `tag_values` 反填：

- `brand = tag_values.brand.join(" / ")`
- `host = tag_values.host.join(" / ")`
- `category = tag_values.category.join(" / ")`
- `tags = tag_values.custom_tags`

`demandPayload()` 增加：

```js
tag_values: normalizeDraftTagValues(item, "inspiration")
```

并反填：

- `innovation = tag_values.innovation[0] || "待分类"`
- `scenarios = tag_values.scenarios`
- `painpoints = tag_values.painpoints`
- `tags = tag_values.custom_tags`

### 6. Options 页

文件：`loom-extension/options/options.html`、`loom-extension/options/options.js`、`loom-extension/options/options.css`

Claude Design 可优化这里，但不要把它做成字段 schema 的主入口。字段 schema 的真实管理入口在 Web Settings。

建议文案：

- 把“字段映射”改成“兼容字段映射”。
- 增加说明：标签字段请在 Web 端 Settings -> 标签与字段管理。
- 增加按钮：`打开 Web 字段设置`，链接到 Web 端 Settings 页面。

## Claude Design 的能力边界

Claude Design 是 Web 端设计工具，不是 Chrome extension runtime，也不是仓库内 coding agent。它最适合做：

- 读取静态 HTML/CSS/JS 预览。
- 调整布局、层级、间距、字号、颜色、状态表达。
- 返回一个可下载 zip。

它不应该负责：

- 调试 Chrome extension API，例如 `chrome.tabs`、`chrome.storage`、`chrome.cookies`。
- 改登录态、token、后台 service worker。
- 设计新的后端 API。
- 直接判断真实数据库字段迁移。
- 大范围重写 `sidepanel.js`。

所以交付给 Claude Design 的包必须是“Web 可预览”的，而不是完整 Chrome 插件工程。它只需要打开 `index.html` 或 `loom-extension/preview/sidepanel-preview.html` 看状态板，然后改视觉文件。

## 最佳往返方式

为了让我从 Claude Design 下载回来的 zip 能最好复原，请按这个协议约束它：

1. 保持目录结构，不要把文件拍平成一层。
2. 优先改 CSS，其次改 HTML 模板；尽量不要改 JS 逻辑。
3. 如果必须改 JS，只能改渲染模板字符串里的 class/布局，不改函数名、状态字段、接口路径、事件绑定。
4. 保留所有 `data-*` 属性、`id`、storage key、API 路径。
5. 不新增 React/Vue/Tailwind/build step/CDN。
6. 回传 zip 必须包含 `CLAUDE_DESIGN_CHANGELOG.md`。
7. 如果它要新增文件，只能放在 `loom-extension/sidepanel/`、`loom-extension/options/` 或 `loom-extension/styles/`，并在 changelog 说明。

最理想的返回结果是：我解压后可以直接对比 `loom-extension/sidepanel/*.css|html|js`、`loom-extension/options/*.css|html|js`，把视觉 diff 合回真实插件。

## 给 Claude Design 的硬性约束

### 可以改

- `loom-extension/sidepanel/sidepanel.css`
- `loom-extension/options/options.css`
- `loom-extension/preview/sidepanel-preview.html`
- `sidepanel.js` 中纯 HTML 模板字符串的布局层级和 class 命名，但前提是保留所有绑定属性。
- `options.html` 的视觉结构和文案。

### 谨慎改

- `loom-extension/sidepanel/sidepanel.js`
- `loom-extension/options/options.js`

只能改展示函数附近的 HTML，不要改鉴权、接口、Chrome API、storage key、保存 payload。

### 禁止改

- `manifest.json`
- `background/service-worker.js`
- `content/*.js`
- `icons/*`
- 任何 `DEFAULT_API_BASE`、`TOKEN_KEY`、`API_BASE_KEY`、`LEGACY_KEY_MAP`
- 所有 API 路径：`/api/bootstrap`、`/api/fields`、`/api/products`、`/api/demands`、`/api/*/parse-raw`
- 所有 `data-key`、`data-open-tag-picker`、`data-toggle-tag`、`data-value`、`data-single`、`data-tag-query`、`data-field-select`、`data-list-*` 属性

## Claude Design 回传格式

请它只回传一个 zip，结构必须保持：

```txt
index.html
CLOUD_DESIGN_README.md
ROUNDTRIP_CONTRACT.json
loom-extension/
  sidepanel/
    sidepanel.html
    sidepanel.css
    sidepanel.js
  options/
    options.html
    options.css
    options.js
  preview/
    sidepanel-preview.html
  styles/
    design-tokens.css
```

并附一份：

```txt
CLAUDE_DESIGN_CHANGELOG.md
```

Changelog 必须列：

- 改了哪些文件。
- 改了哪些 class。
- 是否改了任何 `data-*` 属性。
- 是否改了任何 API 路径。
- 是否改了任何 storage key。
- 是否新增外部资源或 CDN。

验收线：如果 Changelog 里出现“改了 API 路径 / storage key / 删除 data-*”，这版不能直接合并。

## 设计验收

Claude Design 优化后的插件需要满足：

- 390px 宽 side panel 下文本不挤压、不重叠。
- 登录、待采集、竞品采集、需求采集、AI 整理中、保存成功、设置页都有可视状态。
- 字段区可以容纳新增 `主机 host`。
- 多选字段 chip 较多时可换行，不撑爆面板。
- 选择器弹层不会被底部按钮遮住。
- Options 页明确告诉用户：字段 schema 管理在 Web 端 Settings。

## 风险

- 最大风险是 Claude Design 把真实插件改成静态原型，导致 Chrome API、登录态、保存流程断掉。
- 第二风险是它重命名或删除 `data-*` 属性，事件委托会失效。
- 第三风险是它把字段写死成 `brand/category`，导致 schema 化后又要重画。

所以交付包只给插件前端可视层，不给后台脚本和 content scripts；设计可以动皮肤和布局，但运行契约必须锁住。
