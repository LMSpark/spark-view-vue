# SPARK AI 新业务模板

> 这个模板用于复制出一个最小可运行业务。当前选择破坏式新结构：函数示例使用 `examples`，不再新增旧 `example` 字段。

## 文件建议

```text
basic-business/
├── service.ts
├── modules.ts
├── registration.ts
├── host.ts
└── basic-business.test.ts
```

## service.ts

```ts
import { AiModuleResult } from '@spark-view/spark-ai/modules'

export class TicketService {
  private readonly tickets = new Map<string, { status: string; priority: string }>()

  describe(ticketId: string) {
    return AiModuleResult.ok({ ticketId, ...this.ensure(ticketId) })
  }

  setPriority(ticketId: string, priority: string) {
    const ticket = this.ensure(ticketId)
    ticket.priority = priority
    return AiModuleResult.ok({ ticketId, priority })
  }

  private ensure(ticketId: string) {
    const existing = this.tickets.get(ticketId)
    if (existing !== undefined) return existing
    const created = { status: 'open', priority: 'normal' }
    this.tickets.set(ticketId, created)
    return created
  }
}
```

## modules.ts

```ts
import {
  AiModule,
  AiModuleResult,
  type AiModuleFunctionMetadata,
  type AiModuleInstanceRef,
  type AiModulePathContext,
} from '@spark-view/spark-ai/modules'
import {
  noParamsSchema,
  paramsSchema,
  stringSchema,
  type AiJsonValue,
} from '@spark-view/spark-ai/json'
import type { TicketService } from './service'

export const TICKET_KIND = 'support-ticket'

const TICKET_FUNCTIONS: readonly AiModuleFunctionMetadata[] = [
  {
    name: 'describeTicket',
    description: '读取当前工单状态。',
    paramsSchema: noParamsSchema(),
    usageRules: ['用户询问状态或下一步时调用。'],
    failureModes: [],
    examples: [
      {
        intent: '用户要求查看工单状态',
        args: {},
      },
    ],
  },
  {
    name: 'setPriority',
    description: '设置当前工单优先级。',
    paramsSchema: paramsSchema({
      priority: stringSchema('优先级，例如 low、normal、high。', { minLength: 1 }),
    }, ['priority']),
    requiredBeforeCall: ['必须先用 module_find 定位当前 support-ticket 实例 path。'],
    usageRules: ['只在用户明确要求调整优先级时调用。'],
    failureModes: [
      { code: 'INVALID_PRIORITY', when: 'priority 为空或非法', fix: '向用户确认目标优先级。' },
    ],
    examples: [
      {
        user: '把这个工单调成高优先级',
        args: { priority: 'high' },
      },
    ],
    antiExamples: [
      {
        user: '我看看状态',
        reason: '只是查看状态，不应修改优先级。',
      },
    ],
  },
]

export class TicketAiModule extends AiModule {
  public constructor(private readonly service: TicketService) {
    super({
      kind: TICKET_KIND,
      name: '支持工单',
      description: '支持工单处理根模块。',
      functions: TICKET_FUNCTIONS,
      find: (ctx, childKind, query) => {
        if (ctx.segments.length !== 0 || childKind !== TICKET_KIND) {
          return AiModuleResult.ok<readonly AiModuleInstanceRef[]>([])
        }
        const id = typeof query['id'] === 'string'
          ? query['id']
          : ctx.host?.moduleInstanceId ?? 'ticket-1'
        return AiModuleResult.ok([{ id, label: `工单 ${id}` }])
      },
    })
  }

  protected override runFunction(
    ctx: AiModulePathContext,
    functionName: string,
    args: Readonly<Record<string, AiJsonValue>>,
  ): AiModuleResult<AiJsonValue> {
    const ticketId = ctx.host?.moduleInstanceId ?? ctx.segment?.id ?? ''
    switch (functionName) {
      case 'describeTicket':
        return this.service.describe(ticketId)
      case 'setPriority':
        return this.service.setPriority(ticketId, String(args['priority']))
      default:
        return AiModuleResult.failCode('FUNCTION_NOT_IMPLEMENTED', `未实现函数：${functionName}`)
    }
  }
}
```

## registration.ts

```ts
import {
  createAiBusinessKit,
} from '@spark-view/spark-ai/agent'
import type { AiAgentRegistration } from '@spark-view/spark-ai/agent'
import {
  paramsSchema,
  stringSchema,
  type AiJsonParamShape,
  type AiJsonParams,
} from '@spark-view/spark-ai/json'
import { TicketAiModule } from './modules'
import { TicketService } from './service'

export const TICKET_BUSINESS_ID = 'supportTicket'

export type TicketRunInput = AiJsonParamShape<{
  ticketId: string
  message: string
}>

const TICKET_INPUT_SCHEMA = paramsSchema({
  ticketId: stringSchema('当前工单 ID。', { minLength: 1 }),
  message: stringSchema('用户本轮诉求。', { minLength: 1 }),
}, ['ticketId', 'message'])

export function createTicketRegistration(): AiAgentRegistration<TicketRunInput> {
  const service = new TicketService()
  const kit = createAiBusinessKit<TicketRunInput>({
    businessId: TICKET_BUSINESS_ID,
    name: '支持工单助手',
    description: '支持工单助手。',
    rootModule: new TicketAiModule(service),
    input: {
      paramsSchema: TICKET_INPUT_SCHEMA,
      identityField: 'ticketId',
      messageField: 'message',
      normalize: (input) => ({
        ticketId: requireText(input, 'ticketId'),
        message: requireText(input, 'message'),
      }),
      systemPrompt: (input) =>
        `首轮先定位当前工单：module_find({ path: "/", childKind: "support-ticket", query: { id: "${input.ticketId}" } })。`,
    },
  })
  return kit.registration
}

function requireText(input: AiJsonParams, fieldName: 'ticketId' | 'message'): string {
  const value = input[fieldName]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`ticket input.${fieldName} 必须是非空字符串。`)
  }
  return value.trim()
}
```

## host.ts

```ts
import { createAiAgentHost } from '@spark-view/spark-ai/agent'
import { createTicketRegistration } from './registration'

const host = createAiAgentHost({
  turnCallbacks: createAiAgentTurnCallbacks(),
  maxToolRounds: 8,
}).register('ticketAssistant', createTicketRegistration())

await host.run('ticketAssistant', {
  ticketId: 'T-1001',
  message: '把这个工单调成高优先级。',
})
```

## 最小测试

```ts
import { describe, expect, it } from 'vitest'
import { AiModuleRuntime } from '@spark-view/spark-ai/modules'
import { TicketAiModule } from './modules'
import { TicketService } from './service'

describe('TicketAiModule', () => {
  it('通过 direct function 设置工单优先级', async () => {
    const runtime = new AiModuleRuntime()
    runtime.register(new TicketAiModule(new TicketService()))

    expect(runtime.inspect().ok).toBe(true)
    await expect(runtime.executeTool('setPriority', {
      path: '/support-ticket[T-1001]',
      args: { priority: 'high' },
    })).resolves.toMatchObject({
      ok: true,
      data: { ticketId: 'T-1001', priority: 'high' },
    })
  })
})
```
