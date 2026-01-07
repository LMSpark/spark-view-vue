<template>
  <div v-if="loading" class="loading">加载中...</div>
  <div v-else-if="error" class="error">
    <h3>❌ 页面加载失败</h3>
    <p>{{ error }}</p>
  </div>
  <div v-else>
    <!-- 动态注入页面样式（自动添加作用域） -->
    <component :is="'style'" v-if="pageStyle">{{ pageStyle }}</component>
    
    <!-- 渲染页面内容 -->
    <div ref="pageContainer" :data-page="pageId">
      <form-create
        :rule="pageRules"
        :option="{ form: false, submitBtn: false, resetBtn: false }"
        @mounted="onFormMounted"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import {ref, onMounted, watch, reactive} from 'vue'
import {useRoute} from 'vue-router'
import {getPageConfig} from '../api'
import type {PageRule, ApiConfig} from '../types'

// 使用 Vite 的 glob import 预加载所有页面脚本模块
const pageModules = import.meta.glob('../pageScripts/*/script.js', { eager: false })

const route = useRoute()
const pageRules = ref<PageRule[]>([])
const originalRules = ref<PageRule[]>([]) // 保存原始 rules 配置
const pageStyle = ref<string>('')
const pageId = ref<string>('')
const loading = ref(true)
const error = ref<string>('')
const formApi = ref<any>(null) // form-create API 实例
const pageFunctions = ref<Record<string, Function>>({}) // 页面函数
const pageContainer = ref<HTMLElement | null>(null) // 页面容器引用
const pageData = reactive<Record<string, any>>({}) // 响应式页面数据

// 初始化全局上下文（在任何模块加载之前）- 仅在客户端
if (typeof window !== 'undefined') {
    ;(window as any).__pageContext = {
        $api: null,
        $route: route,
        $data: pageData,
        $el: null,
        $query: (_selector: string) => null,
        $queryAll: (_selector: string) => null,
        $refreshData: null  // 刷新数据的方法
    }
}


// 递归替换 rule 中的数据占位符和事件处理器
const bindDataToRules = (rules: PageRule[], data: Record<string, any>): PageRule[] => {
    return rules.map(rule => {
        const newRule = {...rule}
    
        // 处理事件处理器：将字符串转换为函数
        if (newRule.on && typeof newRule.on === 'object') {
            const newOn: Record<string, Function> = {}
            for (const [eventName, handler] of Object.entries(newRule.on)) {
                if (typeof handler === 'string') {
                    // 从页面函数对象获取函数
                    newOn[eventName] = (...args: any[]) => {
                        const fn = pageFunctions.value[handler]
                        if (typeof fn === 'function') {
                            fn(...args)  // 传递所有参数
                        } else {
                            console.warn(`函数 ${handler} 未定义`)
                        }
                    }
                } else {
                    newOn[eventName] = handler as Function
                }
            }
            newRule.on = newOn
        }
    
        if (newRule.dataKey) {
            const keys = newRule.dataKey.split('.')
            let value: any = data
            for (const key of keys) {
                value = value?.[key]
            }
      
            if (newRule.type === 'el-table' && newRule.props) {
                newRule.props.data = value
            } else if (newRule.children && Array.isArray(newRule.children)) {
                // 确保值被转换为字符串
                newRule.children = [String(value)]
            } else if (newRule.options !== undefined) {
                newRule.options = value
            } else if (newRule.value !== undefined) {
                newRule.value = value
            }
        }
    
        if (newRule.children && Array.isArray(newRule.children)) {
            newRule.children = newRule.children.map(child => {
                if (typeof child === 'string' || typeof child === 'number') {
                    return String(child)
                }
                return bindDataToRules([child], data)[0]
            })
        }
    
        return newRule
    })
}

// 判断是否为 API 配置
const isApiConfig = (value: any): value is ApiConfig => {
    return value && typeof value === 'object' && 'url' in value
}

// 从响应中提取数据
const extractData = (response: any, dataPath?: string): any => {
    if (!dataPath) return response
    
    const keys = dataPath.split('.')
    let value = response
    for (const key of keys) {
        value = value?.[key]
    }
    return value
}

// 加载 API 数据
const loadApiData = async (key: string, config: ApiConfig): Promise<void> => {
    try {
        const method = config.method || 'GET'
        const url = config.url
        
        let fetchUrl = url
        let fetchOptions: RequestInit = { method }
        
        if (method === 'GET' && config.params) {
            const params = new URLSearchParams(config.params)
            fetchUrl = `${url}?${params}`
        } else if (config.params) {
            fetchOptions.body = JSON.stringify(config.params)
            fetchOptions.headers = { 'Content-Type': 'application/json' }
        }
        
        console.log(`📡 加载 API 数据 [${key}]:`, fetchUrl)
        
        const response = await fetch(fetchUrl, fetchOptions)
        const result = await response.json()
        
        // 提取数据
        const data = extractData(result, config.dataPath)
        
        // 更新响应式数据
        pageData[key] = data
        
        console.log(`✅ API 数据加载成功 [${key}]:`, data)
        
        // 重新绑定数据到 rules
        pageRules.value = bindDataToRules(pageRules.value, pageData)
    } catch (err) {
        console.error(`❌ 加载 API 数据失败 [${key}]:`, err)
        throw err
    }
}

// 刷新指定 key 的数据
const refreshData = async (key?: string): Promise<void> => {
    if (!pageDataConfig.value) return
    
    if (key) {
        // 刷新单个数据
        const config = pageDataConfig.value[key]
        if (isApiConfig(config) && config.autoLoad !== false) {
            await loadApiData(key, config)
        }
    } else {
        // 刷新所有 API 数据
        const apiConfigs = Object.entries(pageDataConfig.value)
            .filter(([, value]) => isApiConfig(value))
        
        for (const [k, config] of apiConfigs) {
            if ((config as ApiConfig).autoLoad !== false) {
                await loadApiData(k, config as ApiConfig)
            }
        }
    }
}

// 强制重新绑定数据到 rules（用于响应式数据更新后）
const rebindRules = (): void => {
    if (originalRules.value && originalRules.value.length > 0) {
        console.log('🔄 重新绑定数据到 rules', pageData)
        pageRules.value = bindDataToRules(JSON.parse(JSON.stringify(originalRules.value)), pageData)
    }
}

// 保存原始数据配置（用于刷新）
const pageDataConfig = ref<Record<string, any>>({})

// 处理页面数据（支持静态数据和 API 配置）
const processPageData = async (dataConfig: Record<string, any>): Promise<void> => {
    // 保存配置用于后续刷新
    pageDataConfig.value = dataConfig
    
    // 清空现有数据
    Object.keys(pageData).forEach(key => delete pageData[key])
    
    // 处理每个数据项
    for (const [key, value] of Object.entries(dataConfig)) {
        if (isApiConfig(value)) {
            // API 配置：如果 autoLoad 不为 false，则自动加载
            if (value.autoLoad !== false) {
                await loadApiData(key, value)
            }
        } else {
            // 静态数据：直接赋值
            pageData[key] = value
        }
    }
}
// CSS 作用域隔离：自动添加 [data-page="xxx"] 前缀
const scopeCSS = (css: string, pageId: string): string => {
    if (!css) return ''
    
    // 为每个 CSS 规则添加属性选择器前缀
    return css.replace(
        /([^{}]+)\{([^}]*)\}/g,
        (match, selector, rules) => {
            // 跳过 @media, @keyframes 等 at-rules
            if (selector.trim().startsWith('@')) {
                return match
            }
            
            // 分割多个选择器（如 .a, .b { }）
            const selectors = selector.split(',').map((s: string) => {
                const trimmed = s.trim()
                // 如果已经有 data-page 前缀，跳过
                if (trimmed.includes('[data-page')) {
                    return trimmed
                }
                // 添加属性选择器前缀
                return `[data-page="${pageId}"] ${trimmed}`
            })
            
            return `${selectors.join(', ')} {${rules}}`
        }
    )
}
const loadPageConfig = async () => {
    loading.value = true
    error.value = ''
    
    try {
        // 优先从 meta.pageId 获取，其次从路由参数，最后从路由名称
        const currentPageId = (route.meta.pageId as string) || 
                             (route.params.id as string) || 
                             route.name as string
        
        if (!currentPageId) {
            throw new Error('无法确定页面ID')
        }
        
        pageId.value = currentPageId
        const config = await getPageConfig(currentPageId)
    
        console.log(`✅ 加载页面配置 [${currentPageId}]:`, config)
    
        // 直接动态导入页面脚本模块
        try {
            // 更新全局上下文（在模块加载之前）
            ;(window as any).__pageContext = {
                $api: formApi.value,
                $route: route,
                $data: pageData,
                $el: pageContainer.value,
                $query: (selector: string) => pageContainer.value?.querySelector(selector),
                $queryAll: (selector: string) => pageContainer.value?.querySelectorAll(selector),
                $refreshData: refreshData,  // 刷新 API 数据
                $rebindRules: rebindRules    // 重新绑定数据到 rules
            }
            
            // 使用预加载的模块映射（Vite glob import）
            const modulePath = `../pageScripts/${currentPageId}/script.js`
            const moduleLoader = pageModules[modulePath]
            
            if (!moduleLoader) {
                console.warn(`⚠️ 页面模块不存在: ${modulePath}，跳过脚本加载`)
                pageFunctions.value = {}
            } else {
                // 调用加载器函数获取模块
                const scriptModule = await moduleLoader() as Record<string, unknown>
                
                // 提取导出的函数
                const functions: Record<string, Function> = {}
                for (const [key, value] of Object.entries(scriptModule)) {
                    if (typeof value === 'function') {
                        functions[key] = value as Function
                    }
                }
                
                pageFunctions.value = functions
                console.log('✅ 页面模块加载成功，注册函数:', Object.keys(functions))
            }
        } catch (err) {
            console.error('❌ 页面模块加载失败:', err)
            console.error('尝试加载:', `../pageScripts/${currentPageId}/script.js`)
            pageFunctions.value = {}
        }
    
        // 处理数据（支持静态数据和 API 配置）
        await processPageData(config.data)
    
        // 保存原始 rules 配置
        originalRules.value = config.rule
        
        // 绑定数据到 rules
        pageRules.value = bindDataToRules(config.rule, pageData)
    
        // 加载页面样式（自动添加作用域隔离）
        pageStyle.value = scopeCSS(config.style || '', pageId.value)
    } catch (err: any) {
        error.value = err.message || '加载页面配置失败'
        console.error('❌ 获取页面配置失败:', err)
    } finally {
        loading.value = false
    }
}

// 表单挂载回调
const onFormMounted = (api: any) => {
    formApi.value = api
    console.log('📋 表单实例已挂载:', api)
}

// 监听路由变化，重新加载配置
watch(() => route.path, () => {
    loadPageConfig()
})

onMounted(() => {
    loadPageConfig()
})
</script>

<style scoped>
.loading {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  font-size: 20px;
  color: #409eff;
}

.error {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100vh;
  color: #f56c6c;
}

.error h3 {
  margin-bottom: 10px;
}
</style>
