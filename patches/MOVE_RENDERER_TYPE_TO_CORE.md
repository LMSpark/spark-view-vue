目标：把 `RendererDebugProvider` 类型从 feature 层正式迁移到 `packages/spark-core/src/types`，并由 core 导出（按最佳实践）。

变更内容（在 core 仓库中执行）：

1) 新建类型文件：packages/spark-core/src/types/spark-renderer.ts

```ts
// packages/spark-core/src/types/spark-renderer.ts
/**
 * Simple "computed-like" type to avoid taking a direct Vue dependency in core.
 * If core prefers to use Vue types, replace with ComputedRef<T> and add Vue as a peer/dev dependency.
 */
export type ComputedLike<T> = T | { value: T }

export interface RendererDebugProvider<TComponent = unknown> {
  componentType: string
  isRegistered: ComputedLike<boolean>
  resolvedComponent: TComponent | null
  childCount: ComputedLike<number>
}

export default RendererDebugProvider
```

2) 在 core 的导出文件中导出该类型（示例放在两种常见位置，选择适合你仓库的）：

- 如果 `packages/spark-core/src/index.ts` 存在：
```ts
export type { RendererDebugProvider } from './types/spark-renderer'
```

- 或者在 `packages/spark-core/src/spark-namespace.ts`（如果你把类型和命名空间一同导出）：
```ts
export type { RendererDebugProvider } from './types/spark-renderer'
```

3) (可选) 在 core 中添加一个类型检查测试：packages/spark-core/tests/spark-renderer-type.test.ts

```ts
import type { RendererDebugProvider } from '../src/types/spark-renderer'

test('RendererDebugProvider type exists', () => {
  // Just ensure TypeScript can import the type – no runtime assertion needed
  const _probe: RendererDebugProvider = {
    componentType: 'x',
    isRegistered: true,
    resolvedComponent: null,
    childCount: 0
  }
  expect(_probe.componentType).toBe('x')
})
```

4) 将 old shim 文件（`e.g. src/types/shims-spark-core.d.ts`）中对应的临时声明移除或标注为已迁移。

5) 在 `spark-view`（app）仓库中：
- 移除本地 shims 对该类型的声明（或在合并后清理）
- 确认 `features/spark/components/SparkComponentRenderer.vue` 从 `@spark-view/spark-core` 导入 `RendererDebugProvider` 并移除 feature 级类型声明

应用步骤（在 core 仓库根目录执行）:

```bash
# 切换到 core 仓库（示例路径）
cd <path-to>/form-create-ssr-app/packages/spark-core
# 新建文件并编辑
mkdir -p src/types
# 将上面的 types/spark-renderer.ts 内容粘贴到文件中
# 在 src/index.ts 或 spark-namespace.ts 中加入导出行
# 运行类型检查与测试
pnpm run typecheck
pnpm test
# 提交并推送
git checkout -b feat/add-renderer-type
git add src/types/spark-renderer.ts src/index.ts
git commit -m "chore(types): add RendererDebugProvider and export from core"
# Push and open PR as needed
git push origin feat/add-renderer-type
```

变更后：
- `spark-view` 能直接从 `@spark-view/spark-core` 导入 `RendererDebugProvider`（移除临时 shims），保持清晰职责分离。

需要我为你在 core 仓库中生成一个完整的 patch 文件（git diff / patch）以便你直接应用，还是你希望我生成一个 PR 补丁文本供你复制到 core 仓库？请回复：“生成 patch” 或 “生成 PR 文本”。