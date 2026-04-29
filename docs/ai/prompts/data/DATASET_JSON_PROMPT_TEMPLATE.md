# SPARK pagedata.json 组装模板

> 唯一持续维护的 pagedata.json 规则正文是 [PAGEDATA_JSON_COMPLETE_PROMPT.md](PAGEDATA_JSON_COMPLETE_PROMPT.md)。
>
> 所属： [AI 文档体系](../../README.md) / 数据生成 / 组装模板。

## 当前职责

本文件只说明如何把数据生成规则嵌入更大的 prompt，不维护第二套 schema 规则。

当前规则来源划分如下：

1. 生产规则正文： [PAGEDATA_JSON_COMPLETE_PROMPT.md](PAGEDATA_JSON_COMPLETE_PROMPT.md)
2. 案例、验证、自检、速查： [DATASET_JSON_PROMPT.md](DATASET_JSON_PROMPT.md)
3. 本页：组装说明

## 组装规则

如果你需要把 pagedata.json 生成规则嵌入页面生成、流程生成或多文件生成 prompt：

1. 始终以 [PAGEDATA_JSON_COMPLETE_PROMPT.md](PAGEDATA_JSON_COMPLETE_PROMPT.md) 作为唯一规则源。
2. 需要完整约束时，直接内联生产版主入口中的“完整提示词”正文。
3. 需要缩短上下文时，只能裁剪外围说明、案例或附录，不能在本页重新改写第二份规则体系。
4. 任何涉及 schema、运行时约束、TreeApi、tableRelations / viewDependencies、视图行为的变更，必须先改生产版主入口，再决定是否在案例附录补充示例。

## 维护约束

1. 修改 pagedata.json 规则时，先更新 [PAGEDATA_JSON_COMPLETE_PROMPT.md](PAGEDATA_JSON_COMPLETE_PROMPT.md)。
2. 如有必要，再更新 [DATASET_JSON_PROMPT.md](DATASET_JSON_PROMPT.md) 中的案例、自检或速查内容。
3. 本页只在组装策略变化时调整。
