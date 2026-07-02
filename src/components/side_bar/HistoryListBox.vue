<script setup lang="ts">
import Menu from 'primevue/menu';
import Listbox from "primevue/listbox";
import { ref, watch,onMounted } from "vue";import {useVerifyStore} from "@/stores/verify.ts";
import router from "@/router";
const verifyStore = useVerifyStore()
import type {ResponseConversationIdInterface} from "@/interface/response-interface.ts";
import axios from "axios";
import {useUserStore} from "@/stores/user_store.ts";
import {storeToRefs} from "pinia";
import type {MenuItemCommandEvent} from "primevue/menuitem";

const userStore = useUserStore()
const { selectedItem, conversation_id_list } = storeToRefs(userStore)


onMounted(()=>{
  userStore.fetch_history_list()
})

const handleNewChat = async () => {
  selectedItem.value = undefined;       // 1. 清空选中值，移除高亮
  // await nextTick();    // 2. 让 Listbox 失去 DOM 焦点
  router.replace({ name: 'Chat' });
};

watch(() => userStore.selectedItem, (newUuid) => {
  if (newUuid) {
    console.log("历史记录box已经检测到用户切换聊天会话了")
    router.replace({ name: 'Chat', params: { uuid: newUuid } })
  }
})

const deleteConversation = () => {
  console.log('删除:', activeId.value);
};

const menu = ref();
const activeId = ref('');
const items = ref( [
      {
        label: '重命名',
        icon: 'pi pi-refresh',
      },
      {separator: true},
      {
        label: '删除此对话',
        icon: 'pi pi-trash',
        class: 'text-red-500',
        command: deleteConversation,
      }
    ]
  );
const toggle = (event:PointerEvent,value:string) => {
  activeId.value = value
  menu.value.toggle(event);
};

watch(() => verifyStore.isVerified,
    (verified) => {
      if (!verified) {
        router.replace('/chat')
      }else {
        console.log("验证结果似乎发生了变化")
        userStore.fetch_history_list()
      }

    },
    { immediate: true } // 组件挂载时也检查一次
)

</script>

<template>
  <div class="flex flex-col w-full h-full text-[1rem]">
    <div @click="handleNewChat" class="w-full h-12 mt-3 pl-1 pr-2 flex flex-row items-center border-b border-surface-200 rounded-lg hover:bg-gray-200 cursor-pointer">
      <i class="pl-2 text-[1.0rem]! pi pi-pen-to-square"></i>
      <span  class="ml-2">新建对话</span>
    </div>
    <div class="flex items-center w-full pl-3 mt-3 text-sm text-gray-400">最近</div>
    <Menu ref="menu" id="overlay_menu" :model="items" :popup="true" :pt="{
              itemContent:{class:'text-inherit'},
              itemIcon:{class:'text-inherit'},
              root:{class:'rounded-xl py-1 text-[0.95rem]'},
            }"/>
    <Listbox v-model="selectedItem" :options="conversation_id_list" optionLabel="summary_content" optionValue="conversation_id"
             :virtualScrollerOptions="{ itemSize: 38 }" class="w-full border-none bg-transparent h-full"
             listStyle="height: 100%"
             :pt="{
                    option: {class: 'p-2 hover:bg-gray-200 rounded-lg overflow-hidden group'},
                    list: { class: 'p-1  w-full ' },
                    // optionGroup :{class: 'text-[1rem] text-black font-bold pl-2'},
                      }">
      <template #option="slotProps">
          <div class="truncate w-[90%] min-w-0 text-[0.95rem] ">
            {{ slotProps.option.summary_content }}
            <span @click.stop="toggle($event,slotProps.option.conversation_id)" class="absolute -translate-y-1/2 top-1/2 flex justify-center items-center right-2
            w-5 h-5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-gray-300"><i class="text-[0.7rem]! pi pi-ellipsis-h"></i></span>
          </div>
      </template>
    </Listbox>
  </div>
</template>

<style scoped>
:deep(.p-virtualscroller) {
  scrollbar-width: thin;
  scrollbar-color: #ffffff00 #ffffff00;
}
:deep(.p-virtualscroller:hover) {
  scrollbar-color: #a7a7a7 #e6e6e6;
}
:deep(.p-listbox-option-selected) {
  background: var(--color-gray-200);
  color: var(--color-gray-700);
}
</style>