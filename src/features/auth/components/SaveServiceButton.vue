<script setup>
import { computed, ref } from 'vue'

import { useAuthStore } from '@/features/auth/stores/authStore.js'
import AppButton from '@/shared/components/AppButton.vue'
import { describeError } from '@/shared/domain/errorCopy.js'

/**
 * The Save / Unsave button for one service on Service Detail. It renders nothing unless someone
 * is signed in, shows whether the service is saved from the user's savedServiceIds, and saves or
 * unsaves through the auth store, which updates `user` in place (a saved-list change is not an
 * identity change, so identityEpoch does not move). Components may not import a data module
 * (an ESLint boundary rule), so a refused write is shown through the shared describeError.
 */
const props = defineProps({
  serviceId: { type: String, required: true },
})

const authStore = useAuthStore()

const signedIn = computed(() => authStore.status === 'signed-in')
const isSaved = computed(() => authStore.user?.savedServiceIds?.includes(props.serviceId) === true)
const pending = ref(false)
const error = ref('')

const toggle = async () => {
  if (pending.value) {
    return
  }
  pending.value = true
  error.value = ''
  try {
    if (isSaved.value) {
      await authStore.unsaveService(props.serviceId)
    } else {
      await authStore.saveService(props.serviceId)
    }
  } catch (failure) {
    error.value = describeError(failure)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div v-if="signedIn" class="save-service">
    <AppButton variant="secondary" type="button" :busy="pending" @click="toggle">
      {{ isSaved ? 'Unsave' : 'Save' }}
    </AppButton>
    <p v-if="error" class="save-service__error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.save-service {
  display: grid;
  justify-items: start;
  gap: 0.5rem;
}

.save-service__error {
  margin: 0;
  color: var(--color-danger);
}
</style>
