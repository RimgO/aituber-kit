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

  // Character faces camera (-Z)
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
  
  // Stabilize spine: Lerp to vertical UP
  const stableSpineVec = new THREE.Vector3().lerpVectors(new THREE.Vector3(0, 1, 0), spineVec, 0.6).normalize()
  const spineRotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), stableSpineVec)

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

    const upperQ = calcBoneRotation(sho, elb, new THREE.Vector3(1, 0, 0))
    rig['LeftUpperArm'] = upperQ

    const lowerQ = calcBoneRotation(elb, wrs, new THREE.Vector3(1, 0, 0)).premultiply(upperQ.clone().invert())
    rig['LeftLowerArm'] = lowerQ
  }

  // Subject's LEFT (11, 13, 15) -> Avatar's RIGHT
  {
    const sho = getWorld(POSE_LANDMARKS.leftShoulder)
    const elb = getWorld(POSE_LANDMARKS.leftElbow)
    const wrs = getWorld(POSE_LANDMARKS.leftWrist)

    const upperQ = calcBoneRotation(sho, elb, new THREE.Vector3(-1, 0, 0))
    rig['RightUpperArm'] = upperQ

    const lowerQ = calcBoneRotation(elb, wrs, new THREE.Vector3(-1, 0, 0)).premultiply(upperQ.clone().invert())
    rig['RightLowerArm'] = lowerQ
  }

  // --- Legs ---
  // Subject's RIGHT -> Avatar's LEFT
  {
    const hip = getWorld(POSE_LANDMARKS.rightHip)
    const kne = getWorld(POSE_LANDMARKS.rightKnee)
    const ank = getWorld(POSE_LANDMARKS.rightAnkle)
    const toes = getWorld(POSE_LANDMARKS.rightFootIndex)

    const upperQ = calcBoneRotation(hip, kne, new THREE.Vector3(0, -1, 0))
    rig['LeftUpperLeg'] = upperQ

    const lowerQ = calcBoneRotation(kne, ank, new THREE.Vector3(0, -1, 0)).premultiply(upperQ.clone().invert())
    rig['LeftLowerLeg'] = lowerQ

    rig['LeftFoot'] = calcBoneRotation(ank, toes, new THREE.Vector3(0, -1, 0))
    rig['LeftToes'] = calcBoneRotation(ank, toes, new THREE.Vector3(0, 0, 1))
  }

  // Subject's LEFT -> Avatar's RIGHT
  {
    const hip = getWorld(POSE_LANDMARKS.leftHip)
    const kne = getWorld(POSE_LANDMARKS.leftKnee)
    const ank = getWorld(POSE_LANDMARKS.leftAnkle)
    const toes = getWorld(POSE_LANDMARKS.leftFootIndex)

    const upperQ = calcBoneRotation(hip, kne, new THREE.Vector3(0, -1, 0))
    rig['RightUpperLeg'] = upperQ

    const lowerQ = calcBoneRotation(kne, ank, new THREE.Vector3(0, -1, 0)).premultiply(upperQ.clone().invert())
    rig['RightLowerLeg'] = lowerQ

    rig['RightFoot'] = calcBoneRotation(ank, toes, new THREE.Vector3(0, -1, 0))
    rig['RightToes'] = calcBoneRotation(ank, toes, new THREE.Vector3(0, 0, 1))
  }


  return rig
}
