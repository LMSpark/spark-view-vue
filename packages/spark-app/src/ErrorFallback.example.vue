<template>
  <div class="error-fallback">
    <div class="error-content">
      <h1 class="error-icon">⚠️</h1>
      <h2 class="error-title">应用启动失败</h2>
      <p class="error-message">{{ error.message }}</p>
      <button class="reload-button" @click="reload">
        重新加载
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  error: Error
}>()

const reload = () => {
  location.reload()
}
</script>

<style scoped>
.error-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  font-family: system-ui, sans-serif;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.error-content {
  text-align: center;
  max-width: 500px;
  padding: 2rem;
}

.error-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.error-title {
  margin-bottom: 1rem;
}

.error-message {
  opacity: 0.9;
  margin-bottom: 2rem;
}

.reload-button {
  padding: 0.75rem 2rem;
  background: white;
  color: #667eea;
  border: none;
  border-radius: 0.5rem;
  font-size: 1rem;
  cursor: pointer;
  font-weight: 600;
}

.reload-button:hover {
  opacity: 0.9;
}
</style>
