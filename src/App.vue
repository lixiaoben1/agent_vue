<script setup lang="ts">
import { RouterView } from 'vue-router'
import GlobalVerifyDialog from "@/components/GlobalVerifyDialog.vue";
import Toast from 'primevue/toast';
import ConfirmDialog from 'primevue/confirmdialog';

</script>
<template>
  <GlobalVerifyDialog />
  <RouterView></RouterView>
  <Toast />
  <!--
    ConfirmDialog 与 Toast 一样必须有一个全局渲染点。useConfirm() 只是把
    请求推给这个组件，没有它的话 confirm.require() 调了不会有任何反应 ——
    而那看起来像「按钮点了没用」，排查方向完全错。
  -->
</template>
<style scoped>

</style>
