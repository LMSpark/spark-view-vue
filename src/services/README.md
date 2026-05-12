# 前端服务目录索引

`src/services/` 存放根应用层的前端服务与协议适配，负责把认证、HTTP、路由、AI 面板、截图/调试等浏览器应用能力组织成可调用接口。

## 当前内容特征

- AI 会话集成：页面设计会话编排与应用层面板联动。
- 请求与路径：HTTP 封装、认证态、API 路径拼装。
- 平台级能力：项目切换、SSE 调试路由与截图链路。
- 应用壳适配：为 `@spark-view/spark-page-config` 注入认证头、租户路径、路由刷新等外部能力。

## 放置原则

- 应用层集成逻辑放这里。
- 纯基础工具优先沉到 `packages/spark-utils/`。
- 页面配置域的框架无关服务放在 `packages/spark-page-config/src/services/`。
- 如果某个服务只属于单一业务域，优先迁入对应包或 `src/features/`，避免在根应用服务目录形成双真源。

## 相关目录

- [../components/README.md](../components/README.md)
- [../views/README.md](../views/README.md)
- [../../packages/spark-utils/README.md](../../packages/spark-utils/README.md)
- [../../packages/spark-page-config/README.md](../../packages/spark-page-config/README.md)
