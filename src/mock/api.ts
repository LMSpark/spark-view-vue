import { MockMethod } from 'vite-plugin-mock'
import routes from './routes.json'
import fs from 'fs'
import path from 'path'

// 动态导入页面配置
const loadPageConfig = (pageId: string, type: 'rule' | 'data' | 'style') => {
  try {
    // JSON 文件使用 require
    if (type === 'rule' || type === 'data') {
      const config = require(`./pages/${pageId}/${type}.json`)
      return config
    }
    
    // style 从 style.css 文件读取
    if (type === 'style') {
      try {
        const stylePath = path.join(__dirname, `pages/${pageId}/style.css`)
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
    console.warn(`⚠️ 未找到页面配置: pages/${pageId}/${type}`)
    return type === 'rule' ? [] : type === 'data' ? {} : null
  }
}

export default [
  {
    url: '/api/getPageConfig',
    method: 'get',
    response: ({ query }: any) => {
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
