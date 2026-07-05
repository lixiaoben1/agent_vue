<script setup lang="ts">
import Popover from 'primevue/popover';
import Avatar from "primevue/avatar";
import router from "@/router";
import {useConversationStore} from "@/stores/conversation_store.js";
import {storeToRefs} from "pinia";
import {inject, ref, watch} from "vue";

const conversationStore = useConversationStore()
const { selectedItem } = storeToRefs(conversationStore)
const handleNewChat = async () => {
  selectedItem.value = undefined;       // 1. 清空选中值，移除高亮
  // await nextTick();    // 2. 让 Listbox 失去 DOM 焦点
  router.replace({ name: 'Chat' });
};

const op = ref();

const toggle_popover = (event:PointerEvent) => {
  op.value.toggle(event);
}

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
        <Popover class="popover_component" :pt="{content:{class:'p-0'}}" ref="op">
          <div class="flex items-center justify-center p-2 w-40 h-8 text-gray-400">其他项目</div>
          <a href="https://qlrr.pages.dev/" target="_blank" class="flex items-center justify-center p-2 w-40 h-8 cursor-pointer rounded-md hover:bg-gray-200">主页</a>
          <a href="https://restaurant.a2353058191.workers.dev/" target="_blank" class="flex items-center justify-center p-2 w-40 h-8 cursor-pointer rounded-md hover:bg-gray-200">大数据开发面板</a>
          <a href="https://movies.a2353058191.workers.dev/" target="_blank" class="flex items-center justify-center p-2 w-40 h-8 cursor-pointer rounded-md hover:bg-gray-200">共同观影平台</a>
        </Popover>
        <div @click="toggle_popover" class="flex flex-row items-center justify-center rounded-full w-8 h-8 mr-1.5 hover:bg-gray-200 cursor-pointer">
          <i class="text-[1.3rem]! pi pi-ellipsis-h"></i>
        </div>
      </div>
    </div>
  </header>
</template>

<style>

.popover_component::before {
  display: none !important;
}

.popover_component::after {
  display: none !important;
}
</style>