<script setup lang="ts">


import {useVerifyStore} from "@/stores/verify.ts";
const veryfyStore = useVerifyStore();

/**
 * 未登录时点这里重新弹登录框。
 *
 * 需要一个常驻入口：登录框可以被 Cancel 关掉，关掉之后界面上原本没有
 * 任何地方能把它叫回来 —— 用户只能靠"发一条消息触发校验"这种并不
 * 直观的方式。这里本来就显示着「需要登陆」，做成可点的最自然。
 */
const handleIdentityClick = () => {
  if (!veryfyStore.isVerified) {
    veryfyStore.requireVerify()
  }
}
</script>

<template>
<div class="flex flex-row items-center justify-between w-full h-20 border-t border-surface-200">
  <div
      @click="handleIdentityClick"
      :class="veryfyStore.isVerified ? '' : 'cursor-pointer hover:bg-gray-200'"
      class="flex flex-col justify-between ml-5 -my-2 py-2 pl-2 pr-4 rounded-lg"
  >
    <div class="">{{veryfyStore.username}}</div>
    <div class="text-[0.95rem] text-gray-500">
      {{ veryfyStore.isVerified ? '免费版' : '点此登录' }}
    </div>
  </div>
  <div class="mr-5 rounded-full w-10 h-10 hover:bg-gray-200 flex items-center justify-center">
    <i class="text-[1.3rem]! pi pi-cog"></i>
  </div>

</div>
</template>

<style scoped>

</style>