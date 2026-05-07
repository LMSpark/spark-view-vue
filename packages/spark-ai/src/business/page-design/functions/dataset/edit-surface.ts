export const PAGE_DESIGN_HIDDEN_DATASET_METHODS: ReadonlySet<string> = new Set([
  'toJson',
  'listAggregates',
  'getAggregate',
  'addAggregate',
  'updateAggregate',
  'removeAggregate',
])

export function isPageDesignDatasetMethodExposed(methodName: string): boolean {
  return !PAGE_DESIGN_HIDDEN_DATASET_METHODS.has(methodName)
}
