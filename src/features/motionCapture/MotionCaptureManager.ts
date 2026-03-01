import { Holistic, Results } from '@mediapipe/holistic'
// @ts-ignore
import * as Kalidokit from 'kalidokit'
import homeStore from '@/features/stores/home'
import settingsStore from '@/features/stores/settings'
import { solveArms } from './solveArms'

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
        ; (globalHolisticInstance as Holistic).onResults(
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
        return null
      }
    }

    let poseRig: any = {}
    let customArms: any = {}
    if (results.poseLandmarks && results.poseLandmarks.length >= 33) {
      // Only solve pose if any body part tracking is enabled
      if (
        settings.enableUpperBodyTracking ||
        settings.enableHipsTracking ||
        settings.enableLegTracking
      ) {
        try {
          // Fallback for 3D landmarks if missing to prevent Kalidokit crash
          const worldLandmarks =
            (results as any).poseWorldLandmarks ||
            results.poseLandmarks.map((l) => ({
              x: l.x,
              y: l.y,
              z: 0,
              visibility: l.visibility,
            }))

          poseRig = Kalidokit.Pose.solve(
            worldLandmarks,
            results.poseLandmarks,
            {
              runtime: 'mediapipe',
              video: videoElement,
            }
          )

          // Overwrite arm rigs with custom solver for better upper/lower arm tracking
          customArms = solveArms(worldLandmarks)

          if (settings.enableUpperBodyTracking) {
            poseRig.RightUpperArm = customArms.RightUpperArm
            if (poseRig.RightLowerArm && customArms.RightLowerArm) {
              poseRig.RightLowerArm = {
                ...customArms.RightLowerArm,
                x: poseRig.RightLowerArm.x,
              }
            } else {
              poseRig.RightLowerArm = customArms.RightLowerArm
            }

            poseRig.LeftUpperArm = customArms.LeftUpperArm
            if (poseRig.LeftLowerArm && customArms.LeftLowerArm) {
              poseRig.LeftLowerArm = {
                ...customArms.LeftLowerArm,
                x: poseRig.LeftLowerArm.x,
              }
            } else {
              poseRig.LeftLowerArm = customArms.LeftLowerArm
            }
          }

          // Filter Rig based on settings
          if (!settings.enableHipsTracking) {
            delete poseRig.Hips
            delete poseRig.Root
          }

          if (!settings.enableUpperBodyTracking) {
            delete poseRig.Spine
            delete poseRig.Chest
            delete poseRig.UpperChest
            delete poseRig.Neck
            delete poseRig.RightShoulder
            delete poseRig.LeftShoulder
            delete poseRig.RightArm
            delete poseRig.LeftArm
            delete poseRig.RightForeArm
            delete poseRig.LeftForeArm
            delete poseRig.RightHand
            delete poseRig.LeftHand
          }

          if (!settings.enableLegTracking) {
            delete poseRig.RightUpperLeg
            delete poseRig.LeftUpperLeg
            delete poseRig.RightLowerLeg
            delete poseRig.LeftLowerLeg
            delete poseRig.RightFoot
            delete poseRig.LeftFoot
            delete poseRig.RightToes
            delete poseRig.LeftToes
          }
        } catch (e) {
          console.error('Kalidokit Pose solve error:', e)
        }
      }
    }

    let faceRig: any = {}
    if (settings.enableFaceTracking && results.faceLandmarks) {
      faceRig = Kalidokit.Face.solve(results.faceLandmarks, {
        runtime: 'mediapipe',
        video: videoElement,
      })

      // Mouth Open Detection
      if (faceRig && faceRig.mouth) {
        const isOpen = (faceRig.mouth.y || 0) > 0.1
        const currentIsOpen = homeStore.getState().isMouthOpen
        if (currentIsOpen !== isOpen) {
          homeStore.setState({ isMouthOpen: isOpen })
        }
      }
    }

    let rightHandRig: any = {}
    if (
      (settings.enableHandTracking || settings.enableFingerTracking) &&
      results.leftHandLandmarks
    ) {
      rightHandRig = Kalidokit.Hand.solve(results.leftHandLandmarks, 'Right')
      // Fix palm facing slightly down: Lift wrist up and use Hand solver's wrist
      if (rightHandRig?.RightWrist) {
        rightHandRig.RightHand = rightHandRig.RightWrist
        // Lift palm up
        rightHandRig.RightHand.x += 0.4
      }
    }

    let leftHandRig: any = {}
    if (
      (settings.enableHandTracking || settings.enableFingerTracking) &&
      results.rightHandLandmarks
    ) {
      leftHandRig = Kalidokit.Hand.solve(results.rightHandLandmarks, 'Left')
      // Fix palm facing slightly down: Lift wrist up and use Hand solver's wrist
      if (leftHandRig?.LeftWrist) {
        leftHandRig.LeftHand = leftHandRig.LeftWrist
        // Lift palm up
        leftHandRig.LeftHand.x += 0.4
      }
    }

    const riggedPose = {
      ...poseRig,
      ...(rightHandRig || {}),
      ...(leftHandRig || {}),
      Face: faceRig,
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

    return riggedPose
  }
}
