export type BlueprintExecutionMode = 'inline' | 'subagent'

export interface BlueprintPlanItem {
  id: string
  title: string
  action: string
  status: 'pending' | 'done'
  note?: string
  dependsOn?: string[]
  relatedPlanItemIds?: string[]
  executionMode?: BlueprintExecutionMode
  subagentGoal?: string
}

export interface BlueprintCheckpoint {
  id: string
  title: string
  plannedActions: string[]
  planItems: BlueprintPlanItem[]
  validation: string
  status: 'pending' | 'done'
  note?: string
  dependsOn?: string[]
  relatedCheckpointIds?: string[]
  executionMode?: BlueprintExecutionMode
  subagentGoal?: string
}

export interface ExecutionBlueprint {
  version: 1
  userGoal: string
  currentCheckpointId: string
  currentPlanItemId: string
  openQuestions: string[]
  checkpoints: BlueprintCheckpoint[]
  lastReflection?: string
}
