<template>
  <el-mention
    v-if="isVisible"
    v-model="textValue"
    :options="resolvedOptions"
    :prefix="prefix"
    :split="split"
    :filter-option="filterOption"
    :placement="placement"
    :show-arrow="showArrow"
    :offset="offset"
    :whole="whole"
    :check-is-whole="checkIsWhole"
    :loading="loading"
    :disabled="isDisabled"
    :type="inputType"
    :placeholder="placeholder"
    :rows="rows"
    v-bind="$attrs"
    @select="handleSelect"
    @search="handleSearch"
  />
</template>

<script setup lang="ts">
/**
 * @skill r-mention
 * @description 提及输入字段，绑定 string 值，基于 el-mention 支持 @ 前缀触发用户或实体搜索选择。
 */
import { ref, computed, watch } from 'vue'
import { useSparkPageComponent } from '../../internal'
import type { RMentionProps, MentionOption } from './FieldMention.props'

const props = withDefaults(defineProps<RMentionProps>(), {
  type: 'r-mention',
  prefix: '@',
  split: ' ',
  placement: 'bottom',
  showArrow: false,
  inputType: 'text',
  rows: 3,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  select: [option: MentionOption, prefix: string]
  search: [pattern: string, prefix: string]
}>()

const { isVisible, isDisabled } = useSparkPageComponent(props)

const resolvedOptions = computed(() => props.options ?? [])

const textValue = ref(props.modelValue ?? '')

watch(() => props.modelValue, (v) => {
  if (v !== undefined) textValue.value = v
})

watch(textValue, (v) => {
  emit('update:modelValue', v)
})

function handleSelect(option: MentionOption, prefix: string) {
  emit('select', option, prefix)
}

function handleSearch(pattern: string, prefix: string) {
  emit('search', pattern, prefix)
}
</script>
