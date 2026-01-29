import { Holistic, Results } from '@mediapipe/holistic'
// @ts-ignore
import * as Kalidokit from 'kalidokit'
import homeStore from '@/features/stores/home'

// Singleton instance to prevent multiple WASM initializations
let globalHolisticInstance: Holistic | null = null
let isInitializing = false
let initializationPromise: Promise<void> | null = null

export class MotionCaptureManager {
  private isRunning: boolean = false
  private onResultsCallback: ((results: Results) => void) | null = null

  constructor(onResults: (results: Results) => void) {
    this.onResultsCallback = onResults
  }

  public async initialize() {
    if (globalHolisticInstance) {
      console.log('Attaching to existing global Holistic instance')
      globalHolisticInstance.onResults(this.handleResults.bind(this))
      return
    }

    if (isInitializing && initializationPromise) {
      console.log('Waiting for existing initialization...')
      await initializationPromise
      if (globalHolisticInstance) {
        ; (globalHolisticInstance as Holistic).onResults(this.handleResults.bind(this))
      }
      return
    }

    isInitializing = true
    console.log('Initializing MotionCaptureManager (Holistic)...')

    initializationPromise = (async () => {
      try {
        const holistic = new Holistic({
          locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`
          },
        })

        holistic.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          enableSegmentation: false,
          smoothSegmentation: false,
          refineFaceLandmarks: true,
          minDetectionConfidence: 0.3,
          minTrackingConfidence: 0.3,
        })

        await holistic.initialize()
        globalHolisticInstance = holistic
        globalHolisticInstance.onResults(this.handleResults.bind(this))
        console.log('MotionCaptureManager Initialized')
      } catch (error) {
        console.error('Failed to initialize Holistic:', error)
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
    if (!this.isRunning || !globalHolisticInstance) return
    await globalHolisticInstance.send({ image })
  }

  public start() {
    this.isRunning = true
  }

  public stop() {
    this.isRunning = false
  }

  public solvePose(results: Results, videoElement: HTMLVideoElement) {
    if (!results.poseLandmarks && !results.faceLandmarks) return null

    let poseRig = {}
    if (results.poseLandmarks && results.poseLandmarks.length >= 33) {
      try {
        // Fallback for 3D landmarks if missing to prevent Kalidokit crash
        // @ts-ignore
        const worldLandmarks = results.poseWorldLandmarks || results.poseLandmarks.map(l => ({ x: l.x, y: l.y, z: 0, visibility: l.visibility }))

        poseRig = Kalidokit.Pose.solve(
          results.poseLandmarks,
          worldLandmarks,
          {
            runtime: 'mediapipe',
            video: videoElement,
          }
        )
      } catch (e) {
        console.error('Kalidokit Pose solve error:', e)
      }
    }

    let faceRig: any = {}
    if (results.faceLandmarks) {
      faceRig = Kalidokit.Face.solve(
        results.faceLandmarks,
        {
          runtime: 'mediapipe',
          video: videoElement,
        }
      )

      // Mouth Open Detection
      // faceRig.mouth.y is openness (0 to 1)
      if (faceRig && faceRig.mouth) {
        const isOpen = (faceRig.mouth.y || 0) > 0.1
        const currentIsOpen = homeStore.getState().isMouthOpen
        if (currentIsOpen !== isOpen) {
          homeStore.setState({ isMouthOpen: isOpen })
        }
      }
    }

    let rightHandRig = {}
    if (results.rightHandLandmarks) {
      rightHandRig = Kalidokit.Hand.solve(results.rightHandLandmarks, "Right")
    }

    let leftHandRig = {}
    if (results.leftHandLandmarks) {
      leftHandRig = Kalidokit.Hand.solve(results.leftHandLandmarks, "Left")
    }

    const riggedPose = {
      ...poseRig,
      ...(rightHandRig || {}),
      ...(leftHandRig || {}),
      Face: faceRig
    }

    // Gaze Detection Logic 
    let headRotation = { x: 0, y: 0, z: 0 }
    let hasHeadData = false

    const pose = poseRig as any
    if (pose && pose.Head && pose.Head.rotation) {
      headRotation = pose.Head.rotation
      hasHeadData = true
    } else {
      // Fallback: Raw landmarks from Pose
      if (results.poseLandmarks) {
        const nose = results.poseLandmarks[0]
        const leftEar = results.poseLandmarks[7]
        const rightEar = results.poseLandmarks[8]

        if (nose && leftEar && rightEar) {
          const earMidX = (leftEar.x + rightEar.x) / 2
          const earMidY = (leftEar.y + rightEar.y) / 2

          const yaw = (nose.x - earMidX) * 10
          const pitch = (nose.y - earMidY) * 10
          const roll = -Math.atan2(rightEar.y - leftEar.y, rightEar.x - leftEar.x)

          headRotation = { x: pitch, y: yaw, z: roll }
          hasHeadData = true
        }
      }
    }

    if (hasHeadData) {
      const { x, y, z } = headRotation

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
