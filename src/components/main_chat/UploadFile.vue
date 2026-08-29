<script setup lang="ts">
import Popover from 'primevue/popover';
import { computed, onUnmounted, ref } from "vue";
import Message from 'primevue/message';
import Button from 'primevue/button';
import FileUpload from 'primevue/fileupload';
import type { FileUploadUploadEvent, FileUploadErrorEvent } from 'primevue/fileupload';
import { useToast } from 'primevue/usetoast';
import { getToken } from "@/api/http";
import { useIngestStore, type IngestTask } from "@/stores/ingest_store";

const toast = useToast()
const ingestStore = useIngestStore()
const op = ref()

/**
 * FileUpload 内部用自己的 XMLHttpRequest，不走 axios，所以拦截器加不上
 * Authorization 头 —— 必须在这里显式传。少了它上传一律 401。
 *
 * 用 computed 而不是常量：token 会在重新登录后变化，
 * 取一次存住会让重登后的第一次上传仍然用旧 token。
 */
const uploadHeaders = computed(() => ({
  Authorization: `Bearer ${getToken()}`,
}))

const toggle = (event:PointerEvent) => {
  op.value.toggle(event);
}

const fu = ref();

const onChoose = () => {
  fu.value.choose();
};

const onUpload = () => {
  fu.value.upload();
};

const onClear = () => {
  fu.value.clear();
};

/**
 * 上传成功。注意「上传成功」不等于「解析完成」。
 *
 * 后端只是把文件落了盘、写了一行 PENDING 任务、投进了队列就返回 ——
 * 解析要几分钟，由 Python 消费者异步做。所以这里把 task_id 交给
 * ingest store 去轮询进度，而不是直接告诉用户「已入库」。
 */
const onUploadDone = (event: FileUploadUploadEvent) => {
  let tasks: Array<{ task_id: string; file_name: string; status: string }> = []
  try {
    tasks = JSON.parse(event.xhr.responseText)
  } catch {
    toast.add({ severity: 'warn', summary: '响应解析失败', life: 3000 })
    return
  }

  const duplicates = tasks.filter((t) => t.status === 'DUPLICATE')
  const queued = tasks.filter((t) => t.status !== 'DUPLICATE')

  queued.forEach((task) => ingestStore.track(task.task_id, task.file_name))

  if (queued.length) {
    toast.add({
      severity: 'info',
      summary: '已加入解析队列',
      detail: `${queued.length} 个文件正在后台解析，可能需要几分钟`,
      life: 4000,
    })
  }
  if (duplicates.length) {
    toast.add({
      severity: 'info',
      summary: '已跳过重复文件',
      detail: `${duplicates.length} 个文件此前已入库`,
      life: 4000,
    })
  }
  onClear()
}

const onUploadError = (event: FileUploadErrorEvent) => {
  let detail = '请稍后重试'
  try {
    detail = JSON.parse(event.xhr.responseText)?.message ?? detail
  } catch {
    // 错误体不是 JSON（比如 nginx 返回的 413 页面），用默认文案
  }
  toast.add({ severity: 'error', summary: '上传失败', detail, life: 5000 })
}

const formatSize = (bytes:number) => {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const trackedTasks = computed(() => Object.values(ingestStore.tasks))

const isTerminal = (task: IngestTask) =>
    ['SUCCESS', 'FAILED', 'DUPLICATE'].includes(task.status)

/** 状态文案。直接显示 PENDING/RUNNING 这些字面量用户看不懂。 */
const statusLabel = (task: IngestTask) => {
  switch (task.status) {
    case 'PENDING':
      return '排队中，等待显存资源'
    case 'RUNNING':
      return '正在解析'
    case 'SUCCESS':
      return `已入库，共 ${task.chunk_count ?? 0} 个片段`
    case 'DUPLICATE':
      return '此前已入库，已跳过'
    case 'FAILED':
      return `失败：${task.error_message ?? '未知原因'}`
    default:
      return task.status
  }
}

// 打开面板时拉一次列表：用户可能刷新过页面，之前的轮询定时器
// 已经随页面消失，未完成的任务要在这里接着轮
const toggleAndRefresh = (event: PointerEvent) => {
  ingestStore.fetchTasks()
  op.value.toggle(event)
}

onUnmounted(() => {
  // 不清的话组件销毁后定时器还在发请求
  ingestStore.stopAll()
})

defineExpose({toggle: toggleAndRefresh})

</script>

<template>
  <Popover class="popover_component" ref="op">
    <div class="max-w-md mx-auto">
      <!--
        三处改动，原值都是 PrimeVue 示例代码残留：

        name="demo[]"     → "files"，与后端 @RequestParam("files") 对应。
                            名字不匹配后端收不到文件，报的是「未收到任何文件」
        accept="image/*"  → 实际支持的文本类型。后端只做文本解析，
                            不走 OCR，收图片会在解析阶段才失败
        maxFileSize 1MB   → 50MB，与后端 MAX_UPLOAD_SIZE_MB 一致。
                            前端限制小于后端只是让用户早点知道；
                            反过来（前端宽松）会让请求白跑一趟拿 413
      -->
      <FileUpload
          ref="fu"
          name="files"
          url="/api/upload"
          :multiple="true"
          accept=".txt,.pdf,.md,.docx"
          :maxFileSize="52428800"
          :headers="uploadHeaders"
          mode="advanced"
          @upload="onUploadDone"
          @error="onUploadError"
          :pt="{ root: { class: 'border-0! bg-transparent!' }, header: { class: 'hidden!' }, content: { class: 'border-2! border-dashed! border-surface-200! dark:border-surface-700! rounded-xl! p-8!' } }"
      >
        <template #content="{ files, removeFileCallback, messages }">
          <div v-if="messages?.length" class="flex flex-col gap-2">
            <Message v-for="msg of messages" :key="msg" severity="error">{{ msg }}</Message>
          </div>
          <div v-if="files.length" class="flex flex-col gap-4">
            <div class="flex items-center justify-between">
              <span class="text-sm text-muted-color">{{ files.length }} file(s) selected</span>
              <div class="flex items-center gap-2">
                <Button variant="text" size="small" @click="onUpload">Upload</Button>
                <Button variant="text" size="small" severity="danger" @click="onClear">Clear all</Button>
              </div>
            </div>
            <div class="flex flex-col gap-2">
              <div v-for="(file, index) of files" :key="file.name + file.size" class="flex items-center justify-between p-3 rounded-lg bg-surface-50 dark:bg-surface-800">
                <div class="flex items-center gap-3">
                  <i class="text-[1.3rem]! pi pi-cloud-upload"></i>
                  <div class="flex flex-col">
                    <span class="text-sm font-medium">{{ file.name }}</span>
                    <span class="text-xs text-muted-color">{{ formatSize(file.size) }}</span>
                  </div>
                </div>
                <Button type="button" iconOnly variant="text" severity="secondary" size="small" rounded @click="removeFileCallback(index)">
                  <i class="text-[1.3rem]! pi pi-times"></i>
                </Button>
              </div>
            </div>
          </div>
        </template>
        <template #empty>
          <div class="flex flex-col items-center justify-center gap-3 py-8 cursor-pointer" @click="onChoose">
            <i class="text-[2rem]! pi pi-cloud-upload"></i>
            <div class="text-center">
              <p class="text-lg font-medium mt-0 mb-1">Drop files here</p>
              <p class="text-sm text-muted-color m-0">or click to browse</p>
            </div>
          </div>
        </template>
      </FileUpload>

      <!--
        解析进度。与上传进度是两件事：上传条走完只说明文件传到服务器了，
        解析（Docling + 向量化）还要几分钟，在后台队列里排队进行。
        没有这块的话用户会以为上传完就结束了。
      -->
      <div v-if="trackedTasks.length" class="flex flex-col gap-2 mt-4">
        <span class="text-sm text-muted-color">解析进度</span>
        <div
            v-for="task of trackedTasks"
            :key="task.task_id"
            class="flex items-center justify-between p-3 rounded-lg bg-surface-50 dark:bg-surface-800"
        >
          <div class="flex flex-col min-w-0">
            <span class="text-sm font-medium truncate">{{ task.file_name }}</span>
            <span class="text-xs text-muted-color">{{ statusLabel(task) }}</span>
          </div>
          <Button
              v-if="isTerminal(task)"
              type="button" iconOnly variant="text" severity="secondary"
              size="small" rounded
              @click="ingestStore.dismiss(task.task_id)"
          >
            <i class="text-[1.1rem]! pi pi-times"></i>
          </Button>
          <i v-else class="pi pi-spin pi-spinner text-muted-color"></i>
        </div>
      </div>
    </div>
  </Popover>
</template>

<style>
.popover_component::before {
  display: none !important;
}

.popover_component::after {
  display: none !important;
}
</style>