<script setup lang="ts">
/**
 * 管理看板。
 *
 * 这个页面对普通用户不可见（侧边栏不显示入口），但**可见性不是权限** ——
 * 谁都能直接输 /admin 进来。真正的拦截在后端：每个 /api/admin/** 请求
 * 都由 AdminGuard 现查数据库确认角色，非管理员一律 404。本页对那种情况
 * 显示一句说明，而不是假装成一个空看板。
 */
import { onBeforeUnmount, onMounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import { useAdminStore } from '@/stores/admin_store'
import { useVerifyStore } from '@/stores/verify'
import AdminCorpusUpload from '@/components/admin/AdminCorpusUpload.vue'
import AdminInviteKeys from '@/components/admin/AdminInviteKeys.vue'

const admin = useAdminStore()
const verifyStore = useVerifyStore()
const router = useRouter()
const toast = useToast()

const stage = computed(() => admin.snapshot?.upload_stage)
const gpu = computed(() => admin.snapshot?.gpu)
const corpus = computed(() => admin.snapshot?.corpus)
const accounts = computed(() => admin.snapshot?.accounts)

/** 「数据截至」时刻。看板是轮询的，标出快照时间才能判断数据是否卡住了。 */
const generatedAtText = computed(() => {
  const at = admin.snapshot?.generated_at
  if (!at) return '—'
  return new Date(at).toLocaleTimeString('zh-CN')
})

/**
 * 显存令牌是否可能泄漏。
 *
 * 判据：配额全被占着，但没有任何会话在推理、也没有任务在解析。
 * 这是「服务莫名 503」最常见的原因，而且日志里不会有任何异常 ——
 * 所以必须在看板上主动指出来，光给一个数字管理员看不出问题。
 */
const permitLeakSuspected = computed(() => {
  const g = gpu.value
  const s = stage.value
  if (!g || !s || g.available_permits === null) return false
  const busy = (admin.snapshot?.inferring.length ?? 0)
    + s.session_running + s.corpus_running
  return g.available_permits === 0 && busy === 0
})

const elapsedText = (seconds: number) => {
  if (seconds < 0) return '—'
  if (seconds < 60) return `${seconds} 秒`
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
}

const statusClass = (status: string) => {
  switch (status) {
    case 'SUCCESS':
      return 'text-emerald-600'
    case 'FAILED':
      return 'text-red-600'
    case 'RUNNING':
      return 'text-blue-600'
    case 'DUPLICATE':
      return 'text-gray-500'
    default:
      return 'text-amber-600'
  }
}

function onCorpusUploaded(count: number) {
  toast.add({
    severity: 'success',
    summary: '已加入解析队列',
    detail: `${count} 个文件正在向量化，可在下方任务列表查看进度`,
    life: 4000,
  })
  admin.fetchSnapshot()
}

/*
 * 只在已登录时轮询。
 *
 * 未登录就开轮询的话，每 5 秒打一个 401 —— 而 http 拦截器收到 401 会
 * 弹登录框，于是用户每 5 秒被弹一次。等登录成功了再开始。
 */
watch(
  () => verifyStore.isVerified,
  (verified) => {
    if (verified) {
      admin.startPolling()
    } else {
      admin.stopPolling()
    }
  },
  { immediate: true },
)

onMounted(() => {
  // 直接访问 /admin 时（本页在 SideBar 之外，没有别处会触发登录框）
  if (!verifyStore.isVerified) verifyStore.requireVerify()
})

onBeforeUnmount(() => {
  // 不停的话离开页面后定时器还在每 5 秒发请求
  admin.stopPolling()
})
</script>

<template>
  <div class="w-full h-full overflow-y-auto bg-gray-100 p-6">
    <div class="max-w-6xl mx-auto flex flex-col gap-5">

      <header class="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 class="text-2xl font-semibold m-0">管理看板</h1>
          <p class="text-xs text-gray-500 mt-1 mb-0">
            {{ verifyStore.username }} ·
            数据截至 {{ generatedAtText }} · 每 5 秒刷新
            <span v-if="admin.loading" class="ml-2">
              <i class="pi pi-spin pi-spinner text-[0.7rem]!"></i>
            </span>
          </p>
        </div>
        <Button variant="outlined" size="small" @click="router.push('/chat')">
          <i class="pi pi-arrow-left mr-2 text-[0.8rem]!"></i>返回对话
        </Button>
      </header>

      <!--
        未登录时给个明确的入口。
        本页在 SideBar 之外，没有那个「点此登录」的常驻入口 ——
        不给按钮的话未登录直接访问 /admin 只能看到一片空白加一句报错。
      -->
      <div
        v-if="!verifyStore.isVerified"
        class="p-4 rounded-xl bg-white border border-amber-200 text-sm"
      >
        <p class="font-medium mt-0 mb-2">需要先登录</p>
        <Button size="small" @click="verifyStore.requireVerify()">登录</Button>
      </div>

      <!-- 无权限时把话说清楚，而不是显示一个空看板让人以为服务坏了 -->
      <div
        v-else-if="admin.forbidden"
        class="p-4 rounded-xl bg-white border border-red-200 text-sm"
      >
        <p class="font-medium text-red-600 mt-0 mb-2">没有管理权限</p>
        <p class="text-gray-600 m-0">
          当前登录账号（{{ verifyStore.username }}）不是管理员。
          管理员只能通过命令行插库产生 —— 注册接口不会创建管理员。
          见 docs/sql/04_invite_keys.sql 第 3 段。
        </p>
      </div>

      <div
        v-else-if="admin.error"
        class="p-3 rounded-xl bg-white border border-amber-200 text-sm text-amber-700"
      >
        {{ admin.error }}（仍在重试）
      </div>

      <template v-if="verifyStore.isVerified && !admin.forbidden">
        <!-- 四个核心数字 -->
        <section class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="p-4 rounded-xl bg-white shadow-sm">
            <div class="text-xs text-gray-500">在线用户</div>
            <div class="text-2xl font-semibold mt-1">{{ admin.onlineCount }}</div>
          </div>
          <div class="p-4 rounded-xl bg-white shadow-sm">
            <div class="text-xs text-gray-500">推理中会话</div>
            <div class="text-2xl font-semibold mt-1">
              {{ admin.snapshot?.inferring.length ?? 0 }}
            </div>
          </div>
          <div class="p-4 rounded-xl bg-white shadow-sm">
            <div class="text-xs text-gray-500">知识库片段</div>
            <div class="text-2xl font-semibold mt-1">
              <span v-if="corpus && corpus.chunk_count >= 0">
                {{ corpus.chunk_count.toLocaleString('zh-CN') }}
              </span>
              <span v-else class="text-base text-gray-400">读取失败</span>
            </div>
            <div v-if="corpus" class="text-[0.68rem] text-gray-400 mt-1">
              {{ corpus.file_count >= 0 ? `${corpus.file_count} 个文件` : '' }}
              · {{ corpus.collection }}
            </div>
          </div>
          <div class="p-4 rounded-xl bg-white shadow-sm">
            <div class="text-xs text-gray-500">可用显存配额</div>
            <div class="text-2xl font-semibold mt-1">
              <template v-if="gpu && gpu.available_permits !== null">
                {{ gpu.available_permits }}
                <span class="text-sm text-gray-400">
                  / {{ gpu.effective_total_permits ?? gpu.configured_total_permits }}
                </span>
              </template>
              <span v-else class="text-base text-red-500">Redis 不可达</span>
            </div>
            <!--
              生效值与配置值不一致要显式说出来：信号量一旦初始化过，
              改配置不会重设它。只看配置值会得出错误结论。
            -->
            <div
              v-if="gpu && gpu.effective_total_permits !== null
                && gpu.effective_total_permits !== gpu.configured_total_permits"
              class="text-[0.68rem] text-amber-600 mt-1"
            >
              配置为 {{ gpu.configured_total_permits }}，未生效
            </div>
          </div>
        </section>

        <div
          v-if="permitLeakSuspected"
          class="p-3 rounded-xl bg-amber-50 border border-amber-300 text-sm text-amber-800"
        >
          <i class="pi pi-exclamation-triangle mr-2"></i>
          配额已全部占用，但没有任何推理或解析在进行 —— 可能有令牌泄漏，
          此时所有对话请求都会收到 503。
        </div>

        <!-- 文件阶段 -->
        <section class="p-4 rounded-xl bg-white shadow-sm">
          <h2 class="text-base font-medium mt-0 mb-1">文件处理阶段</h2>
          <p class="text-[0.7rem] text-gray-500 mt-0 mb-3">
            会话文件只解析成文本供上传者本人的那一次对话使用，不进知识库；
            只有下方「导入知识库」上传的语料会进入向量库并被所有对话检索。
          </p>
          <div v-if="stage" class="grid grid-cols-2 gap-6 text-sm">
            <div>
              <div class="text-xs text-gray-500 mb-2">用户会话文件（不进知识库）</div>
              <div class="flex flex-col gap-1">
                <div class="flex justify-between"><span>排队中</span><span class="font-medium">{{ stage.session_pending }}</span></div>
                <div class="flex justify-between"><span>解析中</span><span class="font-medium">{{ stage.session_running }}</span></div>
                <div class="flex justify-between"><span>已完成</span><span class="font-medium">{{ stage.session_success }}</span></div>
                <div class="flex justify-between"><span>失败</span><span class="font-medium" :class="stage.session_failed ? 'text-red-600' : ''">{{ stage.session_failed }}</span></div>
              </div>
            </div>
            <div>
              <div class="text-xs text-gray-500 mb-2">知识库语料（管理员导入）</div>
              <div class="flex flex-col gap-1">
                <div class="flex justify-between"><span>排队中</span><span class="font-medium">{{ stage.corpus_pending }}</span></div>
                <div class="flex justify-between"><span>解析中</span><span class="font-medium">{{ stage.corpus_running }}</span></div>
                <div class="flex justify-between"><span>已完成</span><span class="font-medium">{{ stage.corpus_success }}</span></div>
                <div class="flex justify-between"><span>失败</span><span class="font-medium" :class="stage.corpus_failed ? 'text-red-600' : ''">{{ stage.corpus_failed }}</span></div>
              </div>
            </div>
          </div>
        </section>

        <!-- 账号 -->
        <section class="p-4 rounded-xl bg-white shadow-sm">
          <h2 class="text-base font-medium mt-0 mb-3">账号</h2>
          <div v-if="accounts" class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div class="text-xs text-gray-500">注册用户</div>
              <div class="text-xl font-semibold mt-1">
                {{ accounts.total_users >= 0 ? accounts.total_users : '—' }}
              </div>
            </div>
            <div>
              <div class="text-xs text-gray-500">管理员</div>
              <div class="text-xl font-semibold mt-1">
                {{ accounts.admin_users >= 0 ? accounts.admin_users : '—' }}
              </div>
              <!--
                注册接口产不出管理员（RegisterRequest 里没有 role 字段，
                Service 层硬编码 USER），所以这个数字只可能因为有人直接
                改数据库而变化。把这句话写在界面上，管理员数意外变多时
                才有人看得懂那意味着什么。
              -->
              <div class="text-[0.68rem] text-gray-400 mt-1">仅能命令行创建</div>
            </div>
            <div>
              <div class="text-xs text-gray-500">可用邀请码</div>
              <div class="text-xl font-semibold mt-1">
                {{ accounts.active_keys >= 0 ? accounts.active_keys : '—' }}
              </div>
              <div class="text-[0.68rem] text-gray-400 mt-1">敞开的注册入口</div>
            </div>
            <div>
              <div class="text-xs text-gray-500">已使用邀请码</div>
              <div class="text-xl font-semibold mt-1">
                {{ accounts.used_keys >= 0 ? accounts.used_keys : '—' }}
              </div>
            </div>
          </div>
        </section>

        <!-- 邀请码 -->
        <AdminInviteKeys />

        <!-- 语料导入 -->
        <AdminCorpusUpload @uploaded="onCorpusUploaded" />

        <!-- 在线与推理 -->
        <section class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="p-4 rounded-xl bg-white shadow-sm">
            <h2 class="text-base font-medium mt-0 mb-3">在线用户</h2>
            <div v-if="admin.onlineCount === 0" class="text-sm text-gray-400">
              当前没有活跃用户
            </div>
            <div v-else class="flex flex-wrap gap-2">
              <span
                v-for="(name, id) of admin.snapshot?.online_users"
                :key="id"
                class="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs"
                :title="`user_id: ${id}`"
              >{{ name }}</span>
            </div>
          </div>

          <div class="p-4 rounded-xl bg-white shadow-sm">
            <h2 class="text-base font-medium mt-0 mb-3">正在推理</h2>
            <div
              v-if="!admin.snapshot?.inferring.length"
              class="text-sm text-gray-400"
            >
              没有进行中的推理
            </div>
            <div v-else class="flex flex-col gap-2">
              <div
                v-for="session of admin.snapshot?.inferring"
                :key="session.conversation_id"
                class="flex items-center justify-between text-sm"
              >
                <div class="flex flex-col min-w-0">
                  <span class="font-medium truncate">{{ session.user_name }}</span>
                  <span class="text-[0.68rem] text-gray-400 truncate">
                    {{ session.conversation_id }}
                  </span>
                </div>
                <!-- 跑得越久越可能是卡住而不是在思考 -->
                <span
                  class="text-xs shrink-0 ml-2"
                  :class="session.elapsed_seconds > 300 ? 'text-amber-600' : 'text-gray-500'"
                >{{ elapsedText(session.elapsed_seconds) }}</span>
              </div>
            </div>
          </div>
        </section>

        <!-- 最近任务 -->
        <section class="p-4 rounded-xl bg-white shadow-sm">
          <h2 class="text-base font-medium mt-0 mb-3">最近的解析任务</h2>
          <div
            v-if="!admin.snapshot?.recent_tasks.length"
            class="text-sm text-gray-400"
          >
            暂无任务
          </div>
          <!-- 表格必须能独立横向滚动，否则窄屏下整个页面会横向溢出 -->
          <div v-else class="overflow-x-auto">
            <table class="w-full text-sm border-collapse">
              <thead>
                <tr class="text-left text-xs text-gray-500 border-b">
                  <th class="py-2 pr-3 font-medium">提交者</th>
                  <th class="py-2 pr-3 font-medium">文件</th>
                  <th class="py-2 pr-3 font-medium">去向</th>
                  <th class="py-2 pr-3 font-medium">状态</th>
                  <th class="py-2 pr-3 font-medium">规模</th>
                  <th class="py-2 font-medium">更新时间</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="task of admin.snapshot?.recent_tasks"
                  :key="task.task_id"
                  class="border-b border-gray-100"
                >
                  <td class="py-2 pr-3 whitespace-nowrap">{{ task.user_name }}</td>
                  <td class="py-2 pr-3 max-w-60 truncate" :title="task.file_name">
                    {{ task.file_name }}
                  </td>
                  <td class="py-2 pr-3 whitespace-nowrap">
                    <span
                      class="px-1.5 py-0.5 rounded text-[0.68rem]"
                      :class="task.target === 'CORPUS'
                        ? 'bg-violet-50 text-violet-700'
                        : 'bg-gray-100 text-gray-600'"
                    >{{ task.target === 'CORPUS' ? '知识库' : '会话' }}</span>
                  </td>
                  <td class="py-2 pr-3 whitespace-nowrap" :class="statusClass(task.status)">
                    {{ task.status }}
                  </td>
                  <td class="py-2 pr-3 whitespace-nowrap text-gray-500">
                    <template v-if="task.chunk_count !== null">
                      {{ task.target === 'CORPUS'
                        ? `${task.chunk_count} 片段`
                        : `${task.chunk_count} 字` }}
                    </template>
                    <span v-else>—</span>
                  </td>
                  <td class="py-2 whitespace-nowrap text-gray-500">
                    {{ task.updated_at ?? '—' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>
