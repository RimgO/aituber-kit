import * as THREE from 'three'
import {
  calcBoneRotation,
  calcBoneRotationTwist,
  calcBendAngle,
  angleToQuaternion,
  mediapipeToVRMCoords,
  mediapipeWorldToVRMCoords,
} from './mathUtils'

/**
 * VRM Body Pose solver from MediaPipe Pose.
 * Optimized for Mirror Mode and Upright Orientation.
 */

const POSE_LANDMARKS = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftFootIndex: 31,
  rightFootIndex: 32,
}

export const solvePose = (poseLandmarks: any[], poseWorldLandmarks: any[]) => {
  if (!poseLandmarks || poseLandmarks.length < 33) return null

  // Transform landmarks to unified VRM/Three.js space
  const lm = poseWorldLandmarks.map((l) => mediapipeWorldToVRMCoords(l))
  const screenLm = poseLandmarks.map((l) => mediapipeToVRMCoords(l))

  const rig: any = {}

  // --- Hips ---
  const leftHip = lm[POSE_LANDMARKS.leftHip]
  const rightHip = lm[POSE_LANDMARKS.rightHip]
  const worldHips = new THREE.Vector3().addVectors(leftHip, rightHip).multiplyScalar(0.5)
  const screenHips = new THREE.Vector3().addVectors(screenLm[POSE_LANDMARKS.leftHip], screenLm[POSE_LANDMARKS.rightHip]).multiplyScalar(0.5)

  // Hips orientation (Uprighting and mirroring already handled in mathUtils)
  // Character faces camera (+Z).
  // Character Left Hand is at +X, Right Hand is at -X.
  const hipVec = new THREE.Vector3().subVectors(leftHip, rightHip).normalize() 
  const hipsForward = new THREE.Vector3().crossVectors(hipVec, new THREE.Vector3(0, 1, 0)).normalize()
  const hipsRotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), hipsForward)

  rig['Hips'] = {
    worldPosition: screenHips,
    rotation: hipsRotation,
  }

  // --- Spine ---
  const leftShoulder = lm[POSE_LANDMARKS.leftShoulder]
  const rightShoulder = lm[POSE_LANDMARKS.rightShoulder]
  const shouldersCenter = new THREE.Vector3().addVectors(leftShoulder, rightShoulder).multiplyScalar(0.5)
  const spineVec = new THREE.Vector3().subVectors(shouldersCenter, worldHips).normalize()
  const spineRotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), spineVec)

  const distribute = (q: THREE.Quaternion, f: number) => {
    const e = new THREE.Euler().setFromQuaternion(q, 'YXZ')
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(e.x * f, e.y * f, e.z * f, 'YXZ'))
  }

  rig['Spine'] = distribute(spineRotation, 0.4)
  rig['Chest'] = distribute(spineRotation, 0.3)
  rig['UpperChest'] = distribute(spineRotation, 0.2)

  // --- Arms ---
  // Use 3D world座標（lm）ベースで腕の向きを決定する
  const getWorld = (idx: number) => lm[idx]

  // Left Arm (Humanoid Left)
  {
    const lSho = getWorld(POSE_LANDMARKS.leftShoulder)
    const lElb = getWorld(POSE_LANDMARKS.leftElbow)
    const lWrs = getWorld(POSE_LANDMARKS.leftWrist)

    const upperDir = new THREE.Vector3().subVectors(lElb, lSho)
    // JS サンプルと同じく、左腕レスト方向は -X（左方向）
    const restUpper = new THREE.Vector3(-1, 0, 0)
    const lUpperQ = new THREE.Quaternion().setFromUnitVectors(
      restUpper.clone().normalize(),
      upperDir.clone().normalize()
    )
    // MediaPipe と同じ向きに追従させる
    rig['LeftUpperArm'] = lUpperQ

    const { angle: lBend } = calcBendAngle(lSho, lElb, lWrs)
    // 肘は Z+ 軸周りに曲げる（サンプルと同じ）
    rig['LeftLowerArm'] = angleToQuaternion(
      new THREE.Vector3(0, 0, 1),
      Math.max(0, Math.PI - lBend)
    )
  }

  // Right Arm (Humanoid Right)
  {
    const rSho = getWorld(POSE_LANDMARKS.rightShoulder)
    const rElb = getWorld(POSE_LANDMARKS.rightElbow)
    const rWrs = getWorld(POSE_LANDMARKS.rightWrist)

    const upperDir = new THREE.Vector3().subVectors(rElb, rSho)
    // JS サンプルと同じく、右腕レスト方向は +X（右方向）
    const restUpper = new THREE.Vector3(1, 0, 0)
    const rUpperQ = new THREE.Quaternion().setFromUnitVectors(
      restUpper.clone().normalize(),
      upperDir.clone().normalize()
    )
    rig['RightUpperArm'] = rUpperQ

    const { angle: rBend } = calcBendAngle(rSho, rElb, rWrs)
    // 右肘は Z- 軸周り（サンプルと同じ）
    rig['RightLowerArm'] = angleToQuaternion(
      new THREE.Vector3(0, 0, -1),
      Math.max(0, Math.PI - rBend)
    )
  }

  // --- Legs ---
  rig['LeftUpperLeg'] = calcBoneRotation(lm[POSE_LANDMARKS.leftHip], lm[POSE_LANDMARKS.leftKnee], new THREE.Vector3(0, -1, 0))
  rig['LeftLowerLeg'] = calcBoneRotation(lm[POSE_LANDMARKS.leftKnee], lm[POSE_LANDMARKS.leftAnkle], new THREE.Vector3(0, -1, 0))
  rig['LeftFoot'] = calcBoneRotation(lm[POSE_LANDMARKS.leftAnkle], lm[POSE_LANDMARKS.leftFootIndex], new THREE.Vector3(0, 0, 1))

  rig['RightUpperLeg'] = calcBoneRotation(lm[POSE_LANDMARKS.rightHip], lm[POSE_LANDMARKS.rightKnee], new THREE.Vector3(0, -1, 0))
  rig['RightLowerLeg'] = calcBoneRotation(lm[POSE_LANDMARKS.rightKnee], lm[POSE_LANDMARKS.rightAnkle], new THREE.Vector3(0, -1, 0))
  rig['RightFoot'] = calcBoneRotation(lm[POSE_LANDMARKS.rightAnkle], lm[POSE_LANDMARKS.rightFootIndex], new THREE.Vector3(0, 0, 1))

  return rig
}
