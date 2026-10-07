import { nextTick } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'

import HomeView from '@/views/HomeView.vue'

import { afterNavigation, authGuard } from './authGuard.js'

const routes = [
  {
    path: '/',
    name: 'home',
    component: HomeView,
    meta: { title: 'TurnAgain' },
  },
  {
    path: '/find-nearby',
    name: 'find-nearby',
    component: () => import('@/views/FindNearbyView.vue'),
    meta: { title: 'Search results | TurnAgain' },
  },
  {
    path: '/activities',
    name: 'activities',
    component: () => import('@/views/ActivitiesView.vue'),
    meta: { title: 'Repair & Reuse Activity | TurnAgain' },
  },
  {
    path: '/activities/:activityId',
    name: 'activity-detail',
    component: () => import('@/views/ActivityDetailView.vue'),
    meta: { title: 'Activity details | TurnAgain' },
  },
  {
    path: '/activities/:activityId/book/:sessionId',
    name: 'booking-review',
    component: () => import('@/views/BookingReviewView.vue'),
    meta: {
      title: 'Review your booking | TurnAgain',
      requiresAuth: true,
      allowedRoles: ['member', 'staff', 'admin'],
    },
  },
  {
    path: '/services/:serviceId',
    name: 'service-detail',
    component: () => import('@/views/ServiceDetailView.vue'),
    meta: { title: 'Service details | TurnAgain' },
  },
  {
    path: '/guides',
    name: 'guides',
    component: () => import('@/views/GuidesView.vue'),
    meta: { title: 'Guides | TurnAgain' },
  },
  {
    path: '/about',
    name: 'about',
    component: () => import('@/views/AboutView.vue'),
    meta: { title: 'About & help | TurnAgain' },
  },
  {
    path: '/accessibility',
    name: 'accessibility',
    component: () => import('@/views/AccessibilityView.vue'),
    meta: { title: 'Accessibility | TurnAgain' },
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { title: 'Sign in | TurnAgain', guestOnly: true },
  },
  {
    path: '/forgot-password',
    name: 'forgot-password',
    component: () => import('@/views/ForgotPasswordView.vue'),
    meta: { title: 'Reset your password | TurnAgain', guestOnly: true },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('@/views/RegisterView.vue'),
    meta: { title: 'Create an account | TurnAgain', guestOnly: true },
  },
  {
    path: '/account',
    name: 'account',
    component: () => import('@/views/AccountView.vue'),
    meta: {
      title: 'Your account | TurnAgain',
      requiresAuth: true,
      allowedRoles: ['member', 'staff', 'admin'],
    },
  },
  {
    path: '/account/bookings',
    name: 'my-bookings',
    component: () => import('@/views/MyBookingsView.vue'),
    meta: {
      title: 'My bookings | TurnAgain',
      requiresAuth: true,
      allowedRoles: ['member', 'staff', 'admin'],
    },
  },
  {
    path: '/account/bookings/:bookingId',
    name: 'booking-detail',
    component: () => import('@/views/BookingDetailView.vue'),
    meta: {
      title: 'Your booking | TurnAgain',
      requiresAuth: true,
      allowedRoles: ['member', 'staff', 'admin'],
    },
  },
  {
    // The staff layout: children inherit the role meta. The redirect makes a
    // navigation to { name: 'staff' } (defaultDestination, LoginView) render the overview.
    path: '/staff',
    name: 'staff',
    component: () => import('@/views/StaffView.vue'),
    redirect: { name: 'staff-overview' },
    meta: {
      title: 'Staff workspace | TurnAgain',
      requiresAuth: true,
      allowedRoles: ['staff', 'admin'],
    },
    children: [
      {
        path: '',
        name: 'staff-overview',
        component: () => import('@/views/StaffOverviewView.vue'),
        meta: { title: 'Staff overview | TurnAgain' },
      },
      {
        path: 'services',
        name: 'staff-services',
        component: () => import('@/views/StaffServicesView.vue'),
        meta: { title: 'Service register | TurnAgain' },
      },
      {
        path: 'sessions',
        name: 'staff-sessions',
        component: () => import('@/views/StaffSessionsView.vue'),
        meta: { title: 'Sessions | TurnAgain' },
      },
      {
        path: 'services/new',
        name: 'staff-service-new',
        component: () => import('@/views/StaffRecordView.vue'),
        props: { kind: 'services' },
        meta: { title: 'New service | TurnAgain' },
      },
      {
        path: 'activities/new',
        name: 'staff-activity-new',
        component: () => import('@/views/StaffRecordView.vue'),
        props: { kind: 'activities' },
        meta: { title: 'New activity | TurnAgain' },
      },
      {
        path: 'sessions/new',
        name: 'staff-session-new',
        component: () => import('@/views/StaffRecordView.vue'),
        props: { kind: 'sessions' },
        meta: { title: 'New session | TurnAgain' },
      },
      {
        path: ':kind(services|activities|sessions)/:recordId/edit',
        name: 'staff-record-edit',
        component: () => import('@/views/StaffRecordView.vue'),
        props: true,
        meta: { title: 'Edit record | TurnAgain' },
      },
      {
        path: 'corrections',
        name: 'staff-corrections',
        component: () => import('@/views/StaffCorrectionsView.vue'),
        meta: { title: 'Corrections | TurnAgain' },
      },
      {
        path: 'sessions/:sessionId',
        name: 'staff-session',
        component: () => import('@/views/StaffSessionView.vue'),
        props: true,
        meta: { title: 'Session participants | TurnAgain' },
      },
      {
        path: 'team',
        name: 'staff-team',
        component: () => import('@/views/StaffTeamView.vue'),
        meta: { title: 'Team | TurnAgain', allowedRoles: ['admin'] },
      },
      // Static create paths outrank /staff/sessions/:sessionId; child order is free.
    ],
  },
  {
    path: '/forbidden',
    name: 'forbidden',
    component: () => import('@/views/ForbiddenView.vue'),
    meta: { title: 'Access denied | TurnAgain' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
    meta: { title: 'Page not found | TurnAgain' },
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    }

    if (to.hash) {
      try {
        const target = document.getElementById(decodeURIComponent(to.hash.slice(1)))
        if (target) {
          return {
            el: target,
            behavior:
              to.path === from.path &&
              !window.matchMedia('(prefers-reduced-motion: reduce)').matches
                ? 'smooth'
                : 'auto',
          }
        }
      } catch {
        // A malformed hash must not interrupt otherwise valid navigation.
      }
    }

    // Filters live in the query string: refining a page is not a page change.
    if (to.path !== from.path) {
      return { top: 0 }
    }

    return undefined
  },
  routes,
})

router.beforeEach((to) => authGuard(to, router))
// A completed navigation to a protected page re-validates the profile.
router.afterEach(afterNavigation)

// Focus follows a completed client-side page change so keyboard and screen-reader
// users receive the same navigation cue as sighted users.
router.afterEach((to, from, failure) => {
  if (failure || to.path === from.path) {
    return
  }

  document.title = to.meta.title ?? 'TurnAgain'

  if (!from.name) {
    return
  }

  void nextTick(() => {
    if (router.currentRoute.value.fullPath === to.fullPath) {
      document.querySelector('#main-content')?.focus({ preventScroll: true })
    }
  })
})

export default router
