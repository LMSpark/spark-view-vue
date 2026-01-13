<template>
  <el-form
    :model="formData"
    :label-width="config.labelWidth || '100px'"
    :label-position="config.labelPosition || 'right'"
    :rules="config.rules"
    :inline="config.inline"
    :size="config.size"
    class="form-renderer"
    @submit="handleSubmit"
    @validate="handleValidate"
  >
    <!-- 默认插槽：表单项内容 -->
    <slot />
    
    <!-- 具名插槽：表单底部操作按钮 -->
    <template #footer>
      <slot name="footer" />
    </template>
    
    <!-- 具名插槽：表单头部 -->
    <template #header>
      <slot name="header" />
    </template>
  </el-form>
</template>

<script lang="ts">
import { defineComponent, computed } from 'vue'
import { ElForm } from 'element-plus'

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
  setup(props, { emit }) {
    const formData = computed(() => props.data || {})
    
    const handleSubmit = (event: Event) => {
      emit('submit', event)
    }
    
    const handleValidate = (prop: string | string[], isValid: boolean, message: string) => {
      emit('validate', { prop, isValid, message })
    }
    
    return {
      formData,
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
