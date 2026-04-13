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

    expect(tree.getNode({ nodeId: 'table' })?.type).toBe('r-table')
    expect(tree.getParent({ nodeId: 'name-column' })?.id).toBe('table')
    expect(tree.getLocation({ nodeId: 'name-column' })).toMatchObject({
      depth: 2,
      index: 0,
    })
    expect(tree.hasNode({ nodeId: 'toolbar' })).toBe(true)
    expect(tree.countNodes()).toBe(4)
    expect([...tree.collectDataKeys()]).toEqual(['Users@rows'])
    expect([...tree.collectHandlerNames()]).toEqual(['handleToolbarClick'])
    expect(tree.root).toBe(root)
  })

  it('addNode 应更新实例内部 root', () => {
    const root = createSparkNodeTree()
    const tree = new SparkNodeTree({ root })

    const result = tree.addNode({
      parentId: 'toolbar',
      node: {
        type: 'r-button',
        id: 'refresh-action',
        props: { action: 'refresh' },
      },
    })

    expect(root).not.toBe(tree.root)
    expect(root.children?.length).toBe(3)
    expect(tree.getNode({ nodeId: 'refresh-action' })?.type).toBe('r-button')
    expect(result.index).toBe(0)
  })

  it('addNodes 应支持一次插入多个兄弟节点', () => {
    const tree = new SparkNodeTree({ root: createSparkNodeTree() })

    const result = tree.addNodes({
      parentId: 'toolbar',
      nodes: [
        { type: 'r-button', id: 'refresh-action', props: { action: 'refresh' } },
        { type: 'r-button', id: 'export-action', props: { action: 'export' } },
      ],
    })

    const children = tree.listChildren({ parentId: 'toolbar' })
      .filter((child): child is SparkNode => typeof child !== 'string')

    expect(result.indexes).toEqual([0, 1])
    expect(children.map((child) => child.id)).toEqual(['refresh-action', 'export-action'])
  })

  it('setProps 应支持 merge 与 replace', () => {
    const root = createSparkNodeTree()
    const tree = new SparkNodeTree({ root })

    const merged = tree.setProps({
      nodeId: 'table',
      props: { stripe: true },
      merge: true,
    })

    expect(merged.node.props).toEqual({
      dataKey: 'Users@rows',
      border: true,
      stripe: true,
    })

    const replaced = tree.setProps({
      nodeId: 'table',
      props: { dataKey: 'Orders@rows' },
      merge: false,
    })

    expect(replaced.node.props).toEqual({ dataKey: 'Orders@rows' })
  })

  it('setPropsBatch 应支持一次更新多个节点', () => {
    const tree = new SparkNodeTree({ root: createSparkNodeTree() })

    const result = tree.setPropsBatch({
      items: [
        { nodeId: 'table', props: { stripe: true }, merge: true },
        { nodeId: 'toolbar', props: { class: 'toolbar-wide' }, merge: true },
      ],
    })

    expect(result.nodes).toHaveLength(2)
    expect(tree.getNode({ nodeId: 'table' })?.props).toMatchObject({ border: true, stripe: true })
    expect(tree.getNode({ nodeId: 'toolbar' })?.props).toMatchObject({ class: 'toolbar-wide' })
  })

  it('replaceNode 应替换目标节点并返回旧节点', () => {
    const root = createSparkNodeTree()
    const tree = new SparkNodeTree({ root })

    const result = tree.replaceNode({
      nodeId: 'name-column',
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
    expect(tree.getNode({ nodeId: 'name-column' })?.props).toEqual({
      field: 'displayName',
      label: '显示名',
    })
  })

  it('replaceNodes 应支持一次替换多个节点', () => {
    const tree = new SparkNodeTree({ root: createSparkNodeTree() })

    const result = tree.replaceNodes({
      items: [
        {
          nodeId: 'name-column',
          node: { type: 'el-table-column', id: 'name-column', props: { field: 'fullName', label: '全名' } },
        },
        {
          nodeId: 'toolbar',
          node: { type: 'r-toolbar', id: 'toolbar', props: { dense: true } },
        },
      ],
    })

    expect(result.items).toHaveLength(2)
    expect(result.items[0]?.previous.props).toEqual({ field: 'name', label: '姓名' })
    expect(tree.getNode({ nodeId: 'toolbar' })?.props).toEqual({ dense: true })
  })

  it('removeNode 应删除非根节点并对根节点 fail-fast', () => {
    const root = createSparkNodeTree()
    const tree = new SparkNodeTree({ root })

    const result = tree.removeNode({ nodeId: 'toolbar' })
    expect(result.removed.id).toBe('toolbar')
    expect(tree.getNode({ nodeId: 'toolbar' })).toBeNull()

    expect(() => tree.removeNode({ nodeId: 'root' })).toThrow(/root node/i)
  })

  it('removeNodes 应支持一次删除多个节点', () => {
    const tree = new SparkNodeTree({ root: createSparkNodeTree() })

    const result = tree.removeNodes({
      nodeIds: ['name-column', 'toolbar'],
    })

    expect(result.items).toHaveLength(2)
    expect(tree.getNode({ nodeId: 'name-column' })).toBeNull()
    expect(tree.getNode({ nodeId: 'toolbar' })).toBeNull()
  })

  it('应拒绝缺失节点和位置参数式调用', () => {
    const root = createSparkNodeTree()
    const tree = new SparkNodeTree({ root })

    expect(() => tree.addNode({ parentId: 'missing', node: { type: 'r-text' } })).toThrow(/not found/i)

    if (false) {
      // @ts-expect-error SparkNodeTree 构造函数只接受命名参数对象
      new SparkNodeTree(root)
      // @ts-expect-error getNode 只接受命名参数对象
      tree.getNode('table')
      // @ts-expect-error addNode 只接受命名参数对象
      tree.addNode({ parentId: 'root' }, { type: 'r-text' })
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

    tree.addNode({ parentId: 'toolbar', node: { type: 'r-text', id: 'txt' } })
    expect(tree.version).toBe(1)
    expect(tree.historyCursor).toBe(1)

    tree.setProps({ nodeId: 'txt', props: { field: 'name' } })
    expect(tree.version).toBe(2)
    expect(tree.historyCursor).toBe(2)
  })

  it('undo 应还原到上一个快照', () => {
    const root = createSparkNodeTree()
    const tree = new SparkNodeTree({ root })
    const rootBefore = tree.root

    tree.addNode({ parentId: 'toolbar', node: { type: 'r-text', id: 'txt' } })
    expect(tree.getNode({ nodeId: 'txt' })).not.toBeNull()

    const undone = tree.undo()
    expect(undone).toBe(rootBefore)
    expect(tree.getNode({ nodeId: 'txt' })).toBeNull()
    expect(tree.canUndo).toBe(false)
    expect(tree.canRedo).toBe(true)
  })

  it('redo 应还原到下一个快照', () => {
    const root = createSparkNodeTree()
    const tree = new SparkNodeTree({ root })

    tree.addNode({ parentId: 'toolbar', node: { type: 'r-text', id: 'txt' } })
    const rootAfterAdd = tree.root

    tree.undo()
    expect(tree.getNode({ nodeId: 'txt' })).toBeNull()

    const redone = tree.redo()
    expect(redone).toBe(rootAfterAdd)
    expect(tree.getNode({ nodeId: 'txt' })).not.toBeNull()
    expect(tree.canRedo).toBe(false)
  })

  it('多步 undo → redo 往返', () => {
    const root = createSparkNodeTree()
    const tree = new SparkNodeTree({ root })

    tree.addNode({ parentId: 'toolbar', node: { type: 'r-text', id: 'txt1' } })
    tree.addNode({ parentId: 'toolbar', node: { type: 'r-text', id: 'txt2' } })
    tree.addNode({ parentId: 'toolbar', node: { type: 'r-text', id: 'txt3' } })
    expect(tree.version).toBe(3)
    expect(tree.historyCursor).toBe(3)

    tree.undo()
    tree.undo()
    expect(tree.historyCursor).toBe(1)
    expect(tree.getNode({ nodeId: 'txt1' })).not.toBeNull()
    expect(tree.getNode({ nodeId: 'txt2' })).toBeNull()

    tree.redo()
    expect(tree.historyCursor).toBe(2)
    expect(tree.getNode({ nodeId: 'txt2' })).not.toBeNull()
    expect(tree.getNode({ nodeId: 'txt3' })).toBeNull()
  })

  it('新写操作应截断前方 redo 历史（标准分支语义）', () => {
    const root = createSparkNodeTree()
    const tree = new SparkNodeTree({ root })

    tree.addNode({ parentId: 'toolbar', node: { type: 'r-text', id: 'txt1' } })
    tree.addNode({ parentId: 'toolbar', node: { type: 'r-text', id: 'txt2' } })
    tree.undo()
    expect(tree.canRedo).toBe(true)

    // 分支：新写操作清除 redo
    tree.addNode({ parentId: 'toolbar', node: { type: 'r-text', id: 'txt3' } })
    expect(tree.canRedo).toBe(false)
    expect(tree.getNode({ nodeId: 'txt2' })).toBeNull()
    expect(tree.getNode({ nodeId: 'txt3' })).not.toBeNull()
  })

  it('无可撤销/重做时返回 null', () => {
    const tree = new SparkNodeTree({ root: createSparkNodeTree() })
    expect(tree.undo()).toBeNull()
    expect(tree.redo()).toBeNull()
  })

  it('historyLimit=0 应禁用所有历史功能', () => {
    const tree = new SparkNodeTree({ root: createSparkNodeTree(), historyLimit: 0 })
    tree.addNode({ parentId: 'toolbar', node: { type: 'r-text', id: 'txt' } })

    expect(tree.canUndo).toBe(false)
    expect(tree.canRedo).toBe(false)
    expect(tree.historyCursor).toBe(-1)
    expect(tree.undo()).toBeNull()
  })

  it('historyLimit 应限制最大条目数', () => {
    const tree = new SparkNodeTree({ root: createSparkNodeTree(), historyLimit: 3 })

    // 构造 v0 已占 1 个位置
    tree.addNode({ parentId: 'toolbar', node: { type: 'r-text', id: 'a' } }) // v1
    tree.addNode({ parentId: 'toolbar', node: { type: 'r-text', id: 'b' } }) // v2
    tree.addNode({ parentId: 'toolbar', node: { type: 'r-text', id: 'c' } }) // v3

    // 限制 3 条，最旧的被淘汰，cursor 应留在末尾
    expect(tree.historyCursor).toBe(2) // 0, 1, 2 三个位置
    expect(tree.canUndo).toBe(true)
  })

  it('clearHistory 应仅保留当前快照', () => {
    const tree = new SparkNodeTree({ root: createSparkNodeTree() })
    tree.addNode({ parentId: 'toolbar', node: { type: 'r-text', id: 'a' } })
    tree.addNode({ parentId: 'toolbar', node: { type: 'r-text', id: 'b' } })

    tree.clearHistory()
    expect(tree.canUndo).toBe(false)
    expect(tree.canRedo).toBe(false)
    expect(tree.historyCursor).toBe(0)
    // root 不变
    expect(tree.getNode({ nodeId: 'b' })).not.toBeNull()
  })

  it('removeNode 失败时不应产生脏历史', () => {
    const tree = new SparkNodeTree({ root: createSparkNodeTree() })

    expect(() => tree.removeNode({ nodeId: 'root' })).toThrow(/root node/i)
    // 没有成功写操作，历史仅初始快照
    expect(tree.historyCursor).toBe(0)
    expect(tree.canUndo).toBe(false)
  })

  it('historyCursor 应为只读属性', () => {
    const tree = new SparkNodeTree({ root: createSparkNodeTree() })
    tree.addNode({ parentId: 'toolbar', node: { type: 'r-text', id: 'a' } })
    expect(tree.historyCursor).toBe(1)
    tree.undo()
    expect(tree.historyCursor).toBe(0)
    tree.redo()
    expect(tree.historyCursor).toBe(1)
  })

  it('所有 4 种写操作均自动记录历史', () => {
    const tree = new SparkNodeTree({ root: createSparkNodeTree() })

    tree.addNode({ parentId: 'toolbar', node: { type: 'r-text', id: 'x' } })
    expect(tree.historyCursor).toBe(1)
    tree.setProps({ nodeId: 'x', props: { label: 'test' } })
    expect(tree.historyCursor).toBe(2)
    tree.replaceNode({ nodeId: 'x', node: { type: 'r-text', id: 'x', props: {} } })
    expect(tree.historyCursor).toBe(3)
    tree.removeNode({ nodeId: 'x' })
    expect(tree.historyCursor).toBe(4)

    // 全部可 undo
    expect(tree.canUndo).toBe(true)
  })
})