import {
  createVisibilityContainerZeroCode,
  type VisibilityContainerZeroCodeOptions,
} from '../../support/visibility-container-zero-code.js'

export function createRendererDialogZeroCode(options: VisibilityContainerZeroCodeOptions) {
  const { api: dialogApi, ...handlers } = createVisibilityContainerZeroCode(options)
  return {
    dialogApi,
    ...handlers,
  }
}
