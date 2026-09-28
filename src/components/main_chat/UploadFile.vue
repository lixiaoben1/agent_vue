<script setup lang="ts">
/**
 * 上传面板。
 *
 * === 为什么不再用 PrimeVue 的 FileUpload ===
 *
 * Popover 的插槽内容在 v-if 里，面板一关整棵子树卸载。FileUpload 把已选
 * 文件列表和上传用的 XMLHttpRequest 都存在自己的组件实例上，于是「点空白处
 * 关掉面板」就把它们一起销毁了 —— 重新打开是个空面板，用户无从判断文件
 * 传上去了没有。这正是要修的问题，而它是内置组件的结构决定的，
 * 靠传 prop 改不掉。
 *
 * 现在文件状态全在 composer store 里，本组件只是那份状态的一个视图：
 * 关掉面板不影响任何在途上传，重新打开看到的还是同一份进度。
 * 拖拽和选择文件这两件事本身很简单，一个 input[type=file] 加三个
 * drag 事件就够了。
 */
import Popover from 'primevue/popover'
import Button from 'primevue/button'
import { computed, ref } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useComposerStore } from '@/stores/composer_store'
import { useIngestStore, type IngestTask } from '@/stores/ingest_store'
import AttachmentChip from '@/components/main_chat/AttachmentChip.vue'

const toast = useToast()
const composer = useComposerStore()
const ingestStore = useIngestStore()

const op = ref()
const fileInput = ref<HTMLInputElement>()
const isDragOver = ref(false)

const accept = computed(() =>
  composer.ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(','),
)

function openPicker() {
  fileInput.value?.click()
}

/**
 * 交给 store，把被拒绝的文件汇总成提示。
 *
 * 每个被拒文件弹一条 toast 会在用户一次选了十个不合法文件时刷屏，
 * 合成一条。
 */
function handleFiles(files: FileList | null) {
  if (!files?.length) return

  const rejected = composer.addFiles(Array.from(files))
  if (rejected.length) {
    toast.add({
      severity: 'warn',
      summary: '部分文件未加入',
      detail: rejected.map((item) => `${item.name}：${item.reason}`).join('\n'),
      life: 5000,
    })
  }
}

function onPick(event: Event) {
  const input = event.target as HTMLInputElement
  handleFiles(input.files)
  // 清空 value：不清的话连续选同一个文件不会触发 change 事件，
  // 表现为「移除后再选同一个文件没反应」
  input.value = ''
}

function onDrop(event: DragEvent) {
  isDragOver.value = false
  handleFiles(event.dataTransfer?.files ?? null)
}

/**
 * 历史解析任务。与待发送区是两回事：这里是这个用户过去传过的东西，
 * 用来回答「我上次那个文件到底入库了没有」。
 *
 * 排掉正在待发送区里的那些，否则同一个文件在面板里出现两次。
 */
const historyTasks = computed(() => {
  const pendingTaskIds = new Set(
    composer.attachments.map((item) => item.task_id).filter(Boolean),
  )
  return Object.values(ingestStore.tasks).filter(
    (task) => !pendingTaskIds.has(task.task_id),
  )
})

const isTerminal = (task: IngestTask) =>
  ['SUCCESS', 'FAILED', 'DUPLICATE'].includes(task.status)

/**
 * 状态文案。SESSION 与 CORPUS 两种去向的说法必须分开 ——
 * 用户上传的文件（SESSION）不进知识库，只在那一次对话里可用；
 * 只有管理员导入的语料（CORPUS）才是「已入知识库，所有对话可检索」。
 * 都写「已入库」会让用户以为自己的文件进了共享检索库。
 */
const statusLabel = (task: IngestTask) => {
  const isCorpus = task.target === 'CORPUS'
  switch (task.status) {
    case 'PENDING':
      return '排队中，等待显存资源'
    case 'RUNNING':
      return '正在解析'
    case 'SUCCESS':
      return isCorpus
        ? `已入知识库，共 ${task.chunk_count ?? 0} 个片段`
        : `已解析，共 ${task.chunk_count ?? 0} 字`
    case 'DUPLICATE':
      return '此前已入库，已跳过'
    case 'FAILED':
      return `失败：${task.error_message ?? '未知原因'}`
    default:
      return task.status
  }
}

/**
 * 打开面板时拉一次列表：用户可能刷新过页面，之前的轮询定时器
 * 已经随页面消失，未完成的任务要在这里接着轮。
 */
const toggleAndRefresh = (event: PointerEvent) => {
  ingestStore.fetchTasks()
  op.value.toggle(event)
}

/*
 * 这里刻意不再有 onUnmounted → ingestStore.stopAll()。
 *
 * 原实现有那一句，而本组件会随 Popover 的开合反复卸载 —— 于是「关掉面板」
 * 顺手停掉了所有解析任务的轮询。表现是：关掉面板再打开，任务永远停在
 * 「排队中」，直到用户刷新页面。轮询的生命周期属于 store，不该由一个
 * 会被反复销毁的视图来终止。
 */

defineExpose({ toggle: toggleAndRefresh })
</script>

<template>
  <Popover class="popover_component" ref="op">
    <div class="w-80 sm:w-96">
      <input
        ref="fileInput"
        type="file"
        multiple
        :accept="accept"
        class="hidden"
        @change="onPick"
      />

      <div
        class="flex flex-col items-center justify-center gap-2 py-8 rounded-xl border-2 border-dashed cursor-pointer transition-colors"
        :class="isDragOver
          ? 'border-blue-400 bg-blue-50'
          : 'border-surface-200 dark:border-surface-700 hover:border-blue-300'"
        @click="openPicker"
        @dragenter.prevent="isDragOver = true"
        @dragover.prevent="isDragOver = true"
        @dragleave.prevent="isDragOver = false"
        @drop.prevent="onDrop"
      >
        <i class="text-[2rem]! pi pi-cloud-upload text-gray-400"></i>
        <div class="text-center">
          <p class="text-base font-medium mt-0 mb-1">把文件拖到这里</p>
          <p class="text-xs text-muted-color m-0">
            或点击选择 · 支持 {{ composer.ALLOWED_EXTENSIONS.join(' / ') }} · 单个最大 50MB
          </p>
          <!--
            把去向说清楚。用户有权知道自己传的东西会不会被别人看到 ——
            改动前这些文件确实进了所有人共享的检索库，界面上却没有任何提示。
          -->
          <p class="text-[0.68rem] text-muted-color mt-2 mb-0">
            仅用于本次对话，不会进入公共知识库
          </p>
        </div>
      </div>

      <!--
        本次要发送的附件。选中即开始上传，所以这一段从选择文件那一刻
        就有内容 —— 不再有「选了但没点 Upload」这个让人踩坑的中间态。
      -->
      <div v-if="composer.hasAttachments" class="flex flex-col gap-2 mt-4">
        <div class="flex items-center justify-between">
          <span class="text-sm text-muted-color">
            随下一条消息发送（{{ composer.attachments.length }}/{{ composer.MAX_ATTACHMENTS }}）
          </span>
          <Button variant="text" size="small" severity="danger" @click="composer.clear()">
            全部移除
          </Button>
        </div>
        <AttachmentChip
          v-for="item of composer.attachments"
          :key="item.id"
          class="max-w-none!"
          :name="item.name"
          :size="item.size"
          :status="item.status"
          :progress="item.progress"
          :error-message="item.error_message"
          removable
          @remove="composer.remove(item.id)"
        />
      </div>

      <!--
        历史解析进度。与上传进度是两件事：上传条走完只说明文件传到服务器了，
        解析（Docling + 向量化）还要几分钟，在后台队列里排队进行。
      -->
      <div v-if="historyTasks.length" class="flex flex-col gap-2 mt-4">
        <span class="text-sm text-muted-color">此前的解析任务</span>
        <div
          v-for="task of historyTasks"
          :key="task.task_id"
          class="flex items-center justify-between gap-2 p-3 rounded-lg bg-surface-50 dark:bg-surface-800"
        >
          <div class="flex flex-col min-w-0">
            <span class="text-sm font-medium truncate" :title="task.file_name">
              {{ task.file_name }}
            </span>
            <span class="text-xs text-muted-color truncate">{{ statusLabel(task) }}</span>
          </div>
          <Button
            v-if="isTerminal(task)"
            type="button" iconOnly variant="text" severity="secondary"
            size="small" rounded
            :aria-label="`不再显示 ${task.file_name}`"
            @click="ingestStore.dismiss(task.task_id)"
          >
            <i class="text-[1.1rem]! pi pi-times"></i>
          </Button>
          <i v-else class="pi pi-spin pi-spinner text-muted-color" aria-hidden="true"></i>
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
