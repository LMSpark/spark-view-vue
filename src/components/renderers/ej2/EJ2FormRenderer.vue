<template>
  <div class="e-form-container">
    <div class="e-form-header">
      {{ config.title || '表单' }}
    </div>
    <div class="e-form-body">
      <!-- 默认插槽：表单内容 -->
      <slot />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  name: 'EJ2FormRenderer',
  props: {
    config: {
      type: Object,
      required: true
    },
    parentType: String,
    data: Object
  }
})
</script>

<style scoped>
.e-form-container {
  padding: 20px;
  background: #fff;
  border-radius: 4px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.e-form-header {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 20px;
  padding-bottom: 10px;
  border-bottom: 1px solid #e4e7ed;
}

.e-form-body {
  max-width: 600px;
}
</style>
