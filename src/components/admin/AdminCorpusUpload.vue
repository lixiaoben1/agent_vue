<script setup lang="ts">
/**
 * 管理员语料导入。
 *
 * 与用户那个上传面板（UploadFile.vue）的关键区别是**去向**：这里传的文件
 * 会被向量化写进 Chroma，之后所有用户提问时都可能被 rag 工具检索到并
 * 送进模型。用户面板的文件只解析成文本，仅在提交者本人那一轮对话里可用。
 *
 * 因为影响面是全局的，界面上要把这件事说明白，并且不做「选中即上传」——
 * 那个交互适合用户随手拖文件，不适合一个会改变所有人检索结果的操作。
 * 这里要求显式点一下「导入」。
 */
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import { formatSize } from '@/tools/formatSize'
import http from '@/api/http'

const emit = defineEmits<{ uploaded: [count: number] }>()

const toast = useToast()
const fileInput = ref<HTMLInputElement>()
const selected = ref<File[]>([])
const uploading = ref(false)
const isDragOver = ref(false)

/** 与后端 ALLOWED_FILE_TYPES / MAX_FILES_PER_REQUEST 一致。 */
const ALLOWED = ['txt', 'pdf', 'md', 'docx']
const MAX_FILES = 10
const MAX_SIZE = 50 * 1024 * 1024

const accept = computed(() => ALLOWED.map((ext) => `.${ext}`).join(','))

function openPicker() {
  fileInput.value?.click()
}

function addFiles(files: FileList | null) {
  if (!files?.length) return
  const rejected: string[] = []

  for (const file of Array.from(files)) {
    if (selected.value.length >= MAX_FILES) {
      rejected.push(`${file.name}：一次最多 ${MAX_FILES} 个`)
      continue
    }
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!ALLOWED.includes(ext)) {
      rejected.push(`${file.name}：不支持的类型`)
      continue
    }
    if (file.size > MAX_SIZE) {
      rejected.push(`${file.name}：超过 50MB`)
      continue
    }
    if (file.size === 0) {
      rejected.push(`${file.name}：文件是空的`)
      continue
    }
    if (selected.value.some((one) => one.name === file.name && one.size === file.size)) {
      continue
    }
    selected.value.push(file)
  }

  if (rejected.length) {
    toast.add({
      severity: 'warn',
      summary: '部分文件未加入',
      detail: rejected.join('\n'),
      life: 5000,
    })
  }
}

function onPick(event: Event) {
  const input = event.target as HTMLInputElement
  addFiles(input.files)
  // 清空 value，否则连续选同一个文件不会触发 change
  input.value = ''
}

function onDrop(event: DragEvent) {
  isDragOver.value = false
  addFiles(event.dataTransfer?.files ?? null)
}

function remove(index: number) {
  selected.value.splice(index, 1)
}

/**
 * 提交导入。
 *
 * 用 axios 而不是裸 XHR：这里不需要逐文件进度（管理员导入是个低频的
 * 运维动作，一个整体的「进行中」就够），而 axios 能自动带上 Authorization
 * 并复用 401 处理。用户侧那个上传要自己发 XHR，是因为要每个文件各自的进度条。
 */
async function submit() {
  if (!selected.value.length || uploading.value) return

  const formData = new FormData()
  // 字段名必须是 files，与后端 @RequestParam("files") 对应
  selected.value.forEach((file) => formData.append('files', file))

  uploading.value = true
  try {
    const res = await http.post<unknown[]>('/api/admin/rag/upload', formData)
    const count = Array.isArray(res.data) ? res.data.length : selected.value.length
    selected.value = []
    emit('uploaded', count)
  } catch (e: any) {
    const status = e?.response?.status
    toast.add({
      severity: 'error',
      summary: '导入失败',
      // 404 在这里的含义是「没有管理权限」——后端对非管理员统一返回 404，
      // 不用 403（那会向普通用户宣告管理接口存在）
      detail: status === 404
        ? '没有管理权限，或接口不存在'
        : e?.response?.data?.message ?? '请稍后重试',
      life: 5000,
    })
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <section class="p-4 rounded-xl bg-white shadow-sm">
    <h2 class="text-base font-medium mt-0 mb-1">导入知识库</h2>
    <p class="text-[0.7rem] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-2 mt-0 mb-3">
      <i class="pi pi-exclamation-triangle mr-1 text-[0.7rem]!"></i>
      这里导入的内容会进入向量库，被<strong>所有用户</strong>的检索命中。
      只放你确认可以公开给全部使用者的资料。
    </p>

    <input
      ref="fileInput"
      type="file"
      multiple
      :accept="accept"
      class="hidden"
      @change="onPick"
    />

    <div
      class="flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed cursor-pointer transition-colors"
      :class="isDragOver
        ? 'border-violet-400 bg-violet-50'
        : 'border-gray-200 hover:border-violet-300'"
      @click="openPicker"
      @dragenter.prevent="isDragOver = true"
      @dragover.prevent="isDragOver = true"
      @dragleave.prevent="isDragOver = false"
      @drop.prevent="onDrop"
    >
      <i class="text-[1.6rem]! pi pi-cloud-upload text-gray-400"></i>
      <p class="text-sm m-0">拖入或点击选择语料文件</p>
      <p class="text-[0.68rem] text-gray-400 m-0">
        支持 {{ ALLOWED.join(' / ') }} · 单个最大 50MB · 一次最多 {{ MAX_FILES }} 个
      </p>
    </div>

    <div v-if="selected.length" class="flex flex-col gap-2 mt-3">
      <div
        v-for="(file, index) of selected"
        :key="file.name + file.size"
        class="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 text-sm"
      >
        <div class="flex flex-col min-w-0">
          <span class="truncate font-medium" :title="file.name">{{ file.name }}</span>
          <span class="text-[0.68rem] text-gray-500">{{ formatSize(file.size) }}</span>
        </div>
        <Button
          type="button" iconOnly variant="text" severity="secondary" size="small" rounded
          :disabled="uploading"
          :aria-label="`移除 ${file.name}`"
          @click="remove(index)"
        >
          <i class="pi pi-times text-[0.8rem]!"></i>
        </Button>
      </div>

      <div class="flex items-center justify-end gap-2 mt-1">
        <Button
          variant="text" size="small" severity="secondary"
          :disabled="uploading"
          @click="selected = []"
        >清空</Button>
        <!--
          显式的「导入」按钮，不做选中即上传：这个动作会改变所有用户的
          检索结果，值得一次确认。用户侧那个面板相反 —— 随手拖文件就该开始传。
        -->
        <Button size="small" :disabled="uploading" @click="submit">
          <i
            v-if="uploading"
            class="pi pi-spin pi-spinner mr-2 text-[0.8rem]!"
          ></i>
          {{ uploading ? '提交中' : `导入 ${selected.length} 个文件到知识库` }}
        </Button>
      </div>
    </div>
  </section>
</template>
