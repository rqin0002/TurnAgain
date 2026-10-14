<script setup>
import AccountsSection from '@/features/staff/components/AccountsSection.vue'

// The Members page (route meta allowedRoles ['admin']): the member accounts, active and disabled.
// The page is the shared account section; the Team page is the same section over staff and admin
// accounts.
</script>

<template>
  <AccountsSection section="members" />
</template>
