# DBMS 作用域与租户/项目导航层级修改记录

日期：2026-05-17

## 背景

本轮修改收口两条主线：

- DBMS 分层页面必须按当前选择的 server/database 工作，避免切换服务器后数据库列表串台，避免表关系返回整个项目数据。
- 后端种子与导航层级固定为：平台租户 -> 普通租户主站 `homepage` -> 软件项目 `app`，其中 `/app-list` 和 `/dbms` 只挂主站。

## DBMS 作用域

- 前端 DBMS 页面在加载数据库时传递 `serverId`，在加载表和表关系时传递 `databaseId`。
- 切换服务器或数据库时立即清空下级状态，并用当前选中 ID 防止旧异步响应回填到新作用域。
- 数据库查询接口支持 `serverId` 过滤，查询条件限定为当前租户/项目可见数据库和所选服务器。
- 表关系查询接口支持 `databaseId` 过滤，只返回父表和子表都属于当前租户/项目且都在所选数据库内的关系。
- 创建表关系时请求体携带 `databaseId`，后端校验父子表必须同属当前项目作用域和所选数据库。

## 租户与项目种子

- 初始化时幂等确保 `platform` 租户存在，作为平台管理租户，默认项目为 `homepage`。
- 初始化时幂等确保默认普通租户 `lmspark` 存在，作为业务租户，默认项目为 `homepage`。
- 平台主站 `platform/homepage` 命名为“平台管理工作台”。
- 普通租户主站 `lmspark/homepage` 命名为“企业管理平台”。
- 租户基础字段统一补齐：`status`、`homePath`、`apiBaseUrl`、`logLevel`、feature flags 等。
- 本轮不创建默认软件项目；软件项目仍通过应用管理创建，类型固定为 `app`。

## 导航模板与纠偏

- 平台主站模板包含：平台租户管理、平台应用管理、DBMS、平台工具。
- 普通租户主站模板包含：应用管理、DBMS、开发/缓存等租户管理入口。
- 软件项目模板仅包含：项目工作台和项目内开发入口，不包含 `/app-list` 或 `/dbms`。
- 主站缺少 `/app-list` 或 `/dbms` 时会幂等补齐。
- 非主站项目若存在误挂的 `/app-list` 或 `/dbms`，初始化检查时会移除。
- 导航纠偏保留用户自定义菜单，不覆盖、不重排无关节点。
- 普通租户模板节点 ID 增加租户/项目 scope 前缀，避免全局导航节点 ID 冲突。
- 兼容旧主站导航中 `返回应用工场` / `back-to-homepage` 的 `/app-list` 节点，归一为“应用管理”。

## DataViewMember Lint 修复

- `spark-component` 开发/lint 类型解析改为指向 `spark-data` 源码，避免读取旧 `dist` 类型导致 `DataMember` 被 ESLint 识别为 error type。
- `useDisplayDataSource` 中 `dataMember` 条件改为显式 `!== undefined`。
- `data-view-key` 中 nullable enum 判断改为显式 `=== null` / `=== undefined`。

## 关键验证

已通过：

```bash
mvn "-Dtest=DataSourceMetadataServiceTest,ProjectServiceNavigationSeedTest,DataInitializerSeedTest,ProjectNavigationTreeServiceTest" test
pnpm run typecheck
pnpm run lint
pnpm run test
```

验证覆盖：

- 数据库按 `serverId` 过滤。
- 表关系按 `databaseId` 过滤。
- 跨数据库创建关系被拒绝。
- `platform` 与 `lmspark` 租户种子字段正确。
- `platform/homepage` 与 `lmspark/homepage` 项目种子正确。
- 普通租户主站包含 `/app-list` 和 `/dbms`。
- 非主站软件项目不包含 `/app-list` 和 `/dbms`。
- 导航初始化幂等，不重复创建节点。

## 备注

当前工作区存在大量与本轮无关的既有脏改。本轮实现只围绕 DBMS 作用域、租户/项目种子、导航层级、DataViewMember lint 修复和对应验证展开。
