// tree-demo: 4+7 接口完整演示
// 4 个远程接口（DataView）:
//   loadTreeChildren / loadTreePath / expandTreeToNode / searchTreeNested
// 7 个本地接口（TreeManager）:
//   getNode / getChildren / getRoots / getNodePath / searchNodes / buildNestedTree / buildSubTree

const NAV_BASE = '/tenants/{tenantId}/projects/{projectId}/navigation/nodes'

let treeManager = null
let _initialized = false
let _pageState = {
  selectedNode: null,
  selectedPathText: '',
  expandedKeys: [],
  currentNodeKey: null,
  searchKeyword: '',
}

function _safeMessage(message, type) {
  if ($page && typeof $page.showMessage === 'function') {
    $page.showMessage(message, type)
  }
}

function _getDataSet() {
  return $dataSet || null
}

function _getView(tableName, viewId) {
  return _getDataSet()?.getView?.(tableName, viewId || 'default') || null
}

function _setChildRows(rows) {
  const view = _getView('childNodes', 'default')
  if (!view) return
  view.replaceRows(Array.isArray(rows) ? rows : [])
}

function _normalizeNodeId(raw, index) {
  return raw.id ?? raw.nodeId ?? raw.NODE_ID ?? ('node-' + index)
}

function _normalizeParentId(value) {
  if (value === undefined || value === null) return null
  if (typeof value === 'string' && value.trim() === '') return null
  return value
}

function _toTreeNodes(rows) {
  return (Array.isArray(rows) ? rows : []).map(function (raw, index) {
    const id = _normalizeNodeId(raw, index)
    const name = raw.name || raw.title || raw.label || String(id)
    return Object.assign({}, raw, {
      id,
      parentId: _normalizeParentId(raw.parentId ?? raw.PARENT_ID),
      name,
      label: raw.label || name,
      type: raw.type || raw.nodeKind || raw.kind || 'node',
    })
  })
}

function _buildPathTextById(nodeId) {
  if (!treeManager || nodeId === undefined || nodeId === null) return '-'
  try {
    const path = treeManager.getNodePath(nodeId)
    return (path.pathNodes || []).map(n => n.name).join(' > ') || '-'
  } catch (error) {
    return '-'
  }
}

function _syncNestedTreeToView() {
  if (!treeManager) return
  const nestedTree = treeManager.buildNestedTree()
  const view = _getView('hierarchicalTreeData', 'default')
  if (!view) {
    console.error('❌ hierarchicalTreeData 视图未找到')
    return
  }
  view.replaceRows(nestedTree)
}

function _ensureTreeApiConfigured() {
  const ds = _getDataSet()
  const table = ds?.getTable?.('treeData')
  if (!table || typeof table.setApi !== 'function') {
    return
  }

  table.setApi({
    list: { url: NAV_BASE, method: 'GET' },
    children: { url: NAV_BASE, method: 'GET' },
    path: { url: `${NAV_BASE}/path/{id}`, method: 'GET' },
    subtree: { url: `${NAV_BASE}/subtree`, method: 'POST' },
    nestedSearch: { url: `${NAV_BASE}/nested-search`, method: 'GET' },
  })
}

function _pickDefaultNode() {
  if (!treeManager) return null
  const roots = treeManager.getRoots()
  return roots.length > 0 ? roots[0] : null
}

async function _loadRemoteTreeNodes() {
  const view = _getView('treeData', 'default')
  if (!view) return

  try {
    await view.requestData()
    const remoteRows = Array.isArray(view.rows) ? view.rows : []
    if (remoteRows.length === 0) {
      _safeMessage('远程导航节点为空，继续使用本地示例数据', 'warning')
      return
    }

    const config = (_pageState.treeData && _pageState.treeData.config) || {
      idField: 'id', parentIdField: 'parentId', textField: 'name'
    }
    treeManager = SparkData.createTreeManager(config, _toTreeNodes(remoteRows))
    _syncNestedTreeToView()
    _safeMessage(`远程导航节点加载成功（${remoteRows.length} 条）`, 'success')
  } catch (error) {
    console.error('[tree-demo] 远程导航加载失败:', error)
    _safeMessage('远程导航加载失败，已保留本地数据', 'warning')
  }
}

function __init__() {
  if (_initialized) return
  _initialized = true

  const ds = _getDataSet()
  if (!ds) {
    console.error('❌ DataSet 未就绪')
    return
  }

  _ensureTreeApiConfigured()

  let treeConfig = { idField: 'id', parentIdField: 'parentId', textField: 'name' }
  let nodes = []

  const table = ds.getTable('treeData')
  const row = table?.views?.default?.rows?.[0]
  if (row) {
    if (row.config) treeConfig = Object.assign({}, treeConfig, row.config)
    if (Array.isArray(row.nodes)) nodes = row.nodes
  }

  _pageState.treeData = { config: treeConfig, nodes }
  treeManager = SparkData.createTreeManager(treeConfig, _toTreeNodes(nodes))
  _syncNestedTreeToView()

  const defaultNode = _pickDefaultNode()
  if (defaultNode) {
    handleNodeClick(defaultNode)
  }

  void _loadRemoteTreeNodes()
}

function RenderNodeInfo() {
  const node = _pageState.selectedNode
  const pathText = _pageState.selectedPathText

  if (!node) {
    return h('p', {
      style: { color: '#909399', textAlign: 'center', padding: '24px 0', margin: 0 }
    }, ['请点击左侧树节点查看详情'])
  }

  const rows = [
    ['节点 ID', node.id],
    ['节点名称', node.name],
    ['节点类型', node.type],
    ['父节点 ID', node.parentId ?? '-'],
    ['路径', pathText || '-'],
  ]

  const td = 'padding:8px 12px;border-bottom:1px solid #ebeef5;'
  return h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
    rows.map(([label, value]) =>
      h('tr', {}, [
        h('td', { style: td + 'background:#fafafa;width:110px;color:#606266;font-weight:600;' }, [label]),
        h('td', { style: td + 'color:#303133;' }, [String(value ?? '-')])
      ])
    )
  )
}

function handleNodeExpand(data) {
  if (!data || data.id === undefined || data.id === null) return
  if (!_pageState.expandedKeys.includes(data.id)) {
    _pageState.expandedKeys.push(data.id)
  }
}

function handleNodeCollapse(data) {
  if (!data || data.id === undefined || data.id === null) return
  _pageState.expandedKeys = _pageState.expandedKeys.filter(id => id !== data.id)
}

function handleNodeClick(nodeData) {
  if (!nodeData || nodeData.id === undefined || nodeData.id === null) {
    _safeMessage('无效节点数据', 'error')
    return
  }

  _pageState.selectedNode = nodeData
  _pageState.currentNodeKey = nodeData.id
  _pageState.selectedPathText = _buildPathTextById(nodeData.id)

  const children = treeManager ? treeManager.getChildren(nodeData.id) : []
  const rows = children.map(child => Object.assign({}, child, {
    pathText: _buildPathTextById(child.id),
  }))
  _setChildRows(rows)
}

function handleSearch() {
  const keyword = ($query('[name="searchKeyword"]')?.value || '').trim()
  _pageState.searchKeyword = keyword

  if (!treeManager) {
    _safeMessage('TreeManager 未初始化', 'error')
    return
  }

  if (!keyword) {
    _setChildRows([])
    return
  }

  const hits = treeManager.searchNodes(keyword)
  const rows = hits.map(node => Object.assign({}, node, {
    pathText: _buildPathTextById(node.id),
  }))
  _setChildRows(rows)
  _safeMessage(`本地搜索命中 ${hits.length} 条`, hits.length > 0 ? 'success' : 'warning')
}

function handleSearchKeyup(event) {
  if (event && (event.key === 'Enter' || event.keyCode === 13)) {
    handleSearch()
  }
}

function handleClearSearch() {
  _pageState.searchKeyword = ''
  _setChildRows([])
}

function handleLocateNode(row) {
  if (!row || row.id === undefined || row.id === null) return
  const path = treeManager ? treeManager.getNodePath(row.id) : { pathIds: [] }
  const parentIds = (path.pathIds || []).slice(0, -1)
  _pageState.expandedKeys = Array.from(new Set([...(Array.isArray(_pageState.expandedKeys) ? _pageState.expandedKeys : []), ...parentIds]))
  handleNodeClick(row)
}

async function demoRemoteLoadChildren() {
  const view = _getView('treeData', 'default')
  if (!view) return
  const parentId = _pageState.selectedNode?.id ?? null

  try {
    const children = await view.loadTreeChildren(parentId, 20)
    const rows = children.map(item => Object.assign({}, item, {
      type: 'remote:children',
      pathText: _buildPathTextById(item.id),
    }))
    _setChildRows(rows)
    _safeMessage(`远程 loadTreeChildren 成功：${rows.length} 条`, 'success')
    return { ok: true, count: rows.length }
  } catch (error) {
    console.error('[tree-demo] loadTreeChildren 失败:', error)
    const fallback = treeManager ? treeManager.getChildren(parentId) : []
    _setChildRows(fallback.map(item => Object.assign({}, item, {
      type: 'fallback:children',
      pathText: _buildPathTextById(item.id),
    })))
    _safeMessage('远程 children 不可用，已回退本地 children', 'warning')
    return { ok: false, count: fallback.length }
  }
}

async function demoRemoteLoadPath() {
  const view = _getView('treeData', 'default')
  if (!view) return
  const targetId = _pageState.selectedNode?.id
  if (targetId === undefined || targetId === null) {
    _safeMessage('请先选择节点再执行 loadTreePath', 'warning')
    return { ok: false, count: 0 }
  }

  try {
    const path = await view.loadTreePath(targetId)
    const rows = (path.pathIds || []).map(id => ({
      id,
      name: `path:${id}`,
      type: 'remote:path',
      pathText: String(id),
    }))
    _setChildRows(rows)
    _safeMessage(`远程 loadTreePath 成功：${rows.length} 段`, 'success')
    return { ok: true, count: rows.length }
  } catch (error) {
    console.error('[tree-demo] loadTreePath 失败:', error)
    const local = treeManager ? treeManager.getNodePath(targetId) : { pathIds: [], pathNodes: [] }
    const rows = (local.pathNodes || []).map(item => ({
      id: item.id,
      name: item.name,
      type: 'fallback:path',
      pathText: _buildPathTextById(item.id),
    }))
    _setChildRows(rows)
    _safeMessage('远程 path 不可用，已回退本地 getNodePath', 'warning')
    return { ok: false, count: rows.length }
  }
}

async function demoRemoteExpandToNode() {
  const view = _getView('treeData', 'default')
  if (!view) return
  const targetId = _pageState.selectedNode?.id
  if (targetId === undefined || targetId === null) {
    _safeMessage('请先选择节点再执行 expandTreeToNode', 'warning')
    return { ok: false, count: 0 }
  }

  try {
    await view.expandTreeToNode(targetId)
    _syncNestedTreeToView()
    const path = treeManager ? treeManager.getNodePath(targetId) : { pathIds: [] }
    _pageState.expandedKeys = Array.from(new Set([...(Array.isArray(_pageState.expandedKeys) ? _pageState.expandedKeys : []), ...((path.pathIds || []).slice(0, -1))]))
    _safeMessage('远程 expandTreeToNode 成功', 'success')
    return { ok: true, count: (path.pathIds || []).length }
  } catch (error) {
    console.error('[tree-demo] expandTreeToNode 失败:', error)
    const local = treeManager ? treeManager.getNodePath(targetId) : { pathIds: [] }
    _pageState.expandedKeys = Array.from(new Set([...(Array.isArray(_pageState.expandedKeys) ? _pageState.expandedKeys : []), ...((local.pathIds || []).slice(0, -1))]))
    _safeMessage('远程 expand 不可用，已回退本地路径展开', 'warning')
    return { ok: false, count: (local.pathIds || []).length }
  }
}

async function demoRemoteNestedSearch() {
  const view = _getView('treeData', 'default')
  if (!view) return
  const keyword = (_pageState.searchKeyword || '组').trim()

  try {
    const results = await view.searchTreeNested(keyword, 20)
    const rows = results.map(item => ({
      id: item.node.id,
      name: item.node.name,
      type: 'remote:nestedSearch',
      pathText: (item.path || []).map(n => n.name).join(' > '),
    }))
    _setChildRows(rows)
    _safeMessage(`远程 nestedSearch 成功：${rows.length} 条`, 'success')
    return { ok: true, count: rows.length }
  } catch (error) {
    console.error('[tree-demo] searchTreeNested 失败:', error)
    const fallback = treeManager && typeof treeManager.searchNested === 'function'
      ? treeManager.searchNested(keyword, undefined, 20)
      : []
    const rows = fallback.map(item => ({
      id: item.node.id,
      name: item.node.name,
      type: 'fallback:nestedSearch',
      pathText: (item.path || []).map(n => n.name).join(' > '),
    }))
    _setChildRows(rows)
    _safeMessage('远程 nestedSearch 不可用，已回退本地 searchNested', 'warning')
    return { ok: false, count: rows.length }
  }
}

function handleRunLocal7() {
  if (!treeManager) {
    _safeMessage('TreeManager 未初始化', 'error')
    return
  }

  const selectedId = _pageState.selectedNode?.id ?? (_pickDefaultNode()?.id)
  const keyword = (_pageState.searchKeyword || '组').trim()

  const node = selectedId !== undefined && selectedId !== null ? treeManager.getNode(selectedId) : null
  const children = selectedId !== undefined && selectedId !== null ? treeManager.getChildren(selectedId) : []
  const roots = treeManager.getRoots()
  const path = selectedId !== undefined && selectedId !== null ? treeManager.getNodePath(selectedId) : { pathIds: [] }
  const searchHits = treeManager.searchNodes(keyword)
  const nested = treeManager.buildNestedTree()
  const subTree = selectedId !== undefined && selectedId !== null ? treeManager.buildSubTree(selectedId) : null

  const rows = [
    { id: 'L1', name: `getNode -> ${node ? node.name : 'null'}`, type: 'local:getNode', pathText: node ? _buildPathTextById(node.id) : '-' },
    { id: 'L2', name: `getChildren -> ${children.length}`, type: 'local:getChildren', pathText: children.map(c => c.name).join(', ') || '-' },
    { id: 'L3', name: `getRoots -> ${roots.length}`, type: 'local:getRoots', pathText: roots.map(r => r.name).join(', ') || '-' },
    { id: 'L4', name: `getNodePath -> ${path.pathIds.length}`, type: 'local:getNodePath', pathText: _buildPathTextById(selectedId) },
    { id: 'L5', name: `searchNodes("${keyword}") -> ${searchHits.length}`, type: 'local:searchNodes', pathText: searchHits.map(h => h.name).join(', ') || '-' },
    { id: 'L6', name: `buildNestedTree -> ${nested.length}`, type: 'local:buildNestedTree', pathText: nested.map(n => n.name).join(', ') || '-' },
    { id: 'L7', name: `buildSubTree -> ${subTree ? 'ok' : 'null'}`, type: 'local:buildSubTree', pathText: subTree ? subTree.name : '-' },
  ]

  _setChildRows(rows)
  _safeMessage('本地 7 接口已执行完成', 'success')
}

async function handleRunRemote4() {
  const r1 = await demoRemoteLoadChildren()
  const r2 = await demoRemoteLoadPath()
  const r3 = await demoRemoteExpandToNode()
  const r4 = await demoRemoteNestedSearch()

  const okCount = [r1, r2, r3, r4].filter(item => item && item.ok).length
  _safeMessage(`远程 4 接口执行完成：${okCount}/4 成功`, okCount === 4 ? 'success' : 'warning')
}

async function handleRunAll4Plus7() {
  await handleRunRemote4()
  handleRunLocal7()
  _safeMessage('4+7 接口演示已完成（见右侧结果表）', 'success')
}

function testNodeClick() {
  void handleRunAll4Plus7()
}

async function handleAddNode() {
  if (!treeManager) {
    _safeMessage('TreeManager 未初始化', 'error')
    return
  }
  const parent = _pageState.selectedNode
  if (!parent) {
    _safeMessage('请先选择父节点', 'warning')
    return
  }

  const allNodes = treeManager.getAllNodes()
  const maxId = allNodes.reduce((max, n) => {
    const idNum = Number(n.id)
    return Number.isFinite(idNum) ? Math.max(max, idNum) : max
  }, 0)

  const newNode = {
    id: maxId + 1,
    parentId: parent.id,
    name: `新节点 ${maxId + 1}`,
    label: `新节点 ${maxId + 1}`,
    type: 'node',
  }

  treeManager.addNodesToCache([newNode])
  _syncNestedTreeToView()
  _safeMessage(`已添加子节点：${newNode.name}`, 'success')
}

async function handleDeleteNode() {
  if (!treeManager) {
    _safeMessage('TreeManager 未初始化', 'error')
    return
  }
  const node = _pageState.selectedNode
  if (!node) {
    _safeMessage('请先选择要删除的节点', 'warning')
    return
  }

  const children = treeManager.getChildren(node.id)
  if (children.length > 0) {
    _safeMessage('该节点存在子节点，无法删除', 'warning')
    return
  }

  const remained = treeManager.getAllNodes().filter(item => item.id !== node.id)
  treeManager.clear()
  treeManager.addNodesToCache(remained)
  _syncNestedTreeToView()

  _pageState.selectedNode = null
  _pageState.selectedPathText = ''
  _setChildRows([])
  _safeMessage(`已删除节点：${node.name}`, 'success')
}

function handleExport() {
  if (!treeManager) {
    _safeMessage('TreeManager 未初始化', 'error')
    return
  }

  const json = treeManager.toJSON()
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const doc = $el()?.ownerDocument
  if (!doc) {
    URL.revokeObjectURL(url)
    _safeMessage('导出失败：无法访问页面 DOM', 'error')
    return
  }

  const a = doc.createElement('a')
  a.href = url
  a.download = 'tree-demo-data.json'
  doc.body.appendChild(a)
  a.click()
  doc.body.removeChild(a)
  URL.revokeObjectURL(url)
  _safeMessage('树数据导出成功', 'success')
}
