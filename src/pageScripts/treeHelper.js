/**
 * 树形结构辅助函数
 * 用于在 pageScripts 中操作树形数据
 */

import { TreeManager } from '../utils/treeManager.js'

/**
 * 模拟 API：获取节点路径
 * 实际项目中应调用后端 GET /tree/path
 */
export async function getNodePathIds(targetId, api = null) {
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
export async function getSubTreeByRange(fromId, toId, api = null) {
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
export async function getChildren(parentId, api = null) {
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
export async function searchNodes(keyword, api = null) {
  if (api) {
    const response = await fetch(`${api}?keyword=${encodeURIComponent(keyword)}`)
    const data = await response.json()
    return data.data
  }
  
  // Mock 数据
  return []
}

/**
 * 从扁平数据构建树形结构
 * @param {Array} flatNodes - 扁平节点数组
 * @param {string} idField - ID 字段名
 * @param {string} parentIdField - 父 ID 字段名
 * @returns {Array} 树形结构数组
 */
export function buildTreeFromFlat(flatNodes, idField = 'id', parentIdField = 'parentId') {
  const map = new Map()
  const roots = []

  // 第一遍：创建映射
  flatNodes.forEach(node => {
    map.set(node[idField], { ...node, children: [] })
  })

  // 第二遍：建立父子关系
  map.forEach(node => {
    const parentId = node[parentIdField]
    if (parentId && map.has(parentId)) {
      map.get(parentId).children.push(node)
    } else {
      roots.push(node)
    }
  })

  return roots
}

/**
 * 将树形结构展平
 * @param {Array} treeNodes - 树形结构数组
 * @returns {Array} 扁平节点数组
 */
export function flattenTree(treeNodes) {
  const result = []

  function traverse(nodes, level = 0) {
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
 * @param {Array} treeNodes - 树形结构数组
 * @param {Function} predicate - 查找条件
 * @returns {Object|null} 找到的节点
 */
export function findNode(treeNodes, predicate) {
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
 * @param {Array} treeNodes - 树形结构数组
 * @param {Function} predicate - 查找条件
 * @returns {Array} 路径数组
 */
export function getNodePath(treeNodes, predicate) {
  const path = []

  function traverse(nodes) {
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
 * @param {Array} treeNodes - 树形结构数组
 * @param {Function} callback - 回调函数
 */
export function traverseTree(treeNodes, callback) {
  function traverse(nodes, level = 0, parent = null) {
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
 * @param {Array} treeNodes - 树形结构数组
 * @param {Function} predicate - 过滤条件
 * @returns {Array} 过滤后的树
 */
export function filterTree(treeNodes, predicate) {
  function filter(nodes) {
    const result = []
    
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
 * @param {Array} treeNodes - 树形结构数组
 * @param {Function} compareFn - 比较函数
 * @returns {Array} 排序后的树
 */
export function sortTree(treeNodes, compareFn) {
  const sorted = [...treeNodes].sort(compareFn)
  
  return sorted.map(node => ({
    ...node,
    children: node.children ? sortTree(node.children, compareFn) : []
  }))
}

/**
 * 计算树的最大深度
 * @param {Array} treeNodes - 树形结构数组
 * @returns {number} 最大深度
 */
export function getMaxDepth(treeNodes) {
  let maxDepth = 0

  function traverse(nodes, depth) {
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
 * @param {Array} treeNodes - 树形结构数组
 * @returns {number} 节点总数
 */
export function countNodes(treeNodes) {
  let count = 0

  traverseTree(treeNodes, () => {
    count++
  })

  return count
}
