import {
  createVisibilityContainerZeroCode,
  type VisibilityContainerZeroCodeOptions,
} from '../../support/visibility-container-zero-code.js'

export function createRendererDrawerZeroCode(options: VisibilityContainerZeroCodeOptions) {
  const { api: drawerApi, ...handlers } = createVisibilityContainerZeroCode(options)
  return {
    drawerApi,
    ...handlers,
  }
}
