import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import './assets/style.css';

// 引入 Element Plus
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';

// 引入 form-create
import FcDesigner from '@form-create/designer';

// 引入 SPARK.View + form-create 集成
import { setupSparkView } from '@spark-view/runtime';

const app = createApp(App);

// 注册 Element Plus 图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component);
}

app.use(router);
app.use(ElementPlus);
app.use(FcDesigner);

// 初始化 SPARK.View (包含 form-create 和自定义布局组件)
setupSparkView(app);

app.mount('#app');
