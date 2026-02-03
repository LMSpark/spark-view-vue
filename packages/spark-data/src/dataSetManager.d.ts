/**
 * DataSetManager 工厂类
 * 相当于 .NET 的 DataSet 工厂 - 提供静态方法创建和管理 DataSet 实例
 *
 * 架构对应关系：
 * .NET DataSet    → DataSet (dataSet.ts)     - 领域逻辑层
 * .NET DataTable  → DataTable (DataTable.ts)  - 结构层
 * .NET DataView   → BindingContext (BindingContext.ts) - 视图层
 * .NET Factory    → DataSetManager (本文件)   - 工厂层
 */
import type { IDataSet, DataRow } from './types';
import { DataSet } from './dataset-impl';
/**
 * DataSetManager 工厂类（纯静态方法）
 */
export declare class DataSetManager {
    /**
     * 创建 DataSet 实例
     * @param config DataSet 配置
     * @param dataLoader 可选的数据加载器
     * @returns DataSet 实例
     */
    static create(config: IDataSet, dataLoader?: (tableName: string) => Promise<DataRow[]>): DataSet;
    /**
     * 从 JSON 字符串创建 DataSet 实例
     * @param json JSON 字符串
     * @param dataLoader 可选的数据加载器
     * @returns DataSet 实例
     */
    static fromJSON(json: string, dataLoader?: (tableName: string) => Promise<DataRow[]>): DataSet;
    /**
     * 从配置文件创建 DataSet 实例（未实现）
     * @param _pageId 页面 ID
     * @param _dataLoader 可选的数据加载器
     * @returns DataSet 实例
     */
    static fromConfig(_pageId: string, _dataLoader?: (tableName: string) => Promise<DataRow[]>): Promise<DataSet>;
}
//# sourceMappingURL=dataSetManager.d.ts.map