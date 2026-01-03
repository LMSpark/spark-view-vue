import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import './assets/style.css';

// 引入 Element Plus
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';

// 引入 form-create
import formCreate from '@form-create/element-ui';
import FcDesigner from '@form-create/designer';

const app = createApp(App);

// 注册 Element Plus 图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component);
}

app.use(router);
app.use(ElementPlus);
app.use(formCreate);
app.use(FcDesigner);

app.mount('#app');
