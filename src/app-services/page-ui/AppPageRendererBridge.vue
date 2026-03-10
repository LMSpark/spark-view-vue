<template>
  <FCPageRenderer v-bind="forwardedProps" :page-service="mergedPageService" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { FCPageRenderer } from '@spark-view/spark-component'
import type { PageRendererOptions } from '@spark-view/spark-component'
import { appPageUiService } from './pageUiService'

const props = withDefaults(defineProps<PageRendererOptions>(), {
  enableCssScope: true,
  enableDataSet: true,
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