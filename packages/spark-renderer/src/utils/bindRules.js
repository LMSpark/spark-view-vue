/**
 * Rule 数据绑定工具
 */
import { pageLogger } from '@spark-view/spark-app';
import { nextTick } from 'vue';
/**
 * 递归替换 rule 中的数据占位符和事件处理器
 */
export function bindDataToRules(options) {
    const { rules, pageData, pageFunctions, dataSet, formApi } = options;
    // 创建统一的函数调用包装器
    const callFunc = createFunctionCaller(pageFunctions);
    return rules.map(rule => {
        const newRule = { ...rule };
        // 🎯 处理自定义渲染函数（以 Render 开头的 type）
        if (typeof newRule.type === 'string' && newRule.type.startsWith('Render')) {
            const renderFn = pageFunctions[newRule.type];
            if (typeof renderFn === 'function') {
                return {
                    type: 'div',
                    render: renderFn
                };
            }
        }
        // 处理事件处理器：通过 callFunc 包装
        if (newRule.on && typeof newRule.on === 'object') {
            const newOn = {};
            for (const [eventName, handler] of Object.entries(newRule.on)) {
                if (typeof handler === 'string') {
                    // 使用 callFunc 包装，提供运行时检查和扩展能力
                    newOn[eventName] = (...args) => callFunc(handler, ...args);
                }
                else {
                    newOn[eventName] = handler;
                }
            }
            newRule.on = newOn;
        }
        // 自动为 el-table 注入状态同步事件
        if (newRule.type === 'el-table' && newRule.dataKey && dataSet) {
            injectTableEvents(newRule, dataSet, formApi);
        }
        // 递归处理子元素
        if (newRule.children && Array.isArray(newRule.children)) {
            const childRules = newRule.children.filter((child) => typeof child !== 'string');
            if (childRules.length > 0) {
                newRule.children = bindDataToRules({
                    rules: childRules,
                    pageData,
                    pageFunctions,
                    dataSet,
                    formApi
                });
            }
        }
        return newRule;
    });
}
/**
 * 创建统一的函数调用器
 *
 * 优势：
 * 1. 运行时检查函数是否存在
 * 2. 统一的错误处理和日志
 * 3. 可扩展：bind、拦截、性能监控等
 * 4. 调试友好：清晰的调用栈
 */
function createFunctionCaller(pageFunctions) {
    return function callFunc(functionName, ...args) {
        try {
            // 检查函数是否存在
            const func = pageFunctions[functionName];
            if (typeof func !== 'function') {
                pageLogger.warn('函数未定义或不可调用', {
                    functionName,
                    type: typeof func,
                    available: Object.keys(pageFunctions)
                });
                return undefined;
            }
            // 调用函数（可在此处添加：bind、拦截、性能监控等）
            const result = func(...args);
            // 可选：添加调试日志
            // pageLogger.debug('函数调用', { functionName, args, result })
            return result;
        }
        catch (error) {
            pageLogger.error('函数执行错误', {
                functionName,
                args,
                error
            });
            throw error;
        }
    };
}
/**
 * 为 el-table 注入 DataSet 同步事件
 */
function injectTableEvents(rule, dataSet, _formApi) {
    // 使用局部防重入标志
    let isProcessingEvent = false;
    // 解析 dataKey 获取表名
    if (!rule.dataKey)
        return;
    const dataKeyParts = rule.dataKey.split('.');
    const tablesIndex = dataKeyParts.indexOf('tables');
    if (tablesIndex === -1 || !dataKeyParts[tablesIndex + 1])
        return;
    const tableName = dataKeyParts[tablesIndex + 1];
    const contextId = rule.contextId || rule.props?.contextId || 'default';
    // 添加唯一的 name 属性
    if (!rule.name) {
        rule.name = `table_${tableName}_${contextId}`;
    }
    // 确保 on 对象存在
    if (!rule.on) {
        rule.on = {};
    }
    // 注入 currentChange 事件（单选行变化）
    const originalCurrentChange = rule.on['currentChange'];
    rule.on['currentChange'] = (currentRow, oldRow) => {
        if (isProcessingEvent)
            return;
        try {
            isProcessingEvent = true;
            // 先调用用户处理器
            if (originalCurrentChange && typeof originalCurrentChange === 'function') {
                originalCurrentChange(currentRow, oldRow);
            }
            // 同步到 DataSet
            if (dataSet && dataSet.tables && tableName && contextId) {
                const table = dataSet.tables[tableName];
                const context = table?.contexts?.[String(contextId)];
                if (context?.setCurrentRow) {
                    context.setCurrentRow(currentRow || null, false);
                }
            }
        }
        finally {
            isProcessingEvent = false;
        }
    };
    // 注入 selectionChange 事件（多选变化）
    const originalSelectionChange = rule.on['selectionChange'];
    rule.on['selectionChange'] = (selection) => {
        if (isProcessingEvent)
            return;
        try {
            isProcessingEvent = true;
            // 先调用用户处理器
            if (originalSelectionChange && typeof originalSelectionChange === 'function') {
                originalSelectionChange(selection);
            }
            // 同步到 DataSet
            if (dataSet && dataSet.tables && tableName && contextId) {
                const table = dataSet.tables[tableName];
                const context = table?.contexts?.[String(contextId)];
                if (context?.setSelectedRows) {
                    context.setSelectedRows(selection, true);
                }
            }
        }
        finally {
            isProcessingEvent = false;
        }
    };
}
/**
 * 查找具有特定 dataKey 的 rule
 */
export function findRuleByDataKey(rules, dataKey) {
    for (const rule of rules) {
        if (rule.dataKey === dataKey) {
            return rule;
        }
        if (rule.children && Array.isArray(rule.children)) {
            const childRules = rule.children.filter((child) => typeof child !== 'string');
            const found = findRuleByDataKey(childRules, dataKey);
            if (found)
                return found;
        }
    }
    return null;
}
/**
 * 同步 DataSet 选中状态到 el-table
 */
export function syncSelectedRowsToTable(tableName, contextId, rows, formApi) {
    nextTick(() => {
        if (formApi && typeof formApi.el === 'function') {
            const componentName = `table_${tableName}_${contextId}`;
            const tableComponent = formApi.el(componentName);
            if (tableComponent) {
                if (rows.length === 0 && typeof tableComponent.clearSelection === 'function') {
                    tableComponent.clearSelection();
                }
                else if (typeof tableComponent.toggleRowSelection === 'function') {
                    tableComponent.clearSelection?.();
                    rows.forEach(row => {
                        tableComponent.toggleRowSelection?.(row, true);
                    });
                }
            }
        }
    });
}
