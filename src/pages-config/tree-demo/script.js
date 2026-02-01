import { $data, $rebindRules } from '@/utils/page-helpers/common.js'
import { TreeManager } from '@/models/treeManager'
import { buildTreeFromFlat, getNodePath as getNodePathHelper } from '@/utils/page-helpers/treeHelper'
import { ElMessage } from 'element-plus'

let treeManager = null

/**
 * 初始化树管理器
 */
export function __init__() {
  const pageData = $data()
  const { config, nodes } = pageData.treeData
  
  // 创建树管理器
  treeManager = new TreeManager(config, nodes)
  
  // 富化节点信息（计算 level 和 hasChildren）
  treeManager.enrichNodes()
  
  // 🔑 关键修复：将扁平数据转换为树形结构供 el-tree 使用
  const treeNodes = buildTreeFromFlat(
    nodes,
    config.idField || 'id',
    config.parentIdField || 'parentId'
  )
  
  // 更新为树形结构
  pageData.treeData.nodes = treeNodes
  
  console.log('✅ TreeManager 初始化完成')
  console.log('扁平节点数量:', Object.keys(treeManager.getCache()).length)
  console.log('根节点数量:', treeNodes.length)
  console.log('树形结构:', treeNodes)
  
  $rebindRules()
}

/**
 * 展开节点
 */
export function handleNodeExpand(node) {
  const pageData = $data()
  console.log('🔽 展开节点:', node.name)
  
  // 记录展开的节点
  if (!pageData.expandedKeys.includes(node.id)) {
    pageData.expandedKeys.push(node.id)
  }
  
  const children = treeManager.getChildren(node.id)
  console.log('子节点数量:', children.length)
}

/**
 * 收起节点
 */
export function handleNodeCollapse(node) {
  const pageData = $data()
  console.log('🔼 收起节点:', node.name)
  
  // 移除折叠的节点
  const index = pageData.expandedKeys.indexOf(node.id)
  if (index > -1) {
    pageData.expandedKeys.splice(index, 1)
  }
}

/**
 * 点击节点
 */
export function handleNodeClick(node) {
  const pageData = $data()
  
  console.log('📍 点击节点:', node.name)
  
  // 获取节点路径
  const path = treeManager.getNodePath(node.id)
  const pathNames = path.pathNodes.map(n => n.name).join(' > ')
  
  // 更新选中状态
  pageData.selectedNode = node
  pageData.selectedPath = path.pathNodes
  pageData.selectedPathText = pathNames
  pageData.currentNodeKey = node.id  // 更新当前选中节点 key
  
  // 🔑 关键：只重新绑定节点信息部分，避免树重新渲染
  $rebindRules()
  
  ElMessage.success(`已选中: ${pathNames}`)
}

/**
 * 处理搜索输入变化
 */
export function handleSearchInput(value) {
  const pageData = $data()
  pageData.searchKeyword = value
  console.log('📝 搜索输入变化:', value)
  // ⚠️ 不调用 $rebindRules()，避免输入框被重置
}

/**
 * 搜索节点
 */
export function handleSearch() {
  console.log('🎯 handleSearch 被调用！')
  const pageData = $data()
  
  // 🔑 从 form API 获取输入值
  const formApi = window.__formApi__
  const keyword = formApi?.getValue('searchKeyword') || ''
  
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
    ElMessage.success(`找到 ${results.length} 个匹配节点`)
  } else {
    ElMessage.warning('未找到匹配节点')
  }
}

/**
 * 处理搜索框键盘事件
 */
export function handleSearchKeyup(event) {
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
export function handleClearSearch() {
  const pageData = $data()
  pageData.searchKeyword = ''
  pageData.searchResults = []
  $rebindRules()
}

/**
 * 定位到搜索结果
 */
export function handleLocateNode(row, column, event) {
  const pageData = $data()
  
  console.log('🎯 定位到节点 - row:', row)
  console.log('🎯 定位到节点 - column:', column)
  console.log('🎯 定位到节点 - event:', event)
  
  // row 就是节点数据
  const node = row
  
  if (!node || !node.id) {
    ElMessage.error('无效的节点数据')
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
  
  ElMessage.success(`已定位到: ${path.pathNodes.map(n => n.name).join(' > ')}`)
}

/**
 * 切换树模式
 */
export function handleToggleMode() {
  const pageData = $data()
  const currentMode = pageData.treeData.config.mode
  const newMode = currentMode === 'flat' ? 'nested' : 'flat'
  
  pageData.treeData.config.mode = newMode
  
  console.log(`🔄 切换树模式: ${currentMode} -> ${newMode}`)
  
  if (newMode === 'nested') {
    // 构建嵌套树
    const nestedTree = treeManager.buildNestedTree()
    pageData.nestedTreeData = nestedTree
    console.log('嵌套树结构:', nestedTree)
    ElMessage.success('已切换到嵌套模式')
  } else {
    ElMessage.success('已切换到扁平模式')
  }
  
  $rebindRules()
}

/**
 * 展开全部
 */
export function handleExpandAll() {
  console.log('🔽 展开全部节点')
  ElMessage.success('展开全部功能需要 UI 组件支持')
}

/**
 * 收起全部
 */
export function handleCollapseAll() {
  console.log('🔼 收起全部节点')
  ElMessage.success('收起全部功能需要 UI 组件支持')
}

/**
 * 添加节点
 */
export async function handleAddNode() {
  const pageData = $data()
  
  if (!pageData.selectedNode) {
    ElMessage.warning('请先选择父节点')
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
  
  // 🔑 关键：重新构建树形结构
  const flatNodes = Object.values(treeManager.getCache())
  const treeNodes = buildTreeFromFlat(
    flatNodes,
    'id',
    'parentId'
  )
  
  // 更新树形数据
  pageData.treeData.nodes = treeNodes
  
  // 更新父节点的 hasChildren
  treeManager.markHasChildren(parentNode.id)
  
  $rebindRules()
  
  ElMessage.success(`已添加子节点: ${newNode.name}`)
  console.log('✅ 添加节点:', newNode)
}

/**
 * 删除节点
 */
export async function handleDeleteNode() {
  const pageData = $data()
  
  if (!pageData.selectedNode) {
    ElMessage.warning('请先选择要删除的节点')
    return
  }
  
  const node = pageData.selectedNode
  
  // 检查是否有子节点
  const children = treeManager.getChildren(node.id)
  if (children.length > 0) {
    ElMessage.error(`${node.name} 有子节点，无法删除`)
    return
  }
  
  // 从缓存中删除
  const cache = treeManager.getCache()
  delete cache[node.id]
  
  // 🔑 关键：重新构建树形结构
  const flatNodes = Object.values(cache)
  const treeNodes = buildTreeFromFlat(
    flatNodes,
    'id',
    'parentId'
  )
  
  // 更新树形数据
  pageData.treeData.nodes = treeNodes
  pageData.selectedNode = null
  pageData.selectedPath = []
  
  $rebindRules()
  
  ElMessage.success(`已删除节点: ${node.name}`)
  console.log('🗑️ 删除节点:', node)
}

/**
 * 导出树数据
 */
export function handleExport() {
  const json = treeManager.toJSON()
  
  // 创建下载链接
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'tree-data.json'
  a.click()
  URL.revokeObjectURL(url)
  
  ElMessage.success('已导出树数据')
  console.log('📤 导出数据:', json)
}

/**
 * 查看节点详情
 */
export function handleViewDetails(node) {
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
  
  ElMessage.info(`查看节点详情: ${node.name}`)
}
