import { Comment, Fragment, Text, isVNode } from 'vue'
import type { VNode } from 'vue'
import {
  SPARK_NODE_STRUCT_KEYS,
  type ComponentChildrenMode,
  type ComponentRegistry,
  type SparkNode,
  type SparkNodeChildren,
} from '../../core/types.js'

let sparkChildType: unknown = null

export const SPARK_CHILD_VNODE_MARKER = '__sparkChildVNodeMarker__'
export const SPARK_TEMPLATE_NODE_DESCRIPTOR = '__sparkTemplateNodeDescriptor__'

export interface SparkTemplateNodeDescriptor {
  nodeType?: string
}

const TEMPLATE_STRUCTURAL_KEYS = new Set<string>([
  ...SPARK_NODE_STRUCT_KEYS,
  'nodeId',
  'key',
  'ref',
])

const TEMPLATE_FIXED_TYPE_STRUCTURAL_KEYS = new Set<string>([
  ...SPARK_NODE_STRUCT_KEYS,
  'nodeId',
  'key',
  'ref',
])

const TEMPLATE_IGNORED_KEYS = new Set<string>(['dock', 'order'])

TEMPLATE_FIXED_TYPE_STRUCTURAL_KEYS.delete('type')

const warnedUnsupportedVNodeTypes = new Set<string>()
const warnedNodeIdConflicts = new Set<string>()
const warnedIgnoredChildrenInputs = new Set<string>()

type DeclaredProps = Record<string, unknown> | string[]

interface VueComponentLike {
  props?: DeclaredProps
  __vccOpts?: {
    props?: DeclaredProps
  }
}

export function bindSparkChildType(type: unknown): void {
  if (type !== null && type !== undefined) {
    markSparkTemplateNodeComponent(type)
    sparkChildType = type
  }
}

function markSparkChildType(type: unknown): void {
  if (type === null || type === undefined) return
  if (typeof type !== 'object' && typeof type !== 'function') return
  ;(type as Record<string, unknown>)[SPARK_CHILD_VNODE_MARKER] = true
}

export function markSparkTemplateNodeComponent(type: unknown, descriptor: SparkTemplateNodeDescriptor = {}): void {
  markSparkChildType(type)
  if (type === null || type === undefined) return
  if (typeof type !== 'object' && typeof type !== 'function') return
  ;(type as Record<string, unknown>)[SPARK_TEMPLATE_NODE_DESCRIPTOR] = descriptor
}

function isMarkedSparkChildType(type: unknown): boolean {
  if (type === null || type === undefined) return false
  if (typeof type !== 'object' && typeof type !== 'function') return false
  return (type as Record<string, unknown>)[SPARK_CHILD_VNODE_MARKER] === true
}

function isSparkChildVNodeType(type: unknown): boolean {
  return type === sparkChildType || isMarkedSparkChildType(type)
}

function readTemplateNodeDescriptor(type: unknown): SparkTemplateNodeDescriptor | null {
  if (!isSparkChildVNodeType(type)) return null
  if (type === null || type === undefined) return null
  if (typeof type !== 'object' && typeof type !== 'function') return null
  const descriptor = (type as Record<string, unknown>)[SPARK_TEMPLATE_NODE_DESCRIPTOR]
  if (descriptor === null || descriptor === undefined || typeof descriptor !== 'object') return {}
  return descriptor as SparkTemplateNodeDescriptor
}

function isMeaningfulText(value: string): boolean {
  return value.trim().length > 0
}

function readNamedVNodeType(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value !== 'object' && typeof value !== 'function') return undefined

  const name = (value as { name?: unknown }).name
  return typeof name === 'string' && name.length > 0 ? name : undefined
}

function describeVNodeType(vn: VNode): string {
  if (typeof vn.type === 'string') return vn.type
  if (typeof vn.type === 'symbol') return String(vn.type)
  const name = readNamedVNodeType(vn.type)
  if (name !== undefined) return name
  return 'anonymous-vnode'
}

function warnUnsupportedVNode(vn: VNode): void {
  if (!import.meta.env.DEV) return
  const label = describeVNodeType(vn)
  if (warnedUnsupportedVNodeTypes.has(label)) return
  warnedUnsupportedVNodeTypes.add(label)
  console.warn(
    `[SparkChild] 忽略未包装的模板子节点 \"${label}\"。` +
    ' 请使用 <SparkChild type="..."> 声明子节点；文本内容可直接写在 slot 中。'
  )
}

function warnNodeIdConflict(scope: string, idValue: string, nodeIdValue: string): void {
  if (!import.meta.env.DEV) return
  const key = `${scope}:${idValue}:${nodeIdValue}`
  if (warnedNodeIdConflicts.has(key)) return
  warnedNodeIdConflicts.add(key)
  console.warn(
    `[SparkChild] 同时声明了 id="${idValue}" 和 nodeId="${nodeIdValue}"，将优先使用 id。`
  )
}

export function warnIgnoredChildrenInput(scope: string, type: string): void {
  if (!import.meta.env.DEV) return
  const key = `${scope}:${type}`
  if (warnedIgnoredChildrenInputs.has(key)) return
  warnedIgnoredChildrenInputs.add(key)
  console.warn(
    `[SparkChild] ${type} 不再支持 props.children。` +
    ' 请改用默认 slot 声明子节点；当前 children 输入已忽略。'
  )
}

export function resolveNodeId(raw: Record<string, unknown>, scope: string): string | undefined {
  const idValue = typeof raw['id'] === 'string' ? raw['id'] : undefined
  const nodeIdValue = typeof raw['nodeId'] === 'string' ? raw['nodeId'] : undefined

  if (idValue !== undefined && nodeIdValue !== undefined && idValue !== nodeIdValue) {
    warnNodeIdConflict(scope, idValue, nodeIdValue)
  }

  return idValue ?? nodeIdValue
}

function readDeclaredProps(component: unknown): DeclaredProps | null {
  if (component === null || component === undefined) return null
  if (typeof component !== 'object' && typeof component !== 'function') return null

  const normalizedComponent = component as VueComponentLike
  return normalizedComponent.props ?? normalizedComponent.__vccOpts?.props ?? null
}

function declaresProp(component: unknown, propName: string): boolean {
  const declaredProps = readDeclaredProps(component)
  if (declaredProps === null) return false
  if (Array.isArray(declaredProps)) return declaredProps.includes(propName)
  return propName in declaredProps
}

function resolveChildrenMode(meta: Record<string, unknown> | undefined): ComponentChildrenMode {
  const value = meta?.['childrenMode']
  return value === 'prop' || value === 'slot' ? value : 'auto'
}

export function shouldCompileTemplateChildren(registry: ComponentRegistry | undefined, type: string): boolean {
  const definition = registry?.get(type)
  if (!definition) return false

  const mode = resolveChildrenMode(definition.meta)
  if (mode === 'prop') return true
  if (mode === 'slot') return false
  return declaresProp(definition.component, 'children')
}

export function collectBusinessProps(
  attrs: Record<string, unknown>,
  options?: { fixedNodeType?: boolean }
): Record<string, unknown> {
  const structuralKeys = options?.fixedNodeType === true
    ? TEMPLATE_FIXED_TYPE_STRUCTURAL_KEYS
    : TEMPLATE_STRUCTURAL_KEYS

  return Object.fromEntries(
    Object.entries(attrs).filter(([key]) => !structuralKeys.has(key) && !TEMPLATE_IGNORED_KEYS.has(key))
  )
}

export function hasLegacyChildrenInput(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return false
  if (typeof value === 'string') return isMeaningfulText(value)
  if (typeof value === 'number') return true
  if (Array.isArray(value)) return value.length > 0
  return true
}

export interface TemplateSlotBindingResult {
  defaultChildren: SparkNodeChildren
  namedSlotNodes: Record<string, SparkNode>
}

function buildNamedSlotDockNode(slotName: string, children: SparkNodeChildren): SparkNode {
  return {
    type: `r-${slotName}`,
    children,
  }
}

/**
 * Collect template slot bindings.
 *
 * - `#default` slot → main content children
 * - Named slots (e.g. `#toolbar`, `#actions`) → structured dock props
 *   `{ toolbar: { type: 'r-toolbar', children: [...] } }`
 */
export function collectTemplateSlotBindings(slotMap: Record<string, unknown>): TemplateSlotBindingResult {
  const defaultChildren: SparkNodeChildren = []
  const namedSlotNodes: Record<string, SparkNode> = {}

  for (const [slotName, slotValue] of Object.entries(slotMap)) {
    if (slotName.startsWith('_')) continue
    if (typeof slotValue !== 'function') continue

    const collected = collectTemplateChildren((slotValue as () => unknown)())
    if (collected.length === 0) continue

    if (slotName === 'default') {
      defaultChildren.push(...collected)
      continue
    }

    namedSlotNodes[slotName] = buildNamedSlotDockNode(slotName, collected)
  }

  return {
    defaultChildren,
    namedSlotNodes,
  }
}

/**
 * Collect template slot children.
 *
 * - `#default` slot → main content children
 * - Named slots (e.g. `#toolbar`, `#actions`) → wrapper SparkNode children
 *   `{ type: 'r-{slotName}', children: [...slotContent] }` appended to the array.
 *   Container components extract docks from children via `useDockExtraction`.
 *   The binding layer (`liftDockChildren`) lifts dock nodes from children into container props.
 */
export function collectTemplateSlotChildren(slotMap: Record<string, unknown>): SparkNodeChildren {
  const { defaultChildren, namedSlotNodes } = collectTemplateSlotBindings(slotMap)
  return [
    ...defaultChildren,
    ...Object.values(namedSlotNodes),
  ]
}

function resolveNodeType(raw: Record<string, unknown>, descriptor: SparkTemplateNodeDescriptor | null): string {
  if (typeof descriptor?.nodeType === 'string' && descriptor.nodeType.length > 0) {
    return descriptor.nodeType
  }
  return typeof raw['type'] === 'string' ? raw['type'] : ''
}

export function buildTemplateNode(
  raw: Record<string, unknown>,
  options: {
    descriptor?: SparkTemplateNodeDescriptor | null
    scope: string
    slotChildren?: SparkNodeChildren
    slotProps?: Record<string, unknown>
  }
): SparkNode {
  const descriptor = options.descriptor ?? null
  const type = resolveNodeType(raw, descriptor)
  const node: SparkNode = { type }

  const businessProps = collectBusinessProps(raw, {
    fixedNodeType: typeof descriptor?.nodeType === 'string' && descriptor.nodeType.length > 0,
  })

  const mergedProps = {
    ...businessProps,
    ...(options.slotProps ?? {}),
  }

  if (Object.keys(mergedProps).length > 0) node.props = mergedProps

  const resolvedId = resolveNodeId(raw, options.scope)
  if (resolvedId !== undefined) {
    node.props ??= {}
    node.props['id'] = resolvedId
  }

  const nestedChildren = options.slotChildren ?? []
  if (nestedChildren.length > 0) {
    node.children = nestedChildren
  } else if (hasLegacyChildrenInput(raw['children'])) {
    warnIgnoredChildrenInput('props', node.type)
  }

  return node
}

export function collectTemplateChildren(input: unknown): SparkNodeChildren {
  const result: SparkNodeChildren = []

  const visit = (value: unknown): void => {
    if (value === null || value === undefined || typeof value === 'boolean') return
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }
    if (typeof value === 'string') {
      if (isMeaningfulText(value)) result.push(value)
      return
    }
    if (typeof value === 'number') {
      result.push(value)
      return
    }
    if (!isVNode(value)) return

    if (value.type === Comment) return
    if (value.type === Text) {
      const textValue = value.children
      if (typeof textValue === 'string') {
        if (isMeaningfulText(textValue)) result.push(textValue)
      } else if (typeof textValue === 'number') {
        result.push(textValue)
      }
      return
    }
    if (value.type === Fragment) {
      visit(value.children)
      return
    }
    if (isSparkChildVNodeType(value.type)) {
      result.push(vnodeToSparkNode(value))
      return
    }

    warnUnsupportedVNode(value)
  }

  visit(input)
  return result
}

function vnodeToSparkNode(vn: VNode): SparkNode {
  const raw = (vn.props ?? {}) as Record<string, unknown>
  const descriptor = readTemplateNodeDescriptor(vn.type)
  const type = resolveNodeType(raw, descriptor)
  return buildTemplateNode(raw, {
    descriptor,
    scope: `vnode:${type}`,
    slotChildren: extractChildSparkNodes(vn),
  })
}

function extractChildSparkNodes(vn: VNode): SparkNodeChildren {
  const children: unknown = vn.children
  if (children === null || children === undefined || typeof children === 'string') return []
  if (Array.isArray(children)) return collectTemplateChildren(children)

  return collectTemplateSlotChildren(children as Record<string, unknown>)
}

export function normalizeSpan(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isInteger(v) && v > 0) return v
  if (typeof v === 'string') {
    const trimmed = v.trim()
    if (!/^\d+$/.test(trimmed)) return undefined
    const n = Number.parseInt(trimmed, 10)
    if (Number.isFinite(n) && n > 0) return n
  }
  return undefined
}