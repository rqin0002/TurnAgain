import './assets/main.css'

import { createApp } from 'vue'

import App from './App.vue'
import { useAuthStore } from './features/auth/stores/authStore.js'
import router from './router'
import pinia from './stores/pinia.js'

const app = createApp(App)

const bootstrap = async () => {
  app.use(pinia)
  await useAuthStore(pinia).initialize()
  app.use(router)

  app.mount('#app')
}

void bootstrap()
