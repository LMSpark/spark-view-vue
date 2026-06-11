# SPARK AppWorks 配置目录

`config/` 是手写配置的 canonical source。配置只表达系统行为声明，不承载执行逻辑。

## 分层规则

- `config/`：源码仓库级配置，供构建工具、运行时 adapter、AI 工具和校验器读取。
- `public/config/`：部署期/租户运行配置，由浏览器启动时加载，可被环境覆盖。
- `src/registries/`：把 JSON 配置绑定到代码资源，如 Vue 组件动态 import。
- `src/services/`：业务服务和生成产物消费者，不放手写配置源。
- `packages/`：通用 loader、validator、协议解析能力，不放根应用私有配置数据。

## 当前配置

- `navigation/vue-pages.json`：系统 Vue 页面声明，作为路由、公共路径、设计器页面选项的配置源。
- `schemas/*.schema.json`：配置协议的 JSON Schema。

## 格式约定

- 纯声明数据使用 JSON，并通过 `protocol` + `schemaVersion` 标识协议。
- 需要 import、函数、组件绑定或派生 helper 的逻辑放在 `src/registries/` 或 loader 中。
- generated JSON/TS 不放在本目录；生成物应靠近消费方或进入专门的 generated 目录。
