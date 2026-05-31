import { describe, expect, it } from 'vitest'

import {
  createAiAgentHost,
  startAiAgentRegistrationSession,
  type AiAgentRuntimeContext,
} from '@spark-view/spark-ai/agent'
import { createRequest } from '@spark-view/spark-utils'
import {
  PROJECT_PLANNING_MODULE_ID,
  createProjectPlanningBusinessKindDefinition,
  createProjectPlanningBusinessRegistration,
  ensureProjectPlanningBusiness,
  type ProjectPlanningRunInput,
} from '@spark-view/spark-page-config/ai'
import {
  ProjectNodeCollection,
  ProjectPlanningModel,
  applyProjectPlanningCommandToRoot,
  type ProjectPlanningEditHost,
} from '@spark-view/spark-page-config/project'
import type { ProjectPlanningApplyCommand } from '@spark-view/spark-page-config/project'
import { PageNodeFileApi } from '../src/page-model/model/page-file/page-file-api'
import { PageNodeFileCache } from '../src/page-model/model/page-file/page-file-cache'
import { PageContentLoader } from '../src/page-model/read/page-content-loader'

function createPlanningHost(projectId = 'school'): ProjectPlanningEditHost {
  const http = createRequest()
  const contentLoader = new PageContentLoader({
    fileStorage: 'memory',
    httpClient: http,
  })
  const nodes = new ProjectNodeCollection({
    fileApi: new PageNodeFileApi({
      getPageFilesApi: () => '/api/pages-config',
      http,
    }),
    fileCache: new PageNodeFileCache({
      contentLoaderFactory: () => contentLoader,
    }),
    contentLoaderFactory: () => contentLoader,
  })
  const planning = new ProjectPlanningModel({ projectId, nodes })
  return {
    readProjectPlanning: () => planning.readProjectPlanning(),
    applyProjectPlanning: (command: ProjectPlanningApplyCommand) => {
      const applied = applyProjectPlanningCommandToRoot({
        root: nodes.root,
        command,
      })
      if (command.projectRequirement !== undefined) {
        planning.setProjectRequirement(command.projectRequirement)
      }
      nodes.replaceRoot(applied.root)
      const { root: _root, ...result } = applied
      return {
        ...result,
        projectPlanning: planning.readProjectPlanning(),
      }
    },
  }
}

function context(projectId: string): AiAgentRuntimeContext {
  return {
    moduleId: PROJECT_PLANNING_MODULE_ID,
    moduleInstanceId: projectId,
    instanceId: projectId,
  }
}

describe('projectPlanning AI business registration', () => {
  it('registers projectPlanning through spark-ai and exposes only planning tools', async () => {
    const host = createPlanningHost()
    const registration = createProjectPlanningBusinessRegistration({
      getPlanningEditHost: () => host,
    })
    const started = await startAiAgentRegistrationSession(registration, context('school'))
    const toolNames = started.tools.map(tool => tool.function.name)

    expect(registration.moduleId).toBe(PROJECT_PLANNING_MODULE_ID)
    expect(toolNames).toEqual(expect.arrayContaining([
      'module_find',
      'module_query',
      'module_function_guide',
      'readPlanning',
      'applyPlanning',
      'agent_complete',
    ]))
    expect(toolNames).not.toEqual(expect.arrayContaining([
      'addNodes',
      'createTable',
      'writeScript',
      'writeStyle',
    ]))

    const found = await registration.runtime.executeTool('module_find', {
      path: '/',
      childKind: PROJECT_PLANNING_MODULE_ID,
      query: { id: 'school' },
    }, context('school'))
    expect(found).toMatchObject({
      ok: true,
      data: [expect.objectContaining({ id: 'school' })],
    })
  })

  it('turns user requirements into project pages without page configuration fields', async () => {
    const planningHost = createPlanningHost()
    const registration = createProjectPlanningBusinessRegistration({
      getPlanningEditHost: () => planningHost,
    })
    const runtimeContext = context('school')
    await startAiAgentRegistrationSession(registration, runtimeContext)

    const path = '/projectPlanning[school]'
    const applied = await registration.runtime.executeTool('applyPlanning', {
      path,
      args: {
        projectRequirement: '建设教务管理系统，先完成学生成绩管理页面。',
        nodes: [
          {
            nodeId: 'academic',
            title: '教务管理',
            nodeKind: 'module',
            description: '教务管理模块，统一承载班级、学生和成绩相关页面。',
          },
          {
            nodeId: 'student-grade',
            parentNodeId: 'academic',
            title: '学生成绩管理',
            nodeKind: 'page',
            description: '维护学生成绩，支持班级、科目筛选、分数录入、平均分统计和异常成绩预警。',
          },
        ],
      },
    }, runtimeContext)
    expect(applied).toMatchObject({
      ok: true,
      data: expect.objectContaining({
        nodeCount: 2,
        moduleCount: 1,
        pageCount: 1,
        createdNodeIds: ['academic', 'student-grade'],
      }),
    })

    const readBack = await registration.runtime.executeTool('readPlanning', {
      path,
      args: {},
    }, runtimeContext)
    expect(readBack).toMatchObject({
      ok: true,
      data: expect.objectContaining({
        pageFeatures: [
          expect.objectContaining({
            pageId: 'student-grade',
            title: '学生成绩管理',
            description: expect.stringContaining('异常成绩预警'),
          }),
        ],
      }),
    })

    const rejected = await registration.runtime.executeTool('applyPlanning', {
      path,
      args: {
        nodes: [
          {
            nodeId: 'bad-page',
            title: '错误页面',
            nodeKind: 'page',
            description: '错误地携带页面配置字段。',
            rule: [],
          },
        ],
      },
    }, runtimeContext)
    expect(rejected.ok).toBe(false)
    expect(JSON.stringify(rejected.checks ?? [])).toContain('SCHEMA_VALIDATION_FAILED')
  })

  it('blocks completion until project requirement and page descriptions are ready', async () => {
    const planningHost = createPlanningHost()
    const registration = createProjectPlanningBusinessRegistration({
      getPlanningEditHost: () => planningHost,
    })
    const runtimeContext = context('school')

    await expect(Promise.resolve(registration.beforeFunctionCall?.({
      ...runtimeContext,
      toolName: 'agent_complete',
      args: { summary: 'done' },
    }))).resolves.toMatchObject({
      status: 'reject',
      fix: expect.stringContaining('尚未产生任何 page/sub-page 页面规划'),
    })

    await registration.runtime.executeTool('applyPlanning', {
      path: '/projectPlanning[school]',
      args: {
        projectRequirement: '建设教务管理系统。',
        nodes: [
          {
            nodeId: 'student-grade',
            title: '学生成绩管理',
            nodeKind: 'page',
            description: '维护学生成绩，支持查询、录入和统计。',
          },
        ],
      },
    }, runtimeContext)

    await expect(Promise.resolve(registration.beforeFunctionCall?.({
      ...runtimeContext,
      toolName: 'agent_complete',
      args: { summary: 'done' },
    }))).resolves.toMatchObject({ status: 'allow' })
  })

  it('can be ensured on AiAgentHost as a registered spark-ai business', async () => {
    const planningHost = createPlanningHost('school')
    const prompts: string[] = []
    const aiHost = ensureProjectPlanningBusiness({
      host: createAiAgentHost({
        turnCallbacks: {
          executeTurn: (input) => {
            prompts.push(input.systemPrompt)
            return Promise.resolve({ text: '', toolCalls: [] })
          },
          appendMessages: () => Promise.resolve(),
        },
        maxToolRounds: 1,
      }),
      getProjectPlanningEditHost: () => planningHost,
    })
    const input: ProjectPlanningRunInput = {
      projectId: 'school',
      userRequirement: '为学校建设学生成绩管理页面',
    }
    const result = await aiHost.run(PROJECT_PLANNING_MODULE_ID, input)

    expect(aiHost.has(PROJECT_PLANNING_MODULE_ID)).toBe(true)
    expect(result.task.target.businessRegistrationId).toBe(PROJECT_PLANNING_MODULE_ID)
    expect(result.task.normalizedInput).toEqual(input)
    expect(prompts.join('\n')).toContain('不生成页面配置')
    expect(prompts.join('\n')).toContain('readPlanning')
    expect(prompts.join('\n')).toContain('applyPlanning')
  })

  it('keeps PageModel out of the projectPlanning core prompt', () => {
    const definition = createProjectPlanningBusinessKindDefinition({
      getPlanningEditHost: () => createPlanningHost(),
    })
    const orchestration = definition.inputContract.toOrchestration({
      projectId: 'school',
      userRequirement: '实现学生成绩管理',
      mode: 'create',
    })

    expect(orchestration.systemPrompt).toContain('SSOT 规则')
    expect(orchestration.systemPrompt).toContain('PageModel/PageNode/pageDesign 都是下游业务范例或后续工位')
    expect(orchestration.systemPrompt).toContain('不生成 rule/pagedata/script/style')
  })
})
