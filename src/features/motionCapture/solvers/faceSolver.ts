import * as THREE from 'three'
import { mediapipeToVRMCoords, OneEuroFilter } from './mathUtils'

/**
 * VRM Expression (BlendShape) + Head/Neck rotation solver from FaceMesh
 * Improved based on vrm_tracking_sample/mediapipe-tracker.js
 */

// FaceMesh ランドマーク番号
const FACE_LANDMARKS = {
  // 左目 (Right of image)
  left_eye_upper: [386, 387, 388, 466],
  left_eye_lower: [374, 380, 381, 382],
  // 右目 (Left of image)
  right_eye_upper: [159, 160, 161, 246],
  right_eye_lower: [145, 153, 154, 155],

  // 眉
  left_brow: [276, 283, 282, 295, 285],
  right_brow: [46, 53, 52, 65, 55],

  // 口
  mouth_outer: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291],
  mouth_inner: [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308],
  mouth_left: [61],
  mouth_right: [291],
  mouth_top: [13],
  mouth_bottom: [14],

  // 頭部回転用
  nose_tip: 4,
  chin: 152,
  left_cheek: 234,
  right_cheek: 454,
}

const getMeanVector = (
  landmarks: { x: number; y: number; z: number }[],
  indices: number[]
) => {
  const sum = new THREE.Vector3()
  for (const idx of indices) {
    if (landmarks[idx]) {
      sum.add(mediapipeToVRMCoords(landmarks[idx]))
    }
  }
  return sum.divideScalar(indices.length)
}

// ── OneEuroFilter for blendshapes (per-call singletons) ──────────────
// NOTE: These are module-level so that they persist across calls
const blinkLFilter = new OneEuroFilter(2.0, 0.1)
const blinkRFilter = new OneEuroFilter(2.0, 0.1)
const aaFilter = new OneEuroFilter(3.0, 0.2)
const joyFilter = new OneEuroFilter(2.0, 0.05)

// Optional calibration value for EYE_OPEN_MAX
let calibratedEyeMax = 0.04

export const solveFace = (results: any, calibEyeMax?: number) => {
  const faceLandmarks = results.faceLandmarks
  if (!faceLandmarks || faceLandmarks.length === 0) return null

  if (calibEyeMax !== undefined) calibratedEyeMax = calibEyeMax

  const now = performance.now() / 1000

  const blendShapes: Record<string, number> = {}

  // --- 目の開閉 ---
  const leftOpenDist = getMeanVector(
    faceLandmarks,
    FACE_LANDMARKS.left_eye_upper
  ).distanceTo(getMeanVector(faceLandmarks, FACE_LANDMARKS.left_eye_lower))

  const rightOpenDist = getMeanVector(
    faceLandmarks,
    FACE_LANDMARKS.right_eye_upper
  ).distanceTo(getMeanVector(faceLandmarks, FACE_LANDMARKS.right_eye_lower))

  const EYE_OPEN_MAX = calibratedEyeMax
  const EYE_CLOSE_MIN = 0.005

  let leftOpen = (leftOpenDist - EYE_CLOSE_MIN) / EYE_OPEN_MAX
  let rightOpen = (rightOpenDist - EYE_CLOSE_MIN) / EYE_OPEN_MAX
  leftOpen = Math.min(1.0, Math.max(0.0, leftOpen))
  rightOpen = Math.min(1.0, Math.max(0.0, rightOpen))

  blendShapes['blink_l'] = blinkLFilter.filter(1.0 - leftOpen, now)
  blendShapes['blink_r'] = blinkRFilter.filter(1.0 - rightOpen, now)

  // --- 口の開閉 ---
  const mouthTop = mediapipeToVRMCoords(
    faceLandmarks[FACE_LANDMARKS.mouth_top[0]]
  )
  const mouthBottom = mediapipeToVRMCoords(
    faceLandmarks[FACE_LANDMARKS.mouth_bottom[0]]
  )
  const mouthLeft = mediapipeToVRMCoords(
    faceLandmarks[FACE_LANDMARKS.mouth_left[0]]
  )
  const mouthRight = mediapipeToVRMCoords(
    faceLandmarks[FACE_LANDMARKS.mouth_right[0]]
  )

  const mouthOpenDist = mouthTop.distanceTo(mouthBottom)

  const MOUTH_OPEN_SCALE = 0.07
  blendShapes['aa'] = aaFilter.filter(
    Math.min(1.0, Math.max(0.0, mouthOpenDist / MOUTH_OPEN_SCALE)),
    now
  )

  // 口角の上がり具合 -> joy
  const mouthCenterY = (mouthTop.y + mouthBottom.y) / 2
  const cornerAvgY = (mouthLeft.y + mouthRight.y) / 2
  const smileVal = Math.min(
    1.0,
    Math.max(0.0, (mouthCenterY - cornerAvgY) * 25)
  )
  blendShapes['joy'] = joyFilter.filter(smileVal, now)

  // --- 頭部回転 ---
  const noseTip = mediapipeToVRMCoords(faceLandmarks[FACE_LANDMARKS.nose_tip])
  const leftCheek = mediapipeToVRMCoords(
    faceLandmarks[FACE_LANDMARKS.left_cheek]
  )
  const rightCheek = mediapipeToVRMCoords(
    faceLandmarks[FACE_LANDMARKS.right_cheek]
  )

  const faceWidth = leftCheek.distanceTo(rightCheek)
  const faceCenter = new THREE.Vector3()
    .addVectors(leftCheek, rightCheek)
    .multiplyScalar(0.5)

  // Yaw（左右回転）
  const noseOffsetX = (noseTip.x - faceCenter.x) / (faceWidth * 0.5)
  // Pitch（上下回転）
  const noseOffsetY = (noseTip.y - faceCenter.y) / (faceWidth * 0.5)
  // Roll（傾き）: 頬の高さ差から
  const roll = ((leftCheek.y - rightCheek.y) / faceWidth) * 0.5

  const pitch = Math.min(1, Math.max(-1, -noseOffsetY * 0.6))
  const yaw = Math.min(1, Math.max(-1, -noseOffsetX * 0.8))
  const rollClamped = Math.min(1, Math.max(-1, roll))

  // Create rotation Euler (x=Pitch, y=Yaw, z=Roll) for head
  const headEuler = new THREE.Euler(pitch, yaw, rollClamped, 'YXZ')

  // Neck is a reduced version of head rotation
  const neckEuler = new THREE.Euler(
    pitch * 0.4,
    yaw * 0.4,
    rollClamped * 0.3,
    'YXZ'
  )

  return {
    blendShapes,
    head: headEuler,
    neck: neckEuler,
    isMouthOpen: blendShapes['aa'] > 0.1,
  }
}
