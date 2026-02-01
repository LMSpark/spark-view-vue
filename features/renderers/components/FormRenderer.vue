<template>
  <el-form
    ref="formRef"
    :model="formData"
    :label-width="config.labelWidth || '100px'"
    :label-position="config.labelPosition || 'right'"
    :rules="config.rules"
    :inline="config.inline"
    :size="config.size"
    :disabled="config.disabled"
    class="form-renderer"
    v-bind="formAttrs"
    @submit="handleSubmit"
    @validate="handleValidate"
  >
    <!-- 具名插槽：表单头部 -->
    <template v-if="$slots.header" #default="">
      <slot name="header" :model="formData" />
    </template>
    
    <!-- 默认插槽：表单项内容（递归渲染子节点） -->
    <slot :model="formData" :validate="handleValidate" />
    
    <!-- 具名插槽：表单底部操作按钮 -->
    <slot name="footer" :model="formData" :submit="handleSubmit" />
  </el-form>
</template>

<script lang="ts">
import { defineComponent, computed, ref } from 'vue'
import { ElForm } from 'element-plus'
import type { FormInstance } from 'element-plus'

export default defineComponent({
  name: 'FormRenderer',
  components: {
    ElForm
  },
  props: {
    config: {
      type: Object,
      required: true
    },
    parentType: String,
    data: Object
  },
  emits: ['update', 'submit', 'validate'],
  setup(props, { emit, expose }) {
    const formRef = ref<FormInstance>()
    const formData = computed(() => props.data || {})
    
    // 提取其他表单属性
    const formAttrs = computed(() => {
      // Intentionally unused extracted props (prefixed with _)
      const { labelWidth: _labelWidth, labelPosition: _labelPosition, rules: _rules, inline: _inline, size: _size, disabled: _disabled, children: _children, ...attrs } = props.config
      return attrs
    })
    
    const handleSubmit = (event: Event) => {
      emit('submit', event)
    }
    
    const handleValidate = (prop: string | string[], isValid: boolean, message: string) => {
      emit('validate', { prop, isValid, message })
    }
    
    // 暴露表单方法给父组件
    expose({
      validate: () => formRef.value?.validate(),
      validateField: (props: string | string[]) => formRef.value?.validateField(props),
      resetFields: () => formRef.value?.resetFields(),
      clearValidate: (props?: string | string[]) => formRef.value?.clearValidate(props)
    })
    
    return {
      formRef,
      formData,
      formAttrs,
      handleSubmit,
      handleValidate
    }
  }
})
</script>

<style scoped>
.form-renderer {
  width: 100%;
}
</style>
