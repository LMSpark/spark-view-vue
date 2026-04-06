<template>
  <el-button
    v-if="isVisible"
    :type="buttonType"
    :size="buttonSize"
    :plain="plain"
    :text="textMode"
    :bg="bg"
    :link="linkMode"
    :round="round"
    :circle="circle"
    :loading="loading"
    :disabled="isDisabled"
    :auto-insert-space="autoInsertSpace"
    :color="color"
    :dark="dark"
    v-bind="$attrs"
  >
    {{ label }}
    <SparkComponentRenderer
      v-for="(child, index) in resolvedChildren"
      :key="nodeId(child) ?? `r-button-child-${index}`"
      :config="child"
    />
  </el-button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent, type SparkNode } from '../../internal'

interface Props extends SparkNode {
  children?: SparkNode[]
  label?: string
  buttonType?: '' | 'default' | 'primary' | 'success' | 'warning' | 'info' | 'danger' | 'text'
  buttonSize?: 'large' | 'default' | 'small'
  plain?: boolean
  textMode?: boolean
  bg?: boolean
  linkMode?: boolean
  round?: boolean
  circle?: boolean
  loading?: boolean
  autoInsertSpace?: boolean
  color?: string
  dark?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-button',
  buttonType: 'default',
  buttonSize: 'default',
  plain: false,
  textMode: false,
  bg: false,
  linkMode: false,
  round: false,
  circle: false,
  loading: false,
  autoInsertSpace: false,
  dark: false,
})

const { isVisible, isDisabled } = useSparkPageComponent(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>
