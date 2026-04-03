/**
 * Blueprint Methods — 兼容 re-export
 *
 * 实际实现已移入 blueprint-domain.ts（DomainProvider 模式）。
 * 本文件仅保留 re-export，避免 dist 中的旧引用断链。
 */
export {
  blueprintCreate,
  blueprintDescribe,
  blueprintAdvance,
  blueprintItemAdvance,
  blueprintRevise,
} from './blueprint-domain'
