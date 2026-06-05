import { describe, expect, it } from 'vitest'
import type { ProjectNodeData } from '@spark-appworks/spark-project-model'
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

describe('ProjectModel.editor — selection and active page', () => {
  it('tracks selected node and active page as editor state SSOT (without loading files)', () => {
    const editor = createEditorWithNavigation([
      { id: 'orders', title: '订单', nodeKind: 'page', path: '/orders' },
    ])

    // selectNode should update ProjectModel.editor.selectedNodeId
    editor.selectNode('orders')
    expect(editor.project.editor.selectedNodeId).toBe('orders')

    // selectPage should open page, set activePageId and keep selectedNodeId consistent
    editor.project.setActivePageId('orders')
    const snapshot = editor.readSnapshot()
    expect(editor.project.editor.activePageId).toBe('orders')
    expect(snapshot.selectedNodeId).toBe('orders')
    expect(snapshot.pageId).toBe('orders')
  })

  it('clearActivePage delegates to ProjectModel.editor and keeps snapshot consistent', () => {
    const editor = createEditorWithNavigation([
      { id: 'orders', title: '订单', nodeKind: 'page', path: '/orders' },
    ])

    editor.selectNode('orders')
    editor.project.setActivePageId('orders')
    expect(editor.project.editor.activePageId).toBe('orders')

    editor.clearActivePage()
    expect(editor.project.editor.activePageId).toBeNull()
    const snapshot = editor.readSnapshot()
    expect(snapshot.pageId).toBe('')
  })

  it('removeNode clears editor.selectedNodeId when selected node is removed', () => {
    const editor = createEditorWithNavigation([
      { id: 'orders', title: '订单', nodeKind: 'page', path: '/orders' },
    ])

    editor.selectNode('orders')
    expect(editor.project.editor.selectedNodeId).toBe('orders')

    editor.removeNode('orders')
    expect(editor.project.editor.selectedNodeId).toBeNull()
  })
})

