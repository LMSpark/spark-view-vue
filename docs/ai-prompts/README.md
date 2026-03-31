# AI 提示词体系

> 这是 SPARK 仓库中所有 AI 提示词文档的系统化入口。
>
> 目标不是再复制一套内容，而是把现有提示词按“运行时基线 / 平台基础 / 数据生成 / 页面生成 / 组件专项”分层整理，明确每份文档的角色、优先级和维护边界。

## 体系总览

1. 运行时基线
   [system-prompt.txt](../../spark-ai-server/src/main/resources/prompts/system-prompt.txt)
   真正被后端页面生成链路加载的系统提示词，是所有文档规则的最终对齐基线。

2. 平台基础层
   [platform/README.md](platform/README.md)
   约束 API-first、统一交互协议、前后端职责边界，属于所有业务提示词的上游规则。

3. 数据生成层
   [data/README.md](data/README.md)
   聚焦 pagedata.json / DataSet / 数据建模 / 字段输入级联 / relations / TreeApi，是当前最核心的提示词簇。

4. 页面生成层
   [pages/README.md](pages/README.md)
   组织 pagedata.json、rule.json、script.js、style.css 的页面级生成链路与策略文档。

5. 组件与专项层
   [components/README.md](components/README.md)
   聚焦组件开发、r-table、组件深度优化等专项提示词。

## 使用顺序

1. 先判断你要解决的是平台规则、数据生成、页面生成，还是组件专项问题。
2. 再进入对应分类 README，选择“生产版 / 模板版 / 案例版 / 策略版”文档。
3. 如果问题涉及 AI 页面生成运行时行为，最后必须回看 [system-prompt.txt](../../spark-ai-server/src/main/resources/prompts/system-prompt.txt)。
4. 如果你要维护或扩展这套文档体系，先看 [GOVERNANCE.md](GOVERNANCE.md) 和 [MIGRATION_STATUS.md](MIGRATION_STATUS.md)。

## 角色约定

1. 生产版：直接复制给 AI 使用的主提示词。
2. 模板版：适合嵌入其他提示词、做二次组装的精简模板。
3. 案例版：保留验证案例、质量门、历史演进，不作为首选复制入口。
4. 策略版：沉淀实战方法、拆分方式、跨文件协同经验。

## 维护规则

1. 涉及运行时约束变更时，先改 [system-prompt.txt](../../spark-ai-server/src/main/resources/prompts/system-prompt.txt)，再回写对应文档。
2. 同一场景只保留一个主入口，其他文档必须说明自己是模板、案例还是策略。
3. docs/guides 只保留尚未迁移的数据正文与通用指南；已经迁移到 ai-prompts 的同名 prompt 不再保留第二份包装文件。

## 治理文档

1. [GOVERNANCE.md](GOVERNANCE.md)
   说明提示词分层、主从关系、更新顺序和新增准入规则。

2. [MIGRATION_STATUS.md](MIGRATION_STATUS.md)
   记录当前哪些文档已纳入体系、哪些仍保留兼容承载职责。
