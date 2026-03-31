# 平台基础提示词体系

> 本分组聚焦所有 AI 提示词共用的平台级规则，包括 API-first、统一协议和运行时基线。

## 核心文档

1. API-first 规则
   [API_FIRST_PROMPT.md](API_FIRST_PROMPT.md)

2. 统一交互协议
   [AI_PROTOCOL_UNIFIED.md](AI_PROTOCOL_UNIFIED.md)

3. 运行时系统提示词
   [system-prompt.txt](../../../spark-ai-server/src/main/resources/prompts/system-prompt.txt)

## 推荐用法

1. 需求涉及页面配置、路由、导航、项目、数据 CRUD、日志、缓存或 AI 生成时，先看 [API_FIRST_PROMPT.md](API_FIRST_PROMPT.md)。
2. 需求涉及多轮 AI 交互、消息协议、结构化输出约束时，再看 [AI_PROTOCOL_UNIFIED.md](AI_PROTOCOL_UNIFIED.md)。
3. 如果要验证真正的运行时行为，最终以 [system-prompt.txt](../../../spark-ai-server/src/main/resources/prompts/system-prompt.txt) 为准。
