<script setup>
import { computed, nextTick, reactive, ref } from 'vue'

import { validatePasswordResetInput } from '../domain/authValidation.js'
import { useAuthStore } from '../stores/authStore.js'
import AuthFormField from './AuthFormField.vue'

const emit = defineEmits({
  success: (email) => typeof email === 'string' && email.length > 0,
})

const authStore = useAuthStore()
const form = ref(null)
const isSubmitting = ref(false)
const summary = ref('')
const fields = reactive({ email: '' })
const errors = reactive({ email: '' })
const pending = computed(
  () => isSubmitting.value || authStore.operationStatus === 'requesting-password-reset',
)

const updateEmail = (value) => {
  fields.email = value
  errors.email = ''
}

const readSubmittedEmail = () => {
  const submitted = form.value ? new FormData(form.value).get('email') : null
  return typeof submitted === 'string' ? submitted : fields.email
}

const submit = async () => {
  if (pending.value) {
    return
  }

  summary.value = ''
  const submittedEmail = readSubmittedEmail()
  fields.email = submittedEmail
  const validation = validatePasswordResetInput({ email: submittedEmail })
  Object.assign(errors, validation.errors)

  if (!validation.isValid) {
    summary.value = 'Check the highlighted field and try again.'
    await nextTick()
    form.value?.querySelector('[name="email"]')?.focus()
    return
  }

  isSubmitting.value = true
  try {
    const requested = await authStore.requestPasswordReset({
      email: validation.values.email,
    })

    if (requested) {
      emit('success', validation.values.email)
      return
    }

    summary.value =
      authStore.errorMessage || 'Password recovery is temporarily unavailable. Try again later.'
  } catch {
    summary.value = 'Password recovery is temporarily unavailable. Try again later.'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <form ref="form" class="auth-form" novalidate :aria-busy="pending" @submit.prevent="submit">
    <div v-if="summary" class="auth-form__summary" role="alert" aria-live="assertive">
      {{ summary }}
    </div>

    <AuthFormField
      id="password-reset-email"
      :model-value="fields.email"
      name="email"
      type="email"
      label="Email address"
      autocomplete="email"
      :spellcheck="false"
      required
      :disabled="pending"
      :error="errors.email"
      @update:model-value="updateEmail"
    />

    <button class="button button--primary auth-form__submit" type="submit" :disabled="pending">
      <span v-if="pending" class="auth-form__spinner" aria-hidden="true"></span>
      {{ pending ? 'Sending reset link…' : 'Send reset link' }}
    </button>
  </form>
</template>
