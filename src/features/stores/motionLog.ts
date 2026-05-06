import { create } from 'zustand'

export type Vector3Data = { x: number; y: number; z: number }

export type MotionLogFrame = {
  time: number
  mediapipe: Record<string, Vector3Data>
  vrm: Record<string, Vector3Data>
}

type MotionLogState = {
  logs: MotionLogFrame[]
  addLog: (frame: MotionLogFrame) => void
  clearLogs: () => void
  exportLogs: () => void
}

export const useMotionLogStore = create<MotionLogState>((set, get) => ({
  logs: [],
  addLog: (frame) => set((state) => ({ logs: [...state.logs, frame] })),
  clearLogs: () => set({ logs: [] }),
  exportLogs: () => {
    const { logs } = get()
    console.log('Exporting motion logs, total frames:', logs.length)
    if (logs.length === 0) {
      console.warn('Motion log is empty, nothing to download.')
      return
    }

    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const downloadAnchorNode = document.createElement('a')
    downloadAnchorNode.href = url
    downloadAnchorNode.download = `motion_tracking_log_${Date.now()}.json`
    document.body.appendChild(downloadAnchorNode) // required for firefox
    downloadAnchorNode.click()
    downloadAnchorNode.remove()
    URL.revokeObjectURL(url)
  }
}))
