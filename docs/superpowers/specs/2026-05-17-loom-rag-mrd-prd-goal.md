# Goal: Loom RAG / MRD / PRD 无人值守实施

状态：Ready for unattended execution
依据设计：`docs/superpowers/specs/2026-05-17-loom-rag-mrd-prd-parallel-design.md`

## 目标

持续实施直到第一阶段闭环完成：

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

执行时不要在每个 milestone 停下来等用户确认。除非遇到会破坏数据、删除生产数据、需要真实密钥、需要外部付费、或需要改变产品方向的决策，否则按本文件继续推进。

## 总原则

- 做最小必要改动，不重写现有 Loom 架构。
- 先服务端、测试、API，再做前端入口。
- 先 paste 导入跑通，再接飞书 OpenAPI。
- P0 不下载图片、不做 OCR、不接向量库。
- RAG 必须检索前权限过滤。
- PRD 是硬件/摄影配件产品定义文档，不使用 MVP/backlog/sprint 语言。
- 产品类型不写死，使用公司可配置模板。
- 飞书 Bot 是接口，不是对话大脑；不默认接 Hermes。
- 飞书 Base 是协作镜像，不是主库。
- 模型使用分层路由：便宜快模型做抽取/标准化/普通草稿，强模型做关键判断和审校，权限必须由代码控制。
- 如果旧字段兼容代码被触碰，顺手收敛，但不要做破坏性大迁移。

## 旧字段兼容清理规则

当前字段系统存在新旧双轨：

```text
settings.fields
settings.tag_groups
entity.tag_values
entity.brand/category/host/tags/scenarios/painpoints/innovation
legacyKey: competitor_brands / camera_brands / product_categories / innovation_types
```

无人值守实现期间，如果触碰相关代码，必须遵守：

- `settings.fields` 作为内部 canonical 字段定义。
- `settings.tag_groups` 只作为兼容输出和旧数据输入，不新增新的业务依赖。
- `tag_values` 作为多选/字段值 canonical 存储。
- `brand/category/host/tags/scenarios/painpoints/innovation` 保留为 UI/旧 API 兼容镜像。
- 新的 Project / Document / Knowledge 模型不要继续引入 `tag_groups` 风格字段。
- 新模板统一使用 `document_templates` 和 `product_type_templates`。
- 不新增 `legacy_doc`、`legacy_project`、`old_project`、`new_project` 这类命名。
- 如果发现字段兼容导致测试失败，优先补 normalization，不删除旧字段。

推荐触碰点：

```text
server/field-config.js
server/field-matcher.js
server/repository.js
src/legacy/screens.jsx
```

不要把字段兼容清理扩大成全站重构。

## Milestone 0: 安全基线

任务：

- 记录当前 `git status --short`。
- 不提交或回滚用户已有改动。
- 新增代码尽量拆模块，避免继续膨胀 `server/index.js` 和 `src/legacy/screens.jsx`。
- 使用 Node 22。

验证：

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm test -- server/index.test.js server/repository.test.js server/rss-service.test.js server/content-fetcher.test.js
```

如果因为已有工作区改动导致测试失败，先定位是否与本任务相关。无关则记录，不要回滚。

## Milestone 1: Schema + Repository

文件：

```text
server/db.js
server/knowledge-repository.js
server/knowledge-repository.test.js
server/seed.js
```

任务：

- 新增 `projects`。
- 新增 `documents`。
- 新增 `document_templates`。
- 新增 `product_type_templates`。
- 新增 `document_imports`。
- 新增 `knowledge_sources`。
- 新增 `knowledge_chunks`。
- 新增 `knowledge_chunks_fts`。
- 新增 `knowledge_packs`。
- 新增 `knowledge_pack_sources`。
- 新增 `knowledge_pack_chunks`。
- 新增 `knowledge_gaps`。
- 新增 `knowledge_query_logs`。
- 写 repository CRUD 和基础 normalize。
- seed 默认 PRD/MRD document template。
- seed 一个通用硬件 product type template，但不要把公司具体产品类型写死。

验收：

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm test -- server/knowledge-repository.test.js server/repository.test.js
```

## Milestone 2: 导入与标准化

文件：

```text
server/document-template-service.js
server/document-import-service.js
server/document-import-service.test.js
server/feishu-doc-reader-service.js
```

任务：

- 实现 paste 导入。
- 将文本转换为 `raw_blocks`。
- 实现 image placeholder，不下载图片。
- 实现 template normalization。
- 生成 `documents.content_json.normalized_sections`。
- 生成 `unmatched_sections`。
- 飞书 reader 先封装接口，真实 OpenAPI 可作为后续实现；P0 不因为飞书权限阻塞 paste 闭环。
- 导入后默认 `rag_enabled=false`、`bot_enabled=false`、`supplier_visible=false`、`sales_visible=false`。

API：

```text
POST /api/document-imports/paste
POST /api/document-imports/feishu
GET /api/document-imports/:id
POST /api/document-imports/:id/retry
```

验收：

- 粘贴 PRD 文本能生成 document。
- 图片占位不会写入文件。
- 模板匹配成功的内容进 normalized sections。
- 未匹配内容进入 unmatched sections。

## Milestone 3: Knowledge Index + Pack

文件：

```text
server/knowledge-indexer.js
server/knowledge-pack-service.js
server/knowledge-indexer.test.js
server/knowledge-pack-service.test.js
```

任务：

- `document → knowledge_source/chunks`。
- `product → knowledge_source/chunks`。
- `demand → knowledge_source/chunks`。
- `news_items → knowledge_source/chunks`。
- `research → knowledge_source/chunks`。
- 写入 `knowledge_chunks_fts`。
- 根据 project 或 research 生成 pack。
- 基于 content hash 跳过未变化内容。

验收：

- 一个项目 + 一份 document + products/demands/news 能生成 pack。
- FTS 能搜到功能、痛点、竞品名。
- 每个 chunk 能回到 source。

## Milestone 4: RAG Query Baseline

文件：

```text
server/knowledge-retriever.js
server/knowledge-query-service.js
server/knowledge-query-service.test.js
```

任务：

- 实现检索前权限过滤。
- SQLite FTS5 检索。
- 简单 rerank。
- 调用现有 `callLLM`，只传 filtered chunks。
- 增加模型路由：普通问答优先 fast model；高风险场景升级 strong model；没有 strong model 时标记 needs_review，不假装已审校。
- 返回 answer / citations / confidence / gaps / mode。
- 无资料或权限不足时 refused + KnowledgeGap。
- 写 `knowledge_query_logs`。

API：

```text
POST /api/knowledge/query
GET /api/knowledge/query-logs
POST /api/knowledge/evaluate
```

验收：

- 导入后默认搜不到。
- 开启 `rag_enabled` 后可被授权用户搜到。
- 无权限用户得到 refused。
- 回答必须带 citations。

## Milestone 5: MRD / PRD 草稿生成

文件：

```text
server/document-generation-service.js
server/prd-template-service.js
server/product-type-template-service.js
server/document-generation-service.test.js
```

任务：

- MRD 从 pack 生成 8 个章节。
- PRD 从 product type template + pack 生成硬件 PRD sections。
- PRD 禁止 MVP/backlog/sprint 语言。
- 包装需求作为可配置模块。
- 模型路由：非关键章节可用 fast model；机会判断、风险判断、结构/工艺/认证/测试/供应商交付建议使用 strong model 或进入 needs_review。
- 每节必须有 source_refs 或 open_questions。
- publish 后重新 index。

API：

```text
POST /api/documents/mrd/draft
POST /api/documents/prd/draft
POST /api/documents/:id/sections/:key/regenerate
PATCH /api/documents/:id/sections/:key
POST /api/documents/:id/publish
```

验收：

- MRD 生成 8 节。
- PRD 按产品类型模板生成模块。
- 不需要的模块不出现。
- 发布后 RAG 可引用。

## Milestone 6: 权限发布与导出

文件：

```text
server/document-access-service.js
server/feishu-doc-export-service.js
server/feishu-base-sync-service.js
```

任务：

- 更新 document / section access policy。
- section policy 继承到 chunk。
- 内部版 / 供应商版 / 销售版导出过滤。
- 导出权限由代码规则决定，不能让模型决定哪些内容可供应商/销售可见。
- Feishu Docs export P0 先生成 markdown/html payload，可后接真实 API。
- KnowledgeGap 同步 Base P0 先封装 service 接口，可后接真实 API。

API：

```text
POST /api/documents/:id/export/feishu
POST /api/documents/:id/export/supplier
POST /api/documents/:id/export/sales
POST /api/knowledge/gaps/:id/sync-feishu
POST /api/documents/:id/sync-review-base
```

验收：

- 供应商版只包含 `supplier_visible=true`。
- 成本 / 内部风险不会导出。
- Gap 可进入 sync 状态或 mock record id。

## Milestone 7: 前端最小入口

文件：

```text
src/legacy/screens.jsx
src/legacy/components.jsx
src/legacy/styles.css
```

如果页面变大，拆到：

```text
src/legacy/projects/
src/legacy/documents/
src/legacy/knowledge/
```

任务：

- 增加 Project / Documents 入口。
- 文档导入页面：飞书链接 / 复制粘贴。
- Knowledge Pack 页面：build、sources、chunks、open questions。
- RAG 问答面板：question、answer、citations、gaps。
- MRD/PRD 草稿页面：章节列表、中间内容、右侧引用/权限。
- 权限发布控件：RAG / Bot / Supplier / Sales 开关。

验收：

- 不靠 curl 也能完成第一阶段 Demo。
- 桌面优先，移动端不崩。

## Milestone 8: 飞书出口

文件：

```text
server/feishu-bot-service.js
server/feishu-doc-export-service.js
server/feishu-base-sync-service.js
```

任务：

- Bot event receiver 最小封装。
- 调用 Loom Knowledge API。
- 回答卡片 payload 生成。
- Gap Base sync 接口。
- Docs export 接口。
- 真实飞书权限不足时必须清晰报错。

验收：

- 可生成 Bot card payload。
- Gap sync 可 mock 成功。
- Docs export 可 mock 成功。
- 不影响 paste 导入和 Web RAG 闭环。

## 最终 Demo 验收

必须跑通：

1. 创建 Project。
2. 粘贴导入一份 PRD。
3. 粘贴导入一份 MRD。
4. 图片默认跳过。
5. 标准化成 sections。
6. 关联现有竞品、需求、Stream。
7. 生成 Knowledge Pack。
8. RAG 问 10 个问题。
9. 生成 MRD 草稿。
10. 生成硬件 PRD 草稿。
11. 设置 `supplier_visible`。
12. 导出供应商版。
13. 权限不足时 RAG 拒答。
14. 答不上来生成 KnowledgeGap。

## 验证命令

优先跑 focused tests：

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm test -- server/knowledge-repository.test.js server/document-import-service.test.js server/knowledge-indexer.test.js server/knowledge-pack-service.test.js server/knowledge-query-service.test.js server/document-generation-service.test.js
```

再跑现有核心测试：

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm test -- server/index.test.js server/repository.test.js server/rss-service.test.js server/content-fetcher.test.js
```

最后跑：

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run build
```

如果 lint/typecheck 因无关旧代码失败，记录失败点，不要扩大修复范围。

## 模型路由规则

配置目标：

```text
llm_fast_model
llm_strong_model
llm_vision_model
llm_routing_policy_json
```

P0 不单独配置 `judge_model`。`strong_model` 同时承担复杂生成、审校和质检。后续如果量大或需要独立质检，再拆出 judge model。

可用 fast model：

- 飞书文档章节识别。
- raw blocks 标准化。
- chunk 摘要和标签。
- 普通 RAG 问答。
- MRD/PRD 非关键草稿。
- KnowledgeGap 归类。

必须 strong model 或 needs_review：

- MRD 机会判断、风险判断、建议方向。
- PRD 功能属性、结构、工艺、认证、测试、供应商交付。
- 供应商版导出前审校。
- 飞书群聊和销售/供应商场景的高风险回答。
- source_refs 不足、confidence 低、来源冲突。

必须代码处理，不能交给模型：

- 权限过滤。
- RAG/Bot 是否可引用。
- 供应商版/销售版导出范围。
- 是否下载图片。
- 是否写入/删除主数据。

## 自动推进规则

- 每完成一个 milestone，运行对应测试。
- 测试失败先修本 milestone 相关问题。
- 如果失败来自既有未提交改动且与本任务无关，记录并继续。
- 如果遇到飞书真实权限问题，不阻塞主线，使用 paste/mock fallback。
- 如果遇到字段兼容问题，按“旧字段兼容清理规则”局部修复。
- 不删除生产数据，不清空 `data/`，不重置 git。
- 不提交 `.env`、数据库、uploads、生产数据。
