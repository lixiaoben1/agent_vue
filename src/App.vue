<script setup lang="ts">
import { RouterView } from 'vue-router'
import GlobalVerifyDialog from "@/components/GlobalVerifyDialog.vue";
import Toast from 'primevue/toast';

</script>
<template>
  <GlobalVerifyDialog />
  <RouterView></RouterView>
  <Toast />
</template>
<style scoped>

</style>
