import { useEffect, useRef, useState, useCallback } from 'react'
import { MotionCaptureManager } from './MotionCaptureManager'
import homeStore from '@/features/stores/home'
import { Camera } from '@mediapipe/camera_utils'
import { IconButton } from '@/components/iconButton'

export const MotionCapture = () => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const managerRef = useRef<MotionCaptureManager | null>(null)
  const hasPoseRef = useRef(false)
  const [isThinking, setIsThinking] = useState(true)
  const [isMinimized, setIsMinimized] = useState(false)
  const [isPip, setIsPip] = useState(false)

  const togglePip = useCallback(async () => {
    if (!videoRef.current) return
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
        setIsPip(false)
      } else {
        await videoRef.current.requestPictureInPicture()
        setIsPip(true)
      }
    } catch (e) {
      console.error('Failed to toggle Picture-in-Picture:', e)
    }
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onEnterPip = () => setIsPip(true)
    const onLeavePip = () => setIsPip(false)

    video.addEventListener('enterpictureinpicture', onEnterPip)
    video.addEventListener('leavepictureinpicture', onLeavePip)
    return () => {
      video.removeEventListener('enterpictureinpicture', onEnterPip)
      video.removeEventListener('leavepictureinpicture', onLeavePip)
    }
  }, [])

  useEffect(() => {
    if (!videoRef.current) return

    const manager = new MotionCaptureManager((results) => {
      // Use videoRef.current as the source for dimensions

      // Check if video is ready
      if (videoRef.current && videoRef.current.readyState >= 2) {
        // Solve pose always to trigger gaze detection
        const riggedPose = manager.solvePose(results, videoRef.current)

        // Access store freshly to get the current viewer/model
        const { viewer } = homeStore.getState()

        if (viewer.model && riggedPose) {
          if (!hasPoseRef.current) {
            hasPoseRef.current = true
            // Stop the idle animation so manual bone control works better
            viewer.model.stopAnimation()
          }
          viewer.model.animateFromPose(riggedPose)

          if ((results as any).poseWorldLandmarks || results.poseLandmarks) {
            const worldLandmarks =
              (results as any).poseWorldLandmarks ||
              results.poseLandmarks.map((l: any) => ({
                x: l.x,
                y: l.y,
                z: 0,
                visibility: l.visibility,
              }))
            viewer.model.drawDebugSkeleton(worldLandmarks)
          } else {
            viewer.model.drawDebugSkeleton(null)
          }
        }
      }
    })

    manager
      .initialize()
      .then(() => {
        setIsThinking(false)
        manager.start()
      })
      .catch((err) => {
        console.error('MotionCapture: Initialization failed', err)
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
    <>
      {isMinimized && (
        <div className="absolute bottom-5 right-5 z-50">
          <IconButton
            iconName="24/Camera"
            isProcessing={false}
            onClick={() => setIsMinimized(false)}
            className="bg-black/80 hover:bg-black/60 text-cyan-400 border border-cyan-500/50"
            title="Show Camera"
          />
        </div>
      )}

      <div
        className={`absolute bottom-5 right-5 w-64 h-48 bg-black rounded-lg border border-cyan-500/30 overflow-hidden shadow-2xl z-50 group transition-all duration-300 ${
          isMinimized
            ? 'opacity-0 pointer-events-none translate-y-4'
            : 'opacity-100'
        }`}
      >
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
        <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 backdrop-blur rounded text-[10px] text-cyan-400 font-mono border border-cyan-500/20 pointer-events-none">
          LIVE FEED
        </div>

        {/* Controls Overlay */}
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <IconButton
            iconName={isPip ? '24/FrameEffect' : '24/FrameEffect'}
            isProcessing={false}
            onClick={togglePip}
            className={`w-8 h-8 !p-1 bg-black/60 hover:bg-black/80 text-cyan-400 border border-cyan-500/30 ${isPip ? 'bg-cyan-900/50' : ''}`}
          />
          <IconButton
            iconName="24/Close"
            isProcessing={false}
            onClick={() => setIsMinimized(true)}
            className="w-8 h-8 !p-1 bg-black/60 hover:bg-black/80 text-cyan-400 border border-cyan-500/30"
          />
        </div>
      </div>
    </>
  )
}
