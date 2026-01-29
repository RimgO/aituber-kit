import { Pose, Results } from '@mediapipe/pose'
// @ts-ignore
import * as Kalidokit from 'kalidokit'

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
        ;(globalPoseInstance as Pose).onResults(this.handleResults.bind(this))
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
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
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
    if (!results.poseLandmarks || !results.poseWorldLandmarks) return null

    return Kalidokit.Pose.solve(
      results.poseLandmarks,
      results.poseWorldLandmarks,
      {
        runtime: 'mediapipe',
        video: videoElement,
      }
    )
  }
}
