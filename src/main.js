import './assets/main.css'

import { createApp } from 'vue'

import App from './App.vue'
import { motion, navigationIndicator } from './motion/index.js'
import { useAuthStore } from './features/auth/stores/authStore.js'
import router from './router'
import pinia from './stores/pinia.js'

const app = createApp(App)
app.directive('motion', motion)
app.directive('navigation-indicator', navigationIndicator)

const bootstrap = async () => {
  app.use(pinia)
  await useAuthStore(pinia).initialize()
  app.use(router)

  app.mount('#app')
}

void bootstrap()
