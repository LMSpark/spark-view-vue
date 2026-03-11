<template>
  <FCPageRenderer v-bind="forwardedProps" :page-service="mergedPageService" :module-context="moduleContext" />
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'
import { FCPageRenderer } from '@spark-view/spark-component'
import type { PageRendererOptions } from '@spark-view/spark-component'
import type { IModuleContext } from '@spark-view/spark-utils'
import { appPageUiService } from '@spark-view/spark-app'
import { NAV_KEY } from '@spark-view/spark-app'

const props = withDefaults(defineProps<PageRendererOptions>(), {
  enableCssScope: true,
  enableDataSet: true,
})

const nav = inject(NAV_KEY, undefined)

const moduleContext = computed<IModuleContext | null>(() => {
  const state = nav?.moduleContext.value
  if (!state) return null
  return {
    selected: state.selected,
    items: state.items,
    nodeId: state.nodeId,
  }
})

const mergedPageService = computed(() => ({
  ...(props.pageService ?? {}),
  ...appPageUiService,
}))

const forwardedProps = computed(() => ({
  ...(props.configLoader !== undefined ? { configLoader: props.configLoader } : {}),
  ...(props.pageId !== undefined ? { pageId: props.pageId } : {}),
  ...(props.pageConfig !== undefined ? { pageConfig: props.pageConfig } : {}),
  ...(props.messageService !== undefined ? { messageService: props.messageService } : {}),
  ...(props.confirmService !== undefined ? { confirmService: props.confirmService } : {}),
  ...(props.beforeLoad !== undefined ? { beforeLoad: props.beforeLoad } : {}),
  ...(props.afterLoad !== undefined ? { afterLoad: props.afterLoad } : {}),
  ...(props.onError !== undefined ? { onError: props.onError } : {}),
  ...(props.formCreateOptions !== undefined ? { formCreateOptions: props.formCreateOptions } : {}),
  enableCssScope: props.enableCssScope,
  enableDataSet: props.enableDataSet,
}))
</script>