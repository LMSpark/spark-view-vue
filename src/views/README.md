# 视图目录索引

`src/views/` 存放页面级视图与平台页面入口，当前按访问层级拆成 `app/`、`platform/`、`tenant/` 三组。

## 当前分层

- `app/`：主应用页面、demo 页面、dev-system 与应用级组件组合。
- `platform/`：平台级公共页面，例如首页、登录、关于页。
- `tenant/`：租户级管理与配置页面。

## 放置原则

- 页面入口和路由级视图放这里，不把页面级组件平铺到 `src/components/`。
- 复杂页面内部的局部组件可继续就近放在 `views/app/components/` 等子目录。
- 当某类页面逐渐形成完整业务域，再考虑迁移到 `src/features/` 做更强分区。

## 相关目录

- [../components/README.md](../components/README.md)
- [../features/README.md](../features/README.md)
- [../../docs/guides/QUICKSTART.md](../../docs/guides/QUICKSTART.md)