/**
 * 页面设计标准件工具模块。
 *
 * 标准件函数把可确定的页面装配逻辑沉到业务层，LLM 只负责选择标准件
 * 并提供业务参数。函数内部稳定写入最新 PageNode 子模型。
 */

import * as SparkAiSchema from '@spark-view/spark-ai/json'
import type {
  AiJsonValue,
} from '@spark-view/spark-ai/json'
import {
  AiModule,
  type AiModuleFunctionMetadata,
  type AiModuleInstanceRef,
  type AiModulePathContext,
  type AiModuleResult,
} from '@spark-view/spark-ai/modules'
import type {
  PageDesignManagementWorkbenchField,
  PageDesignManagementWorkbenchRequest,
  PageDesignService,
} from '../../update/page-design-service'
import type { PageDesignServiceContext } from '../../update/page-edit-session'
import { createCurrentPageRef, findCurrentPageInstance } from '../page-design-helpers'
import { PAGE_DESIGN_STANDARD_PAGE_KIND } from '../page-design-kind-ids'

const {
  anySchema,
  arraySchema,
  booleanSchema,
  enumSchema,
  objectSchema,
  paramsSchema,
  stringSchema,
} = SparkAiSchema

const FIELD_SCHEMA = objectSchema({
  name: stringSchema('字段名，使用稳定英文/拼音标识，例如 studentName、score、department。'),
  label: stringSchema('字段显示名，例如 学生姓名、分数、部门。'),
  type: enumSchema(['string', 'number', 'date', 'datetime', 'boolean', 'text'], '字段类型。'),
  role: enumSchema(['primary', 'title', 'status', 'metric', 'date', 'contact', 'department', 'score', 'description', 'field'], '字段在管理页面中的业务角色。'),
  required: booleanSchema('是否必填。'),
  options: arraySchema(stringSchema('枚举选项文本'), '可选项；存在时标准件会生成选择控件。'),
}, {
  required: ['name', 'label'],
  additionalProperties: false,
  description: '管理工作台主表字段定义。只描述业务字段，不描述 Vue 内部组件逻辑。',
})

const BUILD_MANAGEMENT_WORKBENCH_PARAMS = paramsSchema({
  title: stringSchema('页面标题，例如 学生成绩管理、员工信息管理。'),
  entityName: stringSchema('主业务实体名，例如 StudentGrade、Employee。'),
  tableName: stringSchema('可选。主表名，默认由 entityName 归一化。'),
  fields: arraySchema(FIELD_SCHEMA, '主业务表字段。'),
  rows: arraySchema(objectSchema({}, { additionalProperties: anySchema() }), '可选。示例行数据。'),
  filters: arraySchema(stringSchema('筛选项名称，例如 班级、课程、状态。'), '页面筛选项。'),
  metrics: arraySchema(stringSchema('统计指标名称，例如 总人数、平均分、在职人数。'), '摘要指标。'),
  primaryAction: stringSchema('主操作按钮文案，例如 保存、录入成绩、保存档案。'),
}, ['title', 'entityName', 'fields'], '管理工作台标准件装配参数。')

const STANDARD_PAGE_ACTIONS: readonly AiModuleFunctionMetadata[] = [
  {
    name: 'buildManagementWorkbench',
    description: [
      '装配管理类页面标准件：一次确定性写入 PageNode 的 navigation（如已挂载）、dataSet、rule、script、style。',
      'LLM 只传业务字段、筛选项、指标和少量示例数据；不要手写四文件内部结构。',
    ].join(''),
    paramsSchema: BUILD_MANAGEMENT_WORKBENCH_PARAMS,
    resultSchema: {
      tableName: 'string — 已生成主表名',
      dataViewKey: 'string — 主视图 DataViewKey',
      fieldCount: 'number — 字段数量',
      rowCount: 'number — 示例行数量',
      standardPart: '"management-workbench"',
    },
    example: {
      title: '学生成绩管理',
      entityName: 'StudentGrade',
      fields: [
        { name: 'studentName', label: '学生姓名', type: 'string', role: 'title', required: true },
        { name: 'score', label: '分数', type: 'number', role: 'score', required: true },
      ],
      filters: ['班级', '课程'],
      metrics: ['总人数', '平均分', '异常成绩'],
      primaryAction: '录入成绩',
    },
    usageRules: [
      '管理台、信息维护、成绩管理、员工档案等 CRUD/筛选/统计页面优先调用本标准件。',
      '本函数内部负责 PageNode 确定性装配；LLM 不需要再分别 writeScript/writeStyle/addNodes，除非标准件结果不满足用户特殊需求。',
      '调用前只需理解用户需求并抽取字段、筛选项、统计指标；组件和脚本内部逻辑由标准件生成。',
    ],
    failureModes: [
      {
        code: 'INVALID_STANDARD_PART_ARGS',
        when: '缺少标题、实体或字段',
        fix: '从用户需求中抽取 title/entityName/fields 后重试。',
      },
    ],
  },
]

export class PageDesignStandardPageAiModule extends AiModule {
  private readonly service: PageDesignService
  private readonly contextFactory: (ctx: AiModulePathContext) => PageDesignServiceContext

  public constructor(options: {
    readonly service: PageDesignService
    readonly contextFactory: (ctx: AiModulePathContext) => PageDesignServiceContext
    readonly parentKind?: string
  }) {
    super({
      kind: PAGE_DESIGN_STANDARD_PAGE_KIND,
      name: 'Page Design Standard Parts',
      description: '页面标准件装配工具。把常见管理页面的确定性内部逻辑封装成可选择标准件。',
      ...(options.parentKind === undefined ? {} : { parentKind: options.parentKind }),
      functions: STANDARD_PAGE_ACTIONS,
      children: [],
      find: (ctx, childKind, query) => findCurrentPageInstance({
        ctx,
        childKind,
        query,
        ownKind: PAGE_DESIGN_STANDARD_PAGE_KIND,
        label: '当前页面标准件装配器',
      }),
    })
    this.service = options.service
    this.contextFactory = options.contextFactory
  }

  protected override runFunction(
    ctx: AiModulePathContext,
    actionName: string,
    args: Readonly<Record<string, AiJsonValue>>,
  ): Promise<AiModuleResult<AiJsonValue>> {
    if (this.findFunction(actionName) === undefined) {
      throw new Error(`${this.kind} action is not declared: ${actionName}`)
    }
    switch (actionName) {
      case 'buildManagementWorkbench':
        return Promise.resolve(this.serviceResultToOperationResult(
          this.service.buildManagementWorkbench(this.contextFactory(ctx), toManagementWorkbenchRequest(args)),
        ))
      default:
        throw new Error(`${this.kind} action runner is not registered: ${actionName}`)
    }
  }

  protected override createCurrentInstanceRef(ctx: AiModulePathContext): AiModuleInstanceRef | null {
    return createCurrentPageRef(ctx, '当前页面标准件装配器')
  }
}

function toManagementWorkbenchRequest(
  args: Readonly<Record<string, AiJsonValue>>,
): PageDesignManagementWorkbenchRequest {
  return {
    title: typeof args['title'] === 'string' ? args['title'] : '',
    entityName: typeof args['entityName'] === 'string' ? args['entityName'] : '',
    ...(typeof args['tableName'] === 'string' ? { tableName: args['tableName'] } : {}),
    fields: Array.isArray(args['fields']) ? args['fields'].filter(isWorkbenchField) : [],
    rows: Array.isArray(args['rows']) ? args['rows'].filter(isRecord) : [],
    filters: readStringArray(args['filters']),
    metrics: readStringArray(args['metrics']),
    ...(typeof args['primaryAction'] === 'string' ? { primaryAction: args['primaryAction'] } : {}),
  }
}

function isWorkbenchField(value: unknown): value is PageDesignManagementWorkbenchField {
  return isRecord(value)
    && typeof value['name'] === 'string'
    && typeof value['label'] === 'string'
}

function readStringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
