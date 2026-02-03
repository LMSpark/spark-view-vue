/**
 * 渲染器类型定义 (SOLID原则应用)
 *
 * 类型层次说明：
 * - RuleConfig: 配置文件中的规则格式（来自 @spark-view/spark-page-config）
 * - Rule: 运行时的规则格式（FormCreate 官方类型）
 *
 * 转换流程：
 * 1. 配置加载器读取 rule.json → RuleConfig[]
 * 2. PageRenderer 接收 RuleConfig[] → 转换为 Rule[]
 * 3. 绑定和渲染使用 Rule[]（FormCreate 标准格式）
 */
export {};
