<template>
  <div class="e-form-container">
    <div v-if="config.title" class="e-form-header">
      <!-- 具名插槽：表单标题 -->
      <slot name="header" :title="config.title">
        {{ config.title }}
      </slot>
    </div>
    <div class="e-form-body">
      <!-- 默认插槽：表单内容（递归渲染子节点）-->
      <slot :data="data" :config="config" />
    </div>
    <div v-if="$slots.footer" class="e-form-footer">
      <!-- 具名插槽：表单底部 -->
      <slot name="footer" :data="data" />
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

.e-form-footer {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #e4e7ed;
  text-align: right;
}
</style>
