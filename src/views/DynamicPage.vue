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
import { DataSetManager } from '../utils/dataSetManager'

// 使用 Vite 的 glob import 预加载所有页面脚本模块
const pageModules = import.meta.glob('../pages-config/*/script.js', { eager: false })

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
let dataSetManager: DataSetManager | null = null // DataSet 管理器实例

// 初始化全局上下文（在任何模块加载之前）- 仅在客户端
if (typeof window !== 'undefined') {
    ;(window as any).__pageContext = {
        $api: null,
        $route: route,
        $data: pageData,
        $el: null,
        $query: (_selector: string) => null,
        $queryAll: (_selector: string) => null,
        $refreshData: null,  // 刷新数据的方法
        $dataSetManager: null  // DataSet 管理器实例（由 DynamicPage 自动创建）
    }
}

// 自动初始化 DataSetManager（如果 pageData 包含 dataset）
const initDataSetManager = () => {
    if (pageData.dataset && pageData.dataset.tables) {
        // 🔄 每次页面切换时重新创建 DataSetManager（不同页面有不同的表结构）
        if (dataSetManager) {
            // 清理旧的 DataSetManager
            dataSetManager = null;
        }
        
        // 创建 mock dataLoader（页面脚本可以覆盖）
        const defaultDataLoader = async (tableName: string) => {
            console.log(`⚠️ 默认 dataLoader：${tableName} - 页面脚本应该注册自定义 dataLoader`);
            return [];
        };
        
        // 完全解耦：不传 rebindCallback，通过订阅机制自动触发
        dataSetManager = new DataSetManager(pageData.dataset, defaultDataLoader);
        
        // 🔑 移除 pageData.dataset.tables 引用，强制使用 DataSetManager API
        // 用户脚本必须通过 $dataSetManager().getTable() 或 $dataSetManager().dataSet.tables 访问
        delete pageData.dataset.tables;
        
        // 更新全局上下文
        if (typeof window !== 'undefined') {
            (window as any).__pageContext.$dataSetManager = dataSetManager;
        }
        console.log('✅ DataSetManager 自动初始化成功（内核级）');
        
        // 注意：autoSubscribeTables() 需要在 originalRules 设置后调用
        // 已移到 loadPageConfig 的最后
    }
}

// 自动订阅 rules 中引用的所有表（UI 完全解耦）
const autoSubscribeTables = () => {
    if (!dataSetManager || !originalRules.value) return;
    
    // 收集所有 (tableName, contextId) 组合
    const contexts = new Set<string>();
    
    // 递归提取所有 dataKey 中的表名和上下文ID
    const extractContexts = (rules: any[]) => {
        rules.forEach(rule => {
            if (rule.dataKey && rule.dataKey.startsWith('dataset.tables.')) {
                // 提取表名和上下文路径
                // dataset.tables.Users.rows → Users, default
                // dataset.tables.Users.contexts.detail.rows → Users, detail
                const match = rule.dataKey.match(/^dataset\.tables\.([^.]+)(?:\.contexts\.([^.]+))?/);
                if (match) {
                    const tableName = match[1];
                    const contextId = match[2] || rule.contextId || 'default';
                    const key = `${tableName}.${contextId}`;
                    contexts.add(key);
                }
            }
            if (rule.children && Array.isArray(rule.children)) {
                extractContexts(rule.children);
            }
        });
    };
    
    extractContexts(originalRules.value);
    
    // 为每个上下文注册订阅
    // ⚠️ 不再自动调用 rebindRules，依赖 Vue 响应式机制
    // 只有在明确需要重新解析 rules 时才手动调用 rebindRules
    contexts.forEach(key => {
        const [tableName, contextId] = key.split('.');
        dataSetManager!.subscribe(tableName, contextId, () => {
            console.log(`🔄 上下文 ${key} 数据变化（Vue 响应式自动更新）`);
            // ❌ 移除自动 rebindRules，避免不必要的 UI 重绑
            // rebindRules();
        });
        console.log(`📡 自动订阅上下文: ${key}`);
    });
    
    // 🎯 监听 currentRow/selectedRows 变化事件，需要 rebindRules 更新显示
    dataSetManager!.on('currentRowChanged', () => {
        console.log('🎯 [Event] currentRow 变化，触发 rebindRules');
        rebindRules();
    });
    dataSetManager!.on('selectedRowsChanged', () => {
        console.log('🎯 [Event] selectedRows 变化，触发 rebindRules');
        rebindRules();
    });
}

// 防重入锁：防止事件处理过程中再次触发同步
let isProcessingEvent = false;

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
                            console.log(`🎯 [事件触发] ${eventName} -> ${handler}`, args)
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

        // 自动为 el-table 注入状态同步事件
        if (newRule.type === 'el-table' && newRule.dataKey) {
            // 解析 dataKey 获取表名（例如："dataset.tables.Users.rows" → "Users"）
            const dataKeyParts = newRule.dataKey.split('.')
            const tablesIndex = dataKeyParts.indexOf('tables')
            if (tablesIndex !== -1 && dataKeyParts[tablesIndex + 1]) {
                const tableName = dataKeyParts[tablesIndex + 1]
                
                // 获取 contextId（优先使用 contextId 属性）
                const contextId = (newRule as any).contextId || (newRule.props && (newRule.props as any).contextId) || 'default';
                
                console.log(`🔧 [自动注入] 为表 ${tableName} 注入事件处理器 (contextId=${contextId})`)
                
                // 确保 on 对象存在
                if (!newRule.on) {
                    newRule.on = {}
                }
                
                // 注入 currentChange 事件（单选行变化）
                // 注意：form-create 使用驼峰命名，Element Plus 模板中的 @current-change 会被转换为 onCurrentChange
                const originalCurrentChange = newRule.on['currentChange']
                newRule.on['currentChange'] = (currentRow: any, oldRow: any) => {
                    console.log(`🎯 [事件触发] currentChange`, { tableName, currentRow, oldRow, isProcessingEvent })
                    
                    // 重入检查：如果正在处理事件，跳过以防止死循环
                    if (isProcessingEvent) {
                        console.log(`🚫 [防重入] 跳过重复的 currentChange 事件`)
                        return
                    }
                    
                    try {
                        isProcessingEvent = true
                        
                        // 先调用原有的用户处理器
                        if (originalCurrentChange && typeof originalCurrentChange === 'function') {
                            originalCurrentChange(currentRow, oldRow)
                        }
                        
                        // 自动同步到 DataSetManager
                        // 对于 currentChange：需要触发关系更新（主从表联动）
                        if (dataSetManager) {
                            // ✨ 使用面向对象方式：直接操作上下文
                            const context = dataSetManager.getContext(tableName, contextId || 'default')
                            if (context && context.setCurrentRow) {
                                // ⚠️ 不使用 skipNotify，因为需要触发子表过滤
                                context.setCurrentRow(currentRow || null, false)
                            } else {
                                console.warn(`⚠️ 上下文 ${tableName}.${contextId || 'default'} 不存在或未注入方法`)
                            }
                        } else {
                            console.warn(`⚠️ dataSetManager 为 null，无法同步 ${tableName}.currentRow`)
                        }
                    } finally {
                        // 延迟释放锁，确保 rebindRules 完成后再允许下次事件
                        setTimeout(() => {
                            isProcessingEvent = false
                        }, 0)
                    }
                }
                
                // 注入 selectionChange 事件（多选行变化）
                const originalSelectionChange = newRule.on['selectionChange']
                newRule.on['selectionChange'] = (selectedRows: any[]) => {
                    console.log(`🎯 [事件触发] selectionChange`, { tableName, selectedRows })
                    
                    // 先调用原有的用户处理器
                    if (originalSelectionChange && typeof originalSelectionChange === 'function') {
                        originalSelectionChange(selectedRows)
                    }
                    
                    // 自动同步到 DataSetManager
                    // 关键：传递 skipNotify=true，因为 UI 已经是最新的，不需要触发 rebindRules
                    if (dataSetManager) {
                        // ✨ 使用面向对象方式：直接操作上下文
                        const context = dataSetManager.getContext(tableName, contextId || 'default')
                        if (context && context.setSelectedRows) {
                            context.setSelectedRows(selectedRows, true)
                        } else {
                            console.warn(`⚠️ 上下文 ${tableName}.${contextId || 'default'} 不存在或未注入方法`)
                        }
                        console.log(`✅ [自动同步] ${tableName}.${contextId || 'default'}.selectedRows =`, selectedRows)
                    }
                }
            }
        }
    
        if (newRule.dataKey) {
            const keys = newRule.dataKey.split('.')
            let value: any = data
            
            // 🔑 特殊处理：dataset.tables.* 路径从 DataSetManager 获取实时数据
            if (keys[0] === 'dataset' && keys[1] === 'tables' && dataSetManager) {
                const tableName = keys[2];
                const contextId = keys[4] === 'contexts' ? keys[5] : 'default';
                
                // 从 DataSetManager 获取上下文（DataTable 或 BindingContext 实例）
                const context = dataSetManager.getContext(tableName, contextId);
                
                if (context) {
                    // 确定访问的属性：rows, currentRow, selectedRows 等
                    const propertyName = keys[keys.length - 1];
                    value = context[propertyName as keyof typeof context];
                } else {
                    console.warn(`⚠️ 上下文不存在: ${tableName}.${contextId}`);
                    value = null;
                }
            } else {
                // 普通路径：按原逻辑解析
                for (const key of keys) {
                    value = value?.[key]
                }
            }
            
            // 🔍 Debug: 查看 currentRow 的实际值
            if (newRule.dataKey?.includes('currentRow')) {
                console.log(`🔍 [Debug] dataKey="${newRule.dataKey}" 解析结果:`, value, typeof value)
            }
      
            if ((newRule.type === 'el-table' || newRule.type === 'el-tree')) {
                // 🔑 el-table 和 el-tree 都使用 data 属性
                if (!newRule.props) {
                    newRule.props = {}
                }
                newRule.props.data = value
                console.log(`📊 [数据绑定] ${newRule.type} dataKey="${newRule.dataKey}" 绑定数据:`, value)
                
                // 🌲 el-tree 特殊处理：绑定 expandedKeys 和 currentNodeKey
                if (newRule.type === 'el-tree') {
                    if (data.expandedKeys) {
                        newRule.props.defaultExpandedKeys = data.expandedKeys
                    }
                    if (data.currentNodeKey !== undefined) {
                        newRule.props.currentNodeKey = data.currentNodeKey
                    }
                }
            } else if (newRule.type === 'el-input' && newRule.props) {
                // 🔤 el-input 绑定 modelValue
                newRule.props.modelValue = value
            } else if (newRule.type === 'pre' || newRule.type === 'code' || (newRule.children !== undefined)) {
                // 文本显示类组件（pre, code）或有 children 的组件
                // 根据不同的 dataKey 路径处理显示格式
                if (newRule.dataKey.includes('.currentRow') || newRule.dataKey.includes('.selectedRows')) {
                    // BindingContext 路径：格式化对象/数组
                    if (Array.isArray(value)) {
                        // selectedRows: 显示数组长度或 JSON
                        newRule.children = value.length > 0 ? [JSON.stringify(value, null, 2)] : ['[]']
                    } else if (value && typeof value === 'object') {
                        // currentRow: 显示 JSON
                        newRule.children = [JSON.stringify(value, null, 2)]
                    } else {
                        newRule.children = [String(value || 'null')]
                    }
                } else if (newRule.children && Array.isArray(newRule.children)) {
                    // 普通路径：直接转字符串（仅当 children 已存在时才覆盖）
                    newRule.children = [String(value)]
                }
            } else if (newRule.options !== undefined) {
                newRule.options = value
            } else if (newRule.value !== undefined) {
                newRule.value = value
            } else if (newRule.props) {
                // 对于其他组件，将 value 设置到 props 中
                newRule.props = { ...newRule.props, modelValue: value }
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
// 使用 debounce 防止批量更新时多次重绘
let rebindTimer: any = null
const rebindRules = (): void => {
    if (rebindTimer) clearTimeout(rebindTimer)
    rebindTimer = setTimeout(() => {
        if (originalRules.value && originalRules.value.length > 0) {
            console.log('🔄 [Debounce] 重新绑定数据到 rules')
            pageRules.value = bindDataToRules(JSON.parse(JSON.stringify(originalRules.value)), pageData)
        }
    }, 20) // 20ms 延迟，合并同步更新
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
    
        // 先处理数据（支持静态数据和 API 配置）
        await processPageData(config.data)
    
        // 自动初始化 DataSetManager（如果数据包含 dataset）
        initDataSetManager()

        // 🎯 关键：先保存 rules 并注册订阅者，再加载模块
        // 这样可以确保 __init__ 触发数据加载时，订阅者已经就绪
        originalRules.value = config.rule
        
        // 绑定数据到 rules
        pageRules.value = bindDataToRules(config.rule, pageData)
    
        // 自动订阅所有表（必须在 __init__ 之前）
        if (dataSetManager && originalRules.value) {
            autoSubscribeTables();
        }

        // 直接动态导入页面脚本模块
        try {
            // 更新全局上下文（在模块加载之前，确保包含 dataSetManager）
            ;(window as any).__pageContext = {
                $api: formApi.value,
                $route: route,
                $data: pageData,
                $dataSetManager: dataSetManager,  // 确保传递 DataSetManager
                $el: pageContainer.value,
                $query: (selector: string) => pageContainer.value?.querySelector(selector),
                $queryAll: (selector: string) => pageContainer.value?.querySelectorAll(selector),
                $refreshData: refreshData,  // 刷新 API 数据
                $rebindRules: rebindRules    // 重新绑定数据到 rules
            }
            
            // 使用预加载的模块映射（Vite glob import）
            const modulePath = `../pages-config/${currentPageId}/script.js`
            const moduleLoader = pageModules[modulePath]
            
            if (!moduleLoader) {
                console.warn(`⚠️ 页面模块不存在: ${modulePath}，跳过脚本加载`)
                pageFunctions.value = {}
            } else {
                // 调用加载器函数获取模块
                const scriptModule = await moduleLoader() as Record<string, unknown>
                
                // 提取导出的函数（排除 __init__）
                const functions: Record<string, Function> = {}
                for (const [key, value] of Object.entries(scriptModule)) {
                    if (typeof value === 'function' && key !== '__init__') {
                        functions[key] = value as Function
                    }
                }
                
                pageFunctions.value = functions
                console.log('✅ 页面模块加载成功，注册函数:', Object.keys(functions))
                
                // 如果模块导出了 __init__ 函数，立即调用（此时订阅者已就绪）
                if (typeof scriptModule.__init__ === 'function') {
                    console.log('🎯 调用模块初始化函数 __init__')
                    ;(scriptModule.__init__ as Function)()
                }
            }
        } catch (err) {
            console.error('❌ 页面模块加载失败:', err)
            console.error('尝试加载:', `../pages-config/${currentPageId}/script.js`)
            pageFunctions.value = {}
        }

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
    // 🔑 暴露 formApi 供 pageScripts 使用
    if (typeof window !== 'undefined') {
        (window as any).__formApi__ = api
    }
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
