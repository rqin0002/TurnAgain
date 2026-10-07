import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import { useAuthStore } from './features/auth/stores/authStore.js'
import router from './router/index.js'

const app = createApp(App)

const pinia = createPinia()
app.use(pinia)

// Mount immediately (spec 9.5): the store starts its single listener with the router in hand,
// the guard holds protected navigation until `ready`, and index.html shows the loading text
// until this mount replaces it. Nothing awaits auth before the first paint.
useAuthStore(pinia).init({ router })
app.use(router)
app.mount('#app')
