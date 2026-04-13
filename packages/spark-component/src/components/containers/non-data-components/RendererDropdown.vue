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
    v-bind="$attrs"
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
 * @skill r-dropdown
 * @description 下拉菜单容器，基于 el-dropdown 渲染触发器和菜单项，支持分裂按钮模式和命令事件。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent, type SparkNode } from '../../internal'

interface DropdownItem {
  label: string
  command?: string
  disabled?: boolean
  divided?: boolean
  icon?: string
}

interface RendererDropdownProps {
  type?: 'r-dropdown'
  children?: SparkNode[]
  items?: DropdownItem[]
  trigger?: 'hover' | 'click' | 'contextmenu'
  effect?: 'dark' | 'light'
  placement?: string
  hideOnClick?: boolean
  showTimeout?: number
  hideTimeout?: number
  splitButton?: boolean
  popperClass?: string
  maxHeight?: number | string
}

const props = withDefaults(defineProps<RendererDropdownProps>(), {
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
