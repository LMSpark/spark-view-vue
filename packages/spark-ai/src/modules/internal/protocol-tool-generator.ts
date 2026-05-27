import type { AiJsonSchemaObject } from '../../json'
import type { AiModuleRegistry } from './module-kind-registry'

export type AiModuleToolSpec = Readonly<{
  type: 'function'
  function: {
    readonly name: ProtocolToolName
    readonly description: string
    readonly parameters: AiJsonSchemaObject
    readonly strict?: boolean
  }
}>

export type ProtocolToolName =
  | 'module_query'
  | 'module_guide'
  | 'module_find'
  | 'module_attr'
  | 'module_call'
  | 'human_question'

export const PROTOCOL_TOOL_NAMES: Readonly<{
  moduleQuery: 'module_query'
  moduleGuide: 'module_guide'
  moduleFind: 'module_find'
  moduleAttr: 'module_attr'
  moduleCall: 'module_call'
  humanQuestion: 'human_question'
}> = Object.freeze({
  moduleQuery: 'module_query',
  moduleGuide: 'module_guide',
  moduleFind: 'module_find',
  moduleAttr: 'module_attr',
  moduleCall: 'module_call',
  humanQuestion: 'human_question',
})

export class ProtocolToolGenerator {
  public constructor(
    private readonly kinds: AiModuleRegistry,
  ) {}

  public generate(): readonly AiModuleToolSpec[] {
    return [
      this.buildModuleQuery(),
      this.buildModuleGuide(),
      this.buildModuleFind(),
      this.buildModuleAttr(),
      this.buildModuleCall(),
      this.buildHumanQuestion(),
    ]
  }

  private buildModuleQuery(): AiModuleToolSpec {
    return {
      type: 'function',
      function: {
        name: PROTOCOL_TOOL_NAMES.moduleQuery,
        description: [
          'Query the registered AiModule catalog. Use this before choosing a path, function, attribute, or child module.',
          'Returns compact module summaries from the current runtime registration snapshot.',
          `Registered module count: ${String(this.kinds.list().length)}.`,
        ].join('\n'),
        parameters: {
          type: 'object',
          properties: {
            kind: { type: 'string', description: 'Optional exact module kind filter.' },
            parentKind: { type: 'string', description: 'Optional parent kind filter. Use "root" for root modules.' },
            keyword: { type: 'string', description: 'Optional keyword matching kind, name, description, payloads, attributes, functions, or children.' },
            includeFunctions: {
              type: 'boolean',
              description: 'When true, also returns matching function summaries.',
            },
          },
          required: [],
          additionalProperties: false,
        },
      },
    }
  }

  private buildModuleGuide(): AiModuleToolSpec {
    return {
      type: 'function',
      function: {
        name: PROTOCOL_TOOL_NAMES.moduleGuide,
        description: [
          'Read detailed guidance for one module kind or one function.',
          'Use { kind } to inspect module metadata. Use { kind, functionName } to inspect a function contract before module_call.',
        ].join('\n'),
        parameters: {
          type: 'object',
          properties: {
            kind: { type: 'string', description: 'Registered module kind.' },
            functionName: { type: 'string', description: 'Optional declared function name on the module kind.' },
          },
          required: ['kind'],
          additionalProperties: false,
        },
      },
    }
  }

  private buildModuleFind(): AiModuleToolSpec {
    return {
      type: 'function',
      function: {
        name: PROTOCOL_TOOL_NAMES.moduleFind,
        description: [
          'Find or list module instances using a concrete parent path.',
          'Use path="/" for root instances. Provide childKind and query to search; omit query to list children.',
        ].join('\n'),
        parameters: {
          type: 'object',
          properties: {
            path: pathProperty(true),
            childKind: {
              type: 'string',
              description: 'Optional child module kind filter. Required when query is provided.',
            },
            query: instanceQueryProperty(),
          },
          required: ['path'],
          additionalProperties: false,
        },
      },
    }
  }

  private buildModuleAttr(): AiModuleToolSpec {
    return {
      type: 'function',
      function: {
        name: PROTOCOL_TOOL_NAMES.moduleAttr,
        description: [
          'Read or write one declared attribute on the module identified by path.',
          'Set op="get" to read. Set op="set" and provide value to write.',
        ].join('\n'),
        parameters: {
          type: 'object',
          properties: {
            op: {
              type: 'string',
              enum: ['get', 'set'],
              description: 'Attribute operation.',
            },
            path: pathProperty(),
            attrName: { type: 'string', description: 'Declared attribute name on the path tail kind.' },
            value: {
              description: 'Value for op="set"; must match the declared attribute schema.',
              type: ['string', 'number', 'boolean', 'object', 'array', 'null'],
            },
          },
          required: ['op', 'path', 'attrName'],
          additionalProperties: false,
        },
      },
    }
  }

  private buildModuleCall(): AiModuleToolSpec {
    return {
      type: 'function',
      function: {
        name: PROTOCOL_TOOL_NAMES.moduleCall,
        description: [
          'Call a declared function on the module identified by path.',
          'Instance identity is resolved only from path and the current session scope. Do not pass protocol-only $paths.',
        ].join('\n'),
        parameters: {
          type: 'object',
          properties: {
            path: pathProperty(),
            functionName: { type: 'string', description: 'Declared function name on the path tail kind.' },
            args: {
              type: 'object',
              description: 'Business arguments for the function. Shape is described by module_guide.',
              additionalProperties: true,
            },
          },
          required: ['path', 'functionName', 'args'],
          additionalProperties: false,
        },
      },
    }
  }

  private buildHumanQuestion(): AiModuleToolSpec {
    return {
      type: 'function',
      function: {
        name: PROTOCOL_TOOL_NAMES.humanQuestion,
        description: [
          'Prepare a human-facing question when required facts or confirmations are missing.',
          'Use this to pause tool execution and make the next user prompt precise.',
        ].join('\n'),
        parameters: {
          type: 'object',
          properties: {
            context: { type: 'string', description: 'What the agent is trying to complete.' },
            reason: { type: 'string', description: 'Why guessing would be risky or impossible.' },
            missingFacts: {
              type: 'array',
              description: 'Missing user facts, ordered by importance.',
              items: { type: 'string' },
            },
            candidateOptions: {
              type: 'array',
              description: 'Optional choices if they help the user answer quickly.',
              items: { type: 'string' },
            },
          },
          required: ['context', 'reason'],
          additionalProperties: false,
        },
      },
    }
  }
}

function pathProperty(allowRoot = false): AiJsonSchemaObject {
  return {
    type: 'string',
    description: allowRoot
      ? 'Module path. Use "/" for the root, or /<kind>[<id>]/... for concrete instances.'
      : 'Concrete module path such as /<kind>[<id>]/<childKind>[<id>].',
  }
}

function instanceQueryProperty(): AiJsonSchemaObject {
  return {
    type: 'object',
    description: 'Optional business query object interpreted by the target module finder.',
    properties: {
      id: { type: 'string', description: 'Exact instance id.' },
      label: { type: 'string', description: 'Visible label or name.' },
      keyword: { type: 'string', description: 'Loose keyword.' },
      hint: { type: 'string', description: 'Natural-language lookup hint.' },
      filters: {
        type: 'object',
        description: 'Business-specific filters.',
        additionalProperties: true,
      },
    },
    additionalProperties: true,
  }
}

export function isProtocolToolName(name: string): name is ProtocolToolName {
  const known: readonly ProtocolToolName[] = Object.values(PROTOCOL_TOOL_NAMES)
  return known.some((candidate) => candidate === name)
}
