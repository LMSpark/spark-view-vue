/**
 * Mock 配置 API 服务器
 * 用于测试远程配置功能
 * 
 * 运行方式：
 * node tools/mock-config-api.mjs
 * 
 * 默认端口：3001
 * 访问：http://localhost:3001/api/config/default
 */

import express from 'express'
import cors from 'cors'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3001

// 启用 CORS
app.use(cors())
app.use(express.json())

// 日志中间件
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`)
  next()
})

// 租户配置数据（模拟数据库）
const tenantDatabase = new Map([
  ['demo', {
    tenant: {
      tenantId: 'demo',
      tenantName: 'Demo Company',
      tenantCode: 'DEMO001',
      logo: 'https://via.placeholder.com/150/1890ff/ffffff?text=Demo',
      theme: {
        primaryColor: '#1890ff',
        borderRadius: '4px'
      }
    },
    config: {
      apiBaseUrl: 'https://demo-api.example.com',
      logLevel: 'debug',
      features: {
        enableAI: false,
        enableExport: true,
        enableOffline: true
      }
    },
    pageConfig: {
      homePath: '/demo-home'
    },
    logger: {
      level: 'debug',
      enableRemote: true,
      remoteEndpoint: 'https://demo-api.example.com/logs'
    }
  }],
  ['enterprise', {
    tenant: {
      tenantId: 'enterprise',
      tenantName: 'Enterprise Corporation',
      tenantCode: 'ENT001',
      logo: 'https://via.placeholder.com/150/722ed1/ffffff?text=Enterprise',
      theme: {
        primaryColor: '#722ed1',
        borderRadius: '8px'
      }
    },
    config: {
      apiBaseUrl: 'https://enterprise-api.example.com',
      logLevel: 'info',
      features: {
        enableAI: true,
        enableExport: true,
        enableOffline: false
      }
    },
    pageConfig: {
      source: 'remote',
      homePath: '/enterprise-dashboard'
    },
    logger: {
      level: 'info',
      enableRemote: true,
      remoteEndpoint: 'https://enterprise-api.example.com/logs'
    }
  }],
  ['test', {
    tenant: {
      tenantId: 'test',
      tenantName: 'Test Tenant',
      tenantCode: 'TEST001',
      logo: 'https://via.placeholder.com/150/52c41a/ffffff?text=Test',
      theme: {
        primaryColor: '#52c41a'
      }
    },
    config: {
      apiBaseUrl: 'https://test-api.example.com',
      logLevel: 'debug',
      enableMock: true,
      features: {
        enableAI: false,
        enableExport: true,
        enableOffline: true
      }
    }
  }]
])

/**
 * 获取默认配置
 */
app.get('/api/config/default', async (req, res) => {
  try {
    // 模拟网络延迟
    await delay(500)
    
    const defaultConfig = {
      router: {
        mode: 'history'
      },
      mountTarget: '#app',
      plugins: {
        'element-plus': {
          enabled: true,
          options: {
            size: 'default',
            zIndex: 2000
          },
          priority: 1
        },
        'vxe-table': {
          enabled: true,
          priority: 2
        },
        'form-create': {
          enabled: true,
          priority: 3
        }
      },
      spark: {
        enabled: true
      },
      pageConfig: {
        source: 'local',
        apiBaseUrl: '/api',
        homePath: '/home'
      },
      config: {
        apiBaseUrl: '/api',
        logLevel: 'info',
        enableMock: false,
        version: '1.0.0',
        features: {
          enableAI: false,
          enableExport: true,
          enableOffline: false
        }
      },
      logger: {
        level: 'info',
        enableColors: true,
        showTimestamp: false,
        enableRemote: true,
        remoteEndpoint: '/api/logs'
      }
    }
    
    console.log('✅ Returned default config')
    res.json(defaultConfig)
  } catch (error) {
    console.error('❌ Error getting default config:', error)
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to load default configuration',
      code: 500
    })
  }
})

/**
 * 获取租户配置
 */
app.get('/api/config/tenant/:tenantId', async (req, res) => {
  try {
    const { tenantId } = req.params
    
    // 模拟网络延迟
    await delay(300)
    
    const tenantConfig = tenantDatabase.get(tenantId)
    
    if (!tenantConfig) {
      console.warn(`⚠️  Tenant not found: ${tenantId}`)
      return res.status(404).json({
        error: 'TENANT_NOT_FOUND',
        message: `Tenant '${tenantId}' not found`,
        code: 404
      })
    }
    
    console.log(`✅ Returned config for tenant: ${tenantId}`)
    res.json(tenantConfig)
  } catch (error) {
    console.error(`❌ Error getting tenant config for ${req.params.tenantId}:`, error)
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to load tenant configuration',
      code: 500
    })
  }
})

/**
 * 列出所有租户
 */
app.get('/api/tenants', async (req, res) => {
  try {
    const tenants = Array.from(tenantDatabase.entries()).map(([id, config]) => ({
      tenantId: id,
      tenantName: config.tenant.tenantName,
      tenantCode: config.tenant.tenantCode
    }))
    
    console.log(`✅ Listed ${tenants.length} tenants`)
    res.json(tenants)
  } catch (error) {
    console.error('❌ Error listing tenants:', error)
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to list tenants',
      code: 500
    })
  }
})

/**
 * 创建/更新租户配置（用于测试）
 */
app.post('/api/config/tenant/:tenantId', async (req, res) => {
  try {
    const { tenantId } = req.params
    const config = req.body
    
    tenantDatabase.set(tenantId, config)
    
    console.log(`✅ Updated config for tenant: ${tenantId}`)
    res.json({
      success: true,
      message: `Configuration updated for tenant: ${tenantId}`
    })
  } catch (error) {
    console.error(`❌ Error updating tenant config for ${req.params.tenantId}:`, error)
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to update tenant configuration',
      code: 500
    })
  }
})

/**
 * 删除租户配置（用于测试）
 */
app.delete('/api/config/tenant/:tenantId', async (req, res) => {
  try {
    const { tenantId } = req.params
    
    if (!tenantDatabase.has(tenantId)) {
      return res.status(404).json({
        error: 'TENANT_NOT_FOUND',
        message: `Tenant '${tenantId}' not found`,
        code: 404
      })
    }
    
    tenantDatabase.delete(tenantId)
    
    console.log(`✅ Deleted config for tenant: ${tenantId}`)
    res.json({
      success: true,
      message: `Configuration deleted for tenant: ${tenantId}`
    })
  } catch (error) {
    console.error(`❌ Error deleting tenant config for ${req.params.tenantId}:`, error)
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to delete tenant configuration',
      code: 500
    })
  }
})

/**
 * 健康检查
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    tenants: tenantDatabase.size
  })
})

/**
 * 延迟工具函数
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 404 处理
 */
app.use((req, res) => {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `Route ${req.method} ${req.url} not found`,
    code: 404
  })
})

/**
 * 错误处理
 */
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err)
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: err.message,
    code: 500
  })
})

/**
 * 启动服务器
 */
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60))
  console.log('🚀 Mock Config API Server Started')
  console.log('='.repeat(60))
  console.log(`📍 Server URL: http://localhost:${PORT}`)
  console.log(`📊 Health Check: http://localhost:${PORT}/health`)
  console.log(`📋 Default Config: http://localhost:${PORT}/api/config/default`)
  console.log(`👥 Available Tenants:`)
  
  tenantDatabase.forEach((config, id) => {
    console.log(`   - ${id}: ${config.tenant.tenantName}`)
    console.log(`     URL: http://localhost:${PORT}/api/config/tenant/${id}`)
  })
  
  console.log('='.repeat(60) + '\n')
})

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down Mock Config API Server...')
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('\n👋 Shutting down Mock Config API Server...')
  process.exit(0)
})
