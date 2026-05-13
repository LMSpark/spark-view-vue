# Composables 目录说明

`src/composables/` 存放根应用层的组合式逻辑，用来把路由、HTTP、SSE、通知或页面宿主行为封装成可复用的前端调用接口。

## 当前内容

- AI 会话核心 composable（`useAiChat/useAiPanelStore/useAiSession`）已迁移到 `packages/spark-component/src/composables/`。
- `useTenantRouter.ts`：租户作用域路由拼接与页面跳转辅助。
- `useNotifications.ts`：通知/消息相关组合逻辑。
- `useFloatingPanelOwner.ts`：浮层宿主归属管理。

## 放置原则

- 这里适合“应用层编排”逻辑，不适合沉淀框架无关的运行时核心。
- 一旦某个 composable 被多个包共享，优先抽到 `packages/`，不要长期留在根应用目录。
- 如果某个 composable 只服务单一业务域，后续可迁入对应 `src/features/` 或页面域目录。

## 相关入口

- [../services/README.md](../services/README.md)
- [../features/README.md](../features/README.md)
- [../../packages/spark-ai/README.md](../../packages/spark-ai/README.md)