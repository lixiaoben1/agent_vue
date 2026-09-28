<script setup lang="ts">
import 'primeicons/primeicons.css'
import AttachmentChip from '@/components/main_chat/AttachmentChip.vue'
import type { MessageAttachment } from '@/interface/attachment-interface'

const props = defineProps<{
  content?: string
  isFirst?: boolean
  /**
   * 随这条消息发出的附件。
   *
   * 显示在气泡上方而不是里面：附件的宽度由文件名决定，塞进气泡会把
   * 一条短消息的气泡撑成一整行。而且状态还会变（解析中 → 已入库），
   * 独立成块更容易看出那是一个仍在变化的东西。
   */
  attachments?: MessageAttachment[]
}>()
</script>

<template>
  <div v-show="isFirst" class="h-20"></div>
  <div class="flex flex-col justify-between items-end p-2 group">
    <div
      v-if="attachments?.length"
      class="flex flex-row flex-wrap justify-end gap-2 max-w-[80%] mb-2"
    >
      <AttachmentChip
        v-for="file of attachments"
        :key="file.task_id ?? file.name"
        :name="file.name"
        :size="file.size"
        :status="file.status"
        :error-message="file.error_message"
      />
    </div>
    <!--
      只发了文件、一个字没打时不画气泡：一个空的灰色圆角块看着像渲染出错了。
    -->
    <div
      v-if="content"
      class="max-w-[80%] p-3 rounded-[1.125rem] bg-gray-200 text-black break-words whitespace-pre-wrap"
    >
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
