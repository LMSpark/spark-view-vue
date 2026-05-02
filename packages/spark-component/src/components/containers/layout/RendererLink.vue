<template>
  <el-link
    v-if="effectiveVisible"
    :type="linkType"
    :underline="underline"
    :disabled="effectiveDisabled"
    :href="href"
    :target="target"
  >
    {{ label }}
    <SparkComponentRenderer
      v-for="(child, index) in resolvedChildren"
      :key="nodeId(child) ?? `r-link-child-${index}`"
      :config="child"
    />
  </el-link>
</template>

<script setup lang="ts">
/**
 * @skill r-link
 * @description 链接组件，可渲染子内容。
 */
import { computed } from 'vue'
import type { IDataRow } from '@spark-view/spark-data'
import {
  DATA_ROW,
  DATA_SOURCE,
  SparkComponentRenderer,
  getSparkNodeChildren,
  nodeId,
  useSparkPageComponent,
  type SparkNode,
} from '../../internal'
import type { RLinkProps } from './RendererLink.props'
import { usePermission, extractModelPermission } from '../../../permission'



const props = withDefaults(defineProps<RLinkProps>(), {
  type: 'r-link',
  linkType: 'default',
  underline: true,
  target: '_self',
})

const { isVisible, isDisabled, resolvedProps, sparkConsume } = useSparkPageComponent(props)
const permission = usePermission()

function readActionNode(): SparkNode {
  return {
    type: props.type,
    props: resolvedProps.value,
    ...(props.children !== undefined ? { children: props.children } : {}),
  }
}

const permissionAllowed = computed(() => {
  const actionNode = readActionNode()
  const dataSource = sparkConsume(DATA_SOURCE)
  const dataRow = sparkConsume(DATA_ROW)
  const modelPerm = extractModelPermission(dataSource)
  const scopedRow = (dataRow ?? ((dataSource as { currentRow?: IDataRow } | null)?.currentRow)) ?? undefined

  return permission.isModelActionAllowed(actionNode, modelPerm)
    && permission.isRowActionAllowed(actionNode, scopedRow)
})

const permissionDeniedMode = computed<'disable' | 'hide'>(() => {
  const mode = resolvedProps.value['permissionDeniedMode']
  return mode === 'hide' ? 'hide' : 'disable'
})

const effectiveVisible = computed(() => {
  if (!isVisible.value) return false
  if (permissionAllowed.value) return true
  return permissionDeniedMode.value !== 'hide'
})

const effectiveDisabled = computed(() => {
  if (!permissionAllowed.value && permissionDeniedMode.value === 'disable') {
    return true
  }
  return isDisabled.value
})

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>


