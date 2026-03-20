import { describe, expect, it, vi } from 'vitest'
import { DataSet } from '../dataset'
import { TreeManager } from '../tree-manager'
import type { FlatTreeNode } from '../types'

const NAV_BASE = '/api/tenants/tenant-test/projects/homepage/navigation/nodes'

function createRemoteTreeDataSet(mockHttpClient: unknown): DataSet {
  const dataSet = DataSet.fromConfig({
    dataSetName: 'Tree4Plus7',
    tables: {
      NavigationNodes: {
        tableName: 'NavigationNodes',
        columns: [
          { name: 'id', type: 'number' },
          { name: 'parentId', type: 'number' },
          { name: 'name', type: 'string' },
        ],
        api: {
          children: { url: NAV_BASE, method: 'GET' },
          path: { url: `${NAV_BASE}/path/{id}`, method: 'GET' },
          subtree: { url: `${NAV_BASE}/subtree`, method: 'POST' },
          nestedSearch: { url: `${NAV_BASE}/nested-search`, method: 'GET' },
        },
        views: {
          default: {
            treeConfig: {
              idField: 'id',
              parentIdField: 'parentId',
              textField: 'name',
            },
          },
        },
        rows: [],
      },
    },
  })

  dataSet.setSharedHttpClient(mockHttpClient as never)
  return dataSet
}

describe('DataSet Tree 4+7 interfaces', () => {
  describe('4 remote interfaces (DataView delegates)', () => {
    it('loadTreeChildren should call navigation/nodes and return children', async () => {
      const get = vi.fn().mockResolvedValue([
        { id: 1, parentId: null, name: 'Root' },
      ])
      const post = vi.fn()
      const dataSet = createRemoteTreeDataSet({ get, post })
      const view = dataSet.getView('NavigationNodes', 'default')
      expect(view).toBeDefined()

      const rows = await view!.loadTreeChildren(null, 20)

      expect(rows).toHaveLength(1)
      expect(rows[0]?.['name']).toBe('Root')
      expect(get).toHaveBeenCalledOnce()
      expect(get.mock.calls[0]?.[0]).toBe(NAV_BASE)
      expect(get.mock.calls[0]?.[1]).toEqual({ parentId: '', limit: 20 })
    })

    it('loadTreePath should call navigation path endpoint and return pathIds', async () => {
      const get = vi.fn().mockResolvedValue({ pathIds: [1, 2, 3] })
      const post = vi.fn()
      const dataSet = createRemoteTreeDataSet({ get, post })
      const view = dataSet.getView('NavigationNodes', 'default')
      expect(view).toBeDefined()

      const path = await view!.loadTreePath(3)

      expect(path.pathIds).toEqual([1, 2, 3])
      expect(get).toHaveBeenCalledOnce()
      expect(get.mock.calls[0]?.[0]).toBe(`${NAV_BASE}/path/3`)
    })

    it('expandTreeToNode should call navigation path then subtree and skip subtree when cache is complete', async () => {
      const get = vi.fn()
      const post = vi.fn()
      const dataSet = createRemoteTreeDataSet({ get, post })
      const view = dataSet.getView('NavigationNodes', 'default')
      expect(view).toBeDefined()

      get.mockResolvedValueOnce([{ id: 1, parentId: null, name: 'Root' }])
      await view!.loadTreeChildren(null)

      get.mockResolvedValueOnce({ pathIds: [1, 2, 3] })
      post.mockResolvedValueOnce({
        2: { id: 2, parentId: 1, name: 'Child' },
        3: { id: 3, parentId: 2, name: 'Leaf' },
      })
      await view!.expandTreeToNode(3)

      expect(get.mock.calls[1]?.[0]).toBe(`${NAV_BASE}/path/3`)
      expect(post).toHaveBeenCalledOnce()
      expect(post.mock.calls[0]?.[0]).toBe(`${NAV_BASE}/subtree`)
      expect(post.mock.calls[0]?.[1]).toEqual({
        fromId: 1,
        toId: 3,
        includeTargetChildren: true,
      })

      get.mockResolvedValueOnce({ pathIds: [1, 2, 3] })
      await view!.expandTreeToNode(3)
      expect(post).toHaveBeenCalledTimes(1)
    })

    it('searchTreeNested should call navigation nested-search endpoint and return nested results', async () => {
      const get = vi.fn().mockResolvedValue([
        {
          node: { id: 3, parentId: 2, name: 'Leaf' },
          path: [
            { id: 1, parentId: null, name: 'Root' },
            { id: 2, parentId: 1, name: 'Child' },
            { id: 3, parentId: 2, name: 'Leaf' },
          ],
        },
      ])
      const post = vi.fn()
      const dataSet = createRemoteTreeDataSet({ get, post })
      const view = dataSet.getView('NavigationNodes', 'default')
      expect(view).toBeDefined()

      const result = await view!.searchTreeNested('leaf', 10)

      expect(result).toHaveLength(1)
      expect(result[0]?.node['id']).toBe(3)
      expect(get).toHaveBeenCalledOnce()
      expect(get.mock.calls[0]?.[0]).toBe(`${NAV_BASE}/nested-search`)
      expect(get.mock.calls[0]?.[1]).toEqual({ keyword: 'leaf', limit: 10 })
    })
  })

  describe('7 local interfaces (TreeManager in-memory)', () => {
    const nodes: FlatTreeNode[] = [
      { id: 1, parentId: null, name: 'Root A' },
      { id: 2, parentId: 1, name: 'Child A1' },
      { id: 3, parentId: 1, name: 'Child A2' },
      { id: 4, parentId: 2, name: 'Leaf A1-1' },
      { id: 5, parentId: null, name: 'Root B' },
    ]

    it('getNode should return node by id', () => {
      const tree = new TreeManager({ idField: 'id', parentIdField: 'parentId', textField: 'name' }, undefined, nodes)
      expect(tree.getNode(2)?.name).toBe('Child A1')
      expect(tree.getNode(999)).toBeUndefined()
    })

    it('getChildren should return direct children of parent', () => {
      const tree = new TreeManager({ idField: 'id', parentIdField: 'parentId', textField: 'name' }, undefined, nodes)
      const children = tree.getChildren(1)
      expect(children.map(item => item.id)).toEqual([2, 3])
    })

    it('getRoots should return top-level nodes', () => {
      const tree = new TreeManager({ idField: 'id', parentIdField: 'parentId', textField: 'name' }, undefined, nodes)
      const roots = tree.getRoots()
      expect(roots.map(item => item.id)).toEqual([1, 5])
    })

    it('getNodePath should return pathIds from root to target', () => {
      const tree = new TreeManager({ idField: 'id', parentIdField: 'parentId', textField: 'name' }, undefined, nodes)
      const path = tree.getNodePath(4)
      expect(path.pathIds).toEqual([1, 2, 4])
      expect(path.pathNodes?.map(item => item.name)).toEqual(['Root A', 'Child A1', 'Leaf A1-1'])
    })

    it('searchNodes should match keyword by textField (case-insensitive)', () => {
      const tree = new TreeManager({ idField: 'id', parentIdField: 'parentId', textField: 'name' }, undefined, nodes)
      const found = tree.searchNodes('child')
      expect(found.map(item => item.id)).toEqual([2, 3])
    })

    it('buildNestedTree should build full nested tree from roots', () => {
      const tree = new TreeManager({ idField: 'id', parentIdField: 'parentId', textField: 'name' }, undefined, nodes)
      const nested = tree.buildNestedTree()

      expect(nested).toHaveLength(2)
      expect(nested[0]?.id).toBe(1)
      expect(nested[0]?.children.map(item => item.id)).toEqual([2, 3])
      expect(nested[0]?.children[0]?.children.map(item => item.id)).toEqual([4])
      expect(nested[1]?.id).toBe(5)
    })

    it('buildSubTree should build subtree from specific root', () => {
      const tree = new TreeManager({ idField: 'id', parentIdField: 'parentId', textField: 'name' }, undefined, nodes)
      const subtree = tree.buildSubTree(2)

      expect(subtree?.id).toBe(2)
      expect(subtree?.children.map(item => item.id)).toEqual([4])
      expect(tree.buildSubTree(999)).toBeNull()
    })
  })
})
