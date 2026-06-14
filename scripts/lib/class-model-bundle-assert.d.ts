export type AssertClassModelBundleCompleteOptions = Readonly<{
  requireParamsSchema?: boolean
}>

export function assertClassModelBundleComplete(
  bundleRoot: string,
  options?: AssertClassModelBundleCompleteOptions,
): void

export function assertClassModelGuideParamsSchema(bundleRoot: string): void

export function assertClassModelSemanticGapsZero(bundleRoot: string): void
