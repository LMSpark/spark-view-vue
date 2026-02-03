/**
 * @spark-view/spark-data
 * SPARK 数据空间包 - 提供类似 .NET DataSet 的数据管理能力
 */
// 导出命名空间（推荐使用）
export { SparkData, SparkData as default } from './spark-data-namespace';
// 导出核心类（向后兼容）
export { DataSet } from './dataset-impl';
export { DataTable } from './dataTable';
export { BindingContext } from './bindingContext';
export { TreeManager } from './treeManager';
export { DataSetManager } from './dataSetManager';
export { FilterExpressionParser } from './filterExpressionParser';
