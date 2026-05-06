import { useEffect, useRef, useState, useCallback } from 'react'
import { MotionCaptureManager } from './MotionCaptureManager'
import homeStore from '@/features/stores/home'
import { Camera } from '@mediapipe/camera_utils'
import { IconButton } from '@/components/iconButton'

export const MotionCapture = () => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const managerRef = useRef<MotionCaptureManager | null>(null)
  const cameraRef = useRef<Camera | null>(null)
  const hasPoseRef = useRef(false)
  const rAFRef = useRef<number>()
  const isCameraActiveRef = useRef(true)   // true = using webcam, false = using video/screen
  const isProcessingRef = useRef(false)
  const canvasRef = useRef<HTMLCanvasElement>(
    typeof document !== 'undefined' ? document.createElement('canvas') : null as any
  )

  const [isThinking, setIsThinking] = useState(true)
  const [isMinimized, setIsMinimized] = useState(false)
  const [isPip, setIsPip] = useState(false)
  const [sourceLabel, setSourceLabel] = useState<'LIVE FEED' | 'TEST MEDIA'>('LIVE FEED')

  // --- Helpers ---

  const sendFrameFromCanvas = useCallback(async (video: HTMLVideoElement) => {
    if (!managerRef.current || isProcessingRef.current) return
    if (video.paused || video.ended) return
    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) return

    isProcessingRef.current = true
    try {
      const canvas = canvasRef.current
      if (!canvas) return
      const MAX = 640
      let w = video.videoWidth, h = video.videoHeight
      if (w > MAX || h > MAX) {
        const r = Math.min(MAX / w, MAX / h)
        w = Math.round(w * r); h = Math.round(h * r)
      }
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h
      }
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      ctx.drawImage(video, 0, 0, w, h)
      await managerRef.current.send(canvas as any)
    } catch (e) {
      console.error('MediaPipe send error:', e)
    } finally {
      isProcessingRef.current = false
    }
  }, [])

  const stopVideoLoop = useCallback(() => {
    if (rAFRef.current) {
      cancelAnimationFrame(rAFRef.current)
      rAFRef.current = undefined
    }
  }, [])

  const startVideoLoop = useCallback(() => {
    stopVideoLoop()
    const loop = () => {
      if (videoRef.current && !isCameraActiveRef.current) {
        sendFrameFromCanvas(videoRef.current)
      }
      rAFRef.current = requestAnimationFrame(loop)
    }
    rAFRef.current = requestAnimationFrame(loop)
  }, [sendFrameFromCanvas, stopVideoLoop])

  // --- PiP ---
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const onEnter = () => setIsPip(true)
    const onLeave = () => setIsPip(false)
    video.addEventListener('enterpictureinpicture', onEnter)
    video.addEventListener('leavepictureinpicture', onLeave)
    return () => {
      video.removeEventListener('enterpictureinpicture', onEnter)
      video.removeEventListener('leavepictureinpicture', onLeave)
    }
  }, [])

  // --- Initialize Manager and Camera ONCE ---
  useEffect(() => {
    if (!videoRef.current) return

    const manager = new MotionCaptureManager((results) => {
      if (!videoRef.current || videoRef.current.readyState < 2) return
      const riggedPose = manager.solvePose(results, videoRef.current)
      const { viewer } = homeStore.getState()
      if (viewer.model && riggedPose) {
        if (!hasPoseRef.current) {
          hasPoseRef.current = true
          viewer.model.stopAnimation()
        }
        viewer.model.animateFromPose(riggedPose)
        if ((results as any).poseWorldLandmarks || results.poseLandmarks) {
          const worldLandmarks =
            (results as any).poseWorldLandmarks ||
            results.poseLandmarks.map((l: any) => ({ x: l.x, y: l.y, z: 0, visibility: l.visibility }))
          viewer.model.drawDebugSkeleton(worldLandmarks, riggedPose)
        } else {
          viewer.model.drawDebugSkeleton(null, null)
        }
      }
    })

    managerRef.current = manager

    manager.initialize()
      .then(() => {
        setIsThinking(false)
        manager.start()

        // Start webcam via Camera utility
        const camera = new Camera(videoRef.current!, {
          onFrame: async () => {
            // Only process if in webcam mode and not already processing
            if (isCameraActiveRef.current && videoRef.current && !isProcessingRef.current) {
              isProcessingRef.current = true
              try {
                await managerRef.current?.send(videoRef.current)
              } catch (e) {
                console.error('Camera send error:', e)
              } finally {
                isProcessingRef.current = false
              }
            }
          },
          width: 640,
          height: 480,
        })
        cameraRef.current = camera
        camera.start()
      })
      .catch((err) => console.error('MotionCapture: Initialization failed', err))

    return () => {
      manager.stop()
      stopVideoLoop()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- Screen Capture ---
  const handleScreenCapture = async () => {
    if (!videoRef.current) return
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true })

      // Switch to external source mode (stop webcam processing)
      isCameraActiveRef.current = false
      setSourceLabel('TEST MEDIA')

      const video = videoRef.current
      video.srcObject = stream
      video.muted = true

      video.onloadedmetadata = () => {
        video.play()
        startVideoLoop()
      }

      stream.getVideoTracks()[0].addEventListener('ended', () => {
        stopVideoLoop()
        isCameraActiveRef.current = true
        setSourceLabel('LIVE FEED')
      })
    } catch (e) {
      console.error('Failed to get screen capture:', e)
    }
  }

  // --- Video File Upload ---
  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !videoRef.current) return

    // Switch to external source mode
    isCameraActiveRef.current = false
    setSourceLabel('TEST MEDIA')

    const url = URL.createObjectURL(file)
    const video = videoRef.current
    video.srcObject = null
    video.src = url
    video.loop = true
    video.muted = true

    video.onloadedmetadata = () => {
      video.play()
      startVideoLoop()
    }
  }

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
      console.error('Failed to toggle PiP:', e)
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
          isMinimized ? 'opacity-0 pointer-events-none translate-y-4' : 'opacity-100'
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
          {sourceLabel}
        </div>

        {/* Controls Overlay */}
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          {/* Screen Capture */}
          <button
            onClick={handleScreenCapture}
            className="w-8 h-8 flex items-center justify-center bg-black/60 hover:bg-black/80 text-cyan-400 border border-cyan-500/30 rounded-full"
            title="Screen Capture"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
              <line x1="8" y1="21" x2="16" y2="21"></line>
              <line x1="12" y1="17" x2="12" y2="21"></line>
            </svg>
          </button>

          {/* File Upload */}
          <label className="cursor-pointer">
            <input type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
            <div className="w-8 h-8 flex items-center justify-center bg-black/60 hover:bg-black/80 text-cyan-400 border border-cyan-500/30 rounded-full" title="Upload Video">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
            </div>
          </label>

          <IconButton
            iconName="24/FrameEffect"
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
