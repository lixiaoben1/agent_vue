<script setup lang="ts">


import {useVerifyStore} from "@/stores/verify.ts";
const veryfyStore = useVerifyStore();
</script>

<template>
<div class="flex flex-row items-center justify-between w-full h-20 border-t border-surface-200">
  <div class="flex flex-col justify-between ml-5">
    <div class="">{{veryfyStore.username}}</div>
    <div class="text-[0.95rem] text-gray-500">免费版</div>
  </div>
  <div class="mr-5 rounded-full w-10 h-10 hover:bg-gray-200 flex items-center justify-center">
    <i class="text-[1.3rem]! pi pi-cog"></i>
  </div>

</div>
</template>

<style scoped>

</style>