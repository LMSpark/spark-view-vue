import { describe, expect, it } from 'vitest'

import {
  startRegistrationSession,
  type AiHostBusinessRuntimeContext,
} from '@spark-view/spark-ai/host'
import { DataMember, DataSetCrudTool, buildDataViewKey } from '@spark-view/spark-data'
import {
  PAGE_DESIGN_MODULE_ID,
  createPageDesignBusinessRegistration,
} from '@spark-view/spark-page-config/ai'
import { compileRule, parsePageData } from '@spark-view/spark-page-config/config'
import type { PageDesignEditHost } from '@spark-view/spark-page-config/design'
import { isRecord } from '@spark-view/spark-page-config/json-document'
import { SparkNodeTree, getSparkNodeChildren } from '@spark-view/spark-page-config/node-tree'

const PAGE_ID = 'hr/leave-request'
const REQUEST_ID = 'leave-application-page-design-test'
const REQUIREMENT = '请假申请页面设计：员工填写请假类型、起止日期、请假天数、事由，提交后进入待审批列表；页面展示待审批数量。'

const LEAVE_REQUESTS_TABLE = 'LeaveRequests'
const LEAVE_TYPES_TABLE = 'LeaveTypeOptions'

const leaveDefaultKey = buildDataViewKey(LEAVE_REQUESTS_TABLE, 'default')
const leavePendingKey = buildDataViewKey(LEAVE_REQUESTS_TABLE, 'pending')
const leaveTypeOptionsKey = buildDataViewKey(LEAVE_TYPES_TABLE, 'default')

type ToolResult = {
  readonly ok: boolean
  readonly data?: unknown
  readonly checks?: readonly unknown[] | undefined
}

function createHost(): {
  host: PageDesignEditHost
  nodeTree: SparkNodeTree
  dataSetTool: DataSetCrudTool
  reads: () => { script: string; style: string; nodeChanged: number; dataChanged: number }
} {
  let script = 'export default {}'
  let style = ''
  let nodeChanged = 0
  let dataChanged = 0
  const nodeTree = SparkNodeTree.fromJson({
    type: 'spark-page',
    id: 'spark-page-root',
    props: {},
    children: [],
  })
  const dataSetTool = new DataSetCrudTool('leave-application-page')

  return {
    nodeTree,
    dataSetTool,
    host: {
      getNodeTree: () => nodeTree,
      onNodeTreeChanged: () => { nodeChanged += 1 },
      getDataSetTool: () => dataSetTool,
      onDataSetChanged: () => { dataChanged += 1 },
      readScript: () => script,
      writeScript: (content) => { script = content },
      readStyle: () => style,
      writeStyle: (content) => { style = content },
    },
    reads: () => ({ script, style, nodeChanged, dataChanged }),
  }
}

function hostContext(): AiHostBusinessRuntimeContext {
  return {
    moduleId: PAGE_DESIGN_MODULE_ID,
    moduleInstanceId: PAGE_ID,
    instanceId: REQUEST_ID,
  }
}

function pagePath(): string {
  return `/pageDesign[${PAGE_ID}]`
}

function childPath(kind: string): string {
  return `${pagePath()}/${kind}[${PAGE_ID}]`
}

function assertOk(result: ToolResult, label: string): void {
  if (result.ok) return
  throw new Error(`${label} failed: ${JSON.stringify(result.checks ?? result)}`)
}

function requireRecordResult(result: ToolResult, label: string): Record<string, unknown> {
  assertOk(result, label)
  if (isRecord(result.data)) return result.data
  throw new Error(`${label} expected record data`)
}

function requireArrayResult(result: ToolResult, label: string): unknown[] {
  assertOk(result, label)
  if (Array.isArray(result.data)) return result.data
  throw new Error(`${label} expected array data`)
}

describe('请假申请页面设计测试程序', () => {
  it('按数据优先流程生成 pagedata、rule、style，并能被配置编译器回读', async () => {
    const { host, nodeTree, dataSetTool, reads } = createHost()
    const registration = createPageDesignBusinessRegistration({ getEditToolHost: () => host })
    const context = hostContext()

    await startRegistrationSession(registration, context)

    const rootChildren = requireArrayResult(
      await registration.runtime.executeTool('listChildren', { path: '/' }, context),
      'list root children',
    )
    expect(rootChildren.some(entry => isRecord(entry) && entry['id'] === PAGE_DESIGN_MODULE_ID)).toBe(true)

    const pageInstances = requireArrayResult(
      await registration.runtime.executeTool('findInstance', {
        path: '/',
        childKind: PAGE_DESIGN_MODULE_ID,
        query: {},
      }, context),
      'find pageDesign instance',
    )
    expect(pageInstances[0]).toMatchObject({ id: PAGE_ID })

    const bootstrap = await registration.runtime.executeTool('invokeAction', {
      path: childPath('lifecycle'),
      actionName: 'bootstrap',
      args: {},
    }, context)
    expect(bootstrap).toMatchObject({ ok: true, data: { phase: 'editing' } })

    const dataPlanningFlow = requireRecordResult(
      await registration.runtime.executeTool('invokeAction', {
        path: childPath('lifecycle'),
        actionName: 'describeDesignFlow',
        args: { phase: '数据规划' },
      }, context),
      'describe data planning flow',
    )
    expect(dataPlanningFlow['steps']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ step: 21, phase: '数据规划' }),
        expect.objectContaining({ step: 30, phase: '数据规划' }),
      ]),
    )

    for (const key of ['r-section', 'r-card', 'r-form', 'r-text', 'r-select', 'r-date', 'r-number', 'r-textarea', 'r-button', 'r-table']) {
      const guide = requireRecordResult(
        await registration.runtime.executeTool('invokeAction', {
          path: childPath('payload-catalog'),
          actionName: 'guidePayload',
          args: { key },
        }, context),
        `guide payload ${key}`,
      )
      expect(guide).toMatchObject({
        moduleKind: 'node-tree',
        payloadRef: 'spark.component',
      })
    }

    assertOk(
      await registration.runtime.executeTool('invokeAction', {
        path: childPath('dataset'),
        actionName: 'createTable',
        args: {
          tableName: LEAVE_REQUESTS_TABLE,
          resourceType: 'database-table',
          resourceId: 'hr.leave_requests',
          businessCategory: 'master',
          columns: [
            { name: 'id', type: 'number', label: '申请单号', isPrimaryKey: true, autoIncrement: true },
            { name: 'applicantName', type: 'string', label: '申请人', required: true, maxLength: 40 },
            { name: 'leaveType', type: 'string', label: '请假类型', required: true },
            { name: 'startDate', type: 'date', label: '开始日期', required: true },
            { name: 'endDate', type: 'date', label: '结束日期', required: true },
            { name: 'days', type: 'number', label: '请假天数', required: true, min: 0.5 },
            { name: 'reason', type: 'string', label: '请假事由', required: true, maxLength: 300 },
            { name: 'status', type: 'string', label: '状态', defaultValue: 'pending' },
          ],
          api: {
            list: { url: '/api/hr/leave-requests', method: 'GET' },
            create: { url: '/api/hr/leave-requests', method: 'POST' },
            update: { url: '/api/hr/leave-requests/{id}', method: 'PATCH', pathParams: ['id'] },
            delete: { url: '/api/hr/leave-requests/{id}', method: 'DELETE', pathParams: ['id'] },
          },
          crudConfig: {
            validateData: true,
            timeout: 10000,
          },
          views: {
            default: {
              pageSize: 20,
              autoLoad: true,
              autoCurrentFirst: true,
              commitMode: 'staged',
            },
            pending: {
              pageSize: 10,
              autoLoad: true,
              filterExpression: { field: 'status', op: '==', value: 'pending' },
              sortExpression: [{ field: 'startDate', direction: 'desc' }],
              aggregates: {
                pendingCount: { type: 'count', field: 'id' },
              },
            },
          },
        },
      }, context),
      'create leave requests table',
    )

    assertOk(
      await registration.runtime.executeTool('invokeAction', {
        path: childPath('dataset'),
        actionName: 'createTable',
        args: {
          tableName: LEAVE_TYPES_TABLE,
          resourceType: 'static-data',
          resourceId: 'leave-type-options',
          businessCategory: 'reference',
          columns: [
            { name: 'value', type: 'string', label: '类型编码', isPrimaryKey: true },
            { name: 'label', type: 'string', label: '类型名称', required: true },
          ],
          views: {
            default: {
              rows: [
                { value: 'annual', label: '年假' },
                { value: 'sick', label: '病假' },
                { value: 'personal', label: '事假' },
                { value: 'compensatory', label: '调休' },
              ],
              valueField: 'value',
              labelField: 'label',
            },
          },
        },
      }, context),
      'create leave type options table',
    )

    assertOk(
      await registration.runtime.executeTool('invokeAction', {
        path: childPath('node-tree'),
        actionName: 'addNodes',
        args: {
          parentComponentId: 'spark-page-root',
          nodes: [
            {
              type: 'r-section',
              id: 'leave-summary-section',
              props: {
                title: '请假概览',
                description: REQUIREMENT,
                gridColumns: 3,
                gridGap: '16px',
                bodyClass: 'leave-summary-grid',
              },
              children: [
                {
                  type: 'r-card',
                  id: 'pending-count-card',
                  props: {
                    header: '待审批申请统计',
                    shadow: 'always',
                    bodyClass: 'leave-summary-card',
                  },
                },
              ],
            },
            {
              type: 'r-section',
              id: 'leave-form-section',
              props: {
                title: '提交请假申请',
                description: '填写必要字段后提交，表单字段直接来自 LeaveRequests 的 currentRow。',
                useCard: true,
                gridGap: '16px',
              },
              children: [
                {
                  type: 'r-form',
                  id: 'leave-application-form',
                  props: {
                    dataViewKey: leaveDefaultKey,
                    contextDataMember: DataMember.CurrentRow,
                    gridColumns: 2,
                    gridGap: '12px 16px',
                    labelWidth: '96px',
                  },
                  children: [
                    { type: 'r-text', id: 'field-applicant-name', props: { field: 'applicantName', label: '申请人', placeholder: '请输入申请人' } },
                    {
                      type: 'r-select',
                      id: 'field-leave-type',
                      props: {
                        field: 'leaveType',
                        label: '请假类型',
                        placeholder: '请选择请假类型',
                        optionDataViewKey: leaveTypeOptionsKey,
                        optionDataMember: DataMember.Rows,
                        optionLabelField: 'label',
                        optionValueField: 'value',
                      },
                    },
                    { type: 'r-date', id: 'field-start-date', props: { field: 'startDate', label: '开始日期', valueFormat: 'YYYY-MM-DD' } },
                    { type: 'r-date', id: 'field-end-date', props: { field: 'endDate', label: '结束日期', valueFormat: 'YYYY-MM-DD' } },
                    { type: 'r-number', id: 'field-leave-days', props: { field: 'days', label: '请假天数', min: 0.5, precision: 1 } },
                    { type: 'r-textarea', id: 'field-leave-reason', props: { field: 'reason', label: '请假事由', rows: 3, maxlength: 300, showWordLimit: true } },
                    {
                      type: 'r-button',
                      id: 'submit-leave-request',
                      props: {
                        action: 'submit-current-form',
                        label: '提交申请',
                        buttonType: 'primary',
                        icon: 'Send',
                      },
                    },
                  ],
                },
              ],
            },
            {
              type: 'r-section',
              id: 'pending-list-section',
              props: {
                title: '待审批申请',
                description: '列表绑定 LeaveRequests@pending 的 rows，分页和统计不污染 default 视图。',
              },
              children: [
                {
                  type: 'r-table',
                  id: 'pending-leave-table',
                  props: {
                    dataViewKey: leavePendingKey,
                    dataMember: DataMember.Rows,
                    rowKey: 'id',
                    autoColumns: true,
                    stripe: true,
                    border: true,
                    showPagination: true,
                  },
                },
              ],
            },
          ],
        },
      }, context),
      'create leave request page nodes',
    )

    assertOk(
      await registration.runtime.executeTool('invokeAction', {
        path: childPath('text-model'),
        actionName: 'writeStyle',
        args: {
          content: [
            '.leave-summary-grid { display: grid; gap: 16px; }',
            '.leave-summary-grid [data-component-id="pending-count-card"] { min-width: 0; }',
            '.leave-form-section { max-width: 960px; }',
          ].join('\n'),
        },
      }, context),
      'write leave page style',
    )

    const exportedPageData = dataSetTool.toJson()
    expect(Object.keys(exportedPageData.tables)).toEqual([LEAVE_REQUESTS_TABLE, LEAVE_TYPES_TABLE])
    expect(exportedPageData.tables[LEAVE_REQUESTS_TABLE]?.views['pending']?.aggregates?.['pendingCount']).toEqual({
      type: 'count',
      field: 'id',
    })
    expect(exportedPageData.tables[LEAVE_TYPES_TABLE]?.views.default.rows).toHaveLength(4)

    expect([...nodeTree.collectDataViewKeys()].sort()).toEqual([
      leaveDefaultKey,
      leavePendingKey,
      leaveTypeOptionsKey,
    ].sort())
    expect(nodeTree.countNodes()).toBe(14)

    const pageChildren = getSparkNodeChildren(nodeTree.toJSON().children)
    const compiledRule = compileRule(JSON.stringify(pageChildren))
    expect(compiledRule).toHaveLength(3)
    expect(compiledRule[0]).toMatchObject({ id: 'leave-summary-section', type: 'r-section' })
    expect(compiledRule[1]).toMatchObject({ id: 'leave-form-section', type: 'r-section' })
    expect(compiledRule[2]).toMatchObject({ id: 'pending-list-section', type: 'r-section' })

    const parsedDataSet = parsePageData(JSON.stringify(exportedPageData))
    expect(parsedDataSet.getTable(LEAVE_REQUESTS_TABLE)?.columns
      .filter(column => !column.isComputed)
      .map(column => column.name)).toEqual([
      'id',
      'applicantName',
      'leaveType',
      'startDate',
      'endDate',
      'days',
      'reason',
      'status',
    ])
    expect(parsedDataSet.getView(LEAVE_REQUESTS_TABLE, 'pending')).toBeDefined()
    expect(parsedDataSet.getView(LEAVE_TYPES_TABLE, 'default')?.rows).toHaveLength(4)

    const style = requireRecordResult(
      await registration.runtime.executeTool('invokeAction', {
        path: childPath('text-model'),
        actionName: 'readStyle',
        args: {},
      }, context),
      'read leave page style',
    )
    expect(style['content']).toContain('.leave-summary-grid')
    expect(reads()).toMatchObject({
      script: 'export default {}',
      nodeChanged: 1,
      dataChanged: 2,
    })
  })
})
