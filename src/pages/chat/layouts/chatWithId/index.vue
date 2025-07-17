<!-- 每个回话对应的聊天内容 -->
<script setup lang="ts">
import type { AnyObject } from 'typescript-api-pro';
import type { Sender } from 'vue-element-plus-x';
import type { BubbleProps } from 'vue-element-plus-x/types/Bubble';
import type { BubbleListInstance } from 'vue-element-plus-x/types/BubbleList';
import type { PromptsItemsProps } from 'vue-element-plus-x/types/Prompts';
import type { ThinkingStatus } from 'vue-element-plus-x/types/Thinking';
import { useHookFetch } from 'hook-fetch/vue';
import { useRoute } from 'vue-router';
import { send } from '@/api';
import { useChatStore } from '@/stores/modules/chat';
import { useModelStore } from '@/stores/modules/model';
import { useUserStore } from '@/stores/modules/user';

type MessageItem = BubbleProps & {
  key: number;
  role: 'ai' | 'user' | 'system';
  avatar: string;
  thinkingStatus?: ThinkingStatus;
  thinlCollapse?: boolean;
};
const route = useRoute();
const chatStore = useChatStore();
const modelStore = useModelStore();
const userStore = useUserStore();
const { authStr } = route.query;

// 用户头像
const avatar = computed(() => {
  const userInfo = userStore.userInfo;
  return userInfo?.avatar || 'https://avatars.githubusercontent.com/u/76239030?v=4';
});

const inputValue = ref('');
const senderRef = ref<InstanceType<typeof Sender> | null>(null);
const bubbleItems = ref<MessageItem[]>([]);
const validBubbleItems = computed(() => bubbleItems.value.filter(item => item.content && ['assistant', 'system', 'user'].includes(item.role)));
const bubbleListRef = ref<BubbleListInstance | null>(null);

const { stream, loading: isLoading, cancel } = useHookFetch({
  request: send,
  onError: (err) => {
    console.warn('测试错误拦截', err);
    isLoading.value = false;
  },
});
// 记录进入思考中
let isThinking = false;

watch(
  () => route.params?.id,
  async (_id_) => {
    if (_id_) {
      if (_id_ !== 'not_login') {
        // 判断的当前会话id是否有聊天记录，有缓存则直接赋值展示
        if (chatStore.chatMap[`${_id_}`] && chatStore.chatMap[`${_id_}`].length) {
          bubbleItems.value = chatStore.chatMap[`${_id_}`] as MessageItem[];
          // 滚动到底部
          setTimeout(() => {
            bubbleListRef.value!.scrollToBottom();
          }, 350);
          return;
        }

        // 无缓存则请求聊天记录
        await chatStore.requestChatList(`${_id_}`);
        // 请求聊天记录后，赋值回显，并滚动到底部
        bubbleItems.value = chatStore.chatMap[`${_id_}`] as MessageItem[];

        // 滚动到底部
        setTimeout(() => {
          bubbleListRef.value!.scrollToBottom();
        }, 350);
      }

      // 如果本地有发送内容 ，则直接发送
      const v = localStorage.getItem('chatContent');
      if (v) {
        // 发送消息
        console.log('发送消息 v', v);
        setTimeout(() => {
          startSSE(v);
        }, 350);

        localStorage.removeItem('chatContent');
      }
    }
  },
  { immediate: true, deep: true },
);

// 封装数据处理逻辑
function handleDataChunk(chunk: AnyObject) {
  try {
    const reasoningChunk = chunk.choices?.[0].delta.reasoning_content;
    if (reasoningChunk) {
      // 开始思考链状态
      bubbleItems.value[bubbleItems.value.length - 1].thinkingStatus = 'thinking';
      bubbleItems.value[bubbleItems.value.length - 1].loading = true;
      bubbleItems.value[bubbleItems.value.length - 1].thinlCollapse = true;
      if (bubbleItems.value.length) {
        // bubbleItems.value[bubbleItems.value.length - 1].reasoning_content += reasoningChunk;
      }
    }

    // 另一种思考中形式，content中有 <think></think> 的格式
    // 一开始匹配到 <think> 开始，匹配到 </think> 结束，并处理标签中的内容为思考内容
    const parsedChunk = chunk.choices?.[0].delta.content;
    if (parsedChunk) {
      const thinkStart = parsedChunk.includes('<think>');
      const thinkEnd = parsedChunk.includes('</think>');
      if (thinkStart) {
        isThinking = true;
      }
      if (thinkEnd) {
        isThinking = false;
      }
      if (isThinking) {
        // 开始思考链状态
        bubbleItems.value[bubbleItems.value.length - 1].thinkingStatus = 'thinking';
        bubbleItems.value[bubbleItems.value.length - 1].loading = true;
        bubbleItems.value[bubbleItems.value.length - 1].thinlCollapse = true;
        if (bubbleItems.value.length) {
          // bubbleItems.value[bubbleItems.value.length - 1].reasoning_content += parsedChunk
          //   .replace('<think>', '')
          //   .replace('</think>', '');
        }
      }
      else {
        // 结束 思考链状态
        bubbleItems.value[bubbleItems.value.length - 1].thinkingStatus = 'end';
        bubbleItems.value[bubbleItems.value.length - 1].loading = false;
        if (bubbleItems.value.length) {
          bubbleItems.value[bubbleItems.value.length - 1].content += parsedChunk;
        }
      }
    }
  }
  catch (err) {
    // 这里如果使用了中断，会有报错，可以忽略不管
    console.error('解析数据时出错:', err);
  }
}

// 封装错误处理逻辑
function handleError(err: any) {
  console.error('Fetch error:', err);
}

async function startSSE(chatContent: string) {
  try {
    // 添加用户输入的消息
    // console.log('chatContent', chatContent);
    // 清空输入框
    inputValue.value = '';
    addMessage(chatContent, true);
    addMessage('', false);

    // 这里有必要调用一下 BubbleList 组件的滚动到底部 手动触发 自动滚动
    bubbleListRef.value?.scrollToBottom();
    const messages = [{
      role: 'system' as const,
      content: JSON.stringify({
        authStr,
      }),
    }].concat(bubbleItems.value
      .filter((item: any) => item.role === 'user')
      .map((item: any) => ({
        role: item.role,
        content: item.content,
      })));
    for await (const chunk of stream({
      messages,
      sessionId: route.params?.id !== 'not_login' ? String(route.params?.id) : undefined,
      userId: userStore.userInfo?.userId,
      model: modelStore.currentModelInfo.modelName ?? '',
    })) {
      handleDataChunk(chunk.result as AnyObject);
    }
  }
  catch (err) {
    handleError(err);
  }
  finally {
    console.log('数据接收完毕');
    // 停止打字器状态
    if (bubbleItems.value.length) {
      bubbleItems.value[bubbleItems.value.length - 1].typing = false;
    }
  }
}

// 中断请求
async function cancelSSE() {
  cancel();
  // 结束最后一条消息打字状态
  if (bubbleItems.value.length) {
    bubbleItems.value[bubbleItems.value.length - 1].typing = false;
  }
}

// 添加消息 - 维护聊天记录
function addMessage(message: string, isUser: boolean) {
  const i = bubbleItems.value.length;
  const obj: MessageItem = {
    key: i,
    avatar: isUser
      ? avatar.value
      : 'https://cube.elemecdn.com/0/88/03b0d39583f48206768a7534e55bcpng.png',
    avatarSize: '32px',
    role: isUser ? 'user' : 'system',
    placement: isUser ? 'end' : 'start',
    isMarkdown: !isUser,
    loading: !isUser,
    content: message || '',
    thinkingStatus: 'start',
    thinlCollapse: false,
  };
  bubbleItems.value.push(obj);
}

// 展开收起 事件展示
function handleChange(payload: { value: boolean; status: ThinkingStatus }) {
  console.log('value', payload.value, 'status', payload.status);
}

const items = computed<PromptsItemsProps[]>(() => [
  {
    key: '1',
    label: '查看平台设备总数',
    disabled: isLoading.value,
  },
  {
    key: '2',
    label: '查看最近两天告警',
    disabled: isLoading.value,
  },
  {
    key: '3',
    label: '查看最新5条故障信息',
    disabled: isLoading.value,
  },
  {
    key: '4',
    label: '展示用传设备列表',
    disabled: isLoading.value,
  },
]);

function handleItemClick(item: PromptsItemsProps) {
  console.log('点击了提示集', item);
  inputValue.value = item.label || '';
  // 触发发送事件
  startSSE(item.label || '');
}

onMounted(() => {
  senderRef.value?.openHeader?.();
});
</script>

<template>
  <div class="chat-with-id-container">
    <div class="chat-warp">
      <BubbleList ref="bubbleListRef" :list="validBubbleItems" max-height="calc(100vh - 240px)">
        <template #header="{ item }">
          <Thinking
            v-if="item.reasoning_content" v-model="item.thinlCollapse"
            :content="item.reasoning_content"
            :status="item.thinkingStatus" class="thinking-chain-warp" @change="handleChange"
          />
        </template>
        <template #content="{ item }">
          <!-- chat 内容走 markdown -->
          <XMarkdown
            v-if="item.content && ['assistant', 'system'].includes(item.role)"
            :markdown="item.content"
            class="markdown-body" :themes="{ light: 'github-light', dark: 'github-dark' }"
            default-theme-mode="dark"
          />
          <!-- user 内容 纯文本 -->
          <div v-if="item.content && item.role === 'user'" class="user-content">
            {{ item.content }}
          </div>
        </template>
      </BubbleList>

      <Sender
        ref="senderRef" v-model="inputValue" class="chat-defaul-sender" :auto-size="{
          maxRows: 6,
          minRows: 2,
        }" variant="updown" clearable :loading="isLoading" @submit="startSSE" @cancel="cancelSSE"
      >
        <template #header>
          <div class="sender-header p-12px pt-6px pb-0px">
            <div style="display: flex; flex-direction: column; gap: 12px;">
              <Prompts
                :items="items"
                @item-click="handleItemClick"
              />
            </div>
          </div>
        </template>
      </Sender>
    </div>
  </div>
</template>

<style scoped lang="scss">
.chat-with-id-container {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  height: 100%;

  .chat-warp {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    width: 100%;
    height: calc(100vh - 60px);

    .thinking-chain-warp {
      margin-bottom: 12px;
    }
  }

  :deep() {
    .el-bubble-list {
      padding-top: 24px;
    }

    .el-bubble {
      padding: 0 12px;
      padding-bottom: 24px;
    }

    .el-typewriter {
      overflow: hidden;
      border-radius: 12px;
    }

    .user-content {
      // 换行
      white-space: pre-wrap;
    }

    .markdown-body {
      background-color: transparent;
    }

    .markdown-elxLanguage-header-div {
      top: -25px !important;
    }

    // xmarkdown 样式
    .elx-xmarkdown-container {
      padding: 8px 4px;
    }
  }

  .chat-defaul-sender {
    width: 100%;
    margin-bottom: 22px;
  }

  :deep(.el-bubble-content) {
    max-width: 90%;
  }
}
</style>
