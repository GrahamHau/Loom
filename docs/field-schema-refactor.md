# 字段系统重构方案 — 竞品库 / 灵感库

> 状态：方案设计中  
> 作者：Claude + Graham 协作  
> 关联实体：competitor（竞品库 / Lens）、inspiration（灵感库 / Spark）

---

## 1. 背景与问题

当前所有标签数据都存在 `settings.tag_groups` 里，是一个扁平数组：

```js
[
  { key: "competitor_brands", name: "竞品品牌", tone: "outline", tags: [...] },
  { key: "camera_brands",     name: "主机品牌", tone: "outline", tags: [...] },
  { key: "product_categories",name: "产品品类", tone: "default", tags: [...] },
  // ... 7 组
]
```

**核心问题**：
1. **概念混乱**：「字段」和「选项库」搅在一起。一个 `key` 既代表 product 上的属性（如 `brand`），又是 tag 选项的容器。
2. **隐藏的死配置**：`camera_brands`（主机品牌）已经定义在 tag-config 里，但**竞品详情页根本没用上**——只接入了品牌、品类、自定义标签三个字段。
3. **字段不可扩展**：用户只能新增 tag 选项，不能新增字段本身。
4. **三类字段没分层**：固定字段（标题/价格）、官方标签字段、用户自定义标签字段混在一个数组里，没区分。
5. **归属不清**：同一个字段在不同实体（竞品 vs 灵感）下的可用性没有显式表达。

---

## 2. 新的数据模型

### 2.1 字段定义 — `settings.fields`

从 `tag_groups` 演进到统一的字段数组。每个字段同时携带：定义、归属、选项库。

```js
settings.fields = [
  // ─── 官方字段（official: true，不可删，但可改归属/选项）───
  {
    key: "brand",            // 唯一 ID
    name: "品牌",
    tone: "outline",         // 颜色：default / outline / accent / success / warn / danger
    multi: true,             // true=多选，false=单选
    official: true,
    entities: ["competitor"],// 归属：能挂到哪些实体
    options: ["Ulanzi", "DJI", "Insta360", "SmallRig", "NEEWER", ...]
  },
  {
    key: "host",             // ← 新增的"主机"字段
    name: "主机",
    tone: "outline",
    multi: false,
    official: true,
    entities: ["competitor"],
    options: ["Pocket 3", "Pocket 4", "Pocket 4 Pro", "Pocket 5",
              "Insta Luna", "Insta Ace Pro", "Insta GO 3",
              "iPhone 15 Pro", "iPhone 15 Pro Max", "iPhone 16 Pro",
              "Sony α7 IV", "Canon EOS R5", ...]
  },
  {
    key: "category", name: "品类", tone: "default", multi: true,
    official: true, entities: ["competitor"],
    options: ["灯光", "稳定器", "三脚架", "镜头", "麦克风", ...]
  },
  {
    key: "scenarios", name: "使用场景", tone: "accent", multi: true,
    official: true,
    entities: ["competitor", "inspiration"],  // ← 双实体共用
    options: ["Vlog/自拍", "直播/带货", "短视频创作", ...]
  },
  {
    key: "painpoints", name: "用户痛点", tone: "danger", multi: true,
    official: true,
    entities: ["competitor", "inspiration"],
    options: [...]
  },
  {
    key: "innovation", name: "创新类型", tone: "success", multi: false,
    official: true, entities: ["inspiration"],
    options: ["技术创新", "使用方式创新", "形态创新", "场景拓展", ...]
  },

  // ─── 用户自定义字段（official: false，可删可改）───
  {
    key: "u_<uuid>", name: "目标人群", tone: "outline", multi: true,
    official: false,
    entities: ["competitor"],
    options: ["创作者", "摄影爱好者"]
  }
]
```

**关键设计**：
- **`entities` 数组**：表达字段归属，一个字段可以归属多个实体（如"使用场景"）。
- **`official` 标记**：区分官方字段和用户自定义字段，决定删除权限。
- **统一结构**：官方和自定义字段用同一个数据结构，前端按 `official` 字段差异化渲染。

### 2.2 实体上的值 — `tag_values`

product / demand 实体新增 `tag_values: Record<fieldKey, string[]>`，存所有标签字段的值：

```js
product = {
  id, title, platforms, price, ...   // 固定字段（不变）
  tag_values: {
    brand:      ["Godox"],
    host:       ["Pocket 3"],         // ← 新增
    category:   ["灯光"],
    scenarios:  ["室内棚拍", "Vlog/自拍"],
    painpoints: [],
    u_<uuid>:   ["创作者"]
  }
}

demand = {
  id, title, source, url, ...
  tag_values: {
    innovation: ["技术创新"],
    scenarios:  [...],
    painpoints: [...]
  }
}
```

---

## 3. UI 方案

### 3.1 详情页字段渲染

#### 布局结构

```
┌─ Lens 竞品详情面板 ──────────────────────────┐
│ [固定字段区]                                  │
│   标题 / 价格 / 评分 / 月销 / 平台卡片        │
├──────────────────────────────────────────────┤
│ [官方标签字段区] — 2 列网格                  │
│   品牌 [Godox ×]      主机 [Pocket 3]        │
│   品类 [灯光 ×]                               │
│   使用场景 [室内棚拍 × Vlog ×]               │
│   用户痛点 [无]                               │
├──────────────────────────────────────────────┤
│ [用户自定义字段区] — 同样网格                │
│   ✨ 目标人群 [创作者 ×]              ⋯      │ ← hover 出现操作菜单
│                                              │
│   [+ 添加字段]                               │ ← 点击弹 popover
├──────────────────────────────────────────────┤
│ [富文本字段] 卖点 / 差评                      │
└──────────────────────────────────────────────┘
```

#### 官方 vs 自定义视觉差异

| 维度       | 官方字段                | 自定义字段                       |
| ---------- | ----------------------- | -------------------------------- |
| 图标       | `tag`（灰色）           | `sparkles`（accent 色）          |
| Label 颜色 | `var(--text-2)`         | `var(--text-2)` + 灰色"自定义"chip |
| 操作菜单   | 无                      | hover 出现 `⋯`：改名 / 删除      |
| 顺序       | 固定（按 schema 顺序）  | 用户可拖动调序                   |

### 3.2 "+ 添加字段" Popover

详情页底部按钮，点击弹出：

```
┌─ 添加字段 ─────────────────┐
│ [🔍 搜索字段名]             │
├────────────────────────────┤
│ 设置里已定义、未挂载的字段： │
│                            │
│  ⊕ 目标人群    多选 · 灰色  │ ← 点击直接挂到当前实体
│  ⊕ 价格区间    单选 · 默认  │
│  ⊕ 适用季节    多选 · 灰色  │
│                            │
├────────────────────────────┤
│ → 去设置里新建字段          │ ← 跳到 Settings 字段管理
└────────────────────────────┘
```

**两种空态**：
- **有可挂载字段**：列出 Settings 里 `entities` 不含当前实体的所有字段，点一下立即把当前实体加入 `entities` 数组，详情页同步出现该字段，光标自动落进去。
- **列表为空**：显示空态文案"还没有可添加的字段" + 直达 Settings 的按钮。

### 3.3 Settings 字段管理页

重做现有的"标签库"为"标签与字段"，分 tab 组织：

```
┌─ 标签与字段 ─────────────────────────────────────────┐
│  [Tab: 竞品库 (6)]  [Tab: 灵感库 (3)]  [Tab: 所有字段] │
├──────────────────────────────────────────────────────┤
│  官方字段 (5)                                         │
│  ┌──────────────────────────────────────────────┐    │
│  │ 品牌  · 多选 · 灰色                          │    │
│  │ 归属：☑ 竞品库  ☐ 灵感库                     │    │
│  │ 选项 (14)                                    │    │
│  │ [Ulanzi ×] [DJI ×] [Insta360 ×] [+ 添加]    │    │
│  └──────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────┐    │
│  │ 主机  · 单选 · 灰色            [批量导入]    │    │
│  │ 归属：☑ 竞品库  ☐ 灵感库                     │    │
│  │ 选项 (12)                                    │    │
│  │ [Pocket 3 ×] [Pocket 4 ×] [+ 添加]          │    │
│  └──────────────────────────────────────────────┘    │
│  ... 其他官方字段                                     │
│                                                      │
│  用户自定义字段 (1)                                  │
│  ┌──────────────────────────────────────────────┐    │
│  │ 目标人群 · 多选 · 灰色      [改名][删除]     │    │
│  │ 归属：☑ 竞品库  ☑ 灵感库                     │    │
│  │ 选项 (2)                                     │    │
│  │ [创作者 ×] [摄影爱好者 ×] [+ 添加]          │    │
│  └──────────────────────────────────────────────┘    │
│                                                      │
│  [+ 新建字段]                                        │
└──────────────────────────────────────────────────────┘
```

**规则**：
- 官方字段：不显示"删除"按钮；"归属"复选框可改，但至少要勾一个。
- 自定义字段：可改名、可改 tone、可改归属、可删除。
- "+ 新建字段"弹小型 modal：字段名 / 单选或多选 / tone / 归属（多选复选框，至少勾一个）。
- Tab 切换只影响显示过滤，所有字段在一个数据源里。

### 3.4 工作流示例

#### 场景 A — Lazy add（详情页发现要加新字段）

1. Lens 某产品详情页 → 点"+ 添加字段"
2. Popover 显示当前未挂的字段 → 都不合适
3. 点"去设置里新建字段" → 跳到 Settings
4. 创建"目标人群"字段，归属勾"竞品库" → 保存
5. 回 Lens 详情页（或保留 popover 状态）→ "+ 添加字段"看到"目标人群" → 挂载
6. 所有 Lens 产品出现"目标人群"字段

#### 场景 B — Eager add（在 Settings 配置好再用）

1. Settings → 标签与字段 → "+ 新建字段" → 勾选"归属：竞品库" → 保存
2. 回 Lens 详情页 → 字段**自动出现**（不需要再点"+ 添加字段"）

**核心原则**：Settings 里勾选"归属"就直接生效。详情页的"+"只解决两种情况：
- 字段已在 Settings 存在但未勾当前实体
- 用户心智习惯在详情页操作，不想跳出去

---

## 4. 后端逻辑（给 Codex 的简要列表）

### 4.1 数据迁移

| 旧字段                  | 新字段                              |
| ----------------------- | ----------------------------------- |
| `product.brand`         | `product.tag_values.brand[]`        |
| `product.category`      | `product.tag_values.category[]`     |
| `product.tags`          | `product.tag_values.custom_tags[]`  |
| `demand.innovation`     | `demand.tag_values.innovation[]`    |
| `demand.scenarios`      | `demand.tag_values.scenarios[]`     |
| `demand.painpoints`     | `demand.tag_values.painpoints[]`    |
| `settings.tag_groups`   | `settings.fields`                   |

迁移脚本：读取老字段 → 写入 `tag_values` → 老字段保留若干版本作兼容。

### 4.2 API

```
GET    /api/fields?entity=competitor        # 返回该实体启用的字段（entities 数组包含 competitor）
GET    /api/fields/catalog                  # 返回全部字段（Settings 管理用）
POST   /api/fields                          # 新建自定义字段
PATCH  /api/fields/:key                     # 改名 / tone / multi / entities
DELETE /api/fields/:key                     # 删除（仅 official: false）
POST   /api/fields/:key/options             # 加选项
DELETE /api/fields/:key/options/:value      # 删选项
```

**注意**：详情页"+ 添加字段"调用 `PATCH /api/fields/:key`，把当前实体加入 `entities` 数组即可，不需要新 API。

### 4.3 Seed 默认值

在 `server/tag-config.js` 重命名为 `field-config.js`，导出 `DEFAULT_FIELDS`，按上面的数据结构 seed。重点：

- 新增 `host` 字段，options 给一份合理初始列表（Pocket 3/4/4 Pro/5、Insta Luna/Ace、iPhone Pro 系列、α7 IV、R5 等）。
- 旧 `camera_brands`（主机品牌）保留，作为另一个字段（如"主机品牌"）或直接合并到 `host`。建议：合并，避免重复。
- `competitor_brands` 改 key 为 `brand`，更短。

---

## 5. 实施节奏

建议分两阶段，避免一次性改动太大。

### Phase 1 — 最小可见改动（先做）

只加"主机"字段，让用户先看到效果。**不动数据模型**。

- ✅ 后端：`DEFAULT_TAG_GROUPS` 里的 `camera_brands` 改名为"主机"，options 替换为 Pocket/Insta/iPhone/α7/R5 等真实型号。
- ✅ 前端：竞品详情页加一个 `MultiSelectField`，`fieldKey="camera_brands"`, `single`。
- ✅ Settings 标签页同步加入"主机"选项管理。
- 耗时预估：1-2 小时

### Phase 2 — 完整字段系统重构

- 后端：拆数据模型、迁移、加自定义字段 CRUD、API 新增
- 前端：详情页改为 schema 驱动渲染、加"+ 添加字段"popover、Settings 重做
- 数据迁移测试
- 耗时预估：2-3 天

---

## 6. 未决问题

1. **删除自定义字段时，已填的值怎么处理？** 提议：删字段时弹确认"将永久删除该字段及 N 条记录里的值"，确认后软删除 30 天（可恢复）。
2. **重名字段允许吗？** 提议：同一个 entity 下不允许重名。
3. **自定义字段顺序怎么持久化？** 提议：`settings.fields` 数组本身的顺序即显示顺序，拖拽时更新数组顺序。
4. **官方字段允许改名吗？** 提议：允许，但保留原 key 作为内部引用。
5. **字段总数上限？** 提议：每个实体最多 20 个字段，避免详情页过长。

---

## 7. 风险评估

| 风险                         | 缓解措施                                        |
| ---------------------------- | ----------------------------------------------- |
| 数据迁移出错导致用户数据丢失 | 迁移前自动备份；保留老字段一段时间做双写        |
| 详情页字段过多导致视觉混乱   | 默认折叠空字段；超过 N 个字段分组               |
| 用户混淆"字段"和"选项"概念   | UI 文案统一用"字段"和"选项"两个词，配示例说明 |
| Schema 化后性能问题          | `settings.fields` 整体加载，前端缓存即可        |
