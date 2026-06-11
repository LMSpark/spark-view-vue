<!--
@module @spark-appworks/spark-component:components/containers/layout/RendererDropdown
RendererDropdown 模块，属于 SPARK component container/layout-container。
组件目录: containers/layout。
该 DTS shard 当前不导出 ClassModel symbol。
-->
<template>
  <el-dropdown
    v-if="isVisible"
    :trigger="trigger"
    :effect="effect"
    :placement="placement"
    :disabled="isDisabled"
    :hide-on-click="hideOnClick"
    :show-timeout="showTimeout"
    :hide-timeout="hideTimeout"
    :split-button="splitButton"
    :popper-class="popperClass"
    :max-height="maxHeight"
  >
    <template #default>
      <SparkComponentRenderer
        v-for="(child, index) in triggerChildren"
        :key="nodeId(child) ?? `r-dropdown-trigger-${index}`"
        :config="child"
      />
    </template>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item
          v-for="(item, i) in items"
          :key="item.command ?? `dropdown-item-${i}`"
          :command="item.command"
          :disabled="item.disabled"
          :divided="item.divided"
          :icon="item.icon"
        >
          {{ item.label }}
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup lang="ts">
/**
 * @description 下拉菜单容器，支持分裂按钮模式和命令事件。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent } from '../../internal'
import type { RDropdownProps } from './RendererDropdown.props'

const props = withDefaults(defineProps<RDropdownProps>(), {
  type: 'r-dropdown',
  trigger: 'hover',
  effect: 'light',
  placement: 'bottom',
  hideOnClick: true,
  splitButton: false,
})

const { isVisible, isDisabled } = useSparkPageComponent(props)

const triggerChildren = computed(() => getSparkNodeChildren(props.children))
const items = computed(() => props.items ?? [])
</script>


