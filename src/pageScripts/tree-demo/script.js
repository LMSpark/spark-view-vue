import { $data, $rebindRules } from '../common.js'
import { TreeManager } from '../../utils/treeManager'
import { buildTreeFromFlat, getNodePath as getNodePathHelper } from '../treeHelper.js'
import { ElMessage } from 'element-plus'

let treeManager = null

/**
 * 初始化树管理器
 */
export function init() {
  const pageData = $data()
  const { config, nodes } = pageData.treeData
  
  // 创建树管理器
  treeManager = new TreeManager(config, nodes)
  
  // 富化节点信息（计算 level 和 hasChildren）
  treeManager.enrichNodes()
  
  // 更新缓存数据
  pageData.treeData.nodes = Object.values(treeManager.getCache())
  
  console.log('✅ TreeManager 初始化完成')
  console.log('节点数量:', Object.keys(treeManager.getCache()).length)
  console.log('根节点:', treeManager.getRoots())
  
  $rebindRules()
}

/**
 * 展开节点
 */
export function handleNodeExpand(node) {
  console.log('🔽 展开节点:', node.name)
  
  const children = treeManager.getChildren(node.id)
  console.log('子节点数量:', children.length)
  
  if (children.length > 0) {
    ElMessage.success(`${node.name} 有 ${children.length} 个子节点`)
  } else {
    ElMessage.info(`${node.name} 没有子节点`)
  }
}

/**
 * 收起节点
 */
export function handleNodeCollapse(node) {
  console.log('🔼 收起节点:', node.name)
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
  
  $rebindRules()
  
  ElMessage.success(`已选中: ${pathNames}`)
}

/**
 * 搜索节点
 */
export function handleSearch() {
  const pageData = $data()
  const keyword = pageData.searchKeyword
  
  if (!keyword || keyword.trim() === '') {
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
export function handleLocateNode(node) {
  handleNodeClick(node)
  
  // 滚动到节点位置（需要UI组件支持）
  ElMessage.info(`定位到: ${node.name}`)
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
  const newId = Math.max(...pageData.treeData.nodes.map(n => n.id)) + 1
  
  const newNode = {
    id: newId,
    parentId: parentNode.id,
    name: `新节点 ${newId}`,
    type: 'new',
    level: parentNode.level + 1
  }
  
  // 添加到缓存
  treeManager.addNodesToCache([newNode])
  
  // 更新数据
  pageData.treeData.nodes = Object.values(treeManager.getCache())
  
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
  
  // 更新数据
  pageData.treeData.nodes = Object.values(cache)
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
