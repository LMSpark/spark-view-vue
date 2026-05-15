# SPARK_VIEW 17 集视频制作包

> 本目录把 `docs/blog-series/` 的序篇和 16 篇正文转换为“双版本视频制作包”：每集一版 6-10 分钟长视频，一版 90-180 秒短视频。当前交付为脚本、分镜、字幕草稿和素材清单，不合成 mp4。

## 制作定位

- 长视频：技术讲解、源码跟读、架构图解，适合 B 站、内部培训和技术专栏。
- 短视频：传播钩子、关键结论、引导观看长视频，适合切片发布。
- 视觉基础：优先复用 `docs/blog-series/assets/*.svg`、原文 Mermaid 图和源码锚点。
- 硬口径：前端权限只是装饰层，安全边界在后端鉴权；AI Runtime 是通用受约束业务智能体架构，PageDesign 是首个完整样例。

## 观看顺序

| 集数 | 标题 | 长视频 | 短视频 | 分镜 |
| --- | --- | --- | --- | --- |
| 00 | 序篇：为什么 SPARK_VIEW 值得拆成 16 篇 | [long-script](00-preface/long-script.md) | [short-script](00-preface/short-script.md) | [storyboard](00-preface/storyboard.md) |
| 01 | 别再叫它 JSON 表单：SPARK_VIEW 的页面资产化野心 | [long-script](01-spark-view-not-json-form-generator/long-script.md) | [short-script](01-spark-view-not-json-form-generator/short-script.md) | [storyboard](01-spark-view-not-json-form-generator/storyboard.md) |
| 02 | 四文件协议：把一个页面拆成可治理的生产资料 | [long-script](02-four-file-protocol/long-script.md) | [short-script](02-four-file-protocol/short-script.md) | [storyboard](02-four-file-protocol/storyboard.md) |
| 03 | Monorepo 的骨架：运行时、数据层与 AI 如何各就各位 | [long-script](03-monorepo-layering/long-script.md) | [short-script](03-monorepo-layering/short-script.md) | [storyboard](03-monorepo-layering/storyboard.md) |
| 04 | 从 main.ts 到首屏：SPARK_VIEW 如何点亮一个应用 | [long-script](04-app-startup-chain/long-script.md) | [short-script](04-app-startup-chain/short-script.md) | [storyboard](04-app-startup-chain/storyboard.md) |
| 05 | 导航树即路由源：菜单、页面与项目边界的一次统一 | [long-script](05-navigation-tree-as-route-source/long-script.md) | [short-script](05-navigation-tree-as-route-source/short-script.md) | [storyboard](05-navigation-tree-as-route-source/storyboard.md) |
| 06 | Loader 与 Compiler：配置世界的取数边界和解释边界 | [long-script](06-config-loading-and-compile-boundary/long-script.md) | [short-script](06-config-loading-and-compile-boundary/short-script.md) | [storyboard](06-config-loading-and-compile-boundary/storyboard.md) |
| 07 | SparkPageRenderer：四文件落地成页面的总指挥 | [long-script](07-spark-page-renderer-runtime/long-script.md) | [short-script](07-spark-page-renderer-runtime/short-script.md) | [storyboard](07-spark-page-renderer-runtime/storyboard.md) |
| 08 | SparkComponentRenderer：一棵 SparkNode 如何长成 Vue 页面 | [long-script](08-spark-component-renderer-recursive-interpreter/long-script.md) | [short-script](08-spark-component-renderer-recursive-interpreter/short-script.md) | [storyboard](08-spark-component-renderer-recursive-interpreter/storyboard.md) |
| 09 | 组件注册与能力系统：让递归组件树学会协作 | [long-script](09-component-registry-and-capability-system/long-script.md) | [short-script](09-component-registry-and-capability-system/short-script.md) | [storyboard](09-component-registry-and-capability-system/storyboard.md) |
| 10 | 三层数据模型：DataSet、DataTable、DataView 的后台秩序 | [long-script](10-dataset-datatable-dataview/long-script.md) | [short-script](10-dataset-datatable-dataview/short-script.md) | [storyboard](10-dataset-datatable-dataview/storyboard.md) |
| 11 | DataKey：组件通往数据空间的那把钥匙 | [long-script](11-datakey-and-cascade-loading/long-script.md) | [short-script](11-datakey-and-cascade-loading/short-script.md) | [storyboard](11-datakey-and-cascade-loading/storyboard.md) |
| 12 | CRUD 之外：聚合、计算列与树数据的工程化收口 | [long-script](12-crud-aggregate-computed-tree/long-script.md) | [short-script](12-crud-aggregate-computed-tree/short-script.md) | [storyboard](12-crud-aggregate-computed-tree/storyboard.md) |
| 13 | 权限别演戏：前端只是装饰，后端鉴权才是边界 | [long-script](13-permission-boundary-frontend-decoration/long-script.md) | [short-script](13-permission-boundary-frontend-decoration/short-script.md) | [storyboard](13-permission-boundary-frontend-decoration/storyboard.md) |
| 16 | DevSystem：把运行时框架推进生产车间 | [long-script](16-devsystem-production-toolchain/long-script.md) | [short-script](16-devsystem-production-toolchain/short-script.md) | [storyboard](16-devsystem-production-toolchain/storyboard.md) |

## 制作状态

- 已落地：系列总控、制作圣经、第 00-03 集制作包。
- 已落地：第 00、01 集长短视频样片渲染脚本，见 [RENDERING.md](RENDERING.md)。
- 后续范围：第 04-16 集制作包，以及批量渲染脚本。
- 当前素材：SVG 技术配图、Mermaid 图、源码路径。
- 增强素材：后续可采集真实 DevSystem、运行时页面、AI 面板和权限页面截图。

## 统一制作规则

详见 [SERIES_BIBLE.md](SERIES_BIBLE.md)。每集剪辑前必须先核对对应 `visual-checklist.md`，第 13 集和第 14-15 集需要额外核对权限与 AI 边界口径。
