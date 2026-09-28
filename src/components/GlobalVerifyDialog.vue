<script setup lang="ts">
import { useVerifyStore } from '@/stores/verify';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import { computed, ref, watch } from "vue";
import { useToast } from 'primevue/usetoast';

const toast = useToast();
const verify_store = useVerifyStore()

const mode = ref<'login' | 'register'>('login')
const username = ref<string>("lixiaoben")
const password = ref<string>("123456")
const inviteKey = ref<string>("")
const errorMsg = ref<string>("")
const submitting = ref(false)

const isRegister = computed(() => mode.value === 'register')

/**
 * 前端校验。
 *
 * 规则与后端 RegisterRequest 的注解保持一致 —— 两侧不一致会出现
 * 「前端过了后端拒」，用户看到一个他自己看不出原因的失败。
 *
 * 登录不校验格式：那些规则只对新账号有意义，套在登录上会把库里
 * 已存在的短名用户挡在外面（比如命令行插的 admin 只有 5 位）。
 */
function validate(): string {
  const name = username.value.trim()
  const pwd = password.value

  if (!name || !pwd) return "用户名和密码不能为空"

  if (!isRegister.value) return ""

  if (name.length < 4 || name.length > 32) return "用户名长度需为 4-32 个字符"
  if (!/^[A-Za-z一-龥]/.test(name)) return "用户名需以字母或汉字开头"
  if (!/^[A-Za-z一-龥][A-Za-z0-9一-龥_-]*$/.test(name)) {
    return "用户名只能包含字母、数字、汉字、下划线和短横线"
  }
  if (pwd.length < 8) return "密码至少 8 位"
  if (pwd.length > 256) return "密码过长"
  if (!inviteKey.value.trim()) return "请填写管理员提供的邀请码"
  return ""
}

async function submit() {
  if (submitting.value) return

  const problem = validate()
  if (problem) {
    errorMsg.value = problem
    return
  }

  const name = username.value.trim()
  submitting.value = true
  try {
    if (isRegister.value) {
      await verify_store.register(name, password.value, inviteKey.value.trim())
      toast.add({
        severity: 'success',
        summary: '注册成功',
        detail: '已自动登录，可以开始使用了',
        life: 3000,
      })
    } else {
      await verify_store.verify(name, password.value)
    }
    // 成功后清掉输入：弹窗是全局常驻的，下次打开不该看到上次填的东西，
    // 尤其是密码和邀请码
    password.value = ""
    inviteKey.value = ""
  } catch (error: any) {
    handleError(error)
  } finally {
    submitting.value = false
  }
}

/**
 * 把后端的失败翻译成一句话。
 *
 * 400 直接用后端给的 message：注册失败有好几种原因（用户名被占、
 * 邀请码无效/已用/已过期/已作废），它们对用户意味着不同的下一步 ——
 * 「已被使用」要去找管理员要新码，「已过期」可能只是自己重复提交了。
 * 在前端重新编一套文案只会与后端漂移。
 */
function handleError(error: any) {
  const status = error?.response?.status
  const backendMessage = error?.response?.data?.message

  if (status === 401) {
    // 401 不区分「用户名不存在」和「密码错误」——那等于提供一个
    // 用户名枚举接口，攻击者可以先批量探测哪些用户名存在
    errorMsg.value = "用户名或密码错误"
    return
  }
  if (status === 400) {
    errorMsg.value = backendMessage ?? "请求参数有误"
    return
  }
  console.error('Verify Error:', error);
  toast.add({
    severity: 'error',
    summary: '服务器错误',
    detail: '后端服务未启动或网络连接失败，请联系管理员',
    life: 5000
  });
}

function switchMode(next: 'login' | 'register') {
  mode.value = next
  errorMsg.value = ""
}

watch([username, password, inviteKey], () => {
  errorMsg.value = ""
})
</script>

<template>
  <Dialog
    v-model:visible="verify_store.visible"
    modal
    :header="isRegister ? '注册账号' : '登录'"
    :style="{ width: '25rem' }"
  >
    <span class="text-surface-500 dark:text-surface-400 block mb-6 text-sm">
      {{ isRegister
        ? '注册需要管理员提供的一次性邀请码'
        : '还没有账号？向管理员索取邀请码后注册' }}
    </span>

    <div class="flex flex-col items-start gap-2 mb-4 w-full">
      <label for="username" class="font-semibold">用户名</label>
      <InputText
        id="username"
        v-model="username"
        class="flex-auto w-full"
        autocomplete="off"
        @keyup.enter="submit"
      />
    </div>

    <div class="flex flex-col items-start gap-2 mb-4 w-full">
      <label for="password" class="font-semibold">密码</label>
      <InputText
        type="password"
        id="password"
        v-model="password"
        class="flex-auto w-full"
        :autocomplete="isRegister ? 'new-password' : 'current-password'"
        @keyup.enter="submit"
      />
      <span v-if="isRegister" class="text-xs text-surface-500">至少 8 位</span>
    </div>

    <div v-if="isRegister" class="flex flex-col items-start gap-2 mb-4 w-full">
      <label for="inviteKey" class="font-semibold">邀请码</label>
      <InputText
        id="inviteKey"
        v-model="inviteKey"
        class="flex-auto w-full font-mono text-sm"
        autocomplete="off"
        placeholder="管理员提供的一次性密钥"
        @keyup.enter="submit"
      />
      <span class="text-xs text-surface-500">每个邀请码只能使用一次</span>
    </div>

    <!-- 固定高度占位，避免出现错误提示时整个弹窗跳动 -->
    <div class="h-6 mb-2">
      <Message
        v-show="errorMsg"
        size="small"
        severity="error"
        variant="simple"
        :closable="false"
      >{{ errorMsg }}</Message>
    </div>

    <div class="flex justify-between items-center gap-2">
      <Button
        type="button"
        variant="link"
        size="small"
        class="px-0!"
        @click="switchMode(isRegister ? 'login' : 'register')"
      >{{ isRegister ? '已有账号？去登录' : '用邀请码注册' }}</Button>

      <div class="flex gap-2">
        <Button
          type="button"
          label="取消"
          severity="secondary"
          :disabled="submitting"
          @click="verify_store.visible = false"
        />
        <Button type="button" :disabled="submitting" @click="submit">
          <i v-if="submitting" class="pi pi-spin pi-spinner mr-2 text-[0.8rem]!"></i>
          {{ isRegister ? '注册' : '登录' }}
        </Button>
      </div>
    </div>
  </Dialog>
</template>
