<script setup lang="ts">
/**
 * 注册邀请码管理。
 *
 * 关键约束：**明文密钥只在生成那一刻可见一次**。后端只存 SHA-256，
 * 列表接口给不出明文。所以生成后要用一块醒目的区域展示并提供复制按钮，
 * 用户确认复制走之后才关掉 —— 关掉就再也拿不回来了。
 */
import { onMounted, ref } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import { useToast } from 'primevue/usetoast'
import { useAdminStore, type InviteKey } from '@/stores/admin_store'

const toast = useToast()
const admin = useAdminStore()

const note = ref('')
const validDays = ref<number | null>(7)
const creating = ref(false)

/** 有效期选项。一次性码仍然该能设有效期 —— 发出去没人用的码会一直是个入口。 */
const validDaysOptions = [
  { label: '1 天', value: 1 },
  { label: '7 天', value: 7 },
  { label: '30 天', value: 30 },
  { label: '永不过期', value: null },
]

async function create() {
  if (creating.value) return
  creating.value = true
  try {
    await admin.createInviteKey(note.value.trim(), validDays.value)
    note.value = ''
    toast.add({
      severity: 'success',
      summary: '邀请码已生成',
      detail: '请立刻复制保存 —— 关闭后无法再次查看',
      life: 6000,
    })
  } catch (e: any) {
    toast.add({
      severity: 'error',
      summary: '生成失败',
      detail: e?.response?.status === 404
        ? '没有管理权限'
        : e?.response?.data?.message ?? '请稍后重试',
      life: 5000,
    })
  } finally {
    creating.value = false
  }
}

/**
 * 复制到剪贴板。
 *
 * navigator.clipboard 在非 HTTPS 的非 localhost 环境下不可用，所以要有
 * 退路 —— 否则管理员在局域网 IP 上访问时点复制毫无反应，而那正是
 * 「唯一一次能拿到明文」的时刻。退路是选中输入框内容让他手工 Ctrl+C。
 */
const keyInputRef = ref<any>()

async function copyKey(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.add({ severity: 'success', summary: '已复制到剪贴板', life: 2000 })
  } catch {
    const input: HTMLInputElement | undefined = keyInputRef.value?.$el
    input?.select()
    toast.add({
      severity: 'warn',
      summary: '无法自动复制',
      detail: '已选中密钥，请按 Ctrl+C 手工复制（非 HTTPS 环境下浏览器禁止自动复制）',
      life: 6000,
    })
  }
}

async function revoke(key: InviteKey) {
  try {
    await admin.revokeInviteKey(key.id)
    toast.add({ severity: 'success', summary: '已作废', life: 2000 })
  } catch (e: any) {
    toast.add({
      severity: 'error',
      summary: '作废失败',
      detail: e?.response?.data?.message ?? '请稍后重试',
      life: 4000,
    })
  }
}

const statusText = (status: InviteKey['status']) => {
  switch (status) {
    case 'ACTIVE': return '可用'
    case 'USED': return '已使用'
    case 'EXPIRED': return '已过期'
    case 'REVOKED': return '已作废'
    default: return status
  }
}

const statusClass = (status: InviteKey['status']) => {
  switch (status) {
    case 'ACTIVE': return 'bg-emerald-50 text-emerald-700'
    case 'USED': return 'bg-gray-100 text-gray-600'
    case 'EXPIRED': return 'bg-amber-50 text-amber-700'
    case 'REVOKED': return 'bg-red-50 text-red-700'
    default: return 'bg-gray-100 text-gray-600'
  }
}

/*
 * 本组件只在 AdminDashboard 的「已登录且有权限」分支里渲染，所以挂载时
 * 一定已经登录了 —— 不用在这里再判一次。
 */
onMounted(() => {
  admin.fetchInviteKeys()
})
</script>

<template>
  <section class="p-4 rounded-xl bg-white shadow-sm">
    <h2 class="text-base font-medium mt-0 mb-1">注册邀请码</h2>
    <p class="text-[0.7rem] text-gray-500 mt-0 mb-3">
      用户凭码自助注册，每个码只能用一次。管理员账号无法通过注册产生 ——
      只能命令行插库（见 docs/sql/04_invite_keys.sql 第 3 段）。
    </p>

    <!--
      刚生成的明文。这是唯一一次能看到它的机会，所以要醒目、要有复制按钮、
      要明说关掉就没了。做成一块黄色警示区而不是一行普通文本，
      是为了让人不会顺手划过去。
    -->
    <div
      v-if="admin.freshKey?.plain_key"
      class="p-3 mb-4 rounded-xl bg-amber-50 border border-amber-300"
    >
      <p class="text-sm font-medium text-amber-900 mt-0 mb-2">
        <i class="pi pi-exclamation-triangle mr-1 text-[0.8rem]!"></i>
        请立刻复制保存，关闭后无法再次查看
      </p>
      <div class="flex items-center gap-2">
        <InputText
          ref="keyInputRef"
          :model-value="admin.freshKey.plain_key"
          readonly
          class="flex-auto font-mono text-xs"
          @focus="(e: FocusEvent) => (e.target as HTMLInputElement).select()"
        />
        <Button size="small" @click="copyKey(admin.freshKey!.plain_key!)">
          <i class="pi pi-clone mr-1 text-[0.8rem]!"></i>复制
        </Button>
        <Button size="small" severity="secondary" variant="outlined"
                @click="admin.dismissFreshKey()">
          我已保存
        </Button>
      </div>
      <p class="text-[0.68rem] text-amber-700 mt-2 mb-0">
        服务端只保存这个码的哈希值，不保存明文 —— 所以任何人（包括你自己）
        都无法再把它读出来。
      </p>
    </div>

    <!-- 生成表单 -->
    <div class="flex flex-wrap items-end gap-2 mb-4">
      <div class="flex flex-col gap-1 flex-auto min-w-40">
        <label class="text-xs text-gray-500">备注（可选）</label>
        <InputText
          v-model="note"
          placeholder="比如：给张三"
          class="w-full text-sm"
          @keyup.enter="create"
        />
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-xs text-gray-500">有效期</label>
        <Select
          v-model="validDays"
          :options="validDaysOptions"
          option-label="label"
          option-value="value"
          class="text-sm"
        />
      </div>
      <Button :disabled="creating" @click="create">
        <i v-if="creating" class="pi pi-spin pi-spinner mr-2 text-[0.8rem]!"></i>
        <i v-else class="pi pi-plus mr-2 text-[0.8rem]!"></i>
        生成邀请码
      </Button>
    </div>

    <!-- 生成与使用记录 -->
    <div v-if="admin.keysLoading && !admin.inviteKeys.length"
         class="text-sm text-gray-400">
      加载中…
    </div>
    <div v-else-if="!admin.inviteKeys.length" class="text-sm text-gray-400">
      还没有生成过邀请码
    </div>
    <div v-else class="overflow-x-auto">
      <table class="w-full text-sm border-collapse">
        <thead>
          <tr class="text-left text-xs text-gray-500 border-b">
            <th class="py-2 pr-3 font-medium">密钥前缀</th>
            <th class="py-2 pr-3 font-medium">备注</th>
            <th class="py-2 pr-3 font-medium">状态</th>
            <th class="py-2 pr-3 font-medium">使用者</th>
            <th class="py-2 pr-3 font-medium">生成时间</th>
            <th class="py-2 pr-3 font-medium">过期时间</th>
            <th class="py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="key of admin.inviteKeys" :key="key.id"
              class="border-b border-gray-100">
            <td class="py-2 pr-3 font-mono text-xs whitespace-nowrap">
              {{ key.key_prefix }}…
            </td>
            <td class="py-2 pr-3 max-w-40 truncate" :title="key.note ?? ''">
              {{ key.note ?? '—' }}
            </td>
            <td class="py-2 pr-3 whitespace-nowrap">
              <span class="px-1.5 py-0.5 rounded text-[0.68rem]"
                    :class="statusClass(key.status)">
                {{ statusText(key.status) }}
              </span>
            </td>
            <td class="py-2 pr-3 whitespace-nowrap">
              {{ key.used_by_name ?? '—' }}
              <span v-if="key.used_at" class="text-[0.68rem] text-gray-400 block">
                {{ key.used_at.replace('T', ' ').slice(0, 19) }}
              </span>
            </td>
            <td class="py-2 pr-3 whitespace-nowrap text-gray-500 text-xs">
              {{ key.created_at?.replace('T', ' ').slice(0, 19) ?? '—' }}
            </td>
            <td class="py-2 pr-3 whitespace-nowrap text-gray-500 text-xs">
              {{ key.expires_at ? key.expires_at.replace('T', ' ').slice(0, 19) : '永久' }}
            </td>
            <td class="py-2 whitespace-nowrap">
              <!--
                只有还可用的码能作废。已使用的不给这个按钮：账号已经建出来了，
                作废它没有实际效果，只会让记录失真。
              -->
              <Button
                v-if="key.status === 'ACTIVE'"
                size="small" variant="text" severity="danger"
                @click="revoke(key)"
              >作废</Button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
