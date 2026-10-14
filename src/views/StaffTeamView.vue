<script setup>
import AccountsSection from '@/features/staff/components/AccountsSection.vue'

// The Team page (route meta allowedRoles ['admin']): the staff and admin accounts. The page is the
// shared account section; the Members page is the same section over member accounts.
</script>

<template>
  <AccountsSection section="team" />
</template>
