import { describe, expect, it } from 'vitest'

import {
  pageDesignParamsToJsonSchema,
  runPageDesignHeadless,
  type PageDesignLlmTurn,
} from '../packages/spark-ai/src'
import {
  SparkNodeTree,
  type PageDesignEditHost,
} from '../packages/spark-page-config/src'
import { DataSetCrudTool } from '../packages/spark-data/src'

function createEditHost(): PageDesignEditHost {
  let script = 'export default {}'
  let style = '.page {}'
  const tree = SparkNodeTree.fromRuleJson([
    {
      id: 'root-text',
      type: 'r-text',
      props: { text: 'hello' },
    },
  ])
  const dataSetTool = DataSetCrudTool.fromJson({
    dataSetName: 'PageDataSet',
    tables: {},
  })

  return {
    getNodeTree: () => tree,
    getDataSetTool: () => dataSetTool,
    readScript: () => script,
    writeScript: (content) => { script = content },
    readStyle: () => style,
    writeStyle: (content) => { style = content },
  }
}

describe('pageDesign headless runner', () => {
  it('projects OpenAI-safe tool names and loops tool results back to the LLM transport', async () => {
    const seenMessages: number[] = []
    const turn: PageDesignLlmTurn = async (request) => {
      seenMessages.push(request.messages.length)
      const describeProgress = request.tools.find((tool) => tool.function.name.endsWith('_describeProgress'))
      expect(describeProgress?.function.name).toBe('pageDesign_lifecycle_describeProgress')
      expect(describeProgress?.function.description).toContain('Runtime action:')

      if (seenMessages.length === 1) {
        return {
          text: '',
          toolCalls: [
            {
              id: 'call_progress',
              type: 'function',
              function: {
                name: describeProgress?.function.name ?? '',
                arguments: '{}',
              },
            },
          ],
        }
      }

      expect(request.messages.at(-1)).toMatchObject({
        role: 'tool',
        tool_call_id: 'call_progress',
      })
      return {
        text: '工作评价页面已完成。',
      }
    }

    const toolEvents: string[] = []
    const result = await runPageDesignHeadless({
      pageId: 'work-evaluation',
      instanceId: 'headless-test',
      prompt: '新建一个工作评价页面',
      getEditToolHost: () => createEditHost(),
      turn,
      onToolResult: (event) => {
        toolEvents.push(`${event.toolName}:${event.result.ok}`)
      },
    })

    expect(result).toMatchObject({
      ok: true,
      pageId: 'work-evaluation',
      instanceId: 'headless-test',
      rounds: 2,
      text: '工作评价页面已完成。',
    })
    expect(toolEvents).toEqual(['pageDesign_lifecycle_describeProgress:true'])
    expect(result.toolResults).toHaveLength(1)
  })

  it('asks for a final visible answer when the LLM returns empty text after tool calls', async () => {
    const seenLastMessages: string[] = []
    const turn: PageDesignLlmTurn = async (request) => {
      const describeProgress = request.tools.find((tool) => tool.function.name.endsWith('_describeProgress'))
      seenLastMessages.push(request.messages.at(-1)?.content ?? '')

      if (seenLastMessages.length === 1) {
        return {
          text: '',
          toolCalls: [
            {
              id: 'call_progress',
              type: 'function',
              function: {
                name: describeProgress?.function.name ?? '',
                arguments: '{}',
              },
            },
          ],
        }
      }

      if (seenLastMessages.length === 2) {
        expect(request.messages.at(-1)).toMatchObject({
          role: 'tool',
          tool_call_id: 'call_progress',
        })
        return { text: '' }
      }

      expect(request.messages.at(-1)).toMatchObject({
        role: 'user',
      })
      expect(request.messages.at(-1)?.content).toContain('最终中文答复')
      return { text: '这个页面用于查看和调整页面配置。' }
    }

    const result = await runPageDesignHeadless({
      pageId: 'dataset-demo',
      instanceId: 'headless-empty-final-test',
      prompt: '这个干什么用的？',
      getEditToolHost: () => createEditHost(),
      turn,
      maxRounds: 4,
    })

    expect(result).toMatchObject({
      ok: true,
      rounds: 3,
      text: '这个页面用于查看和调整页面配置。',
    })
  })

  it('converts page-design parameter DSL into JSON Schema for function calling', () => {
    expect(pageDesignParamsToJsonSchema({
      content: 'string — 完整文本内容',
      keyword: 'string? — 搜索词',
    })).toEqual({
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: '完整文本内容',
        },
        keyword: {
          type: 'string',
          description: '搜索词',
        },
      },
      required: ['content'],
      additionalProperties: false,
    })

    expect(pageDesignParamsToJsonSchema({
      required: ['action'],
      action: 'string — 函数 action',
    })).toMatchObject({
      type: 'object',
      required: ['action'],
      properties: {
        action: {
          type: 'string',
        },
      },
    })
  })
})
