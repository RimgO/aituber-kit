import { Holistic, Results } from '@mediapipe/holistic'
import homeStore from '@/features/stores/home'
import settingsStore from '@/features/stores/settings'
import { solvePose } from './solvers/poseSolver'
import { solveFace } from './solvers/faceSolver'
import { solveHand } from './solvers/handSolver'

// Singleton instance to prevent multiple WASM initializations
let globalHolisticInstance: Holistic | null = null
let isInitializing = false
let initializationPromise: Promise<void> | null = null

export class MotionCaptureManager {
  private isRunning: boolean = false
  private onResultsCallback: ((results: Results) => void) | null = null
  private smoothedPose: any = {}
  // Auto-calibration
  private calibFrameCount = 0
  private calibEyeMaxSum = 0
  private calibEyeMax = 0.04

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
        ;(globalHolisticInstance as Holistic).onResults(
          this.handleResults.bind(this)
        )
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
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
          selfieMode: true,
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
    const settings = settingsStore.getState()
    if (!settings.enableMotionCapture) return null

    if (!results.poseLandmarks && !results.faceLandmarks) return null

    // Check if the detected person is large enough (heuristic to avoid background people)
    if (results.poseLandmarks) {
      const xs = results.poseLandmarks.map((l) => l.x)
      const ys = results.poseLandmarks.map((l) => l.y)
      const width = Math.max(...xs) - Math.min(...xs)
      const height = Math.max(...ys) - Math.min(...ys)
      const area = width * height

      // If area is less than 3% of the frame, consider it a background person/noise and reset tracking
      if (area < 0.03) {
        if (globalHolisticInstance) {
          globalHolisticInstance.reset()
        }
        this.smoothedPose = {}
        return null
      }
    }

    let poseRig: any = {}
    if (results.poseLandmarks && results.poseLandmarks.length >= 33) {
      if (
        settings.enableUpperBodyTracking ||
        settings.enableHipsTracking ||
        settings.enableLegTracking
      ) {
        try {
          const worldLandmarks =
            (results as any).poseWorldLandmarks ||
            results.poseLandmarks.map((l) => ({
              x: l.x,
              y: l.y,
              z: 0,
              visibility: l.visibility,
            }))

          const solvedPose = solvePose(results.poseLandmarks, worldLandmarks)
          if (solvedPose) poseRig = solvedPose

          // Filter Rig based on settings
          if (!settings.enableHipsTracking) {
            delete poseRig.Hips
          }

          if (!settings.enableUpperBodyTracking) {
            delete poseRig.Spine
            delete poseRig.Chest
            delete poseRig.UpperChest
            delete poseRig.Neck
            delete poseRig.RightShoulder
            delete poseRig.LeftShoulder
            delete poseRig.RightUpperArm
            delete poseRig.LeftUpperArm
            delete poseRig.RightLowerArm
            delete poseRig.LeftLowerArm
          }

          if (!settings.enableLegTracking) {
            delete poseRig.RightUpperLeg
            delete poseRig.LeftUpperLeg
            delete poseRig.RightLowerLeg
            delete poseRig.LeftLowerLeg
          }
        } catch (e) {
          console.error('Pose solve error:', e)
        }
      }
    }

    let faceRig: any = {}
    if (settings.enableFaceTracking && results.faceLandmarks) {
      // Auto-calibrate eye openness scale from first 30 frames
      if (this.calibFrameCount < 30) {
        // Estimate current eye openness for calibration (crude approximation)
        const eyeLm = results.faceLandmarks
        if (eyeLm) {
          const upper386 = eyeLm[386]
          const lower374 = eyeLm[374]
          if (upper386 && lower374) {
            const dist = Math.sqrt(
              (upper386.x - lower374.x) ** 2 + (upper386.y - lower374.y) ** 2
            )
            this.calibEyeMaxSum += dist
            this.calibFrameCount++
            if (this.calibFrameCount === 30) {
              this.calibEyeMax = (this.calibEyeMaxSum / 30) * 1.2
              console.log(
                '[MotionCapture] Calibrated eye max:',
                this.calibEyeMax
              )
            }
          }
        }
      }

      const solvedFace = solveFace(
        results,
        this.calibFrameCount >= 30 ? this.calibEyeMax : undefined
      )
      if (solvedFace) {
        faceRig = solvedFace

        const currentIsOpen = homeStore.getState().isMouthOpen
        if (currentIsOpen !== solvedFace.isMouthOpen) {
          homeStore.setState({ isMouthOpen: solvedFace.isMouthOpen })
        }
      }
    }

    let rightHandRig: any = {}
    if (
      (settings.enableHandTracking || settings.enableFingerTracking) &&
      results.rightHandLandmarks
    ) {
      const solvedHand = solveHand(results.rightHandLandmarks, 'Right')
      if (solvedHand) rightHandRig = solvedHand
    }

    let leftHandRig: any = {}
    if (
      (settings.enableHandTracking || settings.enableFingerTracking) &&
      results.leftHandLandmarks
    ) {
      const solvedHand = solveHand(results.leftHandLandmarks, 'Left')
      if (solvedHand) leftHandRig = solvedHand
    }

    const riggedPose = {
      ...poseRig,
      ...(rightHandRig || {}),
      ...(leftHandRig || {}),
      Face: faceRig,
      // Neck from face solver
      Neck: faceRig?.neck ?? null,
    }

    // Gaze Detection Logic
    let headRotation = { x: 0, y: 0, z: 0 }
    let hasHeadData = false

    if (faceRig && faceRig.head) {
      headRotation = { x: faceRig.head.x, y: faceRig.head.y, z: faceRig.head.z }
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
          const roll = -Math.atan2(
            rightEar.y - leftEar.y,
            rightEar.x - leftEar.x
          )

          headRotation = { x: pitch, y: yaw, z: roll }
          hasHeadData = true
        }
      }
    }

    if (hasHeadData) {
      const { x, y, z } = headRotation

      let checkZ = Math.abs(z)
      if (checkZ > 2.0) checkZ = Math.abs(checkZ - Math.PI)

      const isLooking = Math.abs(x) < 0.3 && Math.abs(y) < 0.3 && checkZ < 0.3

      const currentIsLooking = homeStore.getState().isLookingAtCamera
      if (currentIsLooking !== isLooking) {
        homeStore.setState({ isLookingAtCamera: isLooking })
      }
    }

    // --- Safe EMA Smoothing Filter ---
    const alpha = 0.4 // Smoothing factor (0.0=frozen, 1.0=raw data)

    // Smooth the values into the `riggedPose` directly without disrupting object structure
    const applyEMA = (targetState: any, sourceStructure: any) => {
      if (!sourceStructure) return
      for (const key in sourceStructure) {
        if (typeof sourceStructure[key] === 'number') {
          if (targetState[key] === undefined || isNaN(targetState[key])) {
            targetState[key] = sourceStructure[key]
          } else {
            targetState[key] =
              (1 - alpha) * targetState[key] + alpha * sourceStructure[key]
          }
          // overwrite the source structure with smoothed value!
          sourceStructure[key] = targetState[key]
        } else if (
          typeof sourceStructure[key] === 'object' &&
          sourceStructure[key] !== null
        ) {
          if (!targetState[key]) targetState[key] = {}
          applyEMA(targetState[key], sourceStructure[key])
        }
      }
    }

    applyEMA(this.smoothedPose, riggedPose)
    return riggedPose
  }
}
