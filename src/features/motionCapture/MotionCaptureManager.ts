import { Pose, Results } from '@mediapipe/pose'
// @ts-ignore
import * as Kalidokit from 'kalidokit'
import homeStore from '@/features/stores/home'

// Singleton instance to prevent multiple WASM initializations
let globalPoseInstance: Pose | null = null
let isInitializing = false
let initializationPromise: Promise<void> | null = null

export class MotionCaptureManager {
  private isRunning: boolean = false
  private onResultsCallback: ((results: Results) => void) | null = null

  constructor(onResults: (results: Results) => void) {
    this.onResultsCallback = onResults
  }

  public async initialize() {
    if (globalPoseInstance) {
      console.log('Attaching to existing global Pose instance')
      globalPoseInstance.onResults(this.handleResults.bind(this))
      return
    }

    if (isInitializing && initializationPromise) {
      console.log('Waiting for existing initialization...')
      await initializationPromise
      if (globalPoseInstance) {
        ; (globalPoseInstance as Pose).onResults(this.handleResults.bind(this))
      }
      return
    }

    isInitializing = true
    console.log('Initializing MotionCaptureManager...')

    initializationPromise = (async () => {
      try {
        const pose = new Pose({
          locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
          },
        })

        pose.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          enableSegmentation: false,
          smoothSegmentation: false,
          minDetectionConfidence: 0.3,
          minTrackingConfidence: 0.3,
        })

        await pose.initialize()
        globalPoseInstance = pose
        globalPoseInstance.onResults(this.handleResults.bind(this))
        console.log('MotionCaptureManager Initialized')
      } catch (error) {
        console.error('Failed to initialize Pose:', error)
        throw error
      } finally {
        isInitializing = false
      }
    })()

    await initializationPromise
  }

  private handleResults(results: Results) {
    if (this.onResultsCallback) {
      this.onResultsCallback(results)
    }
  }

  public async send(image: HTMLVideoElement) {
    if (!this.isRunning || !globalPoseInstance) return
    await globalPoseInstance.send({ image })
  }

  public start() {
    this.isRunning = true
  }

  public stop() {
    this.isRunning = false
    // deliberately do NOT close the global pose instance to avoid re-init crashes
  }

  public solvePose(results: Results, videoElement: HTMLVideoElement) {
    // Debug entry removed

    if (!results.poseLandmarks || !results.poseWorldLandmarks) return null

    const riggedPose = Kalidokit.Pose.solve(
      results.poseLandmarks,
      results.poseWorldLandmarks,
      {
        runtime: 'mediapipe',
        video: videoElement,
      }
    )

    // Detailed debug removed

    // Calculate gaze direction
    let headRotation = { x: 0, y: 0, z: 0 }
    let hasHeadData = false

    const pose = riggedPose as any
    if (pose && pose.Head && pose.Head.rotation) {
      headRotation = pose.Head.rotation
      hasHeadData = true
    } else {
      // Fallback: Raw landmarks
      const nose = results.poseLandmarks[0]
      const leftEar = results.poseLandmarks[7]
      const rightEar = results.poseLandmarks[8]

      if (nose && leftEar && rightEar) {
        // Simple approximation
        const earMidX = (leftEar.x + rightEar.x) / 2
        const earMidY = (leftEar.y + rightEar.y) / 2

        // Yaw: Nose relative to ear center X
        // Scale factor approx 10 to map normalized coords to radians
        const yaw = (nose.x - earMidX) * 10

        // Pitch: Nose relative to ear center Y
        // Offset: Nose is naturally below ears. Adjust offset if needed.
        const pitch = (nose.y - earMidY) * 10

        // Roll: Angle of ears
        const roll = -Math.atan2(rightEar.y - leftEar.y, rightEar.x - leftEar.x)

        headRotation = { x: pitch, y: yaw, z: roll }
        hasHeadData = true

      }
    }

    if (hasHeadData) {
      const { x, y, z } = headRotation

      // Check if user is looking at camera (angles close to 0)
      // Threshold: 0.3 radians (~17 degrees)
      // Handle Roll (z) being around PI due to mirroring
      let checkZ = Math.abs(z)
      if (checkZ > 2.0) checkZ = Math.abs(checkZ - Math.PI)

      const isLooking =
        Math.abs(x) < 0.3 && Math.abs(y) < 0.3 && checkZ < 0.3

      const currentIsLooking = homeStore.getState().isLookingAtCamera
      if (currentIsLooking !== isLooking) {
        homeStore.setState({ isLookingAtCamera: isLooking })
      }
    }

    return riggedPose
  }
}
