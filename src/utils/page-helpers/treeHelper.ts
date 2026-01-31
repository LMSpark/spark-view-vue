/**
 * 树形结构辅助函数
 * 用于在 pageScripts 中操作树形数据
 */

/**
 * 节点路径响应
 */
export interface NodePathResponse {
  pathIds: number[]
}

/**
 * 模拟 API：获取节点路径
 * 实际项目中应调用后端 GET /tree/path
 */
export async function getNodePathIds(
  targetId: number,
  api: string | null = null
): Promise<NodePathResponse> {
  if (api) {
    const response = await fetch(`${api}?id=${targetId}`)
    const data = await response.json()
    return data.data
  }
  
  // Mock 数据
  return {
    pathIds: [1, 2, targetId]
  }
}

/**
 * 模拟 API：获取子树区间
 * 实际项目中应调用后端 GET /tree/subtree
 */
export async function getSubTreeByRange(
  fromId: number,
  toId: number,
  api: string | null = null
): Promise<unknown[]> {
  if (api) {
    const response = await fetch(`${api}?fromId=${fromId}&toId=${toId}`)
    const data = await response.json()
    return data.data
  }
  
  // Mock 数据：返回路径上的节点
  return []
}

/**
 * 模拟 API：获取子节点列表
 * 实际项目中应调用后端 GET /tree/children
 */
export async function getChildren(
  parentId: number,
  api: string | null = null
): Promise<unknown[]> {
  if (api) {
    const response = await fetch(`${api}?parentId=${parentId}`)
    const data = await response.json()
    return data.data
  }
  
  // Mock 数据
  return []
}

/**
 * 模拟 API：搜索节点
 * 实际项目中应调用后端 GET /tree/search
 */
export async function searchNodes(
  keyword: string,
  api: string | null = null
): Promise<unknown[]> {
  if (api) {
    const response = await fetch(`${api}?keyword=${encodeURIComponent(keyword)}`)
    const data = await response.json()
    return data.data
  }
  
  // Mock 数据
  return []
}

/**
 * 树节点接口
 */
export interface TreeNode {
  [key: string]: unknown
  children?: TreeNode[]
}

/**
 * 从扁平数据构建树形结构
 */
export function buildTreeFromFlat(
  flatNodes: Record<string, unknown>[],
  idField: string = 'id',
  parentIdField: string = 'parentId'
): TreeNode[] {
  const map = new Map<unknown, TreeNode>()
  const roots: TreeNode[] = []

  // 第一遍：创建映射
  flatNodes.forEach(node => {
    map.set(node[idField], { ...node, children: [] })
  })

  // 第二遍：建立父子关系
  map.forEach(node => {
    const parentId = node[parentIdField]
    if (parentId && map.has(parentId)) {
      const parent = map.get(parentId)
      if (parent) {
        parent.children ??= []
        parent.children.push(node)
      }
    } else {
      roots.push(node)
    }
  })

  return roots
}

/**
 * 将树形结构展平
 */
export function flattenTree(treeNodes: TreeNode[]): unknown[] {
  const result: unknown[] = []

  function traverse(nodes: TreeNode[], level: number = 0): void {
    nodes.forEach(node => {
      const { children, ...rest } = node
      result.push({ ...rest, level })
      
      if (children && children.length > 0) {
        traverse(children, level + 1)
      }
    })
  }

  traverse(treeNodes)
  return result
}

/**
 * 查找节点
 */
export function findNode(
  treeNodes: TreeNode[],
  predicate: (node: TreeNode) => boolean
): TreeNode | null {
  for (const node of treeNodes) {
    if (predicate(node)) {
      return node
    }
    
    if (node.children && node.children.length > 0) {
      const found = findNode(node.children, predicate)
      if (found) return found
    }
  }
  
  return null
}

/**
 * 获取节点路径
 */
export function getNodePath(
  treeNodes: TreeNode[],
  predicate: (node: TreeNode) => boolean
): TreeNode[] {
  const path: TreeNode[] = []

  function traverse(nodes: TreeNode[]): boolean {
    for (const node of nodes) {
      path.push(node)
      
      if (predicate(node)) {
        return true
      }
      
      if (node.children && node.children.length > 0) {
        if (traverse(node.children)) {
          return true
        }
      }
      
      path.pop()
    }
    return false
  }

  traverse(treeNodes)
  return path
}

/**
 * 遍历树
 */
export function traverseTree(
  treeNodes: TreeNode[],
  callback: (node: TreeNode, level: number, parent: TreeNode | null, index: number) => void
): void {
  function traverse(nodes: TreeNode[], level: number = 0, parent: TreeNode | null = null): void {
    nodes.forEach((node, index) => {
      callback(node, level, parent, index)
      
      if (node.children && node.children.length > 0) {
        traverse(node.children, level + 1, node)
      }
    })
  }

  traverse(treeNodes)
}

/**
 * 过滤树（保留匹配节点及其祖先）
 */
export function filterTree(
  treeNodes: TreeNode[],
  predicate: (node: TreeNode) => boolean
): TreeNode[] {
  function filter(nodes: TreeNode[]): TreeNode[] {
    const result: TreeNode[] = []
    
    nodes.forEach(node => {
      const match = predicate(node)
      const filteredChildren = node.children ? filter(node.children) : []
      
      if (match || filteredChildren.length > 0) {
        result.push({
          ...node,
          children: filteredChildren
        })
      }
    })
    
    return result
  }

  return filter(treeNodes)
}

/**
 * 树排序
 */
export function sortTree(
  treeNodes: TreeNode[],
  compareFn: (a: TreeNode, b: TreeNode) => number
): TreeNode[] {
  const sorted = [...treeNodes].sort(compareFn)
  
  return sorted.map(node => ({
    ...node,
    children: node.children ? sortTree(node.children, compareFn) : []
  }))
}

/**
 * 计算树的最大深度
 */
export function getMaxDepth(treeNodes: TreeNode[]): number {
  let maxDepth = 0

  function traverse(nodes: TreeNode[], depth: number): void {
    maxDepth = Math.max(maxDepth, depth)
    
    nodes.forEach(node => {
      if (node.children && node.children.length > 0) {
        traverse(node.children, depth + 1)
      }
    })
  }

  traverse(treeNodes, 0)
  return maxDepth
}

/**
 * 统计节点数量
 */
export function countNodes(treeNodes: TreeNode[]): number {
  let count = 0

  traverseTree(treeNodes, () => {
    count++
  })

  return count
}
