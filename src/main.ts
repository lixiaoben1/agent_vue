import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import PrimeVue from 'primevue/config';
import './assets/main.css'
import 'primeicons/primeicons.css'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import {MyPreset} from '@/theme/main.ts'
import ToastService from 'primevue/toastservice';
import { setUnauthorizedHandler, getToken } from '@/api/http'
import { useVerifyStore } from '@/stores/verify'

const app = createApp(App);
app.use(PrimeVue, {
  theme: {
    preset: MyPreset,
    options: {
      darkModeSelector: '.my-app-dark',
      cssLayer: {
        name: 'primevue',
        order: 'theme, base, primevue'
      }
    }
  }
});

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)
app.use(pinia)
app.use(router)
app.use(ToastService);
app.mount('#app')

// 401 的统一处理接在这里，而不是在 api/http.ts 里直接 import store：
// 那会形成 http.ts → verify store → http.ts 的循环依赖，
// 而循环依赖在 Vite 下不一定报错，可能只是让某个模块拿到 undefined。
//
// 必须在 app.mount 之后：store 要等 pinia 装好才能取。
const verifyStore = useVerifyStore()
setUnauthorizedHandler(() => {
  verifyStore.logout()
  verifyStore.requireVerify()
})

/**
 * 进入页面时就确定身份状态，没有身份就直接弹登录框。
 *
 * 原来是等用户点发送键才弹（见 ChatBox 的 sendMessage）。那个时机太晚：
 * 未登录时侧边栏、历史记录、上传面板全都是空的，用户看到的是一个
 * 「什么都没有」的界面，而没有任何东西提示他需要先登录 —— 他得先打一段字
 * 发出去，才知道原来要登录。
 *
 * 顺序上先尝试用已有 token 换回身份，失败才弹框：
 *   - 有 token：调 /api/auth/me 验一次。必须验 —— isVerified 持久化在
 *     sessionStorage 里，刷新后仍是 true，但 token 可能已经过期
 *     （JWT_TTL_MINUTES 默认 120 分钟且不续期）。不验的话界面显示已登录，
 *     而每个请求都 401，用户只看到「什么都加载不出来」。
 *   - 没 token / 验不过：弹框。
 *
 * 注意不能直接 if (!isVerified) requireVerify()：restoreSession 是异步的，
 * 那样刷新页面时会先闪一下登录框，token 明明还有效。
 */
async function bootstrapIdentity() {
  if (getToken()) {
    const restored = await verifyStore.restoreSession()
    if (restored) return
  }
  verifyStore.requireVerify()
}

bootstrapIdentity()
