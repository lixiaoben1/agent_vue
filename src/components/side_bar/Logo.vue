<script setup lang="ts">
import Avatar from 'primevue/avatar';
</script>

<template>

  <div class="flex flex-row w-full justify-between h-15 mt-2">
    <div class="text-2xl pt-1 font-bold gradient-text transition-transform duration-500 ease-in-out hover:scale-120">Agent</div>
    <div class="flex flex-row items-center w-21 h-10 liquid-glass relative">
      <div class="ml-1.5 flex flex-row items-center justify-center rounded-full w-8 h-8 hover:bg-gray-200 cursor-pointer">
        <i class="text-[1.3rem]! pi pi-search"></i>
      </div>
       <Avatar label="L" class="ml-auto mr-2 w-7 h-7" style="background-color: #514f4f; color: #ffffff" shape="circle" />
    </div>



  </div>

</template>

<style scoped>
@import '../liquid_glass/liquid-glass.css';
.gradient-text {
  /* 1. 定义渐变背景（宽度设为200%用于动画位移） */
  background: linear-gradient(
      90deg,
      #ff6b6b 0%,
      #feca57 25%,
      #48dbfb 50%,
      #ff9ff3 75%,
      #ff6b6b 100%
  );
  background-size: 200% auto;

  /* 2. 将背景裁剪为文字形状 */
  -webkit-background-clip: text;
  background-clip: text;

  /* 3. 让文字本身透明，只显示裁剪后的背景 */
  -webkit-text-fill-color: transparent;
  color: transparent; /* 兼容写法 */

  /* 4. 添加流动动画 */
  animation: gradient-flow 3s linear infinite;
}

@keyframes gradient-flow {
  0%   { background-position: 0% center; }
  100% { background-position: -200% center; } /* 负值向左流动 */
}
</style>