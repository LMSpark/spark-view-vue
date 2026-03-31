# 页面生成提示词体系

> 本分组聚焦页面级 4 文件生成链路：pagedata.json、rule.json、script.js、style.css。

## 核心文档

1. 页面配置提示词
   [SPARK_PAGE_CONFIG_PROMPT.md](SPARK_PAGE_CONFIG_PROMPT.md)
   面向页面配置生成与页面配置规范速查。

2. 页面生成策略
   [AI_PAGE_GENERATION_STRATEGY.md](AI_PAGE_GENERATION_STRATEGY.md)
   面向 4 文件协同生成、tree-demo 实战、提示词拆分策略。

3. 数据生成入口
   [../data/README.md](../data/README.md)
   页面生成中的 pagedata.json 部分应优先遵循数据生成体系，不单独维护第二套数据规则。

## 推荐用法

1. 如果是整页生成：先看 [AI_PAGE_GENERATION_STRATEGY.md](AI_PAGE_GENERATION_STRATEGY.md)。
2. 如果是页面配置速查或页面级规则汇总：看 [SPARK_PAGE_CONFIG_PROMPT.md](SPARK_PAGE_CONFIG_PROMPT.md)。
3. 如果页面生成中涉及 pagedata.json：回到 [../data/README.md](../data/README.md) 选择对应文档。
