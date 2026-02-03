/**
 * 配置验证器
 */
/**
 * 验证路由配置
 */
export function validateRouteConfig(config) {
    const errors = [];
    if (!config.path) {
        errors.push({ field: 'path', message: '路由路径不能为空' });
    }
    if (!config.name) {
        errors.push({ field: 'name', message: '路由名称不能为空' });
    }
    if (!config.pageId) {
        errors.push({ field: 'pageId', message: '页面ID不能为空' });
    }
    if (config.path && !config.path.startsWith('/')) {
        errors.push({
            field: 'path',
            message: '路由路径必须以 / 开头',
            value: config.path
        });
    }
    return errors;
}
/**
 * 验证规则配置
 */
export function validateRuleConfig(config) {
    const errors = [];
    if (!config.type) {
        errors.push({ field: 'type', message: '组件类型不能为空' });
    }
    // 验证子元素
    if (config.children) {
        if (!Array.isArray(config.children)) {
            errors.push({
                field: 'children',
                message: 'children 必须是数组',
                value: config.children
            });
        }
    }
    // 验证事件处理器
    if (config.on) {
        if (typeof config.on !== 'object') {
            errors.push({
                field: 'on',
                message: 'on 必须是对象',
                value: config.on
            });
        }
    }
    return errors;
}
/**
 * 验证页面数据配置
 */
export function validatePageDataConfig(config) {
    const errors = [];
    if (typeof config !== 'object' || config === null) {
        errors.push({
            field: 'root',
            message: '页面数据必须是对象',
            value: config
        });
    }
    return errors;
}
/**
 * 批量验证路由配置
 */
export function validateRoutes(routes) {
    const errorMap = new Map();
    routes.forEach(route => {
        const errors = validateRouteConfig(route);
        if (errors.length > 0) {
            errorMap.set(route.path || 'unknown', errors);
        }
    });
    return errorMap;
}
/**
 * 批量验证规则配置
 */
export function validateRules(rules) {
    const errors = [];
    const validateRecursive = (rule, path) => {
        const ruleErrors = validateRuleConfig(rule);
        errors.push(...ruleErrors.map(e => ({
            ...e,
            field: `${path}.${e.field}`
        })));
        if (Array.isArray(rule.children)) {
            rule.children.forEach((child, index) => {
                if (typeof child === 'object') {
                    validateRecursive(child, `${path}.children[${index}]`);
                }
            });
        }
    };
    rules.forEach((rule, index) => {
        validateRecursive(rule, `rules[${index}]`);
    });
    return errors;
}
