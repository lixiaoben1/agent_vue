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
