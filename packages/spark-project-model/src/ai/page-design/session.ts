/**
 * 页面设计编辑会话核心类型与契约。
 *
 * 包含 PageDesignEditSession、编辑宿主类型以及 Service 层契约类型。
 * PageDesignService 位于 page-design-service.ts。
 * 页面文件 IO 位于 model/page-file-api.ts，导航生命周期位于 navigation/operations.ts。
 */

import type { AiModulePayloadGuide } from '@spark-view/spark-ai/modules'
import type {
  PageDesignEditHost,
  PageDesignEditPhase,
  PageDesignNodeTree,
} from '../../contract/edit-host.contract'

// ── 编辑会话核心契约 ───────────────────────────────────────

/**
 * 单个 pageId 的 live edit 会话状态。
 *
 * 该对象只保存编辑态和已显式查询过的组件 payload guide；AI Host 会话历史、
 * turn stream 状态和后端 session 持久化均不在这里维护。
 */
export class PageDesignEditSession {
  phase: PageDesignEditPhase = 'idle'

  host: PageDesignEditHost | null = null

  private readonly guidedNodePayloads = new Map<string, AiModulePayloadGuide>()

  bindHost(host: PageDesignEditHost): void {
    this.host = host
  }

  getActiveNodeTree(): PageDesignNodeTree | null {
    return this.host?.getNodeTree?.() ?? null
  }

  notifyNodeTreeChanged(nodeTree: PageDesignNodeTree): void {
    this.host?.onNodeTreeChanged?.(nodeTree)
  }

  getActiveDataSetTool(): ReturnType<NonNullable<PageDesignEditHost['getDataSetTool']>> {
    return this.host?.getDataSetTool?.() ?? null
  }

  notifyDataSetChanged(tool: NonNullable<ReturnType<NonNullable<PageDesignEditHost['getDataSetTool']>>>): void {
    this.host?.onDataSetChanged?.(tool)
  }

  markNodePayloadGuided(key: string, guide: AiModulePayloadGuide): void {
    const normalized = key.trim()
    if (normalized.length > 0) this.guidedNodePayloads.set(normalized, guide)
  }

  hasGuidedNodePayload(key: string): boolean {
    return this.guidedNodePayloads.has(key.trim())
  }

  getGuidedNodePayload(key: string): AiModulePayloadGuide | null {
    return this.guidedNodePayloads.get(key.trim()) ?? null
  }

  listGuidedNodePayloads(): readonly string[] {
    return [...this.guidedNodePayloads.keys()].sort()
  }
}
