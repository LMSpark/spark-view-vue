import { watch } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import { toValue } from 'vue'
import { useSparkComponent } from '../_pkg'
import type { SparkNode, UseSparkComponentReturn } from '../_pkg'
import { FIELD_CONTEXT, CONTEXT_DATA } from '../_pkg'
import type { FieldContext } from '../_pkg'
import type { IDataRow } from '@spark-view/spark-data'

// ── 选项接口 ─────────────────────────────────────────────────────────────────

export interface UseDataScopeOptions {
  /** 组件类型（用于创建 SPARK 上下文节点） */
  type: string
  /** 字段上下文类型 */
  fieldContext: MaybeRefOrGetter<FieldContext>
  /** 当前数据行/节点/模型 */
  data: MaybeRefOrGetter<IDataRow>
  /** 可选：已有的 SPARK 配置（传入后复用，避免重复创建上下文） */
  nodeConfig?: SparkNode
}

export interface UseDataScopeReturn {
  sparkProvide: UseSparkComponentReturn['provide']
  consume: UseSparkComponentReturn['consume']
  logger: UseSparkComponentReturn['logger']
}

// ── 组合式函数 ────────────────────────────────────────────────────────────────

/**
 * 统一的数据作用域逻辑 —— 提取 RendererListItemScope /
 * RendererFieldScope 共有的 sparkProvide(FIELD_CONTEXT / CONTEXT_DATA) 模式。
 *
 * DATA_SOURCE 由父容器（r-tree / r-table / r-list 等）在能力链上提供，
 * scope 组件不重复提供，子组件通过 consume(DATA_SOURCE) 沿链向上查找即可。
 *
 * 使用方只需关心自身的 UI 包装（el-card / el-form / 裸 div），
 * 数据作用域注入由本 composable 统一处理。
 */
export function useDataScope(options: UseDataScopeOptions): UseDataScopeReturn {
  const { type, fieldContext, data, nodeConfig } = options

  const { provide: sparkProvide, consume, logger } = useSparkComponent(
    nodeConfig ?? { type }
  )

  // ── FIELD_CONTEXT（静态或响应式） ─────────────────────────────────────────
  watch(
    () => toValue(fieldContext),
    (ctx) => { sparkProvide(FIELD_CONTEXT, ctx) },
    { immediate: true },
  )

  // ── CONTEXT_DATA（行/节点/模型数据） ──────────────────────────────────────
  watch(
    () => toValue(data),
    (d) => { sparkProvide(CONTEXT_DATA, d) },
    { immediate: true },
  )

  return { sparkProvide, consume, logger }
}
