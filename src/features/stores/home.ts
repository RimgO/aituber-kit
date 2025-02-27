import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { Message } from '@/features/messages/messages'
import { Viewer } from '../vrmViewer/viewer'
import { messageSelectors } from '../messages/messageSelectors'
import { Live2DModel } from 'pixi-live2d-display-lipsyncpatch'

export interface PersistedState {
  userOnboarded: boolean
  chatLog: Message[]
  showIntroduction: boolean
}

export interface TransientState {
  viewer: Viewer
  live2dViewer: any
  assistantMessage: string
  slideMessages: string[]
  chatProcessing: boolean
  chatProcessingCount: number
  incrementChatProcessingCount: () => void
  decrementChatProcessingCount: () => void
  backgroundImageUrl: string
  modalImage: string
  triggerShutter: boolean
  webcamStatus: boolean
  captureStatus: boolean
  isCubismCoreLoaded: boolean
  setIsCubismCoreLoaded: (loaded: boolean) => void
  isLive2dLoaded: boolean
  setIsLive2dLoaded: (loaded: boolean) => void
}

export type HomeState = PersistedState & TransientState

const homeStore = create<HomeState>()(
  persist(
    (set, get) => ({
      // persisted states
      userOnboarded: false,
      chatLog: [],
      showIntroduction: process.env.NEXT_PUBLIC_SHOW_INTRODUCTION !== 'false',
      assistantMessage: '',

      // transient states
      viewer: new Viewer(),
      live2dViewer: null,
      slideMessages: [],
      chatProcessing: false,
      chatProcessingCount: 0,
      incrementChatProcessingCount: () => {
        set(({ chatProcessingCount }) => ({
          chatProcessingCount: chatProcessingCount + 1,
        }))
      },
      decrementChatProcessingCount: () => {
        set(({ chatProcessingCount }) => ({
          chatProcessingCount: chatProcessingCount - 1,
        }))
      },
      backgroundImageUrl:
        process.env.NEXT_PUBLIC_BACKGROUND_IMAGE_PATH ?? '/bg-c.png',
      modalImage: '',
      triggerShutter: false,
      webcamStatus: false,
      captureStatus: false,
      isCubismCoreLoaded: false,
      setIsCubismCoreLoaded: (loaded) =>
        set(() => ({ isCubismCoreLoaded: loaded })),
      isLive2dLoaded: false,
      setIsLive2dLoaded: (loaded) => set(() => ({ isLive2dLoaded: loaded })),
    }),
    {
      name: 'aitube-kit-home',
      partialize: ({ chatLog, showIntroduction }) => ({
        chatLog: messageSelectors.cutImageMessage(chatLog),
        showIntroduction,
      }),
    }
  )
)

// chatLogの変更を監視して保存
homeStore.subscribe((state, prevState) => {
  if (state.chatLog !== prevState.chatLog && state.chatLog.length > 0) {
    // Create a safe serializable message structure
    const safeMessages = state.chatLog.map(message => {
      // Basic message properties
      const safeMessage: any = {
        role: message.role,
        timestamp: message.timestamp
      };

      // Handle content properly
      if (typeof message.content === 'string') {
        safeMessage.content = message.content;
      } else if (Array.isArray(message.content)) {
        safeMessage.content = message.content.map(c => {
          const contentItem: any = { type: c.type };
          if (c.type === 'text' && c.text) {
            contentItem.text = c.text;
          }
          if (c.type === 'image' && c.image) {
            // Ensure image data is serializable
            contentItem.image = typeof c.image === 'string' ? c.image : null;
          }
          return contentItem;
        }).filter(item => item.text || item.image); // Remove empty items
      }

      // Add user info if present, only including necessary fields
      if (message.userInfo) {
        safeMessage.userInfo = {
          name: message.userInfo.name,
          age: message.userInfo.age,
          gender: message.userInfo.gender
        };
      }

      return safeMessage;
    });

    // Send sanitized messages to API
    fetch('/api/save-chat-log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: safeMessages,
        isNewFile: prevState.chatLog.length === 0,
      }),
    }).catch((error) => console.error('Error saving chat log:', error));
  }
});

export default homeStore
