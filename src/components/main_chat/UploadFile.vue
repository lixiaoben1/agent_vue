<script setup lang="ts">
import Popover from 'primevue/popover';
import { ref } from "vue";
import Message from 'primevue/message';
import Button from 'primevue/button';
import FileUpload from 'primevue/fileupload';
const op = ref()

const toggle = (event:PointerEvent) => {
  op.value.toggle(event);
}

const fu = ref();

const onChoose = () => {
  fu.value.choose();
};

const onUpload = () => {
  fu.value.upload();
};

const onClear = () => {
  fu.value.clear();
};

const formatSize = (bytes:number) => {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

defineExpose({toggle})

</script>

<template>
  <Popover class="popover_component" ref="op">
    <div class="max-w-md mx-auto">
      <FileUpload
          ref="fu"
          name="demo[]"
          url="/api/upload"
          :multiple="true"
          accept="image/*"
          :maxFileSize="1000000"
          mode="advanced"
          :pt="{ root: { class: 'border-0! bg-transparent!' }, header: { class: 'hidden!' }, content: { class: 'border-2! border-dashed! border-surface-200! dark:border-surface-700! rounded-xl! p-8!' } }"
      >
        <template #content="{ files, removeFileCallback, messages }">
          <div v-if="messages?.length" class="flex flex-col gap-2">
            <Message v-for="msg of messages" :key="msg" severity="error">{{ msg }}</Message>
          </div>
          <div v-if="files.length" class="flex flex-col gap-4">
            <div class="flex items-center justify-between">
              <span class="text-sm text-muted-color">{{ files.length }} file(s) selected</span>
              <div class="flex items-center gap-2">
                <Button variant="text" size="small" @click="onUpload">Upload</Button>
                <Button variant="text" size="small" severity="danger" @click="onClear">Clear all</Button>
              </div>
            </div>
            <div class="flex flex-col gap-2">
              <div v-for="(file, index) of files" :key="file.name + file.size" class="flex items-center justify-between p-3 rounded-lg bg-surface-50 dark:bg-surface-800">
                <div class="flex items-center gap-3">
                  <i class="text-[1.3rem]! pi pi-cloud-upload"></i>
                  <div class="flex flex-col">
                    <span class="text-sm font-medium">{{ file.name }}</span>
                    <span class="text-xs text-muted-color">{{ formatSize(file.size) }}</span>
                  </div>
                </div>
                <Button type="button" iconOnly variant="text" severity="secondary" size="small" rounded @click="removeFileCallback(index)">
                  <i class="text-[1.3rem]! pi pi-times"></i>
                </Button>
              </div>
            </div>
          </div>
        </template>
        <template #empty>
          <div class="flex flex-col items-center justify-center gap-3 py-8 cursor-pointer" @click="onChoose">
            <i class="text-[2rem]! pi pi-cloud-upload"></i>
            <div class="text-center">
              <p class="text-lg font-medium mt-0 mb-1">Drop files here</p>
              <p class="text-sm text-muted-color m-0">or click to browse</p>
            </div>
          </div>
        </template>
      </FileUpload>
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