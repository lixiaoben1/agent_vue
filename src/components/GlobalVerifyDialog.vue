<script setup lang="ts">
import { useVerifyStore } from '@/stores/verify';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import {computed, ref, watch} from "vue";
import { useToast } from 'primevue/usetoast';

const toast = useToast();
const verify_store = useVerifyStore()

const username = ref<string>("lixiaoben")
const password = ref<string>("123456")
const errorMsg = ref<string>("")

async function submitVerify(){
  const trimmedUsername = username.value.trim();
  const trimmedPassword = password.value.trim();
  if (!trimmedUsername || !trimmedPassword) {errorMsg.value = "用户名和密码不能为空";return;}
  if (trimmedUsername.length <= 3) {errorMsg.value = "用户名长度至少为4个字符";return;}
  if (/^\d/.test(trimmedUsername)) {errorMsg.value = "用户名不能以数字开头";return;}
  // 登录成功时 store 内部已经存好 token 与身份并关掉弹窗，这里不用再赋值。
  //
  // 失败的判断方式变了：原先后端无论成败都返回 200，靠 result.status
  // 是 'username not exist' / 'password error' 来区分。现在失败就是
  // HTTP 401，走 catch 分支。
  //
  // 401 不再区分「用户名不存在」和「密码错误」——那等于提供了一个
  // 用户名枚举接口，攻击者可以先批量探测哪些用户名存在。
  try {
    await verify_store.verify(trimmedUsername, trimmedPassword)
  } catch (error: any) {
    const status = error?.response?.status
    if (status === 401) {
      errorMsg.value = "用户名或密码错误"
    } else if (status === 400) {
      errorMsg.value = error.response?.data?.message ?? "请求参数有误"
    } else {
      console.error('Verify Error:', error);
      toast.add({
        severity: 'error',
        summary: '服务器错误',
        detail: '后端服务未启动或网络连接失败，请联系管理员',
        life: 5000
      });
    }
  }
}
watch([username,password],()=>{
  errorMsg.value = ""
})

</script>

<template>
  <Dialog v-model:visible="verify_store.visible" modal header="Log in" :style="{ width: '25rem' }">
    <span class="text-surface-500 dark:text-surface-400 block mb-8">暂不接受注册</span>
    <div class="flex flex-col items-start gap-4 mb-4 w-full ">
      <label for="username" class="font-semibold w-24">Username</label>
      <InputText id="username" v-model="username" class="flex-auto w-full" autocomplete="off" @keyup.enter="submitVerify" />
    </div>
    <div class="flex flex-col items-start gap-4 mb-8 w-full relative">
      <label for="password" class="font-semibold">Password</label>
      <InputText type="password" id="password" v-model="password" class="flex-auto w-full" autocomplete="off" @keyup.enter="submitVerify" />
      <div class="h-3"></div>
      <Message v-show="errorMsg" class="absolute bottom-0" size="small" severity="error" variant="simple" :closable="false">
        {{ errorMsg }}
      </Message>
    </div>

    <div class="flex justify-end gap-2">
      <Button type="button" label="Cancel" severity="secondary" @click="verify_store.visible = false"></Button>
      <Button type="button" label="Log in" @click="submitVerify"></Button>
    </div>
  </Dialog>
</template>