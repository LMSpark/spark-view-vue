/**
 * 基础数据类型定义
 * 
 * 数据类型的唯一定义源，所有包共享使用
 * 
 * @packageDocumentation
 */

/**
 * 数据行：键值对结构
 * 
 * 支持泛型，可指定具体的数据类型
 */
export type IDataRow<T = Record<string, unknown>> = T
