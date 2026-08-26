<script setup>
import { computed, nextTick, reactive, ref } from 'vue'

import { validateLoginInput } from '../domain/authValidation.js'
import { useAuthStore } from '../stores/authStore.js'
import AuthFormField from './AuthFormField.vue'

const emit = defineEmits(['success'])
const authStore = useAuthStore()
const form = ref(null)
const isSubmitting = ref(false)
const summary = ref('')
const fields = reactive({ email: '', password: '' })
const errors = reactive({ email: '', password: '' })
const pending = computed(() => isSubmitting.value || authStore.operationStatus === 'logging-in')

const updateField = (field, value) => {
  fields[field] = value
  errors[field] = ''
}

const focusFirstInvalid = async () => {
  const field = ['email', 'password'].find((name) => errors[name])
  await nextTick()
  form.value?.querySelector(`[name="${field}"]`)?.focus()
}

const readSubmittedFields = () => {
  const submitted = form.value ? new FormData(form.value) : null
  const email = submitted?.get('email')
  const password = submitted?.get('password')

  return {
    email: typeof email === 'string' ? email : fields.email,
    password: typeof password === 'string' ? password : fields.password,
  }
}

const submit = async () => {
  if (pending.value) {
    return
  }

  summary.value = ''
  // Read native controls at submit time because password managers can autofill
  // without dispatching the input event that normally updates Vue state.
  const submittedFields = readSubmittedFields()
  Object.assign(fields, submittedFields)
  const validation = validateLoginInput(submittedFields)
  Object.assign(errors, validation.errors)

  if (!validation.isValid) {
    summary.value = 'Check the highlighted fields and try again.'
    await focusFirstInvalid()
    return
  }

  isSubmitting.value = true
  try {
    const user = await authStore.login({
      email: validation.values.email,
      password: submittedFields.password,
    })

    if (user) {
      emit('success', user)
      return
    }

    summary.value = authStore.errorMessage || 'Email or password is incorrect.'
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
      id="login-email"
      :model-value="fields.email"
      name="email"
      type="email"
      label="Email address"
      autocomplete="username"
      :spellcheck="false"
      required
      :disabled="pending"
      :error="errors.email"
      @update:model-value="updateField('email', $event)"
    />

    <AuthFormField
      id="login-password"
      :model-value="fields.password"
      name="password"
      type="password"
      label="Password"
      autocomplete="current-password"
      required
      :disabled="pending"
      :error="errors.password"
      @update:model-value="updateField('password', $event)"
    />

    <button class="button button--primary auth-form__submit" type="submit" :disabled="pending">
      <span
        v-if="pending"
        class="auth-form__spinner"
        data-testid="auth-pending-indicator"
        aria-hidden="true"
      ></span>
      {{ pending ? 'Signing in…' : 'Sign in' }}
    </button>
  </form>
</template>
