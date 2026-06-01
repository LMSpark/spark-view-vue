# 配置目录说明

`src/config/` 存放根应用自己的前端配置装配代码，重点是把工作区包能力拼成当前应用需要的映射或约定。

## 当前内容

- `vue-page-map.ts`：Vue 页面映射表的单一定义源，负责页面路径、作用域、组件懒加载入口和登录前导航树派生。

## 放置原则

- 只放“根应用层配置装配”，不要把通用配置加载基础设施放进这里。
- 与页面配置读取、DataSet 编译、脚本沙箱等运行时核心有关的能力，仍应放在 `packages/` 中维护。
- 当某份配置已经演变成跨应用共享能力时，应下沉到对应工作区包，而不是继续留在这里。

## 相关入口

- [vue-page-map.ts](vue-page-map.ts)
- [../views/README.md](../views/README.md)
- [../../packages/spark-project-model/README.md](../../packages/spark-project-model/README.md)
