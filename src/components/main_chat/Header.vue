<script setup lang="ts">

import Avatar from "primevue/avatar";
import router from "@/router";
import {useUserStore} from "@/stores/user_store.ts";
import {storeToRefs} from "pinia";
import {inject, ref, watch} from "vue";

const userStore = useUserStore()
const { selectedItem } = storeToRefs(userStore)
const handleNewChat = async () => {
  selectedItem.value = undefined;       // 1. 清空选中值，移除高亮
  // await nextTick();    // 2. 让 Listbox 失去 DOM 焦点
  router.replace({ name: 'Chat' });
};

const sidebar = inject("SIDEBAR_KEY", {isOpen: ref(false), toggle: () => {}, open: () => {}, close: () => {},
})


</script>

<template>
  <header class="absolute top-2 left-0 right-0 h-15 z-50 flex items-center">
    <div class="flex flex-row items-center justify-between w-full h-10 relative">
      <div @click="sidebar.open" v-show="!sidebar.isOpen.value" class="md:opacity-0 ml-5 flex justify-center items-center liquid-glass rounded-full w-10 h-10 cursor-pointer">
        <div class="flex flex-row items-center justify-center rounded-full w-8 h-8 cursor-pointer">
          <i class="text-[1.3rem]! pi pi-bars"></i>
        </div>
      </div>
      <div v-show="!sidebar.isOpen.value" class="flex flex-row items-center justify-between w-23 h-10 mr-7.5 md:mr-10 relative liquid-glass">
        <div @click="handleNewChat" class="flex flex-row items-center justify-center rounded-full w-8 h-8 ml-1.5 hover:bg-gray-200 cursor-pointer">
          <i class="text-[1.3rem]! pi pi-pen-to-square"></i>
        </div>
        <div class="flex flex-row items-center justify-center rounded-full w-8 h-8 mr-1.5 hover:bg-gray-200 cursor-pointer">
          <i class="text-[1.3rem]! pi pi-ellipsis-h"></i>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
@import "@/components/liquid_glass/liquid-glass.css";
</style>