import { MockMethod } from 'vite-plugin-mock'
import routes from '../pages-config/routes.json'
import fs from 'fs'
import path from 'path'

// 从 mock/database 加载模拟数据
const loadMockData = (tableName: string) => {
  try {
    const dbPath = path.join(__dirname, `database/${tableName}.json`)
    if (fs.existsSync(dbPath)) {
      const content = fs.readFileSync(dbPath, 'utf-8')
      return JSON.parse(content)
    }
  } catch (e) {
    console.warn(`⚠️ 加载 Mock 数据失败: database/${tableName}.json`, e)
  }
  return []
}

// 动态导入页面配置
const loadPageConfig = (pageId: string, type: 'rule' | 'data' | 'style') => {
  try {
    // JSON 文件使用 require
    if (type === 'rule' || type === 'data') {
      const fileName = type === 'data' ? 'pagedata' : type
      const config = require(`../pages-config/${pageId}/${fileName}.json`)
      
      // ✅ 按需加载：不再自动填充数据，由页面脚本的 dataLoader 负责
      // 页面初始化时只返回空的数据结构，用户交互时才加载数据

      return config
    }
    
    // style 从 style.css 文件读取
    if (type === 'style') {
      try {
        const stylePath = path.join(__dirname, `../pages-config/${pageId}/style.css`)
        if (fs.existsSync(stylePath)) {
          return fs.readFileSync(stylePath, 'utf-8')
        }
        return null
      } catch {
        return null
      }
    }
    
    return null
  } catch {
    console.warn(`⚠️ 未找到页面配置: pages-config/${pageId}/${type}`)
    return type === 'rule' ? [] : type === 'data' ? {} : null
  }
}

export default [
  {
    url: '/api/getPageConfig',
    method: 'get',
    response: ({ query }: { query: Record<string, string> }) => {
      const pageId = query.pageId || 'home'
      
      console.log('📄 加载页面配置:', pageId)
      
      return {
        code: 200,
        message: 'success',
        data: {
          rule: loadPageConfig(pageId, 'rule'),
          data: loadPageConfig(pageId, 'data'),
          style: loadPageConfig(pageId, 'style')
        }
      }
    }
  },
  {
    url: '/api/getRoutes',
    method: 'get',
    response: () => {
      return {
        code: 200,
        message: 'success',
        data: routes
      }
    }
  },
  // 模拟用户列表 API
  // 模拟通用数据查询 API
  {
    url: '/api/data/list',
    method: 'get',
    response: ({ query }: { query: Record<string, string | number> }) => {
      const { tableName, page = 1, pageSize = 20, ...filters } = query
      
      console.log(`🔎 [Mock API] 查询表: ${tableName}`, { page, pageSize, filters })
      
      if (!tableName || typeof tableName !== 'string') {
        return { code: 400, message: 'Missing tableName', data: [] }
      }

      let rows = loadMockData(tableName)
      
      // 简单过滤逻辑 (模拟后端查询)
      Object.keys(filters).forEach(key => {
        if (key !== 'page' && key !== 'pageSize' && filters[key]) {
          rows = rows.filter((row: Record<string, unknown>) => String(row[key]) == String(filters[key]))
        }
      })
      
      const total = rows.length
      const start = (Number(page) - 1) * Number(pageSize)
      const end = start + Number(pageSize)
      const list = rows.slice(start, end)
      
      return {
        code: 200,
        message: 'success',
        data: {
          list,
          total,
          page: Number(page),
          pageSize: Number(pageSize)
        }
      }
    }
  },
  {
    url: '/api/users',
    method: 'get',
    response: ({ query }: any) => {
      const page = parseInt(query.page || '1')
      const pageSize = parseInt(query.pageSize || '10')
      
      // 模拟数据
      const allUsers = Array.from({ length: 50 }, (_, i) => ({
        id: i + 1,
        name: `用户${i + 1}`,
        email: `user${i + 1}@example.com`,
        status: i % 3 === 0 ? '禁用' : '激活',
        date: new Date(2024, 0, (i % 28) + 1).toISOString().split('T')[0]
      }))
      
      const start = (page - 1) * pageSize
      const end = start + pageSize
      
      return {
        code: 200,
        message: 'success',
        data: {
          list: allUsers.slice(start, end),
          total: allUsers.length,
          page,
          pageSize
        }
      }
    }
  },
  // 模拟统计数据 API
  {
    url: '/api/dashboard/stats',
    method: 'get',
    response: () => {
      return {
        code: 200,
        message: 'success',
        data: {
          totalUsers: Math.floor(Math.random() * 10000),
          todayOrders: Math.floor(Math.random() * 200),
          revenue: `¥${Math.floor(Math.random() * 100000)}`,
          pending: Math.floor(Math.random() * 50)
        }
      }
    }
  },
  // 模拟最近订单 API
  {
    url: '/api/orders/recent',
    method: 'get',
    response: ({ query }: any) => {
      const limit = parseInt(query.limit || '10')
      
      const orders = Array.from({ length: limit }, (_, i) => ({
        orderNo: `ORD${Date.now() + i}`,
        customer: `客户${i + 1}`,
        amount: Math.floor(Math.random() * 5000),
        status: ['待付款', '已付款', '已发货', '已完成'][Math.floor(Math.random() * 4)],
        date: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      }))
      
      return {
        code: 200,
        message: 'success',
        data: {
          orders
        }
      }
    }
  }
] as MockMethod[];
