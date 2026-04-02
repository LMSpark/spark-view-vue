# 前端服务目录索引

`src/services/` 存放根应用层的前端服务与协议适配，负责把路由、HTTP、AI 协议、SSE 调试等能力组织成可调用接口。

## 当前内容特征

- 协议适配：AI 协议、SAP 协议。
- 请求与路径：HTTP 封装、API 路径拼装。
- 平台级能力：项目切换、SSE 调试路由与截图链路。

## 放置原则

- 应用层集成逻辑放这里。
- 纯基础工具优先沉到 `packages/spark-utils/`。
- 如果某个服务只属于单一业务域，后续可迁入对应 `src/features/`。

## 相关目录

- [../components/README.md](../components/README.md)
- [../views/README.md](../views/README.md)
- [../../packages/spark-utils/README.md](../../packages/spark-utils/README.md)