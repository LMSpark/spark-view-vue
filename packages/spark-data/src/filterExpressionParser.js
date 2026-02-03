/**
 * FilterExpression 解析器
 * 支持：内存过滤、SQL WHERE 生成、MongoDB 查询对象生成
 */
/**
 * 过滤表达式解析器
 */
export class FilterExpressionParser {
    /**
     * 解析为内存过滤函数
     */
    static toMemoryFilter(expression, context) {
        return (row) => {
            return this.evaluateExpression(expression, row, context);
        };
    }
    /**
     * 解析为 SQL WHERE 子句
     */
    static toSQL(expression, context, parameterized = true) {
        const params = [];
        const buildSQL = (expr) => {
            // 单一条件
            if ('field' in expr && 'op' in expr && !('type' in expr)) {
                const field = expr.field;
                const op = expr.op;
                const value = this.resolveValue(expr.value, context);
                return this.buildSQLCondition(field, op, value, params, 0, parameterized);
            }
            // 逻辑组合
            if ('type' in expr && (expr.type === 'and' || expr.type === 'or')) {
                const conditions = expr.children.map(child => buildSQL(child));
                return `(${conditions.join(expr.type === 'and' ? ' AND ' : ' OR ')})`;
            }
            // 条件取反
            if ('type' in expr && expr.type === '!condition' && 'field' in expr && 'op' in expr) {
                const condition = this.buildSQLCondition(expr.field, expr.op, this.resolveValue(expr.value, context), params, 0, parameterized);
                return `NOT (${condition})`;
            }
            // 逻辑取反
            if ('type' in expr && (expr.type === '!and' || expr.type === '!or')) {
                const conditions = expr.children.map(child => buildSQL(child));
                if (expr.type === '!and') {
                    return `NOT (${conditions.join(' AND ')})`;
                }
                else {
                    return `NOT (${conditions.join(' OR ')})`;
                }
            }
            // 函数调用
            if ('func' in expr) {
                return this.buildSQLFunction(expr.func, expr.args, context);
            }
            throw new Error('Invalid filter expression');
        };
        const sql = buildSQL(expression);
        return { sql, params };
    }
    /**
     * 解析为 MongoDB 查询对象
     */
    static toMongoDB(expression, context) {
        const buildMongo = (expr) => {
            // 单一条件
            if ('field' in expr && 'op' in expr && !('type' in expr)) {
                const field = expr.field;
                const op = expr.op;
                const value = this.resolveValue(expr.value, context);
                return this.buildMongoCondition(field, op, value);
            }
            // 逻辑组合
            if ('type' in expr && (expr.type === 'and' || expr.type === 'or')) {
                const operator = expr.type === 'and' ? '$and' : '$or';
                return { [operator]: expr.children.map(child => buildMongo(child)) };
            }
            // 条件取反
            if ('type' in expr && expr.type === '!condition' && 'field' in expr && 'op' in expr) {
                const condition = this.buildMongoCondition(expr.field, expr.op, this.resolveValue(expr.value, context));
                return { $not: condition };
            }
            // 逻辑取反
            if ('type' in expr && (expr.type === '!and' || expr.type === '!or')) {
                if (expr.type === '!and') {
                    return { $nor: expr.children.map(child => buildMongo(child)) };
                }
                else {
                    return { $and: expr.children.map(child => ({ $not: buildMongo(child) })) };
                }
            }
            // 函数调用
            if ('func' in expr) {
                return this.buildMongoFunction(expr.func, expr.args, context);
            }
            throw new Error('Invalid filter expression');
        };
        return buildMongo(expression);
    }
    // ==================== 私有辅助方法 ====================
    /**
     * 执行表达式求值（内存过滤）
     */
    static evaluateExpression(expression, row, context) {
        // 单一条件
        if ('field' in expression && 'op' in expression && !('type' in expression)) {
            const fieldValue = row[expression.field];
            const compareValue = this.resolveValue(expression.value, context);
            return this.evaluateCondition(fieldValue, expression.op, compareValue);
        }
        // 逻辑组合
        if ('type' in expression && (expression.type === 'and' || expression.type === 'or')) {
            if (expression.type === 'and') {
                return expression.children.every(child => this.evaluateExpression(child, row, context));
            }
            else {
                return expression.children.some(child => this.evaluateExpression(child, row, context));
            }
        }
        // 条件取反
        if ('type' in expression && expression.type === '!condition' && 'field' in expression && 'op' in expression) {
            const fieldValue = row[expression.field];
            const compareValue = this.resolveValue(expression.value, context);
            return !this.evaluateCondition(fieldValue, expression.op, compareValue);
        }
        // 逻辑取反
        if ('type' in expression && (expression.type === '!and' || expression.type === '!or')) {
            if (expression.type === '!and') {
                return !expression.children.every(child => this.evaluateExpression(child, row, context));
            }
            else {
                return !expression.children.some(child => this.evaluateExpression(child, row, context));
            }
        }
        // 函数调用
        if ('func' in expression) {
            return this.evaluateFunction(expression.func, expression.args, row, context);
        }
        return false;
    }
    /**
     * 执行条件判断
     */
    static evaluateCondition(fieldValue, operator, compareValue) {
        switch (operator) {
            case '==':
                return fieldValue === compareValue;
            case '!=':
                return fieldValue !== compareValue;
            case '>':
                return fieldValue > compareValue;
            case '>=':
                return fieldValue >= compareValue;
            case '<':
                return fieldValue < compareValue;
            case '<=':
                return fieldValue <= compareValue;
            case 'in':
                return Array.isArray(compareValue) && compareValue.includes(fieldValue);
            case 'not in':
                return Array.isArray(compareValue) && !compareValue.includes(fieldValue);
            case 'like':
                return String(fieldValue).includes(String(compareValue));
            case 'not like':
                return !String(fieldValue).includes(String(compareValue));
            case 'is null':
                return fieldValue === null || fieldValue === undefined;
            case 'is not null':
                return fieldValue !== null && fieldValue !== undefined;
            case 'between':
                return Array.isArray(compareValue) &&
                    fieldValue >= compareValue[0] &&
                    fieldValue <= compareValue[1];
            case 'not between':
                return !(Array.isArray(compareValue) &&
                    fieldValue >= compareValue[0] &&
                    fieldValue <= compareValue[1]);
            case 'startsWith':
                return String(fieldValue).startsWith(String(compareValue));
            case 'endsWith':
                return String(fieldValue).endsWith(String(compareValue));
            case 'contains':
                return String(fieldValue).includes(String(compareValue));
            default:
                return false;
        }
    }
    /**
     * 解析值（支持从父表或变量引用）
     */
    static resolveValue(value, context) {
        // 支持 $ 语法：$.parentRow.id, $.variables.userName
        if (typeof value === 'string' && value.startsWith('$.')) {
            const path = value.substring(2); // 移除 '$.'
            const parts = path.split('.');
            // $.parentRow.xxx
            if (parts[0] === 'parentRow' && context?.parentRow) {
                let result = context.parentRow;
                for (let i = 1; i < parts.length; i++) {
                    result = result?.[parts[i]];
                }
                return result;
            }
            // $.variables.xxx
            if (parts[0] === 'variables' && context?.variables) {
                let result = context.variables;
                for (let i = 1; i < parts.length; i++) {
                    result = result?.[parts[i]];
                }
                return result;
            }
        }
        // 支持函数对象格式
        if (typeof value === 'object' && value !== null && 'func' in value) {
            // 函数调用，如 { func: 'FIELD', args: ['id'] }
            const func = value.func;
            const args = value.args;
            if (func === 'FIELD' && context?.parentRow) {
                return context.parentRow[args[0]];
            }
            if (func === 'VAR' && context?.variables) {
                return context.variables[args[0]];
            }
            if (func === 'CURRENT_DATE') {
                return new Date();
            }
            if (func === 'CURRENT_USER' && context?.variables) {
                return context.variables['currentUser'];
            }
        }
        return value;
    }
    /**
     * 构建 SQL 条件
     */
    static buildSQLCondition(field, operator, value, params, _paramIndex, parameterized) {
        const valueStr = parameterized ? `$${params.length + 1}` : this.formatSQLValue(value);
        if (parameterized && !['is null', 'is not null'].includes(operator)) {
            params.push(value);
        }
        switch (operator) {
            case '==':
                return `${field} = ${valueStr}`;
            case '!=':
                return `${field} !== ${valueStr}`;
            case '>':
                return `${field} > ${valueStr}`;
            case '>=':
                return `${field} >= ${valueStr}`;
            case '<':
                return `${field} < ${valueStr}`;
            case '<=':
                return `${field} <= ${valueStr}`;
            case 'in':
                if (parameterized) {
                    return `${field} IN (${valueStr})`;
                }
                return `${field} IN (${Array.isArray(value) ? value.map(v => this.formatSQLValue(v)).join(',') : valueStr})`;
            case 'not in':
                if (parameterized) {
                    return `${field} NOT IN (${valueStr})`;
                }
                return `${field} NOT IN (${Array.isArray(value) ? value.map(v => this.formatSQLValue(v)).join(',') : valueStr})`;
            case 'like':
                return `${field} LIKE ${parameterized ? valueStr : `'%${value}%'`}`;
            case 'not like':
                return `${field} NOT LIKE ${parameterized ? valueStr : `'%${value}%'`}`;
            case 'is null':
                return `${field} IS NULL`;
            case 'is not null':
                return `${field} IS NOT NULL`;
            case 'between':
                if (Array.isArray(value) && value.length === 2) {
                    if (parameterized) {
                        params.push(value[1]);
                        return `${field} BETWEEN ${valueStr} AND $${params.length}`;
                    }
                    return `${field} BETWEEN ${this.formatSQLValue(value[0])} AND ${this.formatSQLValue(value[1])}`;
                }
                return `${field} = ${valueStr}`;
            default:
                return `${field} = ${valueStr}`;
        }
    }
    /**
     * 构建 MongoDB 条件
     */
    static buildMongoCondition(field, operator, value) {
        switch (operator) {
            case '==':
                return { [field]: value };
            case '!=':
                return { [field]: { $ne: value } };
            case '>':
                return { [field]: { $gt: value } };
            case '>=':
                return { [field]: { $gte: value } };
            case '<':
                return { [field]: { $lt: value } };
            case '<=':
                return { [field]: { $lte: value } };
            case 'in':
                return { [field]: { $in: value } };
            case 'not in':
                return { [field]: { $nin: value } };
            case 'like':
                return { [field]: { $regex: value, $options: 'i' } };
            case 'not like':
                return { [field]: { $not: { $regex: value, $options: 'i' } } };
            case 'is null':
                return { [field]: null };
            case 'is not null':
                return { [field]: { $ne: null } };
            case 'between':
                if (Array.isArray(value) && value.length === 2) {
                    return { [field]: { $gte: value[0], $lte: value[1] } };
                }
                return { [field]: value };
            default:
                return { [field]: value };
        }
    }
    /**
     * 格式化 SQL 值
     */
    static formatSQLValue(value) {
        if (value === null || value === undefined) {
            return 'NULL';
        }
        if (typeof value === 'string') {
            return `'${value.replace(/'/g, "''")}'`;
        }
        if (typeof value === 'number' || typeof value === 'boolean') {
            return String(value);
        }
        if (value instanceof Date) {
            return `'${value.toISOString()}'`;
        }
        return `'${String(value)}'`;
    }
    /**
     * 构建 SQL 函数
     */
    static buildSQLFunction(func, args, _context) {
        switch (func.toUpperCase()) {
            case 'FIELD':
                return String(args[0]);
            case 'CURRENT_DATE':
                return 'CURRENT_DATE';
            case 'CURRENT_TIMESTAMP':
                return 'CURRENT_TIMESTAMP';
            case 'CONCAT':
                return `CONCAT(${args.join(', ')})`;
            case 'UPPER':
                return `UPPER(${args[0]})`;
            case 'LOWER':
                return `LOWER(${args[0]})`;
            default:
                return `${func}(${args.join(', ')})`;
        }
    }
    /**
     * 构建 MongoDB 函数
     */
    static buildMongoFunction(func, args, _context) {
        switch (func.toUpperCase()) {
            case 'FIELD':
                return `$${args[0]}`;
            case 'CURRENT_DATE':
                return new Date();
            default:
                return { [`$${func.toLowerCase()}`]: args };
        }
    }
    /**
     * 执行函数调用（内存过滤）
     */
    static evaluateFunction(func, _args, _row, _context) {
        // 这里可以扩展自定义函数
        console.warn(`Function ${func} not implemented in memory filter`);
        return true;
    }
}
