import { nextTick } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'

import { createAuthGuard } from '../features/auth/router/authGuard.js'
import { useAuthStore } from '../features/auth/stores/authStore.js'
import pinia from '../stores/pinia.js'
import HomeView from '../views/HomeView.vue'

const routes = [
  {
    path: '/',
    name: 'home',
    component: HomeView,
    meta: { title: 'Find nearby - TurnAgain' },
  },
  {
    path: '/find-nearby',
    name: 'find-nearby',
    component: () => import('../views/FindNearbyView.vue'),
    meta: { title: 'Search results - TurnAgain' },
  },
  {
    path: '/services/:serviceId',
    name: 'service-detail',
    component: () => import('../views/ServiceDetailView.vue'),
    meta: { title: 'Service details - TurnAgain' },
  },
  {
    path: '/about',
    name: 'about',
    component: () => import('../views/AboutView.vue'),
    meta: { title: 'About & help - TurnAgain' },
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue'),
    meta: { title: 'Sign in - TurnAgain', guestOnly: true },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('../views/RegisterView.vue'),
    meta: { title: 'Create an account - TurnAgain', guestOnly: true },
  },
  {
    path: '/account',
    name: 'account',
    component: () => import('../views/AccountView.vue'),
    meta: {
      title: 'Your account - TurnAgain',
      requiresAuth: true,
      allowedRoles: ['member', 'staff', 'admin'],
    },
  },
  {
    path: '/staff',
    name: 'staff',
    component: () => import('../views/StaffView.vue'),
    meta: {
      title: 'Staff workspace - TurnAgain',
      requiresAuth: true,
      allowedRoles: ['staff', 'admin'],
    },
  },
  {
    path: '/forbidden',
    name: 'forbidden',
    component: () => import('../views/ForbiddenView.vue'),
    meta: { title: 'Access denied - TurnAgain' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('../views/NotFoundView.vue'),
    meta: { title: 'Page not found - TurnAgain' },
  },
]

/**
 * Creates a router with the authentication guard installed.
 * Injectable history and store dependencies keep route-policy tests isolated from browser storage.
 *
 * @param {{
 *   history?: import('vue-router').RouterHistory,
 *   authStore?: object
 * }} [options]
 * @returns {import('vue-router').Router} A configured application router.
 */
export function createAppRouter({
  history = createWebHistory(import.meta.env.BASE_URL),
  authStore = useAuthStore(pinia),
} = {}) {
  const router = createRouter({
    history,
    scrollBehavior(to, from, savedPosition) {
      if (savedPosition) {
        return savedPosition
      }

      if (to.fullPath !== from.fullPath) {
        return { top: 0 }
      }

      return undefined
    },
    routes,
  })

  router.beforeEach(createAuthGuard({ authStore, router }))

  // Focus follows a completed client-side page change so keyboard and screen-reader
  // users receive the same navigation cue as sighted users.
  router.afterEach((to, from) => {
    document.title = to.meta.title ?? 'TurnAgain'

    if (!from.name) {
      return
    }

    void nextTick(() => {
      document.querySelector('#main-content')?.focus({ preventScroll: true })
    })
  })

  return router
}

export default createAppRouter()
