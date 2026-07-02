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
  let result
  try {
  result = await verify_store.verify(trimmedUsername, trimmedPassword)
  if (!result) {
    toast.add({ severity: 'error', summary: '服务器错误', detail: '后端服务器未启动，等待管理员启动', life: 3000 })
    return
  }}catch (error) {
    console.error('Verify Error:', error);
      toast.add({
        severity: 'error',
        summary: '服务器错误',
        detail: '后端服务器未启动或网络连接失败，请联系管理员',
        life: 5000
      });
  }


  if (result?.status === 'username not exist'){
    errorMsg.value = "用户名不存在啊！"
  }
  if (result?.status === 'password error'){
    errorMsg.value = "密码错误啊！"
  }
  if (result?.status === 'success') {
    verify_store.username = result.user_name
    verify_store.user_id = result.user_id
    verify_store.isVerified = true
    verify_store.visible = false
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
      <InputText id="username" v-model="username" class="flex-auto w-full" autocomplete="off" />
    </div>
    <div class="flex flex-col items-start gap-4 mb-8 w-full relative">
      <label for="password" class="font-semibold">Password</label>
      <InputText type="password" id="password" v-model="password" class="flex-auto w-full" autocomplete="off" />
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