<script setup lang="ts">
import { ref } from 'vue'
import {useVerifyStore} from "@/stores/verify.ts";
import {useRouter} from "vue-router";
import SettingsDialog from './SettingsDialog.vue'

const veryfyStore = useVerifyStore();
const router = useRouter();
const showSettings = ref(false)

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

/**
 * 打开设置对话框
 */
const handleSettingsClick = () => {
  showSettings.value = true
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
      {{ veryfyStore.isVerified ? (veryfyStore.isAdmin ? '管理员' : '免费版') : '点此登录' }}
    </div>
  </div>
  <div class="flex flex-row items-center mr-5">
    <!--
      管理入口只对管理员显示。这只是「不给非管理员看一个点不动的按钮」，
      不是权限 —— 页面本身谁都能直接输 /admin 打开，真正的拦截在后端。
    -->
    <div
      v-if="veryfyStore.isAdmin"
      @click="router.push('/admin')"
      title="管理看板"
      class="rounded-full w-10 h-10 hover:bg-gray-200 flex items-center justify-center cursor-pointer"
    >
      <i class="text-[1.3rem]! pi pi-chart-bar"></i>
    </div>
    <div
      @click="handleSettingsClick"
      title="设置"
      class="rounded-full w-10 h-10 hover:bg-gray-200 flex items-center justify-center cursor-pointer"
    >
      <i class="text-[1.3rem]! pi pi-cog"></i>
    </div>
  </div>

  <!-- 设置对话框 -->
  <SettingsDialog v-model:visible="showSettings" />
</div>
</template>

<style scoped>

</style>