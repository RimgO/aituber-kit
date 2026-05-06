import { useCallback } from 'react'
import menuStore from '@/features/stores/menu'
import { useRecordingStore } from '@/features/stores/recording'
import { useMotionLogStore } from '@/features/stores/motionLog'

export const useScreenRecording = () => {
  const recordingStore = useRecordingStore()

  const startRecording = useCallback(async () => {
    console.log('useScreenRecording: startRecording called')
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'browser',
        },
        audio: {
          // @ts-ignore: System audio hint
          suppressLocalAudioPlayback: false,
        },
        // @ts-ignore: preferCurrentTab is a standard hint for current tab recording
        preferCurrentTab: true,
      } as DisplayMediaStreamOptions)

      console.log('useScreenRecording: Stream acquired', stream.id)

      const mimeType = MediaRecorder.isTypeSupported(
        'video/webm;codecs=vp9,opus'
      )
        ? 'video/webm;codecs=vp9,opus'
        : 'video/webm'

      // Clear tracking logs before starting new recording
      useMotionLogStore.getState().clearLogs()

      recordingStore.start(stream, mimeType)
      menuStore.setState({ isRecording: true })

      stream.getVideoTracks()[0].onended = () => {
        console.log('useScreenRecording: Stream ended by external cause')
        recordingStore.stop()
        useMotionLogStore.getState().exportLogs()
        menuStore.setState({ isRecording: false })
      }
    } catch (error) {
      console.error(
        'useScreenRecording: Error starting screen recording:',
        error
      )
      menuStore.setState({ isRecording: false })
    }
  }, [recordingStore])

  const stopRecording = useCallback(() => {
    console.log('useScreenRecording: stopRecording called')
    recordingStore.stop()
    // Export tracking logs when recording stops manually
    useMotionLogStore.getState().exportLogs()
    menuStore.setState({ isRecording: false })
  }, [recordingStore])

  return {
    startRecording,
    stopRecording,
  }
}
