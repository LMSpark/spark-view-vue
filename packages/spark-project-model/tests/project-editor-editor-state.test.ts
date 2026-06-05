import { describe, expect, it } from 'vitest'
import type { ProjectNodeData } from '@spark-appworks/spark-project-model'
import { ConfigPageNode, ConfigSubPageNode, isConfigSubPageNode } from '@spark-appworks/spark-project-model'
import { tryParsePageDataTextError, tryParseRuleTextError } from '../src/model/page/serial'
import { createProjectEditor, type ProjectEditor } from '@spark-appworks/spark-project-model/project'
import { createRequest } from '@spark-appworks/spark-utils'

function createEditorWithNavigation(children: ProjectNodeData[]): ProjectEditor {
  const http = createRequest()
  const editor = createProjectEditor({
    projectId: 'crm',
    http,
    getPageFilesApi: () => '/api/pages-config',
    getNavigationApi: () => '/api/navigation',
    fileStorage: 'memory',
  })
  editor.project.replaceRoot({
    id: 'homepage_root',
    title: 'CRM',
    nodeKind: 'module',
    childPlacement: 'header',
    children,
  })
  return editor
}

describe('ProjectEditor.session — selection and active page', () => {
  it('tracks selected node and active page in editor session (without loading files)', () => {
    const editor = createEditorWithNavigation([
      { id: 'orders', title: '订单', nodeKind: 'page', path: '/orders' },
    ])

    editor.selectNode('orders')
    expect(editor.session.selectedNodeId).toBe('orders')

    editor.setActivePage('orders')
    const snapshot = editor.readSnapshot()
    expect(editor.session.activePageId).toBe('orders')
    expect(snapshot.selectedNodeId).toBe('orders')
    expect(snapshot.pageId).toBe('orders')
  })

  it('clearActivePage clears session and keeps snapshot consistent', () => {
    const editor = createEditorWithNavigation([
      { id: 'orders', title: '订单', nodeKind: 'page', path: '/orders' },
    ])

    editor.selectNode('orders')
    editor.setActivePage('orders')
    expect(editor.session.activePageId).toBe('orders')

    editor.clearActivePage()
    expect(editor.session.activePageId).toBeNull()
    const snapshot = editor.readSnapshot()
    expect(snapshot.pageId).toBe('')
  })

  it('removeNode clears session.selectedNodeId when selected node is removed', () => {
    const editor = createEditorWithNavigation([
      { id: 'orders', title: '订单', nodeKind: 'page', path: '/orders' },
    ])

    editor.selectNode('orders')
    expect(editor.session.selectedNodeId).toBe('orders')

    editor.removeNode('orders')
    expect(editor.session.selectedNodeId).toBeNull()
  })

  it('setPageFileText and undoPageFile bump revision for subscribers', () => {
    const editor = createEditorWithNavigation([
      { id: 'orders', title: '订单', nodeKind: 'page', path: '/orders' },
    ])
    editor.setActivePage('orders')

    let revision = editor.revision
    editor.subscribe(() => {
      revision = editor.revision
    })

    const initial = editor.getPageFileText('rule.json')
    editor.setPageFileText('rule.json', `${JSON.stringify([{ type: 'div' }], null, 2)}\n`)
    expect(revision).toBeGreaterThan(0)
    expect(editor.canUndoPageFile('rule.json')).toBe(true)

    const bumped = revision
    expect(editor.undoPageFile('rule.json')).toBe(true)
    expect(revision).toBeGreaterThan(bumped)
    expect(editor.getPageFileText('rule.json')).toBe(initial)
  })

  it('tryParse helpers surface JSON syntax errors for snapshot pipeline', () => {
    expect(tryParsePageDataTextError('{ invalid json')).toBeTruthy()
    expect(tryParseRuleTextError('{ invalid json')).toBeTruthy()
    expect(tryParsePageDataTextError('{"dataSetName":"x","tables":{}}\n')).toBeNull()
  })

  it('readSnapshot parseErrors are null for canonical in-memory page files', () => {
    const editor = createEditorWithNavigation([
      { id: 'orders', title: '订单', nodeKind: 'page', path: '/orders' },
    ])
    editor.setActivePage('orders')
    editor.setPageFileText('pagedata.json', '{"dataSetName":"orders","tables":{}}\n')

    const snapshot = editor.readSnapshot()
    expect(snapshot.parseErrors['pagedata.json']).toBeNull()
    expect(snapshot.parseErrors['rule.json']).toBeNull()
  })

  it('ingestNavigationRoot hydrates model without HTTP and bumps revision', () => {
    const editor = createEditorWithNavigation([])
    let revision = editor.revision
    editor.subscribe(() => {
      revision = editor.revision
    })

    editor.ingestNavigationRoot({
      title: 'CRM',
      childPlacement: 'header',
      children: [
        { id: 'orders', title: '订单', nodeKind: 'page', path: '/orders' },
      ],
    })

    expect(revision).toBeGreaterThan(0)
    expect(editor.readSnapshot().treeData).toHaveLength(1)
    editor.setActivePage('orders')
    expect(editor.session.activePageId).toBe('orders')
  })

  it('setActivePage on sub-page resolves ConfigSubPageNode without IO on domain', () => {
    const editor = createEditorWithNavigation([{
      id: 'orders', title: '订单', nodeKind: 'page', path: '/orders',
      children: [{ id: 'order-detail', title: '订单详情', nodeKind: 'sub-page' }],
    }])

    editor.setActivePage('order-detail')
    const page = editor.getActivePage()
    expect(page).toBeInstanceOf(ConfigSubPageNode)
    expect(isConfigSubPageNode(page)).toBe(true)
    expect(page?.isSubPage).toBe(true)
    expect(page).toBeInstanceOf(ConfigPageNode)
    expect('load' in (page as object)).toBe(false)
    expect(editor.session.activePageId).toBe('order-detail')
  })

  it('notifies subscribers when session changes', () => {
    const editor = createEditorWithNavigation([
      { id: 'orders', title: '订单', nodeKind: 'page', path: '/orders' },
    ])
    let revision = editor.revision
    editor.subscribe(() => {
      revision = editor.revision
    })

    editor.selectNode('orders')
    expect(revision).toBeGreaterThan(0)
  })
})
