import { useCallback, useEffect, useState } from 'react'
import settingsStore from '@/features/stores/settings'
import homeStore from '@/features/stores/home'
import menuStore from '@/features/stores/menu'
import slideStore from '@/features/stores/slide'
import { handleSendChatFn } from '../features/chat/handlers'
import { MessageInputContainer } from './messageInputContainer'
import { SlideText } from './slideText'
import { useUserTracking as handleCurrentUser } from '../features/chat/handleCurrentUser'

export const Form = () => {
  const modalImage = homeStore((s) => s.modalImage)
  const webcamStatus = homeStore((s) => s.webcamStatus)
  const captureStatus = homeStore((s) => s.captureStatus)
  const slideMode = settingsStore((s) => s.slideMode)
  const slideVisible = menuStore((s) => s.slideVisible)
  const slidePlaying = slideStore((s) => s.isPlaying)
  const chatProcessingCount = homeStore((s) => s.chatProcessingCount)
  const [delayedText, setDelayedText] = useState('')
  const handleSendChat = handleSendChatFn()
  
  // User tracking logic extracted to custom hook
  const { currentUserId, isNewUser } = handleCurrentUser()

  useEffect(() => {
    // Send chat when text and image are ready
    if (delayedText && modalImage) {
      handleSendChat(delayedText)
      setDelayedText('')
    }
  }, [modalImage, delayedText, handleSendChat, currentUserId])

  const hookSendChat = useCallback(
    (text: string) => {
      // If modalImage doesn't exist, trigger shutter
      if (!homeStore.getState().modalImage) {
        homeStore.setState({ triggerShutter: true })
      }

      // If webcam is open or capturing, delay text until image is captured
      if (webcamStatus || captureStatus) {
        setDelayedText(text)
      } else {
        handleSendChat(text)
      }
    },
    [handleSendChat, webcamStatus, captureStatus, currentUserId]
  )

  // Props for MessageInputContainer
  const inputProps = {
    onChatProcessStart: hookSendChat,
    enableAutoVoiceStart: isNewUser, // Auto start voice input for new users
    currentUserId
  }

  return slideMode &&
    slideVisible &&
    (slidePlaying || chatProcessingCount !== 0) ? (
    <SlideText />
  ) : (
    <MessageInputContainer {...inputProps} />
  )
}