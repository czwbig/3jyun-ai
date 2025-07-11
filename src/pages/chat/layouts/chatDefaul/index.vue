<!-- 默认消息列表页 -->
<script setup lang="ts">
import {useRoute, useRouter} from 'vue-router';
import WelecomeText from '@/components/WelecomeText/index.vue';
import {useUserStore} from '@/stores';

import {useSessionStore} from '@/stores/modules/session';
import {login} from "@/api";

const route = useRoute();
const router = useRouter();

const authStr = route.query.authStr;

const userStore = useUserStore();
const sessionStore = useSessionStore();

const senderValue = ref('');
const senderRef = ref();

async function handleSend() {
  localStorage.setItem('chatContent', senderValue.value);
  await sessionStore.createSessionList({
    userId: userStore.userInfo?.userId as number,
    sessionContent: senderValue.value,
    sessionTitle: senderValue.value.slice(0, 10),
    remark: senderValue.value.slice(0, 10),
  }, route.query);
}

onMounted(async () => {
  if (authStr) {
    try {
      const res = await login({
        username: authStr as string,
        password: authStr as string
      });
      console.log(res, 'res');
      res.data.token && userStore.setToken(res.data.token);
      res.data.userInfo && userStore.setUserInfo(res.data.userInfo);
      ElMessage.success('登录成功');
      // 立刻获取回话列表
      await sessionStore.requestSessionList(1, true);
      router.replace('/');
    } catch (error) {
      console.error('请求错误:', error);
    }
  }
})
</script>

<template>
  <div class="chat-defaul-wrap">
    <WelecomeText/>
    <Sender
      ref="senderRef"
      v-model="senderValue"
      class="chat-defaul-sender"
      :auto-size="{
        maxRows: 9,
        minRows: 3,
      }"
      variant="updown"
      clearable
      @submit="handleSend"
    />
  </div>
</template>

<style scoped lang="scss">
.chat-defaul-wrap {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 800px;
  min-height: 450px;

  .chat-defaul-sender {
    width: 100%;
  }
}
</style>
