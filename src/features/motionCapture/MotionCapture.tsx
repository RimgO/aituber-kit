import { useEffect, useRef, useState } from 'react'
import { MotionCaptureManager } from './MotionCaptureManager'
import homeStore from '@/features/stores/home'
import { Camera } from '@mediapipe/camera_utils'

export const MotionCapture = () => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const managerRef = useRef<MotionCaptureManager | null>(null)
  const hasPoseRef = useRef(false)
  const [isThinking, setIsThinking] = useState(true)

  useEffect(() => {
    if (!videoRef.current) return

    const manager = new MotionCaptureManager((results) => {
      // Access store freshly to get the current viewer/model
      const { viewer } = homeStore.getState()
      if (!viewer.model) return

      // Use videoRef.current as the source for dimensions
      // Check if video is ready
      if (videoRef.current && videoRef.current.readyState >= 2) {
        const riggedPose = manager.solvePose(results, videoRef.current)
        if (riggedPose) {
          if (!hasPoseRef.current) {
            hasPoseRef.current = true
            // Stop the idle animation so manual bone control works better
            viewer.model.stopAnimation()
          }
          viewer.model.animateFromPose(riggedPose)
        }
      }
    })

    manager.initialize().then(() => {
      setIsThinking(false)
      manager.start()
    })

    managerRef.current = manager

    const camera = new Camera(videoRef.current, {
      onFrame: async () => {
        if (managerRef.current && videoRef.current) {
          await managerRef.current.send(videoRef.current)
        }
      },
      width: 640,
      height: 480,
    })
    camera.start()

    return () => {
      manager.stop()
      // camera.stop()
    }
  }, [])

  return (
    <div className="absolute bottom-5 right-5 w-64 h-48 bg-black rounded-lg border border-cyan-500/30 overflow-hidden shadow-2xl z-50">
      <video
        ref={videoRef}
        className="w-full h-full object-cover -scale-x-100 opacity-80"
        playsInline
        muted
        autoPlay
      />
      {isThinking && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-cyan-400 text-xs font-mono animate-pulse">
          INITIALIZING VISUAL CORTEX...
        </div>
      )}
      <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 backdrop-blur rounded text-[10px] text-cyan-400 font-mono border border-cyan-500/20">
        LIVE FEED
      </div>
    </div>
  )
}
