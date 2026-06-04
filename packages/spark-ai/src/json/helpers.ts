/**
 * json/helpers.ts — JSON Schema 便捷构造器（deprecated re-export 层）
 *
 * 【迁移说明】所有构造器已统一到 @spark-appworks/spark-json-document。
 *   消费方应改为从 @spark-appworks/spark-json-document 直接导入。
 */

export {
  anySchema,
  arraySchema,
  booleanSchema,
  enumSchema,
  noParamsSchema,
  numberSchema,
  objectSchema,
  paramsSchema,
  stringSchema,
} from '@spark-appworks/spark-json-document'

export type {
  BooleanSchemaOptions,
  EnumSchemaOptions,
  NumberSchemaOptions,
  ObjectSchemaOptions,
  StringSchemaOptions,
} from '@spark-appworks/spark-json-document'
