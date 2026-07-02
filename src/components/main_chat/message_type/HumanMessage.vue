<script setup lang="ts">
import 'primeicons/primeicons.css'

const props = defineProps({ content: String,isFirst: Boolean })
</script>

<template>
  <div v-show="isFirst" class="h-20"></div>
  <div class="flex flex-col justify-between items-end p-2 group">
    <div class=" max-w-[80%] p-3 rounded-[1.125rem] bg-gray-200 text-black break-words">
      {{ content }}
    </div>
    <div class="h-7 flex justify-end mt-2 opacity-0 group-hover:opacity-100 mr-2">
      <div class="flex justify-center items-center h-7 w-7  hover:bg-gray-200 rounded-lg">
        <i class="pi pi-clone text-gray-500 text-sm"></i>
      </div>
      <div class="flex justify-center items-center h-7 w-7  hover:bg-gray-200 rounded-lg ">
        <i class="pi pi-pencil text-gray-500 text-sm"></i>
      </div>
      <div class="flex justify-center items-center h-7 w-7  hover:bg-gray-200 rounded-lg">
        <i class="pi pi-trash text-gray-500 text-sm"></i>
      </div>
    </div>
  </div>


</template>

<style scoped>

</style>