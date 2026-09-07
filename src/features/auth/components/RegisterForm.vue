<script setup>
import { computed, nextTick, reactive, ref } from 'vue'

import { validateRegistrationInput } from '../domain/authValidation.js'
import { useAuthStore } from '../stores/authStore.js'
import AuthFormField from './AuthFormField.vue'

const emit = defineEmits(['success'])
const authStore = useAuthStore()
const form = ref(null)
const isSubmitting = ref(false)
const summary = ref('')
const fields = reactive({
  displayName: '',
  email: '',
  password: '',
  passwordConfirmation: '',
})
const errors = reactive({
  displayName: '',
  email: '',
  password: '',
  passwordConfirmation: '',
})
const pending = computed(() => isSubmitting.value || authStore.operationStatus === 'registering')

const updateField = (field, value) => {
  fields[field] = value
  errors[field] = ''
}

const focusFirstInvalid = async () => {
  const field = ['displayName', 'email', 'password', 'passwordConfirmation'].find(
    (name) => errors[name],
  )
  await nextTick()
  form.value?.querySelector(`[name="${field}"]`)?.focus()
}

const submit = async () => {
  if (pending.value) {
    return
  }

  summary.value = ''
  // Password managers may fill native controls without an input event.
  // Snapshot the form before disabling it and retain password bytes exactly.
  const submitted = form.value ? new FormData(form.value) : null
  for (const field of Object.keys(fields)) {
    const value = submitted?.get(field)
    if (typeof value === 'string') {
      fields[field] = value
    }
  }
  const validation = validateRegistrationInput(fields)
  Object.assign(errors, validation.errors)

  if (!validation.isValid) {
    summary.value = 'Check the highlighted fields and try again.'
    await focusFirstInvalid()
    return
  }

  isSubmitting.value = true
  try {
    const user = await authStore.register({
      displayName: validation.values.displayName,
      email: validation.values.email,
      password: fields.password,
      passwordConfirmation: fields.passwordConfirmation,
    })

    if (user) {
      emit('success', user)
      return
    }

    summary.value = authStore.errorMessage || 'We could not create your account. Try again.'
  } catch {
    summary.value = 'Authentication is temporarily unavailable.'
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
      id="register-display-name"
      :model-value="fields.displayName"
      name="displayName"
      type="text"
      label="Name"
      autocomplete="name"
      required
      :disabled="pending"
      :error="errors.displayName"
      @update:model-value="updateField('displayName', $event)"
    />

    <AuthFormField
      id="register-email"
      :model-value="fields.email"
      name="email"
      type="email"
      label="Email address"
      autocomplete="email"
      :spellcheck="false"
      required
      :disabled="pending"
      :error="errors.email"
      @update:model-value="updateField('email', $event)"
    />

    <AuthFormField
      id="register-password"
      :model-value="fields.password"
      name="password"
      type="password"
      label="Password"
      autocomplete="new-password"
      required
      :disabled="pending"
      :error="errors.password"
      @update:model-value="updateField('password', $event)"
    />

    <AuthFormField
      id="register-password-confirmation"
      :model-value="fields.passwordConfirmation"
      name="passwordConfirmation"
      type="password"
      label="Confirm password"
      autocomplete="new-password"
      required
      :disabled="pending"
      :error="errors.passwordConfirmation"
      @update:model-value="updateField('passwordConfirmation', $event)"
    />

    <button class="button button--primary auth-form__submit" type="submit" :disabled="pending">
      <span
        v-if="pending"
        class="auth-form__spinner"
        data-testid="auth-pending-indicator"
        aria-hidden="true"
      ></span>
      {{ pending ? 'Creating account…' : 'Create account' }}
    </button>
  </form>
</template>
