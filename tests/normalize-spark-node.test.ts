/**
 * SparkNode v2 归一化测试
 *
 * 验证 normalizeSparkNode + isSparkNode + bindDataToRules 对 SparkNode 格式的支持
 */
import { describe, expect, test } from 'vitest'
import { normalizeSparkNode, isSparkNode } from '@spark-view/spark-component'
import type { SparkNode, BindRule } from '@spark-view/spark-component'

// ── isSparkNode 检测 ──────────────────────────────────────────────────────

describe('isSparkNode', () => {
  test('有 meta 对象 → true', () => {
    expect(isSparkNode({ type: 'r-table', meta: { data: { dataKey: 'X@rows' } } } as unknown as BindRule)).toBe(true)
  })

  test('空 meta 对象 → true', () => {
    expect(isSparkNode({ type: 'div', meta: {} } as unknown as BindRule)).toBe(true)
  })

  test('无 meta → false', () => {
    expect(isSparkNode({ type: 'div', props: {} })).toBe(false)
  })

  test('meta 为 null → false', () => {
    expect(isSparkNode({ type: 'div', meta: null } as unknown as BindRule)).toBe(false)
  })
})

// ── DataConfig ─────────────────────────────────────────────────────────────

describe('normalizeSparkNode — data', () => {
  test('dataKey → 顶层 rule.dataKey', () => {
    const node: SparkNode = {
      type: 'r-table',
      meta: { data: { dataKey: 'Users@rows' } },
    }
    const rule = normalizeSparkNode(node)
    expect(rule['dataKey']).toBe('Users@rows')
  })

  test('name → rule.name', () => {
    const node: SparkNode = {
      type: 'r-text',
      meta: { data: { name: 'userName' } },
      props: { label: '用户名' },
    }
    const rule = normalizeSparkNode(node)
    expect(rule.name).toBe('userName')
    expect(rule.props?.['label']).toBe('用户名')
  })

  test('options → props.options', () => {
    const opts = [{ label: '启用', value: 'active' }]
    const node: SparkNode = {
      type: 'r-select',
      meta: { data: { name: 'status', options: opts } },
    }
    const rule = normalizeSparkNode(node)
    expect(rule.props?.['options']).toEqual(opts)
  })

  test('optionLabelField/optionValueField → props', () => {
    const node: SparkNode = {
      type: 'r-select',
      meta: { data: { name: 's', optionLabelField: 'text', optionValueField: 'val' } },
    }
    const rule = normalizeSparkNode(node)
    expect(rule.props?.['optionLabelField']).toBe('text')
    expect(rule.props?.['optionValueField']).toBe('val')
  })
})

// ── FilterConfig ───────────────────────────────────────────────────────────

describe('normalizeSparkNode — filter', () => {
  test('filter 布局属性全量映射', () => {
    const node: SparkNode = {
      type: 'r-table',
      meta: {
        filter: {
          collapsible: true,
          defaultCollapsed: false,
          autoFitMinWidth: '220px',
          itemSpan: 8,
          gridColumns: 12,
          gridGap: '16px',
          gridAutoRows: 'minmax(32px, auto)',
          class: 'my-filter',
        },
      },
    }
    const rule = normalizeSparkNode(node)
    expect(rule.props?.['filterCollapsible']).toBe(true)
    expect(rule.props?.['filterDefaultCollapsed']).toBe(false)
    expect(rule.props?.['filterAutoFitMinWidth']).toBe('220px')
    expect(rule.props?.['filterItemSpan']).toBe(8)
    expect(rule.props?.['filterGridColumns']).toBe(12)
    expect(rule.props?.['filterGridGap']).toBe('16px')
    expect(rule.props?.['filterGridAutoRows']).toBe('minmax(32px, auto)')
    expect(rule.props?.['filterClass']).toBe('my-filter')
  })

  test('filter items 字符串简写 → filterItems', () => {
    const node: SparkNode = {
      type: 'r-table',
      meta: { filter: { items: ['name', 'status'] } },
    }
    const rule = normalizeSparkNode(node)
    expect(rule.props?.['filterItems']).toEqual(['name', 'status'])
  })

  test('filter items 完整配置（组件/选项/逻辑）→ filterItems', () => {
    const node: SparkNode = {
      type: 'r-table',
      meta: {
        filter: {
          logic: 'and',
          items: [
            { field: 'name', label: '姓名', component: 'text' },
            {
              field: 'status',
              label: '状态',
              component: 'select',
              options: [{ label: '启用', value: 1 }, { label: '禁用', value: 0 }],
            },
            { field: 'score', component: 'number-range', logic: 'or', span: 12 },
          ],
        },
      },
    }
    const rule = normalizeSparkNode(node)
    expect(rule.props?.['filterLogic']).toBe('and')
    const items = rule.props?.['filterItems'] as unknown[]
    expect(items).toHaveLength(3)
    expect((items[0] as Record<string, unknown>)['field']).toBe('name')
    expect((items[1] as Record<string, unknown>)['component']).toBe('select')
    expect((items[2] as Record<string, unknown>)['logic']).toBe('or')
  })

  test('filter.on 事件 → rule.on', () => {
    const node: SparkNode = {
      type: 'r-table',
      meta: {
        filter: {
          items: ['name'],
          on: { search: 'handleSearch', reset: 'handleReset', change: 'handleChange' },
        },
      },
    }
    const rule = normalizeSparkNode(node)
    const on = rule['on'] as Record<string, string>
    expect(on?.['search']).toBe('handleSearch')
    expect(on?.['reset']).toBe('handleReset')
    expect(on?.['change']).toBe('handleChange')
  })

  test('filter.on 与 behavior.on 合并：behavior.on 优先', () => {
    const node: SparkNode = {
      type: 'r-table',
      meta: {
        filter: { on: { search: 'filterSearch' } },
        behavior: { on: { search: 'behaviorSearch', click: 'handleClick' } },
      },
    }
    const rule = normalizeSparkNode(node)
    const on = rule['on'] as Record<string, string>
    expect(on?.['search']).toBe('behaviorSearch') // behavior.on 优先
    expect(on?.['click']).toBe('handleClick')
  })
})

// ── LayoutConfig ───────────────────────────────────────────────────────────

describe('normalizeSparkNode — layout', () => {
  test('colSpan / rowSpan → props', () => {
    const node: SparkNode = {
      type: 'r-text',
      meta: { layout: { colSpan: 12, rowSpan: 2 } },
    }
    const rule = normalizeSparkNode(node)
    expect(rule.props?.['colSpan']).toBe(12)
    expect(rule.props?.['rowSpan']).toBe(2)
  })

  test('grid → gridColumns / gridGap / gridAutoRows', () => {
    const node: SparkNode = {
      type: 'r-form',
      meta: { layout: { grid: { columns: 24, gap: '16px', autoRows: 'auto' } } },
    }
    const rule = normalizeSparkNode(node)
    expect(rule.props?.['gridColumns']).toBe(24)
    expect(rule.props?.['gridGap']).toBe('16px')
    expect(rule.props?.['gridAutoRows']).toBe('auto')
  })

  test('style / class 写在 props 内 → 保留透传', () => {
    // SparkNode v2：style / class 是 HTML 原生属性，写在 props，不在节点顶层
    const node: SparkNode = {
      type: 'div',
      props: { style: { display: 'flex' }, class: 'my-div' },
    }
    const rule = normalizeSparkNode(node)
    expect(rule.props?.['style']).toEqual({ display: 'flex' })
    expect(rule.props?.['class']).toBe('my-div')
  })

  test('props.class 支持数组格式', () => {
    const node: SparkNode = {
      type: 'div',
      props: { class: ['container', 'flex'] },
    }
    const rule = normalizeSparkNode(node)
    expect(rule.props?.['class']).toEqual(['container', 'flex'])
  })
})

// ── ToolbarConfig ──────────────────────────────────────────────────────────

describe('normalizeSparkNode — toolbar', () => {
  test('toolbar items 递归归一化 + position/class', () => {
    const node: SparkNode = {
      type: 'r-table',
      meta: {
        toolbar: {
          items: [
            { type: 'el-button', props: { type: 'primary' }, children: [{ type: 'span' }] },
          ],
          position: 'top',
          class: 'toolbar-cls',
        },
      },
    }
    const rule = normalizeSparkNode(node)
    expect(Array.isArray(rule.props?.['toolbar'])).toBe(true)
    const toolbarItems = rule.props!['toolbar'] as BindRule[]
    expect(toolbarItems[0]!.type).toBe('el-button')
    expect(rule.props?.['toolbarPosition']).toBe('top')
    expect(rule.props?.['toolbarClass']).toBe('toolbar-cls')
  })
})

// ── ActionsConfig（Simple） ────────────────────────────────────────────────

describe('normalizeSparkNode — actions (simple)', () => {
  test('r-table → rowActions + rowActionsLabel/Width', () => {
    const node: SparkNode = {
      type: 'r-table',
      meta: {
        actions: {
          items: [{ type: 'el-button', props: { link: true } }],
          label: '操作',
          width: 150,
          position: 'right',
        },
      },
    }
    const rule = normalizeSparkNode(node)
    expect(Array.isArray(rule.props?.['rowActions'])).toBe(true)
    expect(rule.props?.['rowActionsLabel']).toBe('操作')
    expect(rule.props?.['rowActionsWidth']).toBe(150)
    expect(rule.props?.['rowActionsPosition']).toBe('right')
  })

  test('r-tree → nodeActions', () => {
    const node: SparkNode = {
      type: 'r-tree',
      meta: {
        actions: {
          items: [{ type: 'el-button' }],
        },
      },
    }
    const rule = normalizeSparkNode(node)
    expect(Array.isArray(rule.props?.['nodeActions'])).toBe(true)
  })

  test('r-list → itemActions', () => {
    const node: SparkNode = {
      type: 'r-list',
      meta: {
        actions: {
          items: [{ type: 'el-button' }],
        },
      },
    }
    const rule = normalizeSparkNode(node)
    expect(Array.isArray(rule.props?.['itemActions'])).toBe(true)
  })
})

// ── ActionsConfig（Dual） ──────────────────────────────────────────────────

describe('normalizeSparkNode — actions (dual)', () => {
  test('r-dialog header + footer → headerActions + footerActions', () => {
    const node: SparkNode = {
      type: 'r-dialog',
      meta: {
        actions: {
          header: { items: [{ type: 'el-button' }] },
          footer: {
            items: [
              { type: 'el-button', props: { type: 'primary' } },
            ],
          },
        },
      },
    }
    const rule = normalizeSparkNode(node)
    expect(Array.isArray(rule.props?.['headerActions'])).toBe(true)
    expect(Array.isArray(rule.props?.['footerActions'])).toBe(true)
  })

  test('r-drawer SimpleActionsConfig → footerActions（兼容）', () => {
    const node: SparkNode = {
      type: 'r-drawer',
      meta: {
        actions: {
          items: [{ type: 'el-button' }],
        },
      },
    }
    const rule = normalizeSparkNode(node)
    expect(Array.isArray(rule.props?.['footerActions'])).toBe(true)
    // 没有走 header 分支
    expect(rule.props?.['headerActions']).toBeUndefined()
  })
})

// ── StateConfig ────────────────────────────────────────────────────────────

describe('normalizeSparkNode — state', () => {
  test('visible / disabled → 顶层属性', () => {
    const node: SparkNode = {
      type: 'div',
      meta: { state: { visible: false, disabled: true } },
    }
    const rule = normalizeSparkNode(node)
    expect(rule['visible']).toBe(false)
    expect(rule['disabled']).toBe(true)
  })

  test('modelValue → props.modelValue', () => {
    const node: SparkNode = {
      type: 'r-dialog',
      meta: { state: { modelValue: true } },
    }
    const rule = normalizeSparkNode(node)
    expect(rule.props?.['modelValue']).toBe(true)
  })

  test('collapsed → props.collapsed', () => {
    const node: SparkNode = {
      type: 'r-section',
      meta: { state: { collapsed: true } },
    }
    const rule = normalizeSparkNode(node)
    expect(rule.props?.['collapsed']).toBe(true)
  })
})

// ── BehaviorConfig ─────────────────────────────────────────────────────────

describe('normalizeSparkNode — behavior', () => {
  test('标准 DOM 事件 → rule.on', () => {
    const node: SparkNode = {
      type: 'r-table',
      meta: { behavior: { on: { rowDblclick: 'handleRowDblclick' } } },
    }
    const rule = normalizeSparkNode(node)
    expect(rule.on?.['rowDblclick']).toBe('handleRowDblclick')
  })

  test('生命周期事件 → props.onXxx', () => {
    const node: SparkNode = {
      type: 'r-dialog',
      meta: { behavior: { on: { open: 'handleOpen', close: 'handleClose' } } },
    }
    const rule = normalizeSparkNode(node)
    expect(rule.props?.['onOpen']).toBe('handleOpen')
    expect(rule.props?.['onClose']).toBe('handleClose')
    // 不应出现在 rule.on 中
    expect(rule.on?.['open']).toBeUndefined()
  })

  test('混合事件：DOM + 生命周期分流', () => {
    const node: SparkNode = {
      type: 'r-tree',
      meta: {
        behavior: { on: { click: 'handleClick', nodeClick: 'handleNodeClick' } },
      },
    }
    const rule = normalizeSparkNode(node)
    // click → rule.on（标准 DOM 事件）
    expect(rule.on?.['click']).toBe('handleClick')
    // nodeClick → props.onNodeClick（组件特定事件）
    expect(rule.props?.['onNodeClick']).toBe('handleNodeClick')
  })
})

// ── 递归 children ──────────────────────────────────────────────────────────

describe('normalizeSparkNode — children 递归', () => {
  test('children 递归归一化', () => {
    const node: SparkNode = {
      type: 'r-form',
      meta: { data: { dataKey: 'Users@currentRow' } },
      children: [
        {
          type: 'r-text',
          meta: { data: { name: 'userName' }, layout: { colSpan: 12 } },
          props: { label: '用户名' },
        },
      ],
    }
    const rule = normalizeSparkNode(node)
    expect(rule.children).toHaveLength(1)
    const child = rule.children![0] as BindRule
    expect(child.name).toBe('userName')
    expect(child.props?.['colSpan']).toBe(12)
    expect(child.props?.['label']).toBe('用户名')
  })
})

// ── 完整示例（r-table + filter + toolbar + actions） ──────────────────────

describe('normalizeSparkNode — 完整 r-table 示例', () => {
  test('所有 7 域联合映射', () => {
    const node: SparkNode = {
      type: 'r-table',
      props: { border: true, highlightCurrentRow: true },
      meta: {
        data: { dataKey: 'Users@rows' },
        layout: { grid: { columns: 24 } },
        filter: { items: ['name', 'status'], collapsible: true },
        toolbar: {
          items: [{ type: 'el-button', props: { type: 'primary' } }],
          position: 'top',
        },
        actions: {
          items: [{ type: 'el-button', props: { link: true } }],
          label: '操作',
          width: 150,
        },
        state: { visible: true },
        behavior: { on: { rowDblclick: 'handleDblclick' } },
      },
      children: [
        { type: 'r-text', meta: { data: { name: 'name' } }, props: { label: '名称' } },
      ],
    }

    const rule = normalizeSparkNode(node)

    // data
    expect(rule['dataKey']).toBe('Users@rows')
    // layout
    expect(rule.props?.['gridColumns']).toBe(24)
    // filter
    expect(rule.props?.['filterItems']).toEqual(['name', 'status'])
    expect(rule.props?.['filterCollapsible']).toBe(true)
    // toolbar
    expect(Array.isArray(rule.props?.['toolbar'])).toBe(true)
    expect(rule.props?.['toolbarPosition']).toBe('top')
    // actions
    expect(Array.isArray(rule.props?.['rowActions'])).toBe(true)
    expect(rule.props?.['rowActionsLabel']).toBe('操作')
    expect(rule.props?.['rowActionsWidth']).toBe(150)
    // state
    expect(rule['visible']).toBe(true)
    // behavior
    expect(rule.on?.['rowDblclick']).toBe('handleDblclick')
    // 原生 props 保留
    expect(rule.props?.['border']).toBe(true)
    expect(rule.props?.['highlightCurrentRow']).toBe(true)
    // children 递归
    expect(rule.children).toHaveLength(1)
    const child = rule.children![0] as BindRule
    expect(child.name).toBe('name')
  })
})

// ── id 透传 ────────────────────────────────────────────────────────────────

describe('normalizeSparkNode — id', () => {
  test('id 透传到 rule', () => {
    const node: SparkNode = { type: 'r-table', id: 'main-table' }
    const rule = normalizeSparkNode(node)
    expect(rule['id']).toBe('main-table')
  })

  test('无 id 时不设置', () => {
    const node: SparkNode = { type: 'div' }
    const rule = normalizeSparkNode(node)
    expect(rule['id']).toBeUndefined()
  })
})

// ── 无 meta 兼容 ──────────────────────────────────────────────────────────

describe('normalizeSparkNode — 无 meta', () => {
  test('纯原始节点（无 meta）原样透传', () => {
    const node: SparkNode = {
      type: 'el-button',
      props: { type: 'primary' },
      children: [{ type: 'span' }],
    }
    const rule = normalizeSparkNode(node)
    expect(rule.type).toBe('el-button')
    expect(rule.props?.['type']).toBe('primary')
    expect(rule.children).toHaveLength(1)
  })
})
