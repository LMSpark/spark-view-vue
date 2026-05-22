import type { DataRow, DataView, ModelPermission } from '@spark-view/spark-data'
import type { SparkNode, SparkNodeChildren } from '../../core/types.js'

export const BEFORE_RENDER_RESOLVED_PROP = '$beforeRenderResolved'

export type BeforeRenderContext = {
  id?: string | undefined
  type: string
  props: Record<string, unknown>
  children?: SparkNodeChildren | undefined
  row?: DataRow | null | undefined
  data?: unknown
  index?: number | undefined
  dataSource?: DataView | null | undefined
  modelPermission?: ModelPermission | undefined
  host?: {
    type: string | null
  } | undefined}

export type BeforeRenderState = {
  visible: boolean
  propsPatch: Record<string, unknown>}

type BeforeRenderHandler = {
  (context: BeforeRenderContext): unknown}

type MergeBeforeRenderOptions = {

  markResolved?: boolean}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return isObjectRecord(value) && typeof value['then'] === 'function'
}

function isBeforeRenderHandler(value: unknown): value is BeforeRenderHandler {
  return typeof value === 'function'
}

function sanitizeContextProps(props: Record<string, unknown>): Record<string, unknown> {
  const { onBeforeRender: _onBeforeRender, [BEFORE_RENDER_RESOLVED_PROP]: _resolved, ...next } = props
  return next
}

function sanitizePatch(value: unknown): Record<string, unknown> {
  if (!isObjectRecord(value)) return {}

  const nestedProps = isObjectRecord(value['props']) ? value['props'] : undefined
  const source = nestedProps ? { ...nestedProps, ...value } : { ...value }
  const {
    props: _props,
    display: _display,
    onBeforeRender: _onBeforeRender,
    [BEFORE_RENDER_RESOLVED_PROP]: _resolved,
    ...patch
  } = source
  return patch
}

export function resolveNodeBeforeRender(
  node: SparkNode,
  context: Omit<BeforeRenderContext, 'id' | 'type' | 'props' | 'children'>,
  onWarn?: (message: string, error?: unknown) => void,
): BeforeRenderState {
  const props = node.props ?? {}
  const baseVisible = props['visible'] !== false

  if (props[BEFORE_RENDER_RESOLVED_PROP] === true) {
    return { visible: baseVisible, propsPatch: {} }
  }

  const handler = props['onBeforeRender']

  if (!isBeforeRenderHandler(handler)) {
    return { visible: baseVisible, propsPatch: {} }
  }

  try {
    const result = handler({
      id: node.id,
      type: node.type,
      props: sanitizeContextProps(props),
      children: node.children,
      ...context,
    })

    if (isPromiseLike(result)) {
      onWarn?.('[beforeRender] onBeforeRender 必须同步返回，禁止 Promise/async。', result)
      return { visible: baseVisible, propsPatch: {} }
    }

    if (typeof result === 'boolean') {
      return { visible: result, propsPatch: { visible: result } }
    }

    const visible = isObjectRecord(result)
      ? (typeof result['visible'] === 'boolean'
          ? result['visible']
          : (typeof result['display'] === 'boolean' ? result['display'] : baseVisible))
      : baseVisible

    return {
      visible,
      propsPatch: sanitizePatch(result),
    }
  } catch (error) {
    onWarn?.('[beforeRender] onBeforeRender 执行失败。', error)
    return { visible: baseVisible, propsPatch: {} }
  }
}

export function mergeNodeBeforeRenderProps(
  node: SparkNode,
  patch: Record<string, unknown>,
  options?: MergeBeforeRenderOptions,
): SparkNode {
  if (Object.keys(patch).length === 0 && options?.markResolved !== true) return node

  const nextProps: Record<string, unknown> = {
    ...(node.props ?? {}),
    ...patch,
  }

  if (options?.markResolved === true) {
    nextProps[BEFORE_RENDER_RESOLVED_PROP] = true
  }

  return {
    ...node,
    props: nextProps,
  }
}
