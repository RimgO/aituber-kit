import { create } from 'zustand'
import menuStore from './menu'

interface RecordingState {
  mediaRecorder: MediaRecorder | null
  chunks: Blob[]
  start: (stream: MediaStream, mimeType: string) => void
  stop: () => void
  addChunk: (chunk: Blob) => void
  clear: () => void
}

export const useRecordingStore = create<RecordingState>((set, get) => ({
  mediaRecorder: null,
  chunks: [],
  start: (stream, mimeType) => {
    console.log('RecordingStore: Starting recording...')
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 2500000,
    })

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        get().addChunk(event.data)
      }
    }

    mediaRecorder.onstop = () => {
      console.log('RecordingStore: MediaRecorder stopped. Processing blobs...')
      const chunks = get().chunks
      const blob = new Blob(chunks, { type: mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `recording-${new Date().toISOString()}.webm`
      a.click()
      URL.revokeObjectURL(url)

      stream.getTracks().forEach((track) => track.stop())
      menuStore.setState({ isRecording: false })
      get().clear()
    }

    mediaRecorder.onerror = (event) => {
      console.error('RecordingStore: MediaRecorder error:', event)
      menuStore.setState({ isRecording: false })
      get().clear()
    }

    mediaRecorder.start()
    set({ mediaRecorder, chunks: [] })
  },
  stop: () => {
    const { mediaRecorder } = get()
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      console.log('RecordingStore: Stopping recording manually...')
      mediaRecorder.stop()
    } else {
      console.warn(
        'RecordingStore: stop() called but recorder is null or inactive'
      )
      menuStore.setState({ isRecording: false })
    }
  },
  addChunk: (chunk) => {
    set((state) => ({ chunks: [...state.chunks, chunk] }))
  },
  clear: () => {
    set({ mediaRecorder: null, chunks: [] })
  },
}))
