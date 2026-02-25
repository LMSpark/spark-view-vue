// ========================================
// 页面脚本 - 树形数据演示
// ========================================
// 
// 沙箱注入的全局变量:
//   - $api: FormCreate API
//   - $route: Vue Router 路由
//   - $data: 页面数据（reactive）
//   - $el: 页面容器元素 (() => HTMLElement)
//   - $query: DOM 查询单个元素
//   - $queryAll: DOM 查询所有元素
//   - $dataSet: DataSet 实例
//   - $rebindRules: 重新绑定规则
//   - $refreshData: 刷新数据
//   - ElMessage: Element Plus 消息提示
//   - ElMessageBox: Element Plus 消息框
//   - SparkData: SPARK 数据空间命名空间
//   - h: Vue h 函数
//
// 注意：
// 1. 不支持 ES6 import，所有依赖通过沙箱注入
// 2. TreeManager 可以通过 SparkData.createTreeManager() 创建
// ========================================

let treeManager = null
let _initialized = false

/**
 * 初始化树管理器
 */
function __init__() {
  if (_initialized) return   // 防止 $rebindRules() 触发重复初始化
  _initialized = true
  const pageData = $data
  const dataSet = $dataSet

  // 初始化展开状态数组
  if (!pageData.expandedKeys) {
    pageData.expandedKeys = []
  }

  if (!SparkData || !SparkData.createTreeManager) {
    console.error('❌ SparkData 或 createTreeManager 未注入')
    return
  }

  if (!dataSet) {
    console.error('❌ DataSet 未就绪')
    return
  }

  // ── 从 DataSet 取出 treeData（被 fromPageData 归一化为单行表）──
  let treeConfig = { idField: 'id', parentIdField: 'parentId', textField: 'name' }
  let nodes = []

  const treeDataTable = dataSet.getTable('treeData')
  if (treeDataTable) {
    const row = treeDataTable.views['default']?.rows?.[0]
    if (row) {
      if (row.config) treeConfig = Object.assign({}, treeConfig, row.config)
      if (Array.isArray(row.nodes)) nodes = row.nodes
    }
  }
  console.log('📦 treeConfig:', treeConfig, '节点数:', nodes.length)

  // ── 从 DataSet 取出 hierarchicalTreeData 并写回 $data 供 r-tree 使用 ──
  const hierarchTable = dataSet.getTable('hierarchicalTreeData')
  if (hierarchTable) {
    const rows = hierarchTable.views['default']?.rows
    if (rows && rows.length > 0) {
      pageData.hierarchicalTreeData = rows
      console.log('🌲 hierarchicalTreeData 根节点数:', rows.length)
    }
  }

  // ── 创建 TreeManager ──
  treeManager = SparkData.createTreeManager(treeConfig, nodes)
  if (!treeManager) {
    console.error('❌ TreeManager 创建失败')
    return
  }

  if (treeManager.enrichNodes) {
    treeManager.enrichNodes()
  }

  console.log('✅ TreeManager 初始化完成，扁平节点数:', nodes.length)

  // 写入 $data 后需要手动触发重绑，让 r-tree 拿到 hierarchicalTreeData
  $rebindRules()
}

/**
 * RenderNodeInfo — 响应式节点信息面板
 * 直接读取 $data.selectedNode / $data.selectedPathText，
 * 依赖 Vue 响应式自动刷新，无需 $rebindRules()
 */
function RenderNodeInfo() {
  const node = $data.selectedNode
  const pathText = $data.selectedPathText

  if (!node) {
    return h('p', {
      style: { color: '#909399', textAlign: 'center', padding: '24px 0', margin: 0 }
    }, ['请点击左侧树节点查看详情'])
  }

  const rows = [
    ['节点 ID',   node.id],
    ['节点名称', node.name],
    ['节点类型', node.type],
    ['层级',     node.level],
    ['父节点 ID', node.parentId ?? '-'],
  ]

  const tdBaseStyle = 'padding:8px 12px;border-bottom:1px solid #ebeef5;'
  const table = h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
    rows.map(([label, value]) =>
      h('tr', {}, [
        h('td', {
          style: tdBaseStyle + 'background:#fafafa;width:96px;color:#606266;font-weight:600;'
        }, [label]),
        h('td', {
          style: tdBaseStyle + 'color:#303133;'
        }, [String(value ?? '-')])
      ])
    )
  )

  const pathSection = h('div', { style: { marginTop: '16px' } }, [
    h('h4', { style: { margin: '0 0 8px 0', fontSize: '14px', color: '#303133' } }, ['节点路径:']),
    h('div', {
      style: { padding: '10px 14px', background: '#f5f7fa', borderRadius: '4px',
               color: '#606266', fontSize: '13px', lineHeight: '1.6' }
    }, [pathText || '-'])
  ])

  return h('div', {}, [table, pathSection])
}

/**
 * 测试点击函数
 */
function testNodeClick() {
  console.log('🧪 测试按钮被点击！')
  console.log('🧪 $data:', $data)
  console.log('🧪 handleNodeClick 函数:', typeof handleNodeClick)
  
  // 模拟点击第一个节点
  const testData = {
    id: 1,
    name: '测试节点',
    label: '测试节点',
    type: 'test'
  }
  
  const testNode = {
    level: 0,
    expanded: false
  }
  
  console.log('🧪 手动调用 handleNodeClick')
  handleNodeClick(testData, testNode)
  
  ElMessage?.success('测试函数已执行，请查看控制台')
}

/**
 * 展开节点
 * 注意：FormCreate 会在第一个参数注入上下文，需要跳过
 */
function handleNodeExpand(...args) {
  // 跳过 FormCreate 上下文
  let data = args[0]
  if (data && (data.$f || data.api)) {
    data = args[1]
  }
  const pageData = $data
  console.log('🔽 展开节点:', data)
  
  // 初始化 expandedKeys（如果不存在）
  if (!pageData.expandedKeys) {
    pageData.expandedKeys = []
  }
  
  // 记录展开的节点
  if (data && data.id && !pageData.expandedKeys.includes(data.id)) {
    pageData.expandedKeys.push(data.id)
    console.log('📌 保存展开状态，当前展开节点:', pageData.expandedKeys)
  }
  
  if (treeManager) {
    const children = treeManager.getChildren(data.id)
    console.log('子节点数量:', children.length)
  }
}

/**
 * 收起节点
 * 注意：FormCreate 会在第一个参数注入上下文，需要跳过
 */
function handleNodeCollapse(...args) {
  // 跳过 FormCreate 上下文
  let data = args[0]
  if (data && (data.$f || data.api)) {
    data = args[1]
  }
  const pageData = $data
  console.log('🔼 收起节点:', data)
  
  // 初始化 expandedKeys（如果不存在）
  if (!pageData.expandedKeys) {
    pageData.expandedKeys = []
  }
  
  // 移除折叠的节点
  if (data && data.id) {
    const index = pageData.expandedKeys.indexOf(data.id)
    if (index > -1) {
      pageData.expandedKeys.splice(index, 1)
      console.log('📌 移除展开状态，当前展开节点:', pageData.expandedKeys)
    }
  }
}

/**
 * 点击节点
 * 注意：FormCreate 会在第一个参数注入上下文（包含 $f, api 等），需要跳过
 */
function handleNodeClick(...args) {
  const pageData = $data
  
  // 跳过 FormCreate 注入的上下文参数（包含 $f 或 api 字段）
  let nodeData = args[0]
  if (nodeData && (nodeData.$f || nodeData.api)) {
    // 第一个参数是 FormCreate 上下文，使用第二个参数
    nodeData = args[1]
  }
  
  console.log('📍 点击节点 - 原始参数:', args)
  console.log('📍 点击节点 - 节点数据:', nodeData)
  console.log('📍 更新前 selectedNode:', pageData.selectedNode)
  
  if (!nodeData || !nodeData.id) {
    console.error('❌ 无效的节点数据:', nodeData)
    return
  }
  
  // 基本信息更新（不依赖 treeManager）
  pageData.selectedNode = nodeData
  pageData.currentNodeKey = nodeData.id
  
  console.log('📍 更新后 selectedNode:', pageData.selectedNode)
  console.log('📍 selectedNode.id:', pageData.selectedNode?.id)
  console.log('📍 selectedNode.name:', pageData.selectedNode?.name)
  
  // 如果有 treeManager，获取完整的路径信息
  if (treeManager) {
    try {
      const path = treeManager.getNodePath(nodeData.id)
      const pathNames = path.pathNodes.map(n => n.name).join(' > ')
      pageData.selectedPath = path.pathNodes
      pageData.selectedPathText = pathNames
      console.log('📍 节点路径:', pathNames)
      ElMessage?.success(`已选中: ${pathNames}`)
    } catch (error) {
      console.error('获取节点路径失败:', error)
      pageData.selectedPath = []
      pageData.selectedPathText = nodeData.name || nodeData.label || '未知节点'
      ElMessage?.info(`已选中: ${nodeData.name || nodeData.label}`)
    }
  } else {
    // 没有 treeManager 时的简化处理
    console.log('⚠️ TreeManager 未初始化，使用简化处理')
    pageData.selectedPath = []
    pageData.selectedPathText = nodeData.name || nodeData.label || '未知节点'
    ElMessage?.info(`已选中: ${nodeData.name || nodeData.label}`)
  }
  
  // 通过 form-create API 获取 RendererTree 组件实例，再取内部 el-tree 调用 setCurrentKey
  // 避免 $rebindRules() 重建整棵树导致展开状态丢失
  try {
    const treeComp = $api?.el('organization-tree')
    // RendererTree 根元素是 el-tree，其 $el.__vueParentComponent 可向上找到 el-tree vm
    // 更简单：直接查 DOM 上挂的 __vueParentComponent
    if (treeComp) {
      const elTreeVm = treeComp.__vue_app__
        ? null  // element ref，不是 vm
        : treeComp?.$refs?.tree   // r-tree 暴露的 ref（若存在）
      if (elTreeVm && typeof elTreeVm.setCurrentKey === 'function') {
        elTreeVm.setCurrentKey(nodeData.id)
      }
    }
  } catch (e) {
    // 忽略，el-tree 内部已通过 click 维护了 highlight 状态
  }

  // ── 级联更新子节点表格（通过 DataView.replaceRows，无需 $rebindRules）──
  try {
    const childView = $dataSet?.getView?.('childNodes')
    if (childView) {
      const children = treeManager ? treeManager.getChildren(nodeData.id) : []
      const childRows = children.map(c => {
        try {
          const p = treeManager.getNodePath(c.id)
          return Object.assign({}, c, { pathText: p.pathNodes.map(n => n.name).join(' > ') })
        } catch (e2) {
          return Object.assign({}, c, { pathText: c.name })
        }
      })
      childView.replaceRows(childRows)
      console.log('📋 子节点级联更新:', childRows.length, '条')
    }
  } catch (e3) {
    console.error('级联更新子节点失败:', e3)
  }

  console.log('📍 handleNodeClick 完成，节点信息已响应式更新')
}

/**
 * 处理搜索输入变化
 */
function handleSearchInput(value) {
  const pageData = $data
  pageData.searchKeyword = value
  console.log('📝 搜索输入变化:', value)
  // ⚠️ 不调用 $rebindRules()，避免输入框被重置
}

/**
 * 搜索节点
 */
function handleSearch() {
  console.log('🎯 handleSearch 被调用！')
  const pageData = $data
  
  // 🔑 从沙箱上下文获取 formApi
  const keyword = $api?.getValue('searchKeyword') || ''
  
  console.log('📝 当前 searchKeyword:', keyword)
  
  const childView = $dataSet?.getView?.('childNodes')

  if (!keyword || keyword.trim() === '') {
    console.log('⚠️ 关键词为空，清空搜索结果')
    if (childView) childView.replaceRows([])
    return
  }
  
  console.log('🔍 搜索关键词:', keyword)
  
  // 搜索节点
  const results = treeManager.searchNodes(keyword)
  
  console.log('搜索结果:', results)
  
  // 添加路径信息
  const resultsWithPath = results.map(node => {
    const path = treeManager.getNodePath(node.id)
    return Object.assign({}, node, {
      pathText: path.pathNodes.map(n => n.name).join(' > ')
    })
  })
  
  // 通过 DataView.replaceRows 更新表格，无需 $rebindRules()
  if (childView) {
    childView.replaceRows(resultsWithPath)
  }
  
  if (results.length > 0) {
    ElMessage?.success(`找到 ${results.length} 个匹配节点`)
  } else {
    ElMessage?.warning('未找到匹配节点')
  }
}

/**
 * 处理搜索框键盘事件
 */
function handleSearchKeyup(event) {
  console.log('⌨️ handleSearchKeyup 被调用！', event)
  // 回车键触发搜索
  if (event.key === 'Enter' || event.keyCode === 13) {
    console.log('✅ 检测到回车键，触发搜索')
    handleSearch()
  }
}

/**
 * 清空搜索
 */
function handleClearSearch() {
  $data.searchKeyword = ''
  const childView = $dataSet?.getView?.('childNodes')
  if (childView) childView.replaceRows([])
}

/**
 * 定位到搜索结果
 */
function handleLocateNode(row, column, event) {
  const pageData = $data
  
  console.log('🎯 定位到节点 - row:', row)
  console.log('🎯 定位到节点 - column:', column)
  console.log('🎯 定位到节点 - event:', event)
  
  // row 就是节点数据
  const node = row
  
  if (!node || !node.id) {
    ElMessage?.error('无效的节点数据')
    return
  }
  
  // 获取节点路径
  const path = treeManager.getNodePath(node.id)
  const pathIds = path.pathIds
  
  console.log('📍 节点路径 IDs:', pathIds)
  
  // 展开所有父节点（除了当前节点自己）
  const parentIds = pathIds.slice(0, -1)
  pageData.expandedKeys = [...new Set([...pageData.expandedKeys, ...parentIds])]
  
  console.log('🔓 展开的节点 IDs:', pageData.expandedKeys)
  
  // 选中当前节点
  handleNodeClick(node)
  
  ElMessage?.success(`已定位到: ${path.pathNodes.map(n => n.name).join(' > ')}`)
}

/**
 * 切换树模式
 */
function handleToggleMode() {
  const pageData = $data
  const currentMode = pageData.treeData.config.mode
  const newMode = currentMode === 'flat' ? 'nested' : 'flat'
  
  pageData.treeData.config.mode = newMode
  
  console.log(`🔄 切换树模式: ${currentMode} -> ${newMode}`)
  
  if (newMode === 'nested') {
    // 构建嵌套树
    const nestedTree = treeManager.buildNestedTree()
    pageData.nestedTreeData = nestedTree
    console.log('嵌套树结构:', nestedTree)
    ElMessage?.success('已切换到嵌套模式')
  } else {
    ElMessage?.success('已切换到扁平模式')
  }
  
  $rebindRules()
}

/**
 * 展开全部
 */
function handleExpandAll() {
  const pageData = $data
  console.log('🔽 展开全部节点')
  ElMessage?.success('展开全部功能需要 UI 组件支持')
}

/**
 * 收起全部
 */
function handleCollapseAll() {
  const pageData = $data
  console.log('🔼 收起全部节点')
  ElMessage?.success('收起全部功能需要 UI 组件支持')
}

/**
 * 添加节点
 */
async function handleAddNode() {
  const pageData = $data
  
  if (!pageData.selectedNode) {
    ElMessage?.warning('请先选择父节点')
    return
  }
  
  if (!treeManager) {
    ElMessage?.error('TreeManager 未初始化')
    return
  }
  
  const parentNode = pageData.selectedNode
  
  // 从 treeManager 缓存获取所有节点
  const allNodes = Object.values(treeManager.getCache())
  const newId = Math.max(...allNodes.map(n => n.id)) + 1
  
  const newNode = {
    id: newId,
    parentId: parentNode.id,
    name: `新节点 ${newId}`,
    type: 'new',
    level: parentNode.level + 1
  }
  
  // 添加到缓存
  treeManager.addNodesToCache([newNode])
  
  // 🔑 关键：重新构建树形结构并更新 hierarchicalTreeData
  if (treeManager.buildNestedTree) {
    const nestedTree = treeManager.buildNestedTree()
    pageData.hierarchicalTreeData = nestedTree
  }
  
  // 更新父节点的 hasChildren
  if (treeManager.markHasChildren) {
    treeManager.markHasChildren(parentNode.id)
  }
  
  $rebindRules()
  
  ElMessage?.success(`已添加子节点: ${newNode.name}`)
  console.log('✅ 添加节点:', newNode)
}

/**
 * 删除节点
 */
async function handleDeleteNode() {
  const pageData = $data
  
  if (!pageData.selectedNode) {
    ElMessage?.warning('请先选择要删除的节点')
    return
  }
  
  if (!treeManager) {
    ElMessage?.error('TreeManager 未初始化')
    return
  }
  
  const node = pageData.selectedNode
  
  // 检查是否有子节点
  const children = treeManager.getChildren(node.id)
  if (children.length > 0) {
    ElMessage?.error(`${node.name} 有子节点，无法删除`)
    return
  }
  
  // 从缓存中删除
  const cache = treeManager.getCache()
  delete cache[node.id]
  
  // 🔑 关键：重新构建树形结构并更新 hierarchicalTreeData
  if (treeManager.buildNestedTree) {
    const nestedTree = treeManager.buildNestedTree()
    pageData.hierarchicalTreeData = nestedTree
  }
  
  pageData.selectedNode = null
  pageData.selectedPath = []
  
  $rebindRules()
  
  ElMessage?.success(`已删除节点: ${node.name}`)
  console.log('🗑️ 删除节点:', node)
}

/**
 * 导出树数据
 */
function handleExport() {
  const pageData = $data
  
  if (!treeManager) {
    ElMessage?.error('TreeManager 未初始化')
    return
  }
  
  const json = treeManager.toJSON()
  
  // 创建下载链接
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'tree-data.json'
  a.click()
  URL.revokeObjectURL(url)
  
  ElMessage?.success('已导出树数据')
  console.log('📤 导出数据:', json)
}

/**
 * 查看节点详情
 */
function handleViewDetails(node) {
  const pageData = $data
  
  if (!treeManager) {
    ElMessage?.error('TreeManager 未初始化')
    return
  }
  
  const path = treeManager.getNodePath(node.id)
  const children = treeManager.getChildren(node.id)
  
  console.log('📋 节点详情:')
  console.log('  ID:', node.id)
  console.log('  名称:', node.name)
  console.log('  类型:', node.type)
  console.log('  层级:', node.level)
  console.log('  路径:', path.pathNodes.map(n => n.name).join(' > '))
  console.log('  子节点数:', children.length)
  console.log('  完整数据:', node)
  
  ElMessage?.info(`查看节点详情: ${node.name}`)
}
