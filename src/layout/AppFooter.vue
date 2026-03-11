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
  text: '© 2025 SPARK View — Powered by spark-view',
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
