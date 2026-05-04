/**
 * ==============================================
 * 合同层：JSON Schema 精简模型
 * ==============================================
 * 功能分区：
 * 1) 定义运行时可识别的最小 Schema 结构。
 * 2) 作为工具参数约束、payload 约束的统一类型源。
 *
 * 时序分区：
 * 1) 场景注册时声明 parameters/schema。
 * 2) 注册中心在 queryToolSchema/queryToolSchemaNode 时读取。
 * 3) 运行时执行前由上层据此校验参数。
 */

/**
 * JSON Schema 根节点（仅保留对象模型，避免引入过重协议实现）。
 */
export interface JsonSchema {
  /** 当前节点类型：统一要求为 object。 */
  type: 'object'
  /** 对象属性表，key 为字段名，value 为字段 Schema。 */
  properties: Record<string, JsonSchemaProperty>
  /** 必填字段列表。 */
  required?: string[]
}

/**
 * JSON Schema 属性节点。
 * 支持对象、数组、枚举等常见表达，用于描述工具参数。
 */
export interface JsonSchemaProperty {
  /** 字段类型，可是单类型或联合类型（如 ['string', 'null']）。 */
  type: string | string[]
  /** 字段说明文本，供 LLM 与开发者理解语义。 */
  description?: string
  /** 数组元素定义，仅当 type 为 array 时使用。 */
  items?: JsonSchemaProperty
  /** 对象子属性定义，仅当 type 为 object 时使用。 */
  properties?: Record<string, JsonSchemaProperty>
  /** 对象子字段必填列表。 */
  required?: string[]
  /** 枚举候选值。 */
  enum?: Array<string | number | null>
}

/**
 * 约定：pointer 用于在 JsonSchema 内定位子节点，格式采用 JSON Pointer 风格（例如："/body/reason"），
 * 或简单的点分路径（"body.reason"）——注册中心在 queryToolSchemaNode 时应支持两种解析方式。
 *
 * 示例：
 * {
 *   type: 'object',
 *   properties: {
 *     body: {
 *       type: 'object',
 *       properties: { reason: { type: 'string', description: '请假原因' } }
 *     }
 *   }
 * }
 * queryToolSchemaNode({ toolName: 'applyLeave', pointer: 'body.reason' }) => schema for reason 字段
 */
