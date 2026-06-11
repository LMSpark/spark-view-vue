<!--
@module app:layout/AppFooter
app 的 layout/AppFooter 模块。
该 DTS shard 当前不导出 ClassModel symbol。
-->
<template>
  <div class="app-footer">
    <slot>
      <span>{{ text }}</span>
    </slot>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  text?: string
}>(), {
  text: `© ${new Date().getFullYear()} SPARK AppWorks — SPARK 融合平台 · 应用工场`,
})
</script>

<style scoped>
.app-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}
</style>
