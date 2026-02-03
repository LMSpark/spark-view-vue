/**
 * FilterExpression 解析器
 * 支持：内存过滤、SQL WHERE 生成、MongoDB 查询对象生成
 */
import type { FilterExpression, DataRow, FilterContext } from './types';
/**
 * 过滤表达式解析器
 */
export declare class FilterExpressionParser {
    /**
     * 解析为内存过滤函数
     */
    static toMemoryFilter(expression: FilterExpression, context?: FilterContext): (row: DataRow) => boolean;
    /**
     * 解析为 SQL WHERE 子句
     */
    static toSQL(expression: FilterExpression, context?: FilterContext, parameterized?: boolean): {
        sql: string;
        params: (string | number | boolean | null)[];
    };
    /**
     * 解析为 MongoDB 查询对象
     */
    static toMongoDB(expression: FilterExpression, context?: FilterContext): Record<string, unknown>;
    /**
     * 执行表达式求值（内存过滤）
     */
    private static evaluateExpression;
    /**
     * 执行条件判断
     */
    private static evaluateCondition;
    /**
     * 解析值（支持从父表或变量引用）
     */
    private static resolveValue;
    /**
     * 构建 SQL 条件
     */
    private static buildSQLCondition;
    /**
     * 构建 MongoDB 条件
     */
    private static buildMongoCondition;
    /**
     * 格式化 SQL 值
     */
    private static formatSQLValue;
    /**
     * 构建 SQL 函数
     */
    private static buildSQLFunction;
    /**
     * 构建 MongoDB 函数
     */
    private static buildMongoFunction;
    /**
     * 执行函数调用（内存过滤）
     */
    private static evaluateFunction;
}
//# sourceMappingURL=filterExpressionParser.d.ts.map