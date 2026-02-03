<template>
  <div v-if="loading" class="loading-container">
    <el-icon class="loading-icon is-loading">
      <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M512 64a32 32 0 0 1 32 32v192a32 32 0 0 1-64 0V96a32 32 0 0 1 32-32zm0 640a32 32 0 0 1 32 32v192a32 32 0 1 1-64 0V736a32 32 0 0 1 32-32zm448-192a32 32 0 0 1-32 32H736a32 32 0 1 1 0-64h192a32 32 0 0 1 32 32zm-640 0a32 32 0 0 1-32 32H96a32 32 0 0 1 0-64h192a32 32 0 0 1 32 32zM195.2 195.2a32 32 0 0 1 45.248 0L376.32 331.008a32 32 0 0 1-45.248 45.248L195.2 240.448a32 32 0 0 1 0-45.248zm452.544 452.544a32 32 0 0 1 45.248 0L828.8 783.552a32 32 0 0 1-45.248 45.248L647.744 692.992a32 32 0 0 1 0-45.248zM828.8 195.264a32 32 0 0 1 0 45.184L692.992 376.32a32 32 0 0 1-45.248-45.248l135.808-135.808a32 32 0 0 1 45.248 0zm-452.544 452.48a32 32 0 0 1 0 45.248L240.448 828.8a32 32 0 0 1-45.248-45.248l135.808-135.808a32 32 0 0 1 45.248 0z"></path></svg>
    </el-icon>
    <p>加载中...</p>
  </div>
  <div v-else-if="error" class="error-container">
    <el-result icon="error" title="页面加载失败" :sub-title="error">
      <template #extra>
        <el-button type="primary" @click="retryLoad">重试</el-button>
      </template>
    </el-result>
  </div>
  <div v-else class="page-wrapper">
    <!-- 动态注入页面样式 -->
    <component :is="'style'" v-if="pageStyle">{{ pageStyle }}</component>
    
    <!-- 渲染页面内容 -->
    <div ref="pageContainer" :data-page="pageId" class="page-content">
      <form-create
        :rule="pageRules"
        :option="formCreateOption"
        @mounted="onFormMounted"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, reactive, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { DataSetManager, DataSet } from '@spark-view/spark-data'
import type { DataRow } from '@spark-view/spark-data'
import { SparkPageConfig } from '@spark-view/spark-page-config'
import { pageLogger, createEnvironmentDetector } from '@spark-view/spark-app'
import type { RuleConfig } from '@spark-view/spark-page-config'
import VxeTableRenderer from '../../features/renderers/components/vxe/VxeTableRenderer.vue'

// 环境适配器
const envDetector = createEnvironmentDetector()
const browserAdapter = envDetector.getBrowserAdapter()

// Rule 类型定义
interface Rule extends Omit<RuleConfig, 'children'> {
  contextId?: string
  dataKey?: string
  children?: (Rule | string)[]
  on?: Record<string, Function>
  props?: any
  [key: string]: unknown
}

// API 配置类型
interface ApiConfig {
  url: string
  method?: string
  params?: Record<string, any>
  mockData?: any
  dataPath?: string
  autoLoad?: boolean
}

// 定义 FormCreateAPI 类型
interface FormCreateAPI {
  rule: Rule[]
  [key: string]: unknown
}

// 定义页面上下文类型
interface PageContext {
  $api: FormCreateAPI | null
  $route: ReturnType<typeof useRoute>
  $data: Record<string, unknown>
  $el: HTMLElement | null
  $query: (selector: string) => HTMLElement | null
  $queryAll: (selector: string) => NodeListOf<Element>
  $rebindRules: () => void
  $refreshData: (key?: string) => Promise<void>
  $dataSet?: DataSet | null
}

// 全局类型声明
declare global {
  interface Window {
    __pageContext?: PageContext
    __formApi__?: FormCreateAPI | null
    $api?: () => any
    $route?: () => any
    $data?: () => any
    $el?: () => HTMLElement | null
    $query?: (selector: string) => Element | null
    $queryAll?: (selector: string) => NodeListOf<Element>
    $dataSet?: () => DataSet | null
  }
}

// 注意：Element Plus 组件已由 @form-create/element-ui 内部注册
// app.use(formCreate) 时会自动注册所有组件，无需手动导入

// 使用 Vite 的 glob import 预加载所有页面脚本模块
const pageModules = import.meta.glob('/pages-config/*/script.js', { eager: false })

const route = useRoute()
const pageRules = ref<Rule[]>([])
const originalRules = ref<Rule[]>([]) // 保存原始 rules 配置
const pageStyle = ref<string>('')
const pageId = ref<string>('')
const loading = ref(true)
const error = ref<string>('')
const formApi = ref<FormCreateAPI | null>(null) // form-create API 实例
const pageFunctions = ref<Record<string, Function>>({}) // 页面函数
const pageContainer = ref<HTMLElement | null>(null) // 页面容器引用
const pageData = reactive<Record<string, unknown>>({}) // 响应式页面数据
let dataSet: DataSet | null = null // DataSet 实例

// FormCreate 配置（动态注册自定义组件）
const formCreateOption = ref({
  form: false,
  submitBtn: false,
  resetBtn: false,
  global: {
    // 注册占位符组件（避免 e-columns/e-column 解析错误）
    'e-columns': { render: () => null },
    'eColumns': { render: () => null },
    'e-column': { render: () => null },
    'eColumn': { render: () => null }
  } as Record<string, any>
})

// 初始化全局上下文（在任何模块加载之前）- 使用环境适配器
if (browserAdapter.window) {
    const win = browserAdapter.window as any
    win.__pageContext = {
        $api: null,
        $route: route,
        $data: pageData,
        $el: null,
        $query: () => null,
        $queryAll: () => browserAdapter.document?.querySelectorAll('') || [] as unknown as NodeListOf<Element>,
        $rebindRules: () => {},  // 初始化空函数
        $refreshData: () => Promise.resolve(),  // 初始化空函数
        $dataSet: null  // DataSet 实例（由 DynamicPage 自动创建）
    }
}

// 自动初始化 DataSet（如果 pageData 包含 dataset）
const initDataSet = () => {
    if (pageData.dataset && typeof pageData.dataset === 'object' && 'tables' in pageData.dataset) {
        // 🔄 每次页面切换时重新创建 DataSet（不同页面有不同的表结构）
        if (dataSet) {
            // 清理旧的 DataSet
            dataSet = null;
        }
        
        // 创建 mock dataLoader（页面脚本可以覆盖）
        const defaultDataLoader = async (tableName: string) => {
            pageLogger.warn('默认 dataLoader，页面脚本应该注册自定义 dataLoader', { tableName });
            return [];
        };
        
        // 使用工厂方法创建 DataSet
        dataSet = DataSetManager.create(pageData.dataset as any, defaultDataLoader);
        
        // 🔑 移除 pageData.dataset.tables 引用，强制使用 DataSet API
        // 用户脚本必须通过 $dataSet().getTable() 或 $dataSet().tables 访问
        if ('tables' in pageData.dataset) {
            delete (pageData.dataset as any).tables;
        }
        
        // 更新全局上下文
        if (typeof window !== 'undefined') {
            window.__pageContext!.$dataSet = dataSet;
        }
        pageLogger.success('DataSet 自动初始化成功（内核级）');
        
        // 注意：autoSubscribeTables() 需要在 originalRules 设置后调用
        // 已移到 loadPageConfig 的最后
    }
}
// 辅助函数：递归查找具有特定 dataKey 的 rule
const _findRuleByDataKey = (rules: Rule[], dataKey: string): Rule | null => {
    for (const rule of rules) {
        if (rule.dataKey === dataKey) {
            return rule;
        }
        if (rule.children && Array.isArray(rule.children)) {
            // 过滤掉字符串类型的子元素
            const childRules = rule.children.filter((child): child is Rule => typeof child !== 'string');
            const found = _findRuleByDataKey(childRules, dataKey);
            if (found) return found;
        }
    }
    return null;
};

// 自动订阅 rules 中引用的所有表（UI 完全解耦）
const autoSubscribeTables = () => {
    if (!dataSet || !originalRules.value) return;
    
    // 收集所有 (tableName, contextId) 组合
    const contexts = new Set<string>();
    
    // 递归提取所有 dataKey 中的表名和上下文ID
    const extractContexts = (rules: Rule[] | Rule) => {
        // 兼容处理：支持单个对象或数组
        const ruleArray = Array.isArray(rules) ? rules : [rules];
        
        ruleArray.forEach(rule => {
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
                const childRules = rule.children.filter((child): child is Rule => typeof child !== 'string');
                extractContexts(childRules);
            }
        });
    };
    
    extractContexts(originalRules.value);
    
    // 为每个上下文注册订阅
    // ⚠️ 不再自动调用 rebindRules，依赖 Vue 响应式机制
    // 只有在明确需要重新解析 rules 时才手动调用 rebindRules
    contexts.forEach(key => {
        const [tableName, contextId] = key.split('.');
        dataSet!.subscribe(tableName, contextId, () => {
            // 上下文数据变化（Vue 响应式自动更新）
            // ❌ 移除自动 rebindRules，避免不必要的 UI 重绑
            // rebindRules();
        });
        pageLogger.info('自动订阅上下文', { contextKey: key });
    });
    
    // 🎯 监听 currentRow/selectedRows 变化事件
    // ⚠️ 一般不需要 rebindRules：Vue 响应式会自动更新组件
    // 只在 rules 结构本身需要变化时才调用 rebindRules
    dataSet!.on('currentRowChanged', () => {
        pageLogger.debug('currentRow 变化（Vue 响应式自动更新）');
        // ❌ 不调用 rebindRules() - 数据是响应式的，组件会自动更新
    });
    
    dataSet!.on('selectedRowsChanged', ({ tableName, contextId, rows }: { tableName: string, contextId: string, rows: DataRow[] }) => {
        // selectedRows 变化，同步到 el-table
        
        // 使用 nextTick 确保 DOM 已更新
        nextTick(() => {
            if (formApi.value && typeof formApi.value.el === 'function') {
                // 🔑 直接构造 name（与自动注入时的规则一致）
                const componentName = `table_${tableName}_${contextId}`;
                const tableComponent = formApi.value.el(componentName) as any;
                
                if (tableComponent) {
                    // 🔄 同步选中状态到 el-table
                    if (rows.length === 0 && typeof tableComponent.clearSelection === 'function') {
                        // 清空选中
                        tableComponent.clearSelection();
                        // 已清空表格复选框
                    } else if (typeof tableComponent.toggleRowSelection === 'function') {
                        // 设置选中（先清空，再逐个选中）
                        tableComponent.clearSelection?.();
                        rows.forEach(row => {
                            tableComponent.toggleRowSelection(row, true);
                        });
                        // 已设置表格选中行
                    }
                } else {
                    pageLogger.warn('未找到表格组件', { componentName });
                }
            }
        });
    });
    
    // 移除旧的事件监听
    // dataSet!.on('selectionCleared', ...) 不再需要
}

// 防重入锁：防止事件处理过程中再次触发同步
let isProcessingEvent = false;

// 递归替换 rule 中的数据占位符和事件处理器
const bindDataToRules = (rules: Rule[], data: Record<string, unknown>): Rule[] => {
    return rules.map(rule => {
        const newRule = {...rule}
    
        // 🎯 处理自定义渲染函数（以 Render 开头的 type）
        if (typeof newRule.type === 'string' && newRule.type.startsWith('Render')) {
            const renderFn = pageFunctions.value[newRule.type]
            if (typeof renderFn === 'function') {
                // 将自定义组件转换为 render 函数
                return {
                    type: 'div',
                    render: renderFn
                } as Rule
            } else {
                pageLogger.warn('渲染函数未找到', { type: newRule.type })
            }
        }
    
        // 处理事件处理器：将字符串转换为函数
        if (newRule.on && typeof newRule.on === 'object') {
            const newOn: Record<string, Function> = {}
            for (const [eventName, handler] of Object.entries(newRule.on)) {
                if (typeof handler === 'string') {
                    // 从页面函数对象获取函数
                    const handlerName = handler
                    newOn[eventName] = (...args: unknown[]) => {
                        const fn = pageFunctions.value[handlerName]
                        if (typeof fn === 'function') {
                            pageLogger.debug('事件触发', { eventName, handler: handlerName, args })
                            fn(...args)  // 传递所有参数
                        } else {
                            pageLogger.warn('函数未定义', { handler: handlerName, availableFunctions: Object.keys(pageFunctions.value) });
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
                const contextId = (newRule as any).contextId || newRule.props?.contextId || 'default';
                
                // 🔧 添加唯一的 name 属性，用于后续获取组件实例
                if (!newRule.name) {
                    newRule.name = `table_${tableName}_${contextId}`;
                }
                
                pageLogger.debug('为表注入事件处理器', { tableName, contextId });
                
                // 确保 on 对象存在
                if (!newRule.on) {
                    newRule.on = {}
                }
                
                // 注入 currentChange 事件（单选行变化）
                // 注意：form-create 使用驼峰命名，Element Plus 模板中的 @current-change 会被转换为 onCurrentChange
                const originalCurrentChange = newRule.on['currentChange']
                newRule.on['currentChange'] = (currentRow: DataRow | null, oldRow: DataRow | null) => {
                    pageLogger.debug('currentChange 事件', { tableName, hasCurrentRow: !!currentRow, isProcessingEvent });
                    
                    // 重入检查：如果正在处理事件，跳过以防止死循环
                    if (isProcessingEvent) {
                        pageLogger.debug('防重入：跳过重复的 currentChange 事件');
                        return
                    }
                    
                    try {
                        isProcessingEvent = true
                        
                        // 先调用原有的用户处理器
                        if (originalCurrentChange && typeof originalCurrentChange === 'function') {
                            originalCurrentChange(currentRow, oldRow)
                        }
                        
                        // 自动同步到 dataSet
                        // 对于 currentChange：需要触发关系更新（主从表联动）
                        if (dataSet) {
                            // ✨ 使用面向对象方式：直接操作上下文
                            const context = dataSet.getContext(tableName, contextId || 'default')
                            if (context && context.setCurrentRow) {
                                // ⚠️ 不使用 skipNotify，因为需要触发子表过滤
                                context.setCurrentRow(currentRow || null, false)
                            } else {
                                pageLogger.warn('上下文不存在或未注入方法', { tableName, contextId });
                            }
                        } else {
                            pageLogger.warn('dataSet 为 null，无法同步', { tableName, property: 'currentRow' })
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
                newRule.on['selectionChange'] = (selectedRows: DataRow[]) => {
                    pageLogger.debug('selectionChange 事件', { tableName, selectedCount: selectedRows.length });
                    
                    // 先调用原有的用户处理器
                    if (originalSelectionChange && typeof originalSelectionChange === 'function') {
                        originalSelectionChange(selectedRows)
                    }
                    
                    // 自动同步到 dataSet
                    // 关键：传递 skipNotify=true，因为 UI 已经是最新的，不需要触发 rebindRules
                    if (dataSet) {
                        // ✨ 使用面向对象方式：直接操作上下文
                        const context = dataSet.getContext(tableName, contextId || 'default')
                        if (context && context.setSelectedRows) {
                            context.setSelectedRows(selectedRows, true)
                        } else {
                            pageLogger.warn('上下文不存在或未注入方法', { tableName, contextId });
                        }
                        // 自动同步 selectedRows
                    }
                }
            }
        }
    
        if (newRule.dataKey) {
            const keys = newRule.dataKey.split('.')
            let value: unknown = data
            
            // 🔑 特殊处理：dataset.tables.* 路径从 dataSet 获取实时数据
            if (keys[0] === 'dataset' && keys[1] === 'tables' && dataSet) {
                const tableName = keys[2];
                const contextId = keys[4] === 'contexts' ? keys[5] : 'default';
                
                // 从 dataSet 获取上下文（DataTable 或 BindingContext 实例）
                const context = dataSet.getContext(tableName, contextId);
                
                if (context) {
                    // 确定访问的属性：rows, currentRow, selectedRows 等
                    const propertyName = keys[keys.length - 1];
                    value = context[propertyName as keyof typeof context];
                } else {
                    pageLogger.warn('上下文不存在', { tableName, contextId });
                    value = null;
                }
            } else {
                // 普通路径：按原逻辑解析
                for (const key of keys) {
                    value = (value as any)?.[key]
                }
            }
            
            // 🔍 Debug: 查看 currentRow 的实际值
            if (newRule.dataKey?.includes('currentRow')) {
                pageLogger.debug('dataKey 解析结果', { dataKey: newRule.dataKey, value, valueType: typeof value });
            }
      
            if ((newRule.type === 'el-table' || newRule.type === 'el-tree')) {
                // 🔑 el-table、el-tree 使用 data 属性
                if (!newRule.props) {
                    newRule.props = {}
                }
                
                newRule.props.data = value
                pageLogger.debug('数据绑定', { ruleType: newRule.type, dataKey: newRule.dataKey, dataLength: Array.isArray(value) ? value.length : undefined });
                
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
                newRule.options = value as Array<{ label: string; value: any }> | undefined
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
const isApiConfig = (value: unknown): value is ApiConfig => {
    return value !== null && typeof value === 'object' && 'url' in value
}

// 从响应中提取数据
const extractData = (response: unknown, dataPath?: string): unknown => {
    if (!dataPath) return response
    
    const keys = dataPath.split('.')
    let value: any = response
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
            const params = new URLSearchParams(config.params as Record<string, string>)
            fetchUrl = `${url}?${params}`
        } else if (config.params) {
            fetchOptions.body = JSON.stringify(config.params)
            fetchOptions.headers = { 'Content-Type': 'application/json' }
        }
        
        pageLogger.debug('加载 API 数据', { key, url: fetchUrl });
        
        const response = await fetch(fetchUrl, fetchOptions)
        const result = await response.json()
        
        // 提取数据
        const data = extractData(result, config.dataPath)
        
        // 更新响应式数据
        pageData[key] = data
        
        pageLogger.success('API 数据加载成功', { key, dataLength: Array.isArray(data) ? data.length : undefined });
        
        // 重新绑定数据到 rules
        pageRules.value = bindDataToRules(pageRules.value, pageData)
    } catch (err) {
        pageLogger.warn('API请求失败，使用fallback数据', { key, error: err });
        
        // SPA模式 fallback 数据
        const fallbackData = getFallbackData(key, config)
        pageData[key] = fallbackData
        
        pageLogger.info('使用fallback数据', { key, dataLength: Array.isArray(fallbackData) ? fallbackData.length : undefined });
        
        // 重新绑定数据到 rules
        pageRules.value = bindDataToRules(pageRules.value, pageData)
    }
}

// SPA模式：获取fallback数据
const getFallbackData = (_: string, config: ApiConfig) => {
    // 根据API路径返回对应的fallback数据
    if (config.url.includes('/api/dashboard/stats')) {
        return {
            totalUsers: 1250,
            totalOrders: 3847,
            revenue: 125000,
            growth: 12.5
        }
    }
    
    if (config.url.includes('/api/orders/recent')) {
        const limit = parseInt((config.params as any)?.limit) || 10
        return Array.from({ length: limit }, (_, i) => ({
            id: `ORD-${1000 + i}`,
            customer: `Customer ${i + 1}`,
            product: `Product ${i + 1}`,
            amount: Math.floor(Math.random() * 1000) + 100,
            status: ['pending', 'completed', 'cancelled'][i % 3],
            date: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString()
        }))
    }
    
    // 默认返回空数组
    pageLogger.warn('未知的API，返回空数据', { url: config.url });
    return []
}

// ⚠️ 强制重新绑定数据到 rules（谨慎使用！）
// 
// 使用场景：
// ✅ rules 结构本身需要动态变化（如条件显示/隐藏组件）
// ✅ dataKey 表达式需要重新计算（极少情况）
// 
// 不应使用的场景：
// ❌ 数据变化 - Vue 响应式会自动更新组件
// ❌ currentRow/selectedRows 变化 - 会导致组件状态丢失
// ❌ DataSet 数据变化 - 订阅者会自动通知，Vue 响应式处理
// 
// 副作用：
// - 重新创建整个组件树（性能开销大）
// - 丢失组件状态（选中、输入焦点、滚动位置等）
// - 可能导致闪烁
let rebindTimer: ReturnType<typeof setTimeout> | null = null
const rebindRules = (immediate = false): void => {
    if (rebindTimer) clearTimeout(rebindTimer)
    
    const doRebind = () => {
        if (originalRules.value && originalRules.value.length > 0) {
            // 重新绑定数据到 rules
            pageRules.value = bindDataToRules(JSON.parse(JSON.stringify(originalRules.value)), pageData)
        }
    }
    
    if (immediate) {
        // 立即执行，用于首次加载和路由切换
        doRebind()
    } else {
        // 防抖延迟，用于数据变化
        rebindTimer = setTimeout(doRebind, 20)
    }
}

// 保存原始数据配置（用于刷新）
const pageDataConfig = ref<Record<string, unknown>>({})

// 刷新API数据（零代码实现）
const refreshData = async (key?: string): Promise<void> => {
    if (key) {
        // 刷新指定的API数据
        const config = pageDataConfig.value[key]
        if (config && typeof config === 'object' && 'url' in config) {
            await loadApiData(key, config as ApiConfig)
        }
    } else {
        // 刷新所有API数据
        for (const [dataKey, config] of Object.entries(pageDataConfig.value)) {
            if (config && typeof config === 'object' && 'url' in config) {
                await loadApiData(dataKey, config as ApiConfig)
            }
        }
    }
}

// 处理页面数据（支持静态数据和 API 配置）
const processPageData = async (dataConfig: Record<string, unknown>): Promise<void> => {
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
        
        // 使用 L2 ConfigLoader 加载页面配置
        const configLoader = SparkPageConfig.createConfigLoader({
            localPrefix: '/pages-config',
            enableCache: true
        })
        const config = await configLoader.loadPageConfig(currentPageId)
    
        pageLogger.success('加载页面配置', { pageId: currentPageId });
        await processPageData((config as any).data)
    
        // 自动初始化 dataSet（如果数据包含 dataset）
        initDataSet()

        // 🎯 关键：先保存 rules 并注册订阅者，再加载模块
        // 这样可以确保 __init__ 触发数据加载时，订阅者已经就绪
        // ⚠️ 兼容处理：如果 rule 是对象，包装成数组
        const ruleConfig = (config as any).rule as Rule[] | Rule
        originalRules.value = Array.isArray(ruleConfig) ? ruleConfig : [ruleConfig]
        
        // ⚠️ 延迟 bindDataToRules，等模块加载后再绑定（避免渲染函数未找到）
        // pageRules.value = bindDataToRules(config.rule as Rule[], pageData)
    
        // 自动订阅所有表（必须在 __init__ 之前）
        if (dataSet && originalRules.value) {
            autoSubscribeTables();
        }

        // 直接动态导入页面脚本模块
        try {
            // 更新全局上下文（在模块加载之前，确保包含 dataSet）
            if (browserAdapter.window) {
                (browserAdapter.window as any).__pageContext = {
                $api: formApi.value,
                $route: route,
                $data: pageData,
                $dataSet: dataSet || undefined,  // 确保传递 dataSet
                $el: pageContainer.value,
                $query: (selector: string) => pageContainer.value?.querySelector(selector) || null,
                $queryAll: (selector: string) => {
                    if (pageContainer.value?.querySelectorAll) {
                        return pageContainer.value.querySelectorAll(selector)
                    }
                    if (typeof document !== 'undefined') {
                        return document.querySelectorAll(selector)
                    }
                    return [] as unknown as NodeListOf<Element>
                },
                $rebindRules: rebindRules,    // 重新绑定数据到 rules
                $refreshData: refreshData     // 刷新API数据（零代码）
                }
                
                // 🔧 将沙箱上下文注入到全局（供 ES6 模块使用）
                const win = browserAdapter.window as any
                const ctx = win.__pageContext
                if (ctx) {
                    win.$api = () => ctx.$api
                    win.$route = () => ctx.$route
                    win.$data = () => ctx.$data
                    win.$el = () => ctx.$el
                    win.$query = ctx.$query
                    win.$queryAll = ctx.$queryAll
                    win.$dataSet = () => ctx.$dataSet
                }
            }
            
            // 使用预加载的模块映射（Vite glob import）
            const modulePath = `/pages-config/${currentPageId}/script.js`
            const moduleLoader = pageModules[modulePath]
            
            if (!moduleLoader) {
                pageLogger.debug('页面无脚本，跳过加载', { pageId: currentPageId })
                pageFunctions.value = {}
                // ⚠️ 即使没有模块，也要立即绑定数据
                rebindRules(true)
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
                pageLogger.success('页面模块加载成功，注册函数', { functions: Object.keys(functions) })
                
                // 注册自定义渲染函数为 form-create 组件（使用 kebab-case 和 PascalCase 两种格式）
                const customComponents: Record<string, any> = {}
                for (const [key, value] of Object.entries(scriptModule)) {
                    // 识别渲染函数（以 Render 开头）
                    if (typeof value === 'function' && key.startsWith('Render')) {
                        // 注册 PascalCase 和 kebab-case 两种格式
                        customComponents[key] = value
                        // 转换为 kebab-case
                        const kebabName = key.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '')
                        customComponents[kebabName] = value
                    }
                }
                
                if (Object.keys(customComponents).length > 0) {
                    formCreateOption.value.global = customComponents
                    pageLogger.success('注册自定义组件', { components: Object.keys(customComponents) })
                }
                
                // 如果模块导出了 __init__ 函数，立即调用（此时订阅者已就绪）
                if (typeof scriptModule.__init__ === 'function') {
                    pageLogger.info('调用模块初始化函数 __init__')
                    ;(scriptModule.__init__ as Function)()
                }
                
                // ✅ 模块加载完成后，立即绑定规则以解析渲染函数（避免防抖延迟）
                rebindRules(true)
                pageLogger.success('模块加载后重新绑定规则完成')
            }
        } catch (err) {
            pageLogger.error('页面模块加载失败', { error: err, modulePath: `/pages-config/${currentPageId}/script.js` })
            pageFunctions.value = {}
            // ⚠️ 即使模块加载失败，也要立即绑定数据
            rebindRules(true)
        }

        // 加载页面样式（自动添加作用域隔离）
        pageStyle.value = scopeCSS((config as any).style || '', pageId.value)
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : '加载页面配置失败'
        error.value = errorMessage
        pageLogger.error('获取页面配置失败', { error: err })
        // 页面不存在时自动回退到首页，避免客户端反复请求已删除页面
        if (typeof window !== 'undefined' && errorMessage.includes('页面配置不存在')) {
            const router = useRouter()
            try {
                router.replace({ path: '/' })
            } catch (e) {
                pageLogger.warn('无法跳转到首页', { error: e })
            }
        }
    } finally {
        loading.value = false
    }
}

// 表单挂载回调
const onFormMounted = (api: FormCreateAPI) => {
  formApi.value = api
  
  // 注册 VXE Table 自定义组件到 form-create
  const apiAny = api as any
  apiAny.component('VxeTable', VxeTableRenderer)
  apiAny.component('VxeGrid', VxeTableRenderer)
  
  // 注册占位符组件（e-columns/e-column 不需要实际渲染）
  const PlaceholderComponent = { render: () => null }
  apiAny.component('e-columns', PlaceholderComponent)
  apiAny.component('e-column', PlaceholderComponent)
  
  pageLogger.success('VXE 表格组件已注册到 form-create')
  
  // 暴露 formApi 供 pageScripts 使用
  if (typeof window !== 'undefined') {
    window.__formApi__ = api
  }
  pageLogger.info('表单实例已挂载')
}

// 重试加载
const retryLoad = () => {
  error.value = ''
  loadPageConfig()
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
.loading-container {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  min-height: 400px;
  color: #409eff;
}

.loading-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.error-container {
  padding: 40px 20px;
}

.page-wrapper {
  min-height: 100%;
}

.page-content {
  padding: 0;
}
</style>


