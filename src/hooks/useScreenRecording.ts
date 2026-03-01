import { useCallback } from 'react'
import menuStore from '@/features/stores/menu'
import { useRecordingStore } from '@/features/stores/recording'

export const useScreenRecording = () => {
  const recordingStore = useRecordingStore()

  const startRecording = useCallback(async () => {
    console.log('useScreenRecording: startRecording called')
    try {
      // displaySurface: 'window' suggests the user that they should pick a window.
      // selfBrowserSurface: 'include' and preferCurrentTab keep the focus friendly to the current app.
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'window',
          // @ts-ignore: Some browsers support these hints
          selfBrowserSurface: 'include',
          preferCurrentTab: false, // User specifically asked for 'window'
        },
        audio: {
          // @ts-ignore: System audio hint
          suppressLocalAudioPlayback: false,
        },
      } as DisplayMediaStreamOptions)

      console.log('useScreenRecording: Stream acquired', stream.id)

      // Check supported mime types
      const mimeType = MediaRecorder.isTypeSupported(
        'video/webm;codecs=vp9,opus'
      )
        ? 'video/webm;codecs=vp9,opus'
        : 'video/webm'

      recordingStore.start(stream, mimeType)
      menuStore.setState({ isRecording: true })

      // Handle the case where the user stops sharing via browser UI
      stream.getVideoTracks()[0].onended = () => {
        console.log('useScreenRecording: Stream ended by external cause')
        recordingStore.stop()
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
  }, [recordingStore])

  return {
    startRecording,
    stopRecording,
  }
}
