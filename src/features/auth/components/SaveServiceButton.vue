<script setup>
import { computed, ref } from 'vue'

import { useAuthStore } from '@/features/auth/stores/authStore.js'
import AppButton from '@/shared/components/AppButton.vue'
import { describeError } from '@/shared/domain/errorCopy.js'

/**
 * Save / Unsave for one service.
 * Renders nothing until the session is signed in, reads its label from `user.savedServiceIds`
 * and calls the store's own write actions, which update `user` in place (no epoch bump). A
 * component never imports a data layer (`components-no-data`), so the write's own
 * rejection is rendered through the shared `describeError`, which knows the two error classes
 * by name. Service Detail mounts it next to the ratings panel.
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
