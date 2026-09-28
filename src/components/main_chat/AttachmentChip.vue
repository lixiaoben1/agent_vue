<script setup lang="ts">
/**
 * 一个附件的缩略展示。
 *
 * 三处复用：输入框上方的待发送区、上传面板、以及已发出消息的气泡。
 * 三处的状态语义完全一致，各写一遍必然会漂移（比如面板里显示「已入库」
 * 而消息里还写着「解析中」）。
 *
 * 上传进度用底部一条细进度条表示，而不是 PrimeVue 的 ProgressBar ——
 * chip 只有 40 多像素高，ProgressBar 的默认尺寸会把布局撑开。
 */
import { computed } from 'vue'
import { formatSize } from '@/tools/formatSize'
import type { AttachmentStatus } from '@/interface/attachment-interface'

const props = defineProps<{
  name: string
  size: number
  status: AttachmentStatus
  /** 0–100，仅 uploading 时使用。 */
  progress?: number
  errorMessage?: string
  /** 待发送区和上传面板要能移除，消息气泡里不能。 */
  removable?: boolean
}>()

const emit = defineEmits<{ remove: [] }>()

/** 按扩展名给图标。pdf / docx 有专门的字形，其余用通用文件图标。 */
const icon = computed(() => {
  const extension = props.name.split('.').pop()?.toLowerCase() ?? ''
  if (props.status === 'error') return 'pi-exclamation-circle'
  switch (extension) {
    case 'pdf':
      return 'pi-file-pdf'
    case 'docx':
      return 'pi-file-word'
    case 'md':
    case 'txt':
      return 'pi-file-edit'
    default:
      return 'pi-file'
  }
})

const iconColor = computed(() => {
  switch (props.status) {
    case 'error':
      return 'text-red-500'
    case 'ready':
    case 'duplicate':
      return 'text-emerald-600'
    default:
      return 'text-blue-500'
  }
})

/**
 * 状态文案。
 *
 * uploading 与 parsing 必须分开说：前者有进度条在动，后者是几分钟的静默等待。
 * 都写「处理中」的话，用户在 parsing 阶段会以为界面卡住了。
 */
/**
 * 状态文案。
 *
 * ready 刻意不写「已入库」：用户上传的文件不进知识库 —— 它只解析成文本，
 * 在本次对话里作为上下文使用，别的会话和别的用户都碰不到。写「已入库」
 * 会让用户以为文件进了共享检索库，那是对数据去向的错误承诺。
 */
const label = computed(() => {
  switch (props.status) {
    case 'uploading':
      return `上传中 ${props.progress ?? 0}%`
    case 'parsing':
      return '正在解析，可能需要几分钟'
    case 'ready':
      return '已就绪，可在本次对话中引用'
    case 'duplicate':
      return '已就绪'
    case 'error':
      return props.errorMessage ?? '失败'
    default:
      return ''
  }
})

const isBusy = computed(
  () => props.status === 'uploading' || props.status === 'parsing',
)
</script>

<template>
  <div
    class="relative flex items-center gap-2 py-2 pl-2.5 pr-1 rounded-xl bg-white/80 border overflow-hidden max-w-60"
    :class="status === 'error' ? 'border-red-200' : 'border-gray-200'"
  >
    <i class="pi shrink-0 text-[1.1rem]!" :class="[icon, iconColor]"></i>

    <div class="flex flex-col min-w-0">
      <span class="text-xs font-medium truncate" :title="name">{{ name }}</span>
      <span class="text-[0.68rem] text-gray-500 truncate" :title="label">
        {{ formatSize(size) }} · {{ label }}
      </span>
    </div>

    <!-- 移除按钮优先于转圈：解析要几分钟，这期间不给移除入口用户就只能干等 -->
    <button
      v-if="removable"
      type="button"
      class="shrink-0 flex items-center justify-center w-6 h-6 rounded-full hover:bg-gray-200 cursor-pointer"
      :aria-label="`移除 ${name}`"
      @click.stop="emit('remove')"
    >
      <i class="pi pi-times text-[0.7rem]! text-gray-500"></i>
    </button>
    <i
      v-else-if="isBusy"
      class="pi pi-spin pi-spinner shrink-0 text-[0.8rem]! text-gray-400"
      aria-hidden="true"
    ></i>

    <!--
      上传进度。只在 uploading 时出现 —— parsing 阶段后端不提供百分比
      （解析是队列里的黑盒），画一条假的进度条比不画更糟。
    -->
    <div
      v-if="status === 'uploading'"
      class="absolute bottom-0 left-0 h-0.5 bg-blue-500 transition-[width] duration-200"
      :style="{ width: `${progress ?? 0}%` }"
      role="progressbar"
      :aria-valuenow="progress ?? 0"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-label="`${name} 上传进度`"
    ></div>
  </div>
</template>
