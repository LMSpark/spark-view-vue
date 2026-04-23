/**
 * PageFileDocument — SSOT page-file document abstraction for DevSystem.
 *
 * Each of the 4 page files (rule.json / pagedata.json / script.js / style.css) is
 * wrapped as a PageFileDocument<TModel>. The model is the single source of truth;
 * text is a derived projection. Undo/redo is delegated to the model-level history
 * (SparkNodeTree / DataSetCrudTool / SnapshotHistory<string>).
 *
 * This replaces the previous dual-plane (editFiles text + pageRuleTree /
 * pageDataTool + fileTextHistory) design.
 */
import type { ComputedRef, Ref, ShallowRef } from 'vue'

export const PAGE_FILE_NAMES = [
  'rule.json',
  'pagedata.json',
  'script.js',
  'style.css',
] as const
export type PageFileName = typeof PAGE_FILE_NAMES[number]

export type PageFileLoadState = 'idle' | 'loading' | 'loaded'

/**
 * Options when loading a text snapshot from a persistent source (server).
 */
export interface LoadFromTextOptions {
  /** Treat the loaded text as the clean saved baseline. Default: true. */
  markSaved?: boolean
}

export interface PageFileDocument<TModel = unknown> {
  readonly name: PageFileName

  /** Typed domain model. `null` means not loaded or parse failed. */
  readonly model: ShallowRef<TModel | null>

  /** Canonical text projection of the current model. Always in sync with model. */
  readonly text: ComputedRef<string>

  /** Last text persisted to the server. */
  readonly savedText: Ref<string>

  /** Load state for the current page. */
  readonly loadState: Ref<PageFileLoadState>

  /** Last parse/reconcile error (null = ok). */
  readonly parseError: Ref<string | null>

  /** true if `text !== savedText`. */
  readonly isDirty: ComputedRef<boolean>

  /** Whether the underlying model history can undo. */
  readonly canUndo: ComputedRef<boolean>

  /** Whether the underlying model history can redo. */
  readonly canRedo: ComputedRef<boolean>

  /**
   * Ingest a text snapshot (usually from server). Reconciles the model and the
   * derived text view. By default, marks `savedText = text` so `isDirty` becomes
   * false immediately after a clean load.
   */
  loadFromText(text: string, options?: LoadFromTextOptions): void

  /**
   * Accept a text edit from the user's text-editor view. Reconciles the model,
   * commits a new history entry, and updates `text`.
   */
  setText(text: string): void

  /**
   * Apply a direct mutation to the live model (e.g., designer action, AI tool).
   * Returns true if the mutation ran successfully. Implementations commit a new
   * history entry as side effect.
   */
  mutate(fn: (model: TModel) => void): boolean

  /** Step one undo entry in the underlying model history. */
  undo(): boolean

  /** Step one redo entry in the underlying model history. */
  redo(): boolean

  /** Mark the current text as persisted. After this, `isDirty` becomes false. */
  markSaved(): void

  /** Reset to an empty, idle state (used on page switch). */
  reset(): void

  /**
   * Adopt a new live model reference produced by an external owner (e.g., the
   * stills AI replacing the tree on undo). The document keeps treating this
   * reference as the single source of truth going forward.
   */
  replaceModel(next: TModel | null): void
}
