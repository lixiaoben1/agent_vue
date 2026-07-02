<script setup lang="ts">
import Logo from '../components/side_bar/Logo.vue'
import BottomSetting from "../components/side_bar/BottomSetting.vue";
import HistoryListBox from "../components/side_bar/HistoryListBox.vue";
import {provide, ref } from "vue";
function toggleDarkMode(){
  document.documentElement.classList.toggle('my-app-dark')
}
const isSidebarOpen = ref(false)



provide("SIDEBAR_KEY", {
  isOpen: isSidebarOpen,
  toggle: () => { isSidebarOpen.value = !isSidebarOpen.value },
  open: () => { isSidebarOpen.value = true },
  close: () => { isSidebarOpen.value = false },
})

</script>

<template>
  <main>
    <div class="flex flex-row h-screen w-full overflow-hidden relative">
      <aside :class="isSidebarOpen ? 'translate-x-0' : '-translate-x-full'"
             class="fixed left-0 top-0 w-[16rem] md:flex md:translate-x-0 z-55 h-full border-r border-surface-200 flex-col justify-between
              dark:border-surface-700 bg-[#f6f6f8] transition-transform duration-300 ease-in-out">
        <Logo class="p-3"></Logo>
        <HistoryListBox></HistoryListBox>
        <BottomSetting></BottomSetting>
      </aside>
      <div class="hidden md:block md:w-[16rem] "></div>
      <div v-if="isSidebarOpen" class="fixed inset-0 z-40 bg-black/50 min-[788px]:hidden" @click="isSidebarOpen = false"/>
      <div class="flex-1 min-w-0">
        <RouterView/>
      </div>

    </div>
  </main>
</template>
<style scoped>

</style>
