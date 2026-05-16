# Loom RAG / MRD / PRD 并行实施设计

日期：2026-05-17
状态：Approved Design
范围：第一阶段可实施闭环，不覆盖最终全部企业化形态

## 1. 目标

把 Loom 从「采集和整理工具」推进到一个能真实落地的产品知识工作流：

```text
Project / Document / Knowledge 统一模型
→ 飞书文档或复制粘贴导入
→ 模板标准化
→ Knowledge Source / Chunk / Pack
→ RAG 问答
→ MRD 草稿
→ 硬件 PRD 草稿
→ 权限发布
→ 飞书 Bot / Base / Docs 出口
```

第一阶段不是做完整知识中台，而是跑通一条真实 Demo：

```text
创建项目
→ 导入公司已有飞书 PRD / MRD
→ 关联 Loom 现有竞品、需求、Stream 内容
→ 生成 Knowledge Pack
→ RAG 可问答且有引用
→ 生成 MRD 草稿
→ 生成硬件 PRD 草稿
→ 设置权限
→ 导出供应商版 PRD
→ 飞书 Bot 可问答，答不上来生成 KnowledgeGap
```

## 2. 非目标

第一阶段明确不做：

- 不把飞书 Bot 当作对话大脑。飞书 Bot 只是接口。
- 不默认使用 Hermes。Hermes 仅作为未来多工具编排可选项。
- 不一开始接重型向量库或 pgvector。
- 不一开始强绑定 Dify / RAGFlow / FastGPT。
- 不下载飞书文档里的图片和附件。
- 不做默认 OCR 或视觉理解。
- 不把飞书 Base 当主数据库。
- 不把 PRD 做成软件互联网式 MVP / Backlog / Sprint 文档。
- 不把产品类型写死在代码里。

## 3. 核心设计原则

### 3.1 统一模型

不要按「旧项目 / 新项目」建表。所有项目统一叫 `Project`。

不要按 PRD / MRD 分裂成两套完全不同表。所有文档统一叫 `Document`，PRD / MRD 是 `doc_type`。

不要让 RAG 直接读取业务表自由发挥。所有可检索内容先进入统一知识索引：

```text
Project
Document
Knowledge Source
Knowledge Chunk
Knowledge Pack
```

### 3.2 RAG 是派生层，不是主库

现有 `products / demands / research / news_items` 继续作为业务主数据。RAG 数据是可重建的派生索引。

如果 RAG 索引坏了，可以删除并重建，不伤主数据。

### 3.3 权限先于检索

RAG 不能先搜全库再让 AI 判断能不能说。必须先过滤：

```text
workspace
project/team/user/role
rag_enabled
bot_enabled
supplier_visible
sales_visible
external_safe
```

只有有权限的 chunk 才能进入检索和 LLM 上下文。

### 3.4 PRD 是硬件产品定义文档

PRD 面向摄影配件 / 硬件产品，不使用软件 MVP 语言。它关注：

- 功能属性。
- 结构要求。
- 材料工艺。
- ID / CMF。
- 电子 / 固件 / 认证 / 测试。
- 包装需求。
- 供应商交付。
- 质量验收。
- 内部风险。

具体模块由公司配置的产品类型模板决定，不在代码里写死。

## 4. 第一阶段数据模型

### 4.1 projects

统一表示所有项目，包括过去、当前、未来项目。

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT DEFAULT '',
  category TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  description TEXT DEFAULT '',
  owner_user_id TEXT,
  access_policy_json TEXT DEFAULT '{}',
  metadata_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

`status` 可选值：

```text
planned | active | paused | archived
```

### 4.2 documents

统一表示 PRD、MRD、报告、规格书、会议纪要、销售资料等。

```sql
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  project_id TEXT,
  title TEXT NOT NULL,
  doc_type TEXT NOT NULL DEFAULT 'other',
  status TEXT NOT NULL DEFAULT 'draft',
  template_id TEXT,
  source_uri TEXT DEFAULT '',
  storage_key TEXT DEFAULT '',
  mime_type TEXT DEFAULT '',
  version TEXT DEFAULT '',
  author TEXT DEFAULT '',
  owner_user_id TEXT,
  content_text TEXT DEFAULT '',
  content_json TEXT DEFAULT '{}',
  assets_json TEXT DEFAULT '[]',
  access_policy_json TEXT DEFAULT '{}',
  visibility TEXT NOT NULL DEFAULT 'private',
  rag_enabled INTEGER NOT NULL DEFAULT 0,
  bot_enabled INTEGER NOT NULL DEFAULT 0,
  external_safe INTEGER NOT NULL DEFAULT 0,
  supplier_visible INTEGER NOT NULL DEFAULT 0,
  sales_visible INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

`doc_type` 可选值：

```text
prd | mrd | report | spec | meeting_note | faq | sales_doc | other
```

`status` 可选值：

```text
draft | reviewing | published | archived
```

### 4.3 document_templates

定义文档标准化模板。模板由公司配置，不写死具体产品类型。

```sql
CREATE TABLE document_templates (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  name TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT 'v1',
  sections_json TEXT NOT NULL DEFAULT '[]',
  extraction_rules_json TEXT DEFAULT '{}',
  chunk_rules_json TEXT DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

模板示例：

```json
{
  "sections": [
    { "key": "product_definition", "title": "产品定义", "aliases": ["项目背景", "产品概述"], "required": true },
    { "key": "functional_attributes", "title": "功能属性", "aliases": ["功能需求", "功能定义"], "required": true },
    { "key": "structure", "title": "结构要求", "aliases": ["结构设计", "机构要求"], "required": false },
    { "key": "packaging", "title": "包装需求", "aliases": ["包装", "包装设计"], "required": false },
    { "key": "testing", "title": "测试要求", "aliases": ["测试", "验收标准"], "required": false },
    { "key": "open_questions", "title": "待确认问题", "aliases": ["风险", "问题"], "required": true }
  ]
}
```

### 4.4 product_type_templates

产品类型由公司配置。Loom 实现模板引擎，不预设固定产品类型。

```sql
CREATE TABLE product_type_templates (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT DEFAULT '',
  attributes_schema_json TEXT DEFAULT '[]',
  enabled_modules_json TEXT DEFAULT '[]',
  required_roles_json TEXT DEFAULT '[]',
  supplier_visible_modules_json TEXT DEFAULT '[]',
  sales_visible_modules_json TEXT DEFAULT '[]',
  required_fields_json TEXT DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(workspace_id, code)
);
```

这个表用于 PRD Builder 判断应该出现哪些模块、哪些角色参与、哪些内容可导出。

包装需求是可配置模块之一，不写死到某个产品类型。

### 4.5 document_imports

记录导入任务。

```sql
CREATE TABLE document_imports (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  project_id TEXT,
  import_method TEXT NOT NULL,
  doc_type TEXT NOT NULL DEFAULT 'other',
  template_id TEXT,
  title TEXT DEFAULT '',
  source_uri TEXT DEFAULT '',
  raw_blocks_json TEXT DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT DEFAULT '',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

`import_method`：

```text
feishu_doc | paste
```

P0 不做图片下载和文件上传。后续可扩展 `upload | url | folder`。

### 4.6 knowledge_sources

RAG 可引用来源。

```sql
CREATE TABLE knowledge_sources (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  project_id TEXT,
  title TEXT NOT NULL,
  url TEXT DEFAULT '',
  summary TEXT DEFAULT '',
  raw_text TEXT DEFAULT '',
  metadata_json TEXT DEFAULT '{}',
  access_policy_json TEXT DEFAULT '{}',
  visibility TEXT NOT NULL DEFAULT 'private',
  rag_enabled INTEGER NOT NULL DEFAULT 0,
  bot_enabled INTEGER NOT NULL DEFAULT 0,
  external_safe INTEGER NOT NULL DEFAULT 0,
  supplier_visible INTEGER NOT NULL DEFAULT 0,
  sales_visible INTEGER NOT NULL DEFAULT 0,
  confidence TEXT NOT NULL DEFAULT 'raw',
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(workspace_id, source_type, source_id)
);
```

`source_type`：

```text
document | project | product | demand | news | research | manual | external_report
```

### 4.7 knowledge_chunks

真正被 RAG 检索的切片。

```sql
CREATE TABLE knowledge_chunks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  project_id TEXT,
  chunk_type TEXT NOT NULL,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  source_refs_json TEXT DEFAULT '[]',
  tags_json TEXT DEFAULT '[]',
  metadata_json TEXT DEFAULT '{}',
  access_policy_json TEXT DEFAULT '{}',
  visibility TEXT NOT NULL DEFAULT 'private',
  rag_enabled INTEGER NOT NULL DEFAULT 0,
  bot_enabled INTEGER NOT NULL DEFAULT 0,
  external_safe INTEGER NOT NULL DEFAULT 0,
  supplier_visible INTEGER NOT NULL DEFAULT 0,
  sales_visible INTEGER NOT NULL DEFAULT 0,
  confidence TEXT NOT NULL DEFAULT 'raw',
  content_hash TEXT NOT NULL,
  indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(source_id) REFERENCES knowledge_sources(id) ON DELETE CASCADE
);
```

`chunk_type`：

```text
section | fact | quote | spec | requirement | decision | risk | faq | insight | table
```

FTS 表：

```sql
CREATE VIRTUAL TABLE knowledge_chunks_fts USING fts5(
  chunk_id UNINDEXED,
  workspace_id UNINDEXED,
  title,
  text,
  tags
);
```

### 4.8 knowledge_packs

一次 RAG / MRD / PRD 任务使用的资料包。

```sql
CREATE TABLE knowledge_packs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  project_id TEXT,
  title TEXT NOT NULL,
  pack_type TEXT NOT NULL,
  input_json TEXT DEFAULT '{}',
  coverage_score REAL DEFAULT 0,
  open_questions_json TEXT DEFAULT '[]',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE knowledge_pack_sources (
  pack_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  role TEXT DEFAULT 'supporting',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(pack_id, source_id)
);

CREATE TABLE knowledge_pack_chunks (
  pack_id TEXT NOT NULL,
  chunk_id TEXT NOT NULL,
  rank INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(pack_id, chunk_id)
);
```

`pack_type`：

```text
project | research | category | product_line | manual
```

### 4.9 knowledge_gaps

答不上来的问题或资料缺口。

```sql
CREATE TABLE knowledge_gaps (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  project_id TEXT,
  pack_id TEXT,
  question TEXT NOT NULL,
  reason TEXT NOT NULL,
  related_source_ids_json TEXT DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'open',
  owner_user_id TEXT,
  answer_document_id TEXT,
  answer_chunk_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

`status`：

```text
open | in_progress | answered | ignored
```

### 4.10 knowledge_query_logs

RAG 问答审计和调试。

```sql
CREATE TABLE knowledge_query_logs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT,
  project_id TEXT,
  pack_id TEXT,
  channel TEXT NOT NULL,
  audience TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT DEFAULT '',
  mode TEXT NOT NULL,
  confidence REAL DEFAULT 0,
  citations_json TEXT DEFAULT '[]',
  matched_chunk_ids_json TEXT DEFAULT '[]',
  gap_ids_json TEXT DEFAULT '[]',
  latency_ms INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

`channel`：

```text
web | feishu_private | feishu_group
```

`audience`：

```text
internal | supplier | sales_external
```

`mode`：

```text
answered | partial | refused
```

## 5. 导入与标准化

### 5.1 P0 导入范围

支持：

- 飞书文档链接导入文本和表格。
- 复制粘贴导入。
- 图片/附件占位。
- PRD/MRD 模板标准化。

暂不支持：

- 图片下载。
- 图片 OCR。
- 扫描 PDF。
- 批量飞书文件夹。
- 文件上传。
- 用户级复杂 delegated permission。

### 5.2 飞书文档读取路径

主路径：

```text
Loom server
→ 飞书 OpenAPI / Node SDK
→ 用企业应用 token 读取文档文本和表格
→ 转 raw_blocks
→ 标准化
```

兜底：

```text
用户复制飞书文档正文
→ 粘贴到 Loom
→ paste parser 转 raw_blocks
→ 标准化
```

CLI 只作为管理员调试 fallback，不作为长期主路径。

### 5.3 飞书权限

P0 使用公司应用模式：

- 只有 admin / PM 可以导入。
- 文档必须授权给 Loom 飞书应用或 Bot。
- Loom 后端用应用 token 读取。
- 导入后由 Loom 权限管理。

读取失败时提示：

```text
无法读取飞书文档。
请确认：
1. 文档链接正确
2. Loom 飞书应用有云文档读取权限
3. 文档已授权给 Loom Bot / 应用
4. 或改用复制粘贴导入
```

### 5.4 raw_blocks

飞书或粘贴内容先转成块：

```json
[
  {
    "block_id": "heading_1",
    "type": "heading",
    "level": 2,
    "text": "功能需求"
  },
  {
    "block_id": "paragraph_1",
    "type": "paragraph",
    "text": "产品需支持单手快拆。"
  },
  {
    "block_id": "table_1",
    "type": "table",
    "rows": [["功能", "要求"], ["快拆", "单手操作"]]
  },
  {
    "block_id": "image_1",
    "type": "image_placeholder",
    "text": "[图片已跳过，请在原飞书文档查看]",
    "metadata": { "reason": "p0_skip_binary" }
  }
]
```

### 5.5 标准化输出

```json
{
  "template_id": "tpl_prd_v1",
  "normalized_sections": [
    {
      "key": "functional_attributes",
      "title": "功能属性",
      "content": "产品需支持单手快拆。",
      "tables": [],
      "source_block_refs": ["paragraph_1"],
      "confidence": 0.82,
      "access_policy": {
        "visibility": "project_team",
        "rag_enabled": false,
        "bot_enabled": false,
        "supplier_visible": false,
        "sales_visible": false
      }
    }
  ],
  "unmatched_sections": [],
  "image_placeholders": [
    {
      "block_id": "image_1",
      "section_key": "structure",
      "note": "图片未导入，请查看原飞书文档"
    }
  ]
}
```

## 6. RAG 问答设计

### 6.1 查询流程

```text
POST /api/knowledge/query
→ 识别用户、角色、团队、channel、audience
→ 按权限过滤可访问 chunk
→ FTS 检索 pack 内或项目内 chunks
→ 按来源和可信度重排
→ top chunks 交给 LLM
→ LLM 只基于 chunks 回答
→ 返回 answer + citations + confidence + gaps
→ 写 knowledge_query_logs
```

### 6.2 API

```text
POST /api/knowledge/packs/build
GET /api/knowledge/packs/:id
POST /api/knowledge/query
GET /api/knowledge/query-logs
POST /api/knowledge/evaluate
```

`POST /api/knowledge/query` 输入：

```json
{
  "question": "这份 PRD 定义了哪些功能？",
  "pack_id": "pack_x",
  "channel": "web",
  "audience": "internal"
}
```

输出：

```json
{
  "answer": "这份 PRD 定义了三个核心功能...",
  "confidence": 0.78,
  "citations": [
    { "source_id": "src_1", "chunk_id": "chk_1", "title": "功能属性", "url": "https://..." }
  ],
  "gaps": [],
  "mode": "answered"
}
```

### 6.3 回答规则

- 有来源：回答并带引用。
- 来源不足：部分回答，标明不确定，并创建 gap。
- 无来源：拒答，并创建 gap。
- 群聊：更保守，只允许 bot_enabled + external_safe 或明确开放内容。
- 供应商场景：只能使用 supplier_visible 内容。
- 销售场景：只能使用 sales_visible 或 external_safe 内容。

### 6.4 第一阶段检索

第一阶段使用 SQLite FTS5，不上 embedding。

排序权重：

```text
published document > reviewed document > product/demand > news/raw
pm_confirmed > ai_extracted > raw
pack 内 chunk > pack 外同项目 chunk
```

## 7. MRD Studio

### 7.1 定位

MRD 是结构化市场判断，不是 AI 作文。

输入：

```text
Project + Knowledge Pack
```

输出：

```text
documents.doc_type = mrd
documents.content_json.normalized_sections
```

### 7.2 P0 章节

- 市场背景。
- 目标用户与场景。
- 需求与痛点。
- 竞品格局。
- 机会判断。
- 风险与不确定性。
- 建议方向。
- 待确认问题。

每节必须有：

- `source_refs` 或 `open_questions`。
- `confidence`。
- `status`。

### 7.3 API

```text
POST /api/documents/mrd/draft
POST /api/documents/:id/sections/:key/regenerate
PATCH /api/documents/:id/sections/:key
POST /api/documents/:id/publish
POST /api/documents/:id/export/feishu
```

### 7.4 发布后索引

MRD 发布后：

```text
documents(doc_type=mrd)
→ knowledge_sources(source_type=document)
→ knowledge_chunks(chunk_type=section)
→ RAG 可引用
```

## 8. PRD Builder

### 8.1 定位

PRD 是硬件 / 摄影配件产品定义文档，服务内部评审、供应商、结构、电子、认证、供应链和测试。

不要使用：

- MVP。
- Backlog。
- Sprint。
- 软件用户故事。

### 8.2 模块来源

PRD 模块由公司配置的 `product_type_templates` 和 `document_templates` 决定。

Loom 不写死具体产品类型。

可配置模块包括：

- 产品定义。
- 功能属性。
- 结构要求。
- 材料工艺。
- ID / CMF。
- 电子要求。
- 光学 / 照明。
- 散热。
- 固件 / 软件。
- 认证要求。
- 测试要求。
- 包装需求。
- 供应商交付。
- 内部风险。
- 待确认问题。

### 8.3 产品定义卡

创建 PRD 时填写：

- 产品名称。
- 产品类型模板。
- 一句话定义。
- 目标用户。
- 目标场景。
- 目标价格带。
- 关键约束。
- 明确不做。

### 8.4 内容结构

PRD 存在 `documents.content_json`：

```json
{
  "product_profile": {
    "product_type_template_id": "pt_x",
    "attributes": {}
  },
  "enabled_modules": ["product_definition", "functional_attributes", "structure", "packaging"],
  "required_review_roles": ["pm", "id", "structure", "supplier"],
  "sections": []
}
```

功能属性项示例：

```json
{
  "name": "一键快拆",
  "requirement": "用户可在单手操作下完成相机与支架的快速拆装",
  "implementation_hint": "可参考磁吸定位 + 机械锁止结构，最终结构由供应商评估",
  "priority": "must",
  "target_user_value": "减少拆装时间，提升拍摄切换效率",
  "source_refs": ["chunk_demand_1", "chunk_competitor_3"],
  "visibility": "internal",
  "supplier_visible": true,
  "status": "to_confirm"
}
```

### 8.5 API

```text
GET /api/product-type-templates
POST /api/product-type-templates
POST /api/documents/prd/draft
POST /api/documents/:id/export/supplier
POST /api/documents/:id/export/sales
```

### 8.6 验收

- 选择产品类型模板后，只生成该模板启用的模块。
- PRD 至少生成功能属性、结构/工艺/包装/测试等对应模块。
- 不需要的电子/认证/软件模块不会出现。
- 每条关键要求有 `source_refs` 或 `open_questions`。
- 供应商版不包含内部市场判断、竞品敏感来源、成本策略。

## 9. 权限设计

### 9.1 分层权限

```text
飞书文档权限 ≠ Loom 文档权限 ≠ RAG 可调用权限 ≠ 导出权限
```

导入后默认保守：

```text
visibility = private 或 project_team
rag_enabled = false
bot_enabled = false
supplier_visible = false
sales_visible = false
```

PM / admin 明确发布后，内容才进入 RAG 或导出。

### 9.2 access_policy_json

通用权限对象：

```json
{
  "visibility": "private",
  "allowed_roles": ["pm"],
  "allowed_users": [],
  "allowed_teams": [],
  "rag_enabled": false,
  "bot_enabled": false,
  "export_profiles": [],
  "external_safe": false,
  "supplier_visible": false,
  "sales_visible": false,
  "requires_owner_approval": true
}
```

文档、章节、source、chunk 都可以有 policy。

索引时：

```text
section.access_policy
→ knowledge_chunk.access_policy
```

### 9.3 PM 可控项

文档开放设置：

- 仅自己。
- 项目团队。
- 指定团队。
- 全公司内部。
- 供应商可见版本。
- 销售可见版本。

RAG 开放：

- 不进入 RAG。
- 仅项目团队 RAG 可检索。
- 指定团队 RAG 可检索。
- 全公司 Bot 可检索。

章节开放：

- 本章节不进 RAG。
- 本章节只内部可见。
- 本章节可给供应商版导出。
- 本章节可给销售版导出。

### 9.4 权限验收

- 导入一份 PRD 后，默认不能被 RAG 搜到。
- PM 开放给项目团队 RAG 后，只有项目团队能搜到。
- PM 把部分章节标记 `supplier_visible` 后，供应商版只导出这些章节。
- 成本策略章节不会进入供应商版或销售版。
- 飞书群聊 Bot 不能引用 private chunk。
- 指定团队外的人问同样问题，只能得到“当前无可访问资料”。

## 10. 飞书出口

### 10.1 飞书 Bot

飞书 Bot 只是入口：

```text
飞书消息
→ /api/bot/feishu/events
→ Loom Knowledge API
→ 卡片回复
```

卡片包含：

- 答案摘要。
- 引用来源。
- 可信度。
- 有帮助。
- 不准确。
- 转 PM 确认。
- 查看 Loom。

### 10.2 飞书 Base

只同步协作对象：

- Knowledge Gaps。
- PRD / MRD review tasks。
- Supplier questions。
- Standard answers / FAQ。

不同步：

- chunks。
- query logs。
- embeddings。

### 10.3 飞书 Docs

导出：

- 内部完整 MRD。
- 内部完整 PRD。
- 供应商版 PRD。
- 销售版说明。

导出后回写：

```text
documents.feishu_doc_url
documents.exported_at
documents.export_version
```

## 11. API 总表

### 项目和文档

```text
GET /api/projects
POST /api/projects
GET /api/documents
POST /api/documents
GET /api/documents/:id
PATCH /api/documents/:id
```

### 模板

```text
GET /api/document-templates
POST /api/document-templates
GET /api/product-type-templates
POST /api/product-type-templates
```

### 导入

```text
POST /api/document-imports/feishu
POST /api/document-imports/paste
GET /api/document-imports/:id
POST /api/document-imports/:id/retry
```

### Knowledge

```text
POST /api/knowledge/index
POST /api/knowledge/packs/build
GET /api/knowledge/packs/:id
POST /api/knowledge/query
GET /api/knowledge/query-logs
POST /api/knowledge/evaluate
```

### MRD / PRD

```text
POST /api/documents/mrd/draft
POST /api/documents/prd/draft
POST /api/documents/:id/sections/:key/regenerate
PATCH /api/documents/:id/sections/:key
POST /api/documents/:id/publish
POST /api/documents/:id/export/feishu
POST /api/documents/:id/export/supplier
POST /api/documents/:id/export/sales
```

### 飞书

```text
POST /api/bot/feishu/events
POST /api/knowledge/gaps/:id/sync-feishu
POST /api/documents/:id/sync-review-base
```

## 12. 文件边界

建议新增：

```text
server/knowledge-schema.js
server/knowledge-repository.js
server/document-import-service.js
server/document-template-service.js
server/knowledge-indexer.js
server/knowledge-pack-service.js
server/knowledge-retriever.js
server/knowledge-query-service.js
server/document-generation-service.js
server/prd-template-service.js
server/product-type-template-service.js
server/feishu-bot-service.js
server/feishu-doc-reader-service.js
server/feishu-doc-export-service.js
server/feishu-base-sync-service.js
```

前端第一阶段可先在现有 `src/legacy/screens.jsx` 内加入口，但如果页面变大，应拆到：

```text
src/legacy/knowledge/
src/legacy/documents/
src/legacy/projects/
```

## 13. 并行实施计划

### 线 1：知识地基

交付：

- Schema。
- Repository。
- Project / Document CRUD。
- Knowledge Source / Chunk。
- Knowledge Pack Builder。

验收：

- 能创建项目。
- 能创建文档。
- 能从 product / demand / news / research / document 生成 source/chunk。
- 能从项目生成 pack。

### 线 2：导入与标准化

交付：

- 飞书文档链接导入。
- 复制粘贴导入。
- raw_blocks。
- template normalization。
- 图片占位跳过。

验收：

- 飞书 PRD 能读文本和表格。
- 无权限时错误清楚。
- 复制粘贴兜底可用。
- 标准化后进入 chunks。

### 线 3：RAG 问答

交付：

- SQLite FTS5。
- 权限过滤。
- Query API。
- citations。
- KnowledgeGap。
- Query logs。

验收：

- 20 个问题测试。
- 至少 70% 能回答并带 citation。
- 无资料拒答。
- 权限过滤生效。

### 线 4：MRD Studio

交付：

- MRD draft generation。
- Section regenerate / edit。
- Publish re-index。
- Feishu Docs export。

验收：

- 生成 8 个章节。
- 每章有来源或待确认问题。
- 发布后进入 RAG。

### 线 5：PRD Builder

交付：

- Product type templates。
- 硬件 PRD draft generation。
- 权限版导出。
- 包装需求模块。

验收：

- 产品类型模板控制模块。
- 供应商版按权限过滤。
- 关键要求有来源或待确认问题。

### 线 6：飞书协作出口

交付：

- Bot event receiver。
- Base sync for gaps/review。
- Docs export。

验收：

- Bot 问答可用。
- Gap 同步 Base。
- PRD/MRD 导出 Docs。

## 14. 第一阶段 Demo 验收

用一个真实摄影配件项目：

1. 创建 Project。
2. 导入一份飞书 PRD。
3. 导入一份飞书 MRD。
4. 图片默认跳过。
5. 文本和表格按模板标准化。
6. 关联现有竞品、需求、Stream 内容。
7. 生成 Knowledge Pack。
8. Web 里问 10 个问题，有引用、有拒答。
9. 生成 MRD 草稿。
10. 生成硬件 PRD 草稿。
11. 设置部分章节 `supplier_visible`。
12. 导出供应商版 PRD。
13. 飞书 Bot 问问题，权限过滤生效。
14. 答不上来的问题进入 KnowledgeGap。

## 15. 风险和防线

### 飞书文档读不到

防线：

- 明确错误提示。
- 支持复制粘贴兜底。
- CLI 仅作为管理员调试。

### 导入变成一坨文本

防线：

- 必须先选模板。
- raw_blocks 标准化。
- unmatched_sections 保留未匹配内容。

### RAG 泄漏内部 PRD

防线：

- 导入后默认不进 RAG。
- section/chunk 级 access policy。
- 检索前过滤。

### PRD 变成软件文档

防线：

- 模板使用硬件产品语言。
- 禁止 MVP/backlog/sprint。
- 产品类型模板控制模块。

### VPS 磁盘不够

防线：

- P0 不下载图片。
- 只保存图片占位和飞书原链接。
- OCR / 图片解析后置。

## 16. 后续扩展

第二阶段可做：

- PostgreSQL + pgvector。
- RAGFlow / Dify / FastGPT adapter。
- 图片 OCR / 视觉结构化。
- 文件上传。
- 飞书空间批量导入。
- document_sections 独立表。
- knowledge_answers。
- 更细团队权限。
- PRD/MRD 飞书双向同步。

