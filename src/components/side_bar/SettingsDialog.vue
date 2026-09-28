<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useVerifyStore } from '@/stores/verify.ts'
import { useConversationStore } from '@/stores/conversation_store.ts'
import { useChatStore } from '@/stores/chat_store.ts'
import { useSettingsStore } from '@/stores/settings_store.ts'
import { useRouter } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import http from '@/api/http'
import Dialog from 'primevue/dialog'
import TabView from 'primevue/tabview'
import TabPanel from 'primevue/tabpanel'
import Button from 'primevue/button'
import Divider from 'primevue/divider'
import ToggleSwitch from 'primevue/toggleswitch'
import Slider from 'primevue/slider'

const visible = defineModel<boolean>('visible', { default: false })

const verifyStore = useVerifyStore()
const conversationStore = useConversationStore()
const chatStore = useChatStore()
const settingsStore = useSettingsStore()
const router = useRouter()
const confirm = useConfirm()
const toast = useToast()

// ===== 系统信息 =====
const systemInfo = ref({
  version: '1.0.0',
  corpusChunkCount: 0,
})

// 加载系统信息
onMounted(async () => {
  try {
    if (verifyStore.isAdmin) {
      // 用 dashboard 接口拿语料统计
      const dashboardRes = await http.get('/api/admin/dashboard')
      systemInfo.value.corpusChunkCount = dashboardRes.data.corpus?.chunk_count || 0
    }
  } catch (e) {
    console.error('加载系统信息失败', e)
  }
})

// ===== 账户操作 =====
const handleLogout = () => {
  confirm.require({
    message: '确定要退出登录吗？',
    header: '退出确认',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: '退出',
    rejectLabel: '取消',
    accept: () => {
      verifyStore.logout()
      visible.value = false
      toast.add({
        severity: 'success',
        summary: '已退出',
        detail: '您已成功退出登录',
        life: 3000,
      })
    },
  })
}

// ===== 对话管理 =====
const handleClearCurrentChat = () => {
  const convId = conversationStore.selectedItem
  if (!convId) {
    toast.add({
      severity: 'warn',
      summary: '提示',
      detail: '请先选择一个会话',
      life: 3000,
    })
    return
  }

  confirm.require({
    message: '确定要清空当前会话的所有消息吗？此操作不可恢复。',
    header: '清空会话',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: '清空',
    rejectLabel: '取消',
    accept: () => {
      // 清空本地该会话的消息
      chatStore.messages[convId] = []
      toast.add({
        severity: 'success',
        summary: '已清空',
        detail: '当前会话已清空（仅本地）',
        life: 3000,
      })
    },
  })
}

const handleExportHistory = async () => {
  try {
    const selectedConvId = conversationStore.selectedItem
    if (!selectedConvId) {
      toast.add({
        severity: 'warn',
        summary: '提示',
        detail: '请先选择一个会话',
        life: 3000,
      })
      return
    }

    const res = await http.get(`/api/conversations/${selectedConvId}/history`)
    const history = res.data

    // 转换为可读的Markdown格式
    let markdown = `# 对话导出\n\n`
    markdown += `**会话ID**: ${selectedConvId}\n`
    markdown += `**导出时间**: ${new Date().toLocaleString()}\n\n`
    markdown += `---\n\n`

    history.forEach((msg: any) => {
      const role = msg.role === 'HumanMessage' ? '👤 用户' : '🤖 助手'
      const time = msg.created_at ? new Date(msg.created_at).toLocaleString() : ''
      markdown += `## ${role} ${time ? `(${time})` : ''}\n\n`
      markdown += `${msg.content}\n\n`
      if (msg.reasoning) {
        markdown += `<details>\n<summary>推理过程</summary>\n\n${msg.reasoning}\n\n</details>\n\n`
      }
      markdown += `---\n\n`
    })

    // 下载文件
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `conversation_${selectedConvId}_${Date.now()}.md`
    a.click()
    URL.revokeObjectURL(url)

    toast.add({
      severity: 'success',
      summary: '导出成功',
      detail: '对话历史已保存为Markdown文件',
      life: 3000,
    })
  } catch (e: any) {
    toast.add({
      severity: 'error',
      summary: '导出失败',
      detail: e.response?.data?.message || '导出对话历史时出错',
      life: 5000,
    })
  }
}

// ===== 文件管理 =====
const currentSessionFiles = ref<any[]>([])

const loadSessionFiles = async () => {
  try {
    const selectedConvId = conversationStore.selectedItem
    if (!selectedConvId) {
      toast.add({
        severity: 'warn',
        summary: '提示',
        detail: '请先选择一个会话',
        life: 3000,
      })
      return
    }

    const res = await http.get(`/api/conversations/${selectedConvId}/documents`)
    currentSessionFiles.value = res.data || []
  } catch (e: any) {
    if (e.response?.status === 404) {
      toast.add({
        severity: 'info',
        summary: '提示',
        detail: '该会话不存在或无权访问',
        life: 3000,
      })
    } else {
      console.error('加载会话文件失败', e)
    }
  }
}

const handleClearSessionFiles = () => {
  confirm.require({
    message: '确定要清除当前会话的所有上传文件吗？\n\n注意：已注入到对话历史的内容不会被移除，但数据库中的文件记录会被删除。',
    header: '清除文件',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: '清除',
    rejectLabel: '取消',
    accept: async () => {
      try {
        const selectedConvId = conversationStore.selectedItem
        if (!selectedConvId) return

        await http.delete(`/api/conversations/${selectedConvId}/documents`)
        currentSessionFiles.value = []
        toast.add({
          severity: 'success',
          summary: '清除成功',
          detail: '会话文件已清除',
          life: 3000,
        })
      } catch (e: any) {
        toast.add({
          severity: 'error',
          summary: '清除失败',
          detail: e.response?.data?.message || '清除文件时出错',
          life: 5000,
        })
      }
    },
  })
}

</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    header="设置"
    :style="{ width: '50rem', minHeight: '32rem' }"
    :breakpoints="{ '1199px': '75vw', '575px': '90vw' }"
  >
    <TabView style="min-height: 28rem;">
      <!-- 账户标签 -->
      <TabPanel value="account" header="账户">
        <div class="flex flex-col gap-4">
          <div class="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
            <i class="pi pi-user text-3xl text-blue-500"></i>
            <div class="flex-1">
              <div class="font-bold text-lg">{{ verifyStore.username }}</div>
              <div class="text-sm text-gray-500">ID: {{ verifyStore.user_id }}</div>
              <div class="text-sm text-gray-500">
                角色: {{ verifyStore.isAdmin ? '管理员' : '普通用户' }}
              </div>
            </div>
          </div>

          <Divider />

          <div class="flex flex-col gap-2">
            <Button
              label="退出登录"
              icon="pi pi-sign-out"
              severity="danger"
              outlined
              @click="handleLogout"
            />
          </div>
        </div>
      </TabPanel>

      <!-- 对话管理标签 -->
      <TabPanel value="conversations" header="对话管理">
        <div class="flex flex-col gap-3">
          <div class="text-sm text-gray-600 mb-2">
            管理您的对话历史和会话内容
          </div>

          <Button
            label="清空当前会话（仅本地）"
            icon="pi pi-trash"
            severity="secondary"
            outlined
            @click="handleClearCurrentChat"
          />

          <Button
            label="导出当前对话"
            icon="pi pi-download"
            severity="secondary"
            outlined
            @click="handleExportHistory"
          />
        </div>
      </TabPanel>

      <!-- 显示设置标签 -->
      <TabPanel value="display" header="显示">
        <div class="flex flex-col gap-4">
          <div class="flex items-center justify-between">
            <div>
              <div class="font-medium">暗色模式</div>
              <div class="text-sm text-gray-500">切换界面主题</div>
            </div>
            <ToggleSwitch v-model="settingsStore.darkMode" />
          </div>

          <Divider />

          <div class="flex items-center justify-between">
            <div>
              <div class="font-medium">显示推理过程</div>
              <div class="text-sm text-gray-500">显示AI的思考过程</div>
            </div>
            <ToggleSwitch v-model="settingsStore.showReasoning" />
          </div>

          <Divider />

          <div class="flex flex-col gap-2">
            <div class="font-medium">字体大小: {{ settingsStore.fontSize }}px</div>
            <Slider v-model="settingsStore.fontSize" :min="12" :max="20" :step="1" />
          </div>

          <Divider />

          <div class="text-xs text-gray-500">
            设置会自动保存并立即生效
          </div>
        </div>
      </TabPanel>

      <!-- 文件管理标签 -->
      <TabPanel value="files" header="文件">
        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between mb-2">
            <div class="text-sm text-gray-600">
              当前会话的上传文件
            </div>
            <Button
              label="刷新"
              icon="pi pi-refresh"
              size="small"
              text
              @click="loadSessionFiles"
            />
          </div>

          <div v-if="currentSessionFiles.length === 0" class="text-center text-gray-400 py-4">
            暂无文件
          </div>

          <div v-else class="flex flex-col gap-2">
            <div
              v-for="file in currentSessionFiles"
              :key="file.task_id"
              class="flex items-center justify-between p-3 bg-gray-50 rounded"
            >
              <div class="flex items-center gap-2">
                <i class="pi pi-file text-blue-500"></i>
                <div>
                  <div class="font-medium">{{ file.file_name }}</div>
                  <div class="text-xs text-gray-500">
                    {{ file.char_count }} 字符
                    <span v-if="file.truncated" class="text-orange-600">（已截断）</span>
                    <span v-if="file.injected_at" class="text-green-600">（已注入）</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Divider />

          <div class="text-xs text-gray-500 mb-2">
            ⚠️ 清除文件只会删除数据库记录，已注入到对话历史的内容不会被移除
          </div>

          <Button
            label="清除会话文件"
            icon="pi pi-trash"
            severity="danger"
            outlined
            @click="handleClearSessionFiles"
            :disabled="currentSessionFiles.length === 0"
          />
        </div>
      </TabPanel>

      <!-- 关于标签 -->
      <TabPanel value="about" header="关于">
        <div class="flex flex-col gap-4">
          <div class="text-center mb-4">
            <i class="pi pi-comment text-6xl text-blue-500 mb-3"></i>
            <div class="text-2xl font-bold">Agent Chat</div>
            <div class="text-sm text-gray-500">版本 {{ systemInfo.version }}</div>
          </div>

          <Divider />

          <div v-if="verifyStore.isAdmin" class="flex flex-col gap-2">
            <div class="font-medium text-lg mb-2">系统信息</div>
            <div class="grid grid-cols-2 gap-2 text-sm">
              <div class="text-gray-600">语料库片段数:</div>
              <div class="font-mono">{{ systemInfo.corpusChunkCount }}</div>
            </div>
          </div>

          <Divider />

          <div class="flex flex-col gap-2 text-sm text-center text-gray-500">
            <div>© 2024 Agent Chat. All rights reserved.</div>
          </div>
        </div>
      </TabPanel>
    </TabView>
  </Dialog>
</template>

<style scoped>
/* 自定义样式 */
</style>
