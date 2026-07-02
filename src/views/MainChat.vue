<script setup lang="ts">
import Header from '@/components/main_chat/Header.vue'
import ChatBox from '@/components/main_chat/ChatBox.vue'
import ChatWindow from '@/components/main_chat/ChatWindow.vue'
import {computed, nextTick, onMounted, onUnmounted, ref, watch} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {useVerifyStore} from "@/stores/verify.ts";
import router from "@/router";
const verifyStore = useVerifyStore()

const route = useRoute()
const isBottom = ref(false)
const chatWindowRef = ref()

const currentConversationId = computed(() => {
  const id = route.params.uuid
  if (!verifyStore.isVerified) return
  // console.log("聊天对话窗口监视到conversation id发生变化，获取到全新的id：", id)
  // 防御性处理：如果意外拿到数组，取第一个元素
  return (Array.isArray(id) ? id[0] : id) || ''})

</script>
<template>
  <div class="relative flex flex-col items-center w-full h-full bg-gray-100">
    <Header></Header>
    <div v-if="verifyStore.isVerified && currentConversationId" class="w-full h-full relative overflow-y-auto flex flex-row justify-center scrollbar-none">
      <div class="w-full relative max-w-3xl px-5 @container">
        <ChatWindow ref="chatWindowRef" v-model:is-at-bottom="isBottom"></ChatWindow>
      </div>
    </div>
    <div class="absolute top-0 w-full h-20 my-gradient-disappear-to-bottom z-1"></div>
    <div v-if="!currentConversationId" class="absolute bottom-[60%] left-0 right-0 w-full flex justify-center text-2xl">准备好了，随时开始！</div>
    <div :class="currentConversationId ? 'bottom-10' : 'bottom-[50%]'" class="absolute left-0 right-0 w-full flex justify-center z-2" >
      <ChatBox></ChatBox>
    </div>
    <div v-show="currentConversationId && !isBottom" @click="chatWindowRef?.scrollToBottom" class="absolute bottom-30 rounded-full w-8 h-8 liquid-glass flex justify-center items-center cursor-pointer">
      <i class="text-[1rem]! pi pi-arrow-down"></i>
    </div>
    <div class="absolute bottom-0 w-full h-20 my-gradient-disappear-to-top z-1"></div>
  </div>

</template>

<style>
.liquid-glass {
  overflow: hidden;
  background: var(--lg-bg);
  border: 1px solid var(--lg-border);
  backdrop-filter: blur(2px) saturate(1.2);
  -webkit-backdrop-filter: blur(2px) saturate(1.2);
  box-shadow:
      0 5px 10px rgba(0, 0, 0, 0.1),
      inset -1px -2px 1px rgba(255, 255, 255, 0.55);
  border-radius: 30px; /* Added base border radius */
  transition: transform 0.3s cubic-bezier(0.34, 2, 0.64, 1), background 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@media (hover: hover) and (pointer: fine) {
  .liquid-glass:hover {
    background: rgba(255, 255, 255, 0.6);
    transform: scale(1.2);
  }
}
@media (hover: none) {
  .liquid-glass:active {
    background: rgba(255, 255, 255, 0.6);
    transform: scale(1.2);
  }
}
</style>
