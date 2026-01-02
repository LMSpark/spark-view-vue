<template>
  <div class="app">
    <Navbar />
    <main class="main-content">
      <router-view />
    </main>
    <footer class="footer">
      <p>© 2026 SPARK.View Team | MIT License</p>
      <div class="footer-links">
        <a href="https://github.com/your-org/spark-view-vue" target="_blank">GitHub</a>
        <span>·</span>
        <router-link to="/home">首页</router-link>
        <span>·</span>
        <router-link to="/editor">编辑器</router-link>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import Navbar from './components/Navbar.vue';
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  line-height: 1.5;
  color: #333;
  background: #f9f9f9;
}

#app {
  min-height: 100vh;
}

.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.main-content {
  flex: 1;
  padding-top: 0;
}

.footer {
  background: #333;
  color: white;
  padding: 32px 20px;
  text-align: center;
}

.footer p {
  margin: 0 0 12px 0;
  font-size: 14px;
}

.footer-links {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  font-size: 14px;
}

.footer-links a {
  color: #667eea;
  text-decoration: none;
  transition: color 0.2s;
}

.footer-links a:hover {
  color: #764ba2;
  text-decoration: underline;
}

.footer-links span {
  color: #666;
}
</style>
