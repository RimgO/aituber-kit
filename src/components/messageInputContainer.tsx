import { useEffect, useRef } from 'react'
import { MessageInput } from '@/components/messageInput'
import homeStore from '@/features/stores/home'
import settingsStore from '@/features/stores/settings'
import { useVoiceRecognition } from '@/hooks/useVoiceRecognition'

// 無音検出用の状態と変数を追加
type Props = {
  onChatProcessStart: (text: string) => void
}

export const MessageInputContainer = ({ onChatProcessStart }: Props) => {
  const isSpeaking = homeStore((s) => s.isSpeaking)
  const chatProcessing = homeStore((s) => s.chatProcessing)
  const continuousMicListeningMode = settingsStore(
    (s) => s.continuousMicListeningMode
  )
  const speechRecognitionMode = settingsStore((s) => s.speechRecognitionMode)

  // 音声認識フックを使用
  const {
    userMessage,
    isListening,
    silenceTimeoutRemaining,
    handleInputChange,
    handleSendMessage,
    toggleListening,
    handleStopSpeaking,
    startListening,
    stopListening,
  } = useVoiceRecognition({ onChatProcessStart })

  const isLookingAtCamera = homeStore((s) => s.isLookingAtCamera)
  const isMouthOpen = homeStore((s) => s.isMouthOpen)
  const autoStartTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Gaze-based auto-start
  // Gaze-based auto-start with delay
  useEffect(() => {
    // Trigger if Looking OR Mouth is Open
    const isActive = isLookingAtCamera || isMouthOpen
    const canStart =
      !isSpeaking &&
      !chatProcessing &&
      !isListening &&
      !continuousMicListeningMode

    if (isActive && canStart) {
      if (!autoStartTimerRef.current) {
        autoStartTimerRef.current = setTimeout(() => {
          console.log('👀 Face/Gaze trigger: Starting speech recognition')
          startListening()
          autoStartTimerRef.current = null
        }, 1000) // 1 second threshold
      }
    } else {
      if (autoStartTimerRef.current) {
        clearTimeout(autoStartTimerRef.current)
        autoStartTimerRef.current = null
      }
    }

    return () => {
      if (autoStartTimerRef.current) {
        clearTimeout(autoStartTimerRef.current)
      }
    }
  }, [
    isLookingAtCamera,
    isMouthOpen,
    isSpeaking,
    chatProcessing,
    isListening,
    continuousMicListeningMode,
    startListening,
  ])

  // 常時マイク入力モードの切り替え
  const toggleContinuousMode = () => {
    // Whisperモードの場合は常時マイク入力モードを使用できない
    if (speechRecognitionMode === 'whisper') return

    // 現在のモードを反転して設定
    settingsStore.setState({
      continuousMicListeningMode: !continuousMicListeningMode,
    })
  }

  return (
    <MessageInput
      userMessage={userMessage}
      isMicRecording={isListening}
      onChangeUserMessage={handleInputChange}
      onClickMicButton={toggleListening}
      onClickSendButton={handleSendMessage}
      onClickStopButton={handleStopSpeaking}
      isSpeaking={isSpeaking}
      silenceTimeoutRemaining={silenceTimeoutRemaining}
      continuousMicListeningMode={
        continuousMicListeningMode && speechRecognitionMode === 'browser'
      }
      onToggleContinuousMode={toggleContinuousMode}
    />
  )
}
