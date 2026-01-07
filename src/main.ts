import {createApp} from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import formCreate from '@form-create/element-ui'
import router, {setupRouter} from './router'
import App from './App.vue'
import './style.css'

const app = createApp(App)

app.use(ElementPlus)
app.use(formCreate)

// 先动态加载路由，再注册 router 并挂载应用
setupRouter().then(() => {
    app.use(router)
    app.mount('#app')
})
