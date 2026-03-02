<template>
  <div v-if="loading" class="spark-page-loading">
    <slot name="loading">加载中...</slot>
  </div>
  <div v-else-if="error" class="spark-page-error">
    <slot name="error" :error="error">
      <h3>❌ 页面加载失败</h3>
      <p>{{ error }}</p>
    </slot>
  </div>
  <div v-else>
    <!-- 动态注入页面样式（自动添加作用域） -->
    <component :is="'style'" v-if="scopedCss">{{ scopedCss }}</component>
    
    <!-- 渲染页面内容 -->
    <div ref="pageContainer" :data-page="currentPageId" class="spark-page-container">
      <slot name="content" :rules="(boundRules as Rule[])">
        <form-create
          v-if="boundRules.length > 0"
          v-model:api="formApi"
          :rule="boundRules"
          :option="formCreateOptions"
        />
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * PageRenderer - SPARK 页面渲染引擎
 *
 * 纯视图层：模板绑定 + props / slots / expose 声明。
 * 全部编排逻辑由 usePageRenderer composable 承担。
 */
import { ref, getCurrentInstance } from 'vue'
import type { PageRendererOptions, Rule } from '../types'
import { usePageRenderer } from '../composables/usePageRenderer'

const props = withDefaults(defineProps<PageRendererOptions>(), {
  enableCssScope: true,
  enableDataSet: true
})

const pageContainer = ref<HTMLElement | null>(null)
// 在同步 setup() 中捕获 app 实例，供 usePageRenderer 注册脚本中的 Render* 组件
// 必须在此处捕获：usePageRenderer 内部的 loadPageConfig 是 async 函数，await 后 getCurrentInstance() 为 null
const vueApp = getCurrentInstance()?.appContext.app

const {
  loading,
  error,
  currentPageId,
  scopedCss,
  boundRules,
  formApi,
  formCreateOptions,
  loadPageConfig,
  rebindRules,
  pageContext,
  dataSet
} = usePageRenderer(props as PageRendererOptions, { pageContainer, vueApp })

defineExpose({
  reload: loadPageConfig,
  rebindRules,
  pageContext,
  formApi,
  dataSet
})
</script>

<style scoped>
.spark-page-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  color: #409eff;
  font-size: 14px;
}

.spark-page-error {
  padding: 20px;
  color: #f56c6c;
}

.spark-page-error h3 {
  margin: 0 0 10px;
  font-size: 16px;
}

.spark-page-error p {
  margin: 0;
  font-size: 14px;
}

.spark-page-container {
  width: 100%;
}
</style>
