import * as THREE from 'three'
import {
  calcBoneRotation,
  calcBoneRotationTwist,
  calcBendAngle,
  angleToQuaternion,
  mediapipeToVRMCoords,
  mediapipeWorldToVRMCoords,
  lookRotation,
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
  const hipVec = new THREE.Vector3().subVectors(rightHip, leftHip).normalize() 
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
  const getWorld = (idx: number) => lm[idx]

  // Subject's RIGHT (12, 14, 16) -> Avatar's LEFT
  {
    const sho = getWorld(POSE_LANDMARKS.rightShoulder)
    const elb = getWorld(POSE_LANDMARKS.rightElbow)
    const wrs = getWorld(POSE_LANDMARKS.rightWrist)

    const upperDir = new THREE.Vector3().subVectors(elb, sho).normalize()
    const lookQ = lookRotation(upperDir, new THREE.Vector3(0, 1, 0))
    const corr = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2)
    const upperQ = lookQ.clone().multiply(corr)
    rig['LeftUpperArm'] = upperQ

    const lowerDir = new THREE.Vector3().subVectors(wrs, elb).normalize()
    const lowerLookQ = lookRotation(lowerDir, new THREE.Vector3(0, 1, 0))
    const lowerQ = lowerLookQ.clone().multiply(corr).premultiply(upperQ.clone().invert())
    rig['LeftLowerArm'] = lowerQ
  }

  // Subject's LEFT (11, 13, 15) -> Avatar's RIGHT
  {
    const sho = getWorld(POSE_LANDMARKS.leftShoulder)
    const elb = getWorld(POSE_LANDMARKS.leftElbow)
    const wrs = getWorld(POSE_LANDMARKS.leftWrist)

    const upperDir = new THREE.Vector3().subVectors(elb, sho).normalize()
    const lookQ = lookRotation(upperDir, new THREE.Vector3(0, 1, 0))
    const corr = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
    const upperQ = lookQ.clone().multiply(corr)
    rig['RightUpperArm'] = upperQ

    const lowerDir = new THREE.Vector3().subVectors(wrs, elb).normalize()
    const lowerLookQ = lookRotation(lowerDir, new THREE.Vector3(0, 1, 0))
    const lowerQ = lowerLookQ.clone().multiply(corr).premultiply(upperQ.clone().invert())
    rig['RightLowerArm'] = lowerQ
  }

  // --- Legs ---
  // Subject's RIGHT -> Avatar's LEFT
  const rHip3 = lm[POSE_LANDMARKS.rightHip]
  const rKnee3 = lm[POSE_LANDMARKS.rightKnee]
  const rAnkle3 = lm[POSE_LANDMARKS.rightAnkle]
  const rToes3 = lm[POSE_LANDMARKS.rightFootIndex]

  rig['LeftUpperLeg'] = calcBoneRotation(rHip3, rKnee3, new THREE.Vector3(0, -1, 0))
  rig['LeftLowerLeg'] = calcBoneRotation(rKnee3, rAnkle3, new THREE.Vector3(0, -1, 0))
  rig['LeftFoot'] = calcBoneRotation(rAnkle3, rToes3, new THREE.Vector3(0, -1, 0))
  rig['LeftToes'] = calcBoneRotation(rAnkle3, rToes3, new THREE.Vector3(0, 0, 1))

  // Subject's LEFT -> Avatar's RIGHT
  const lHip3 = lm[POSE_LANDMARKS.leftHip]
  const lKnee3 = lm[POSE_LANDMARKS.leftKnee]
  const lAnkle3 = lm[POSE_LANDMARKS.leftAnkle]
  const lToes3 = lm[POSE_LANDMARKS.leftFootIndex]

  rig['RightUpperLeg'] = calcBoneRotation(lHip3, lKnee3, new THREE.Vector3(0, -1, 0))
  rig['RightLowerLeg'] = calcBoneRotation(lKnee3, lAnkle3, new THREE.Vector3(0, -1, 0))
  rig['RightFoot'] = calcBoneRotation(lAnkle3, lToes3, new THREE.Vector3(0, -1, 0))
  rig['RightToes'] = calcBoneRotation(lAnkle3, lToes3, new THREE.Vector3(0, 0, 1))


  return rig
}
