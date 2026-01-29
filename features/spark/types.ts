// Local types for SPARK feature-specific helpers.
// TODO: Move these shared types into `@spark-view/spark-core` and export from core.
import type { ComputedRef, Component } from 'vue'

export interface RendererDebugProvider {
  componentType: string
  isRegistered: ComputedRef<boolean> | boolean
  resolvedComponent: Component | null
  childCount: ComputedRef<number> | number
}
