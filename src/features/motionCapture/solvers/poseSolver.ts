import * as THREE from 'three'
import {
  calcBoneRotation,
  calcBoneRotationTwist,
  calcBendAngle,
  angleToQuaternion,
  mediapipeToVRMCoords,
  mediapipeWorldToVRMCoords,
  lookRotation,
  QuatSmoother,
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

// Persistent smoothers for jitter reduction
const smoothers: Record<string, QuatSmoother> = {
  Hips: new QuatSmoother(0.2),
  Spine: new QuatSmoother(0.2),
  Chest: new QuatSmoother(0.2),
  UpperChest: new QuatSmoother(0.2),
  LeftShoulder: new QuatSmoother(0.15),
  RightShoulder: new QuatSmoother(0.15),
  LeftUpperArm: new QuatSmoother(0.2),
  LeftLowerArm: new QuatSmoother(0.2),
  RightUpperArm: new QuatSmoother(0.2),
  RightLowerArm: new QuatSmoother(0.2),
  LeftUpperLeg: new QuatSmoother(0.2),
  LeftLowerLeg: new QuatSmoother(0.2),
  RightUpperLeg: new QuatSmoother(0.2),
  RightLowerLeg: new QuatSmoother(0.2),
}

export const solvePose = (poseLandmarks: any[], poseWorldLandmarks: any[]) => {
  if (!poseLandmarks || poseLandmarks.length < 33) return null

  // Transform landmarks to unified VRM/Three.js space (0e777180 mapping)
  const lm = poseWorldLandmarks.map((l) => mediapipeWorldToVRMCoords(l))
  const screenLm = poseLandmarks.map((l) => mediapipeToVRMCoords(l))

  const rig: any = {}
  const smooth = (name: string, q: THREE.Quaternion) => smoothers[name] ? smoothers[name].filter(q) : q

  // --- Hips ---
  const leftHip = lm[POSE_LANDMARKS.leftHip]
  const rightHip = lm[POSE_LANDMARKS.rightHip]
  const worldHips = new THREE.Vector3().addVectors(leftHip, rightHip).multiplyScalar(0.5)
  const screenHips = new THREE.Vector3().addVectors(screenLm[POSE_LANDMARKS.leftHip], screenLm[POSE_LANDMARKS.rightHip]).multiplyScalar(0.5)

  const hipVec = new THREE.Vector3().subVectors(rightHip, leftHip).normalize() 
  const hipsForward = new THREE.Vector3().crossVectors(hipVec, new THREE.Vector3(0, 1, 0)).normalize()
  const hipsUp = new THREE.Vector3().crossVectors(hipVec, hipsForward).normalize()
  const hipsRotation = smooth('Hips', lookRotation(hipsForward, hipsUp))

  rig['Hips'] = {
    worldPosition: screenHips,
    rotation: hipsRotation,
  }

  // --- Spine ---
  const leftShoulder = lm[POSE_LANDMARKS.leftShoulder]
  const rightShoulder = lm[POSE_LANDMARKS.rightShoulder]
  const shouldersCenter = new THREE.Vector3().addVectors(leftShoulder, rightShoulder).multiplyScalar(0.5)
  const spineVec = new THREE.Vector3().subVectors(shouldersCenter, worldHips).normalize()
  
  const stableSpineVec = new THREE.Vector3().lerpVectors(new THREE.Vector3(0, 1, 0), spineVec, 0.75).normalize()
  const spineRotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), stableSpineVec)

  const distribute = (name: string, q: THREE.Quaternion, f: number) => {
    const e = new THREE.Euler().setFromQuaternion(q, 'YXZ')
    return smooth(name, new THREE.Quaternion().setFromEuler(new THREE.Euler(e.x * f, e.y * f, e.z * f, 'YXZ')))
  }

  rig['Spine'] = distribute('Spine', spineRotation, 0.4)
  rig['Chest'] = distribute('Chest', spineRotation, 0.3)
  rig['UpperChest'] = distribute('UpperChest', spineRotation, 0.2)

  // --- Arms ---
  const getWorld = (idx: number) => lm[idx]
  const torsoRot = rig['UpperChest'].clone().multiply(rig['Chest']).multiply(rig['Spine'])

  // Subject's LEFT (11, 13, 15) -> Avatar's RIGHT (0e777180 swap)
  {
    const sho = getWorld(POSE_LANDMARKS.leftShoulder)
    const elb = getWorld(POSE_LANDMARKS.leftElbow)
    const wrs = getWorld(POSE_LANDMARKS.leftWrist)

    const worldShoQ = calcBoneRotation(shouldersCenter, sho, new THREE.Vector3(-1, 0, 0))
    const shoQ = smooth('RightShoulder', worldShoQ.clone().premultiply(torsoRot.clone().invert()))
    rig['RightShoulder'] = shoQ

    const shoRotTotal = torsoRot.clone().multiply(shoQ)
    const worldUpperQ = calcBoneRotation(sho, elb, new THREE.Vector3(-1, 0, 0))
    const upperQ = smooth('RightUpperArm', worldUpperQ.clone().premultiply(shoRotTotal.invert()))
    rig['RightUpperArm'] = upperQ

    const worldLowerQ = calcBoneRotation(elb, wrs, new THREE.Vector3(-1, 0, 0))
    rig['RightLowerArm'] = smooth('RightLowerArm', worldLowerQ.clone().premultiply(worldUpperQ.invert()))
  }

  // Subject's RIGHT (12, 14, 16) -> Avatar's LEFT
  {
    const sho = getWorld(POSE_LANDMARKS.rightShoulder)
    const elb = getWorld(POSE_LANDMARKS.rightElbow)
    const wrs = getWorld(POSE_LANDMARKS.rightWrist)

    const worldShoQ = calcBoneRotation(shouldersCenter, sho, new THREE.Vector3(1, 0, 0))
    const shoQ = smooth('LeftShoulder', worldShoQ.clone().premultiply(torsoRot.clone().invert()))
    rig['LeftShoulder'] = shoQ

    const shoRotTotal = torsoRot.clone().multiply(shoQ)
    const worldUpperQ = calcBoneRotation(sho, elb, new THREE.Vector3(1, 0, 0))
    const upperQ = smooth('LeftUpperArm', worldUpperQ.clone().premultiply(shoRotTotal.invert()))
    rig['LeftUpperArm'] = upperQ

    const worldLowerQ = calcBoneRotation(elb, wrs, new THREE.Vector3(1, 0, 0))
    rig['LeftLowerArm'] = smooth('LeftLowerArm', worldLowerQ.clone().premultiply(worldUpperQ.invert()))
  }

  // --- Legs ---
  // Subject's LEFT -> Avatar's RIGHT
  {
    const hip = getWorld(POSE_LANDMARKS.leftHip)
    const kne = getWorld(POSE_LANDMARKS.leftKnee)
    const ank = getWorld(POSE_LANDMARKS.leftAnkle)
    const toes = getWorld(POSE_LANDMARKS.leftFootIndex)

    const worldUpperQ = calcBoneRotation(hip, kne, new THREE.Vector3(0, -1, 0))
    rig['RightUpperLeg'] = smooth('RightUpperLeg', worldUpperQ.clone().premultiply(rig['Hips'].rotation.clone().invert()))

    const worldLowerQ = calcBoneRotation(kne, ank, new THREE.Vector3(0, -1, 0))
    rig['RightLowerLeg'] = smooth('RightLowerLeg', worldLowerQ.clone().premultiply(worldUpperQ.invert()))

    rig['RightFoot'] = calcBoneRotation(ank, toes, new THREE.Vector3(0, -1, 0))
    rig['RightToes'] = calcBoneRotation(ank, toes, new THREE.Vector3(0, 0, 1))
  }

  // Subject's RIGHT -> Avatar's LEFT
  {
    const hip = getWorld(POSE_LANDMARKS.rightHip)
    const kne = getWorld(POSE_LANDMARKS.rightKnee)
    const ank = getWorld(POSE_LANDMARKS.rightAnkle)
    const toes = getWorld(POSE_LANDMARKS.rightFootIndex)

    const worldUpperQ = calcBoneRotation(hip, kne, new THREE.Vector3(0, -1, 0))
    rig['LeftUpperLeg'] = smooth('LeftUpperLeg', worldUpperQ.clone().premultiply(rig['Hips'].rotation.clone().invert()))

    const worldLowerQ = calcBoneRotation(kne, ank, new THREE.Vector3(0, -1, 0))
    rig['LeftLowerLeg'] = smooth('LeftLowerLeg', worldLowerQ.clone().premultiply(worldUpperQ.invert()))

    rig['LeftFoot'] = calcBoneRotation(ank, toes, new THREE.Vector3(0, -1, 0))
    rig['LeftToes'] = calcBoneRotation(ank, toes, new THREE.Vector3(0, 0, 1))
  }


  return rig
}
