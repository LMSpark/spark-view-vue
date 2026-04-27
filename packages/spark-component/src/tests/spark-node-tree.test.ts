import { describe, expect, it } from 'vitest'
import type { SparkNode } from '../index'
import { SparkNodeTree } from '../index'

function createSparkNodeTree(): SparkNode {
  return {
    type: 'page-root',
    id: 'root',
    props: { class: 'page-root' },
    children: [
      {
        type: 'r-toolbar',
        id: 'toolbar',
        props: {
          on: { click: 'handleToolbarClick' },
        },
      },
      {
        type: 'r-table',
        id: 'table',
        props: {
          dataKey: 'Users@rows',
          border: true,
        },
        children: [
          {
            type: 'el-table-column',
            id: 'name-column',
            props: {
              field: 'name',
              label: '姓名',
            },
          },
        ],
      },
      'footer text',
    ],
  }
}

describe('SparkNodeTree', () => {
  it('应该围绕单个 root 实例提供查询 API', () => {
    const root = createSparkNodeTree()
    const tree = new SparkNodeTree({ root })

    expect(tree.getNode({ componentId: 'table' })?.type).toBe('r-table')
    expect(tree.getParent({ componentId: 'name-column' })?.id).toBe('table')
    expect(tree.getLocation({ componentId: 'name-column' })).toMatchObject({
      depth: 2,
      index: 0,
    })
    expect(tree.hasNode({ componentId: 'toolbar' })).toBe(true)
    expect(tree.countNodes()).toBe(4)
    expect([...tree.collectDataKeys()]).toEqual(['Users@rows'])
    expect([...tree.collectHandlerNames()]).toEqual(['handleToolbarClick'])
    expect(tree.root).toEqual(root)
    expect(tree.root).not.toBe(root)
  })

  it('getAllData 应等价于 toJSON（返回当前根引用）', () => {
    const tree = new SparkNodeTree({ root: createSparkNodeTree() })
    const snapshot = tree.getAllData()

    expect(snapshot).toEqual(tree.toJSON())
    expect(snapshot).toBe(tree.toJSON())
  })

  it('fromJson 应在反序列化时补齐缺失组件 id', () => {
    const tree = SparkNodeTree.fromJson({
      type: 'page-root',
      children: [
        { type: 'r-text' },
        {
          type: 'r-table',
          props: { id: 'table' },
          children: [{ type: 'el-table-column' }],
        },
      ],
    })

    const root = tree.getAllData()
    expect(root.id).toBe('page-root__0')

    const firstChild = root.children?.[0]
    const secondChild = root.children?.[1]
    expect(typeof firstChild === 'string').toBe(false)
    expect(typeof secondChild === 'string').toBe(false)

    if (typeof firstChild !== 'string') {
      expect(firstChild.id).toBe('r-text__0_0')
      expect(firstChild.props?.id).toBe('r-text__0_0')
    }

    if (typeof secondChild !== 'string') {
      expect(secondChild.id).toBe('table')
      const column = secondChild.children?.[0]
      if (typeof column !== 'string') {
        expect(column.id).toBe('el-table-column__0_1_0')
      }
    }
  })

  it('fromJson 补齐 id 时应保留历史字段（如 class）', () => {
    const tree = SparkNodeTree.fromJson({
      type: 'page-root',
      children: [
        {
          type: 'div',
          class: 'dataset-demo',
          children: [{ type: 'h1', children: ['title'] }],
        } as unknown as SparkNode,
      ],
    })

    const root = tree.getAllData()
    const firstChild = root.children?.[0]
    if (typeof firstChild === 'string') throw new Error('unexpected text child')

    expect(firstChild.id).toBe('div__0_0')
    expect((firstChild as unknown as Record<string, unknown>)['class']).toBe('dataset-demo')
  })

  it('fromJson 遇到重复组件 id 时应 fail-fast', () => {
    expect(() => SparkNodeTree.fromJson({
      type: 'page-root',
      children: [
        { type: 'r-text', id: 'dup' },
        { type: 'r-button', id: 'dup' },
      ],
    })).toThrow(/duplicated/i)
  })

  it('findByType 应能递归查找匹配类型并返回真实 id', () => {
    const tree = new SparkNodeTree({ root: createSparkNodeTree() })

    const result = tree.findByType({ type: 'el-table-column' })

    expect(result.total).toBe(1)
    expect(result.matches).toHaveLength(1)
    expect(result.matches[0]).toMatchObject({
      id: 'name-column',
      type: 'el-table-column',
      depth: 2,
      parentId: 'table',
    })
  })

  it('findByType 支持从 startComponentId 限定搜索子树', () => {
    const tree = new SparkNodeTree({ root: createSparkNodeTree() })

    expect(tree.findByType({ type: 'el-table-column', startComponentId: 'table' }).total).toBe(1)
    expect(tree.findByType({ type: 'el-table-column', startComponentId: 'toolbar' }).total).toBe(0)
  })

  it('findByType 无匹配时返回空数组且 total 为 0', () => {
    const tree = new SparkNodeTree({ root: createSparkNodeTree() })

    const result = tree.findByType({ type: 'r-tabs' })

    expect(result.total).toBe(0)
    expect(result.matches).toEqual([])
  })

  it('findByType 返回的 id 可直接用于 setProps', () => {
    const tree = new SparkNodeTree({ root: createSparkNodeTree() })
    const [first] = tree.findByType({ type: 'r-table' }).matches
    expect(first?.id).toBe('table')
    if (!first?.id) throw new Error('expected table id')

    tree.setProps({ componentId: first.id, props: { stripe: true }, merge: true })
    expect(tree.getNode({ componentId: 'table' })?.props).toMatchObject({ stripe: true })
  })

  it('findByType limit 应截断返回列表，但保留 total', () => {
    const tree = new SparkNodeTree({ root: createSparkNodeTree() })
    tree.addNode({ parentComponentId: 'toolbar', node: { type: 'r-button', id: 'btn-1' } })
    tree.addNode({ parentComponentId: 'toolbar', node: { type: 'r-button', id: 'btn-2' } })

    const result = tree.findByType({ type: 'r-button', limit: 1 })

    expect(result.total).toBe(2)
    expect(result.matches).toHaveLength(1)
  })

  it('addNode 应更新实例内部 root', () => {
    const root = createSparkNodeTree()
    const tree = new SparkNodeTree({ root })

    const result = tree.addNode({
      parentComponentId: 'toolbar',
      node: {
        type: 'r-button',
        id: 'refresh-action',
        props: { action: 'refresh' },
      },
    })

    expect(root).not.toBe(tree.root)
    expect(root.children?.length).toBe(3)
    expect(tree.getNode({ componentId: 'refresh-action' })?.type).toBe('r-button')
    expect(result.index).toBe(0)
  })

  it('addNodes 应支持一次插入多个兄弟节点', () => {
    const tree = new SparkNodeTree({ root: createSparkNodeTree() })

    const result = tree.addNodes({
      parentComponentId: 'toolbar',
      nodes: [
        { type: 'r-button', id: 'refresh-action', props: { action: 'refresh' } },
        { type: 'r-button', id: 'export-action', props: { action: 'export' } },
      ],
    })

    const children = tree.listChildren({ parentComponentId: 'toolbar' })
      .filter((child): child is SparkNode => typeof child !== 'string')

    expect(result.indexes).toEqual([0, 1])
    expect(children.map((child) => child.id)).toEqual(['refresh-action', 'export-action'])
  })

  it('moveNode 应移动已有节点并只返回位置摘要', () => {
    const tree = new SparkNodeTree({ root: createSparkNodeTree() })

    const result = tree.moveNode({
      componentId: 'name-column',
      parentComponentId: 'toolbar',
      index: 0,
    })

    const toolbarChildren = tree.listChildren({ parentComponentId: 'toolbar' })
      .filter((child): child is SparkNode => typeof child !== 'string')

    expect(result).toEqual({
      componentId: 'name-column',
      fromParentComponentId: 'table',
      toParentComponentId: 'toolbar',
      previousIndex: 0,
      index: 0,
    })
    expect(JSON.stringify(result)).not.toContain('el-table-column')
    expect(toolbarChildren.map((child) => child.id)).toEqual(['name-column'])
    expect(tree.listChildren({ parentComponentId: 'table' })).toEqual([])
  })

  it('moveNode 应拒绝移动根节点和移入自身后代', () => {
    const tree = new SparkNodeTree({ root: createSparkNodeTree() })

    expect(() => tree.moveNode({ componentId: 'root', parentComponentId: null })).toThrow(/root node/i)
    expect(() => tree.moveNode({ componentId: 'table', parentComponentId: 'name-column' })).toThrow(/descendant/i)
    expect(tree.historyCursor).toBe(0)
  })

  it('setProps 应支持 merge 与 replace', () => {
    const root = createSparkNodeTree()
    const tree = new SparkNodeTree({ root })

    const merged = tree.setProps({
      componentId: 'table',
      props: { stripe: true },
      merge: true,
    })

    expect(merged.node.props).toEqual({
      dataKey: 'Users@rows',
      border: true,
      stripe: true,
    })

    const replaced = tree.setProps({
      componentId: 'table',
      props: { dataKey: 'Orders@rows' },
      merge: false,
    })

    expect(replaced.node.props).toEqual({ dataKey: 'Orders@rows' })
  })

  it('setPropsBatch 应支持一次更新多个节点', () => {
    const tree = new SparkNodeTree({ root: createSparkNodeTree() })

    const result = tree.setPropsBatch({
      items: [
        { componentId: 'table', props: { stripe: true }, merge: true },
        { componentId: 'toolbar', props: { class: 'toolbar-wide' }, merge: true },
      ],
    })

    expect(result.nodes).toHaveLength(2)
    expect(tree.getNode({ componentId: 'table' })?.props).toMatchObject({ border: true, stripe: true })
    expect(tree.getNode({ componentId: 'toolbar' })?.props).toMatchObject({ class: 'toolbar-wide' })
  })

  it('replaceNode 应替换目标节点并返回旧节点', () => {
    const root = createSparkNodeTree()
    const tree = new SparkNodeTree({ root })

    const result = tree.replaceNode({
      componentId: 'name-column',
      node: {
        type: 'el-table-column',
        id: 'name-column',
        props: {
          field: 'displayName',
          label: '显示名',
        },
      },
    })

    expect(result.previous.props).toEqual({ field: 'name', label: '姓名' })
    expect(tree.getNode({ componentId: 'name-column' })?.props).toEqual({
      field: 'displayName',
      label: '显示名',
    })
  })

  it('replaceNodes 应支持一次替换多个节点', () => {
    const tree = new SparkNodeTree({ root: createSparkNodeTree() })

    const result = tree.replaceNodes({
      items: [
        {
          componentId: 'name-column',
          node: { type: 'el-table-column', id: 'name-column', props: { field: 'fullName', label: '全名' } },
        },
        {
          componentId: 'toolbar',
          node: { type: 'r-toolbar', id: 'toolbar', props: { dense: true } },
        },
      ],
    })

    expect(result.items).toHaveLength(2)
    expect(result.items[0]?.previous.props).toEqual({ field: 'name', label: '姓名' })
    expect(tree.getNode({ componentId: 'toolbar' })?.props).toEqual({ dense: true })
  })

  it('removeNode 应删除非根节点并对根节点 fail-fast', () => {
    const root = createSparkNodeTree()
    const tree = new SparkNodeTree({ root })

    const result = tree.removeNode({ componentId: 'toolbar' })
    expect(result.removed.id).toBe('toolbar')
    expect(tree.getNode({ componentId: 'toolbar' })).toBeNull()

    expect(() => tree.removeNode({ componentId: 'root' })).toThrow(/root node/i)
  })

  it('removeNodes 应支持一次删除多个节点', () => {
    const tree = new SparkNodeTree({ root: createSparkNodeTree() })

    const result = tree.removeNodes({
      componentIds: ['name-column', 'toolbar'],
    })

    expect(result.items).toHaveLength(2)
    expect(tree.getNode({ componentId: 'name-column' })).toBeNull()
    expect(tree.getNode({ componentId: 'toolbar' })).toBeNull()
  })

  it('应拒绝缺失节点和位置参数式调用', () => {
    const root = createSparkNodeTree()
    const tree = new SparkNodeTree({ root })

    expect(() => tree.addNode({ parentComponentId: 'missing', node: { type: 'r-text' } })).toThrow(/not found/i)

    if (false) {
      // @ts-expect-error SparkNodeTree 构造函数只接受命名参数对象
      new SparkNodeTree(root)
      // @ts-expect-error getNode 只接受命名参数对象
      tree.getNode('table')
      // @ts-expect-error addNode 只接受命名参数对象
      tree.addNode({ parentComponentId: 'root' }, { type: 'r-text' })
      // @ts-expect-error addNodes 只接受命名参数对象
      tree.addNodes([{ type: 'r-text' }])
    }
  })
})

// ─── undo / redo（SnapshotHistory 委托）────────────────────

describe('SparkNodeTree — undo / redo', () => {
  it('构造时应创建初始快照', () => {
    const root = createSparkNodeTree()
    const tree = new SparkNodeTree({ root })

    expect(tree.version).toBe(0)
    expect(tree.canUndo).toBe(false)
    expect(tree.canRedo).toBe(false)
    expect(tree.historyCursor).toBe(0)
  })

  it('写操作应自动推入快照', () => {
    const root = createSparkNodeTree()
    const tree = new SparkNodeTree({ root })

    tree.addNode({ parentComponentId: 'toolbar', node: { type: 'r-text', id: 'txt' } })
    expect(tree.version).toBe(1)
    expect(tree.historyCursor).toBe(1)

    tree.setProps({ componentId: 'txt', props: { field: 'name' } })
    expect(tree.version).toBe(2)
    expect(tree.historyCursor).toBe(2)
  })

  it('undo 应还原到上一个快照', () => {
    const root = createSparkNodeTree()
    const tree = new SparkNodeTree({ root })
    const rootBefore = tree.root

    tree.addNode({ parentComponentId: 'toolbar', node: { type: 'r-text', id: 'txt' } })
    expect(tree.getNode({ componentId: 'txt' })).not.toBeNull()

    const undone = tree.undo()
    expect(undone).toBe(rootBefore)
    expect(tree.getNode({ componentId: 'txt' })).toBeNull()
    expect(tree.canUndo).toBe(false)
    expect(tree.canRedo).toBe(true)
  })

  it('redo 应还原到下一个快照', () => {
    const root = createSparkNodeTree()
    const tree = new SparkNodeTree({ root })

    tree.addNode({ parentComponentId: 'toolbar', node: { type: 'r-text', id: 'txt' } })
    const rootAfterAdd = tree.root

    tree.undo()
    expect(tree.getNode({ componentId: 'txt' })).toBeNull()

    const redone = tree.redo()
    expect(redone).toBe(rootAfterAdd)
    expect(tree.getNode({ componentId: 'txt' })).not.toBeNull()
    expect(tree.canRedo).toBe(false)
  })

  it('多步 undo → redo 往返', () => {
    const root = createSparkNodeTree()
    const tree = new SparkNodeTree({ root })

    tree.addNode({ parentComponentId: 'toolbar', node: { type: 'r-text', id: 'txt1' } })
    tree.addNode({ parentComponentId: 'toolbar', node: { type: 'r-text', id: 'txt2' } })
    tree.addNode({ parentComponentId: 'toolbar', node: { type: 'r-text', id: 'txt3' } })
    expect(tree.version).toBe(3)
    expect(tree.historyCursor).toBe(3)

    tree.undo()
    tree.undo()
    expect(tree.historyCursor).toBe(1)
    expect(tree.getNode({ componentId: 'txt1' })).not.toBeNull()
    expect(tree.getNode({ componentId: 'txt2' })).toBeNull()

    tree.redo()
    expect(tree.historyCursor).toBe(2)
    expect(tree.getNode({ componentId: 'txt2' })).not.toBeNull()
    expect(tree.getNode({ componentId: 'txt3' })).toBeNull()
  })

  it('新写操作应截断前方 redo 历史（标准分支语义）', () => {
    const root = createSparkNodeTree()
    const tree = new SparkNodeTree({ root })

    tree.addNode({ parentComponentId: 'toolbar', node: { type: 'r-text', id: 'txt1' } })
    tree.addNode({ parentComponentId: 'toolbar', node: { type: 'r-text', id: 'txt2' } })
    tree.undo()
    expect(tree.canRedo).toBe(true)

    // 分支：新写操作清除 redo
    tree.addNode({ parentComponentId: 'toolbar', node: { type: 'r-text', id: 'txt3' } })
    expect(tree.canRedo).toBe(false)
    expect(tree.getNode({ componentId: 'txt2' })).toBeNull()
    expect(tree.getNode({ componentId: 'txt3' })).not.toBeNull()
  })

  it('无可撤销/重做时返回 null', () => {
    const tree = new SparkNodeTree({ root: createSparkNodeTree() })
    expect(tree.undo()).toBeNull()
    expect(tree.redo()).toBeNull()
  })

  it('historyLimit=0 应禁用所有历史功能', () => {
    const tree = new SparkNodeTree({ root: createSparkNodeTree(), historyLimit: 0 })
    tree.addNode({ parentComponentId: 'toolbar', node: { type: 'r-text', id: 'txt' } })

    expect(tree.canUndo).toBe(false)
    expect(tree.canRedo).toBe(false)
    expect(tree.historyCursor).toBe(-1)
    expect(tree.undo()).toBeNull()
  })

  it('historyLimit 应限制最大条目数', () => {
    const tree = new SparkNodeTree({ root: createSparkNodeTree(), historyLimit: 3 })

    // 构造 v0 已占 1 个位置
    tree.addNode({ parentComponentId: 'toolbar', node: { type: 'r-text', id: 'a' } }) // v1
    tree.addNode({ parentComponentId: 'toolbar', node: { type: 'r-text', id: 'b' } }) // v2
    tree.addNode({ parentComponentId: 'toolbar', node: { type: 'r-text', id: 'c' } }) // v3

    // 限制 3 条，最旧的被淘汰，cursor 应留在末尾
    expect(tree.historyCursor).toBe(2) // 0, 1, 2 三个位置
    expect(tree.canUndo).toBe(true)
  })

  it('clearHistory 应仅保留当前快照', () => {
    const tree = new SparkNodeTree({ root: createSparkNodeTree() })
    tree.addNode({ parentComponentId: 'toolbar', node: { type: 'r-text', id: 'a' } })
    tree.addNode({ parentComponentId: 'toolbar', node: { type: 'r-text', id: 'b' } })

    tree.clearHistory()
    expect(tree.canUndo).toBe(false)
    expect(tree.canRedo).toBe(false)
    expect(tree.historyCursor).toBe(0)
    // root 不变
    expect(tree.getNode({ componentId: 'b' })).not.toBeNull()
  })

  it('removeNode 失败时不应产生脏历史', () => {
    const tree = new SparkNodeTree({ root: createSparkNodeTree() })

    expect(() => tree.removeNode({ componentId: 'root' })).toThrow(/root node/i)
    // 没有成功写操作，历史仅初始快照
    expect(tree.historyCursor).toBe(0)
    expect(tree.canUndo).toBe(false)
  })

  it('historyCursor 应为只读属性', () => {
    const tree = new SparkNodeTree({ root: createSparkNodeTree() })
    tree.addNode({ parentComponentId: 'toolbar', node: { type: 'r-text', id: 'a' } })
    expect(tree.historyCursor).toBe(1)
    tree.undo()
    expect(tree.historyCursor).toBe(0)
    tree.redo()
    expect(tree.historyCursor).toBe(1)
  })

  it('所有 5 种写操作均自动记录历史', () => {
    const tree = new SparkNodeTree({ root: createSparkNodeTree() })

    tree.addNode({ parentComponentId: 'toolbar', node: { type: 'r-text', id: 'x' } })
    expect(tree.historyCursor).toBe(1)
    tree.setProps({ componentId: 'x', props: { label: 'test' } })
    expect(tree.historyCursor).toBe(2)
    tree.replaceNode({ componentId: 'x', node: { type: 'r-text', id: 'x', props: {} } })
    expect(tree.historyCursor).toBe(3)
    tree.moveNode({ componentId: 'x', parentComponentId: null })
    expect(tree.historyCursor).toBe(4)
    tree.removeNode({ componentId: 'x' })
    expect(tree.historyCursor).toBe(5)

    // 全部可 undo
    expect(tree.canUndo).toBe(true)
  })
})