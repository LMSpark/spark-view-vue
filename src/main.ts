import {createApp} from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import formCreate from '@form-create/element-ui'
import router from './router'
import App from './App.vue'
import './style.css'

// ✅ VXE Table
import VXETable from 'vxe-table'
import 'vxe-table/lib/style.css'

const app = createApp(App)

// 必须先注册 Element Plus，form-create 才能使用这些组件
app.use(ElementPlus)

// ✅ VXE Table 全局注册
app.use(VXETable)

app.use(formCreate)

// 直接注册 router 并挂载应用（setupRouter 不存在，使用同步注册以降低启动复杂度）
app.use(router)
app.mount('#app')
