# SPARK pagedata.json 提示词模板

> 本文件为兼容入口。
>
> 唯一持续维护的 pagedata.json 规则正文已统一收口到 [PAGEDATA_JSON_COMPLETE_PROMPT.md](PAGEDATA_JSON_COMPLETE_PROMPT.md)。
>
> 如果你需要：
> - 直接复制给 AI：使用 [PAGEDATA_JSON_COMPLETE_PROMPT.md](PAGEDATA_JSON_COMPLETE_PROMPT.md)
> - 查看完整验证案例、自检清单、配置速查：使用 [DATASET_JSON_PROMPT.md](DATASET_JSON_PROMPT.md)
> - 在其他 prompt 中嵌入数据生成规则：从生产版主入口提取“完整提示词”正文，不再以本页维护第二套规则文本
>
> 所属： [AI 文档体系](../../README.md) / 数据生成 / 兼容入口。

## 当前职责

本文件保留的唯一目的，是为旧链接、旧引用和提示词组装场景提供稳定入口。

它不再承担以下职责：

1. 不再维护独立的 schema 规则正文。
2. 不再维护第二份 DataSet / DataTable / DataView 结构说明。
3. 不再维护第二份 tableRelations / viewDependencies / aggregates / TreeApi / API 简写规则。

当前规则来源划分如下：

1. 生产规则正文： [PAGEDATA_JSON_COMPLETE_PROMPT.md](PAGEDATA_JSON_COMPLETE_PROMPT.md)
2. 案例、验证、自检、速查： [DATASET_JSON_PROMPT.md](DATASET_JSON_PROMPT.md)
3. 本页：兼容入口与组装说明

## 组装规则

如果你是在编写更大的 prompt，并且需要把 pagedata.json 生成规则嵌入进去，使用下面的原则：

1. 始终以 [PAGEDATA_JSON_COMPLETE_PROMPT.md](PAGEDATA_JSON_COMPLETE_PROMPT.md) 作为唯一规则源。
2. 需要完整约束时，直接内联生产版主入口中的“完整提示词”正文。
3. 需要缩短 token 时，只能裁剪外围说明、案例或附录，不能在本页重新改写第二份规则体系。
4. 任何涉及 schema、运行时约束、TreeApi、tableRelations / viewDependencies、视图行为的变更，必须先改生产版主入口，再决定是否在案例附录补充示例。

## 使用方式

### 场景 1：直接复制给 AI

直接使用 [PAGEDATA_JSON_COMPLETE_PROMPT.md](PAGEDATA_JSON_COMPLETE_PROMPT.md)。

### 场景 2：需要验证案例

使用 [DATASET_JSON_PROMPT.md](DATASET_JSON_PROMPT.md)。

### 场景 3：从旧链接跳转到这里

将本页视为“转发入口”，不要继续从本页复制或维护独立规则正文。

## 维护约束

后续如果再修改 pagedata.json 规则，遵循以下顺序：

1. 先更新 [PAGEDATA_JSON_COMPLETE_PROMPT.md](PAGEDATA_JSON_COMPLETE_PROMPT.md)。
2. 如有必要，再更新 [DATASET_JSON_PROMPT.md](DATASET_JSON_PROMPT.md) 中的案例、自检或速查内容。
3. 本页通常只在入口说明、链接关系或组装策略变化时才需要调整。
