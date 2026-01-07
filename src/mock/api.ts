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
  }
] as MockMethod[];
