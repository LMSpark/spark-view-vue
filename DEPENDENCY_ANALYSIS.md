# SPARK 项目依赖分析报告
生成时间: 2026-02-04 23:27:58

##  包结构

### L0 层（基础工具层）
- @spark-view/spark-utils
  - 无依赖
  - 提供: Logger, ErrorHandler, ConfigManager, EventEmitter, HttpClient, IApiContext

### L1 层（核心功能层）
- @spark-view/spark-data
  - 依赖: @spark-view/spark-utils
  - 提供: DataSet, DataTable, TreeManager, ApiAdapter

- @spark-view/spark-component  
  - 依赖: @spark-view/spark-utils, @spark-view/spark-data
  - 提供: 组件系统、能力管理、组件注册表

- @spark-view/spark-app
  - 依赖: @spark-view/spark-utils
  - 提供: AppContext, Router Guards, Bootstrap

### L2 层（配置层）
- @spark-view/spark-page-config
  - 依赖: @spark-view/spark-app
  - 提供: 页面配置加载、动态路由

### L3 层（渲染层）
- @spark-view/spark-renderer
  - 依赖: @spark-view/spark-data, @spark-view/spark-page-config, @spark-view/spark-utils
  - 提供: 页面渲染引擎、DataSet 集成

##  依赖关系图

`
                    主应用
                      |
        +-------------+-------------+
        |             |             |
    renderer    page-config    component
        |             |             |
        +------+------+        +----+----+
               |               |         |
            data           spark-app   data
               |               |         |
               +-------+-------+---------+
                       |
                     utils
`

##  依赖验证

### 层级依赖规则
- L0 (utils):  无依赖
- L1 (data):  仅依赖 utils
- L1 (component):  依赖 utils + data
- L1 (app):  仅依赖 utils
- L2 (page-config):  依赖 app（L1）
- L3 (renderer):  依赖 data(L1) + page-config(L2) + utils(L0)

### 循环依赖检查
-  无循环依赖

### 架构合规性
-  所有依赖都向下或平级（无向上依赖）
-  renderer 正确位于最顶层
-  utils 正确位于最底层
-  HttpClient 已从 data 移至 utils（架构优化）

##  依赖统计

| 包名 | 层级 | 直接依赖数 | 被依赖数 |
|------|------|-----------|---------|
| spark-utils | L0 | 0 | 4 |
| spark-data | L1 | 1 | 2 |
| spark-component | L1 | 2 | 0 |
| spark-app | L1 | 1 | 1 |
| spark-page-config | L2 | 1 | 1 |
| spark-renderer | L3 | 3 | 0 |

##  架构健康度

**总体评分**:  (5/5)

### 优点
1.  **清晰的层级结构**: L0L1L2L3，职责明确
2.  **无循环依赖**: 所有依赖都是单向的
3.  **低耦合**: 每个包的依赖数量合理（3）
4.  **高内聚**: utils 被4个包依赖，充分复用
5.  **正确的依赖方向**: HttpClient 在 utils 层，可被所有上层使用

### 最近优化
1.  将 HttpClient 从 spark-data 移至 spark-utils
2.  将 IApiContext 从 spark-data 移至 spark-utils
3.  保持向后兼容（spark-data 重新导出）

##  详细依赖树

### @spark-view/spark-renderer
`
spark-renderer
 @spark-view/spark-data (workspace)
    @spark-view/spark-utils (workspace)
 @spark-view/spark-page-config (workspace)
    @spark-view/spark-app (workspace)
        @spark-view/spark-utils (workspace)
 @spark-view/spark-utils (workspace)
`

### @spark-view/spark-component
`
spark-component
 @spark-view/spark-utils (workspace)
 @spark-view/spark-data (workspace)
     @spark-view/spark-utils (workspace)
`

##  建议

### 当前架构
-  架构设计合理，依赖关系清晰
-  没有需要立即解决的问题
-  符合 SOLID 原则和依赖倒置原则

### 未来考虑
1. 如果 component 需要路由能力，考虑让它依赖 app
2. 保持 utils 层的纯粹性，不要添加业务逻辑
3. 新增包时遵循现有的层级规则

