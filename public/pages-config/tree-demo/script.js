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

/**
 * 初始化树管理器
 */
function __init__() {
  const pageData = $data
  
  // 初始化展开状态数组
  if (!pageData.expandedKeys) {
    pageData.expandedKeys = []
  }
  
  // 使用 SparkData 命名空间创建 TreeManager
  if (!SparkData || !SparkData.createTreeManager) {
    console.error('❌ SparkData 或 createTreeManager 未注入')
    return
  }
  
  const { config, nodes } = pageData.treeData
  
  // 使用 SparkData.createTreeManager() 创建树管理器
  treeManager = SparkData.createTreeManager(config, nodes)
  
  if (!treeManager) {
    console.error('❌ TreeManager 创建失败')
    return
  }
  
  // 富化节点信息（计算 level 和 hasChildren）
  if (treeManager.enrichNodes) {
    treeManager.enrichNodes()
  }
  
  console.log('✅ TreeManager 初始化完成')
  console.log('扁平节点数量:', nodes.length)
  
  // 注意：不需要重新构建树形结构，因为 RendererTree 使用的是 hierarchicalTreeData
  // pageData.hierarchicalTreeData 已经是嵌套的树形结构
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
  
  console.log('📍 准备调用 $rebindRules() 更新节点信息显示')
  console.log('📍 当前 expandedKeys:', pageData.expandedKeys)
  
  // 重新绑定规则以更新节点信息显示
  // 注意：会导致树重新渲染，但应该通过 default-expanded-keys 恢复展开状态
  $rebindRules()
  
  console.log('📍 $rebindRules() 调用完成')
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
  
  if (!keyword || keyword.trim() === '') {
    console.log('⚠️ 关键词为空，清空搜索结果')
    pageData.searchResults = []
    $rebindRules()
    return
  }
  
  console.log('🔍 搜索关键词:', keyword)
  
  // 搜索节点
  const results = treeManager.searchNodes(keyword)
  
  console.log('搜索结果:', results)
  
  // 添加路径信息
  const resultsWithPath = results.map(node => {
    const path = treeManager.getNodePath(node.id)
    return {
      ...node,
      pathText: path.pathNodes.map(n => n.name).join(' > ')
    }
  })
  
  pageData.searchResults = resultsWithPath
  $rebindRules()
  
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
  const pageData = $data
  pageData.searchKeyword = ''
  pageData.searchResults = []
  $rebindRules()
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
