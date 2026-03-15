import * as THREE from 'three'
import { mediapipeToVRMCoords, angleToQuaternion } from './mathUtils'

/**
 * Hand tracking solver
 * Improved based on vrm_tracking_sample/mediapipe-tracker.js
 * Uses hand plane for more natural finger bend calculation
 */
const HAND_BONE_MAP = {
  // 親指
  thumb: {
    metacarpal: [0, 1],
    proximal: [1, 2],
    intermediate: [2, 3],
    distal: [3, 4],
  },
  // 人差し指
  index: {
    metacarpal: [0, 5],
    proximal: [5, 6],
    intermediate: [6, 7],
    distal: [7, 8],
  },
  // 中指
  middle: {
    metacarpal: [0, 9],
    proximal: [9, 10],
    intermediate: [10, 11],
    distal: [11, 12],
  },
  // 薬指
  ring: {
    metacarpal: [0, 13],
    proximal: [13, 14],
    intermediate: [14, 15],
    distal: [15, 16],
  },
  // 小指
  pinky: {
    metacarpal: [0, 17],
    proximal: [17, 18],
    intermediate: [18, 19],
    distal: [19, 20],
  },
}

export const solveHand = (handLandmarks: any[], side: 'Right' | 'Left') => {
  if (!handLandmarks || handLandmarks.length < 21) return null

  const rotations: Record<string, THREE.Quaternion> = {}
  const lm = handLandmarks.map((p) => mediapipeToVRMCoords(p))
  const isLeft = side === 'Left'

  // 手首座標系の構築（手平面を定義する）
  const wrist = lm[0]
  const indexBase = lm[5]
  const pinkyBase = lm[17]

  // 手の右方向（左手: 小指→人差し指, 右手: 人差し指→小指）
  const handRight = isLeft
    ? new THREE.Vector3().subVectors(pinkyBase, indexBase).normalize()
    : new THREE.Vector3().subVectors(indexBase, pinkyBase).normalize()
  const handUp = new THREE.Vector3().subVectors(indexBase, wrist).normalize()
  const handFwd = new THREE.Vector3()
    .crossVectors(handRight, handUp)
    .normalize()

  for (const [fingerName, segments] of Object.entries(HAND_BONE_MAP)) {
    for (const [segName, [parentId, childId]] of Object.entries(segments)) {
      const parentPos = lm[parentId]
      const childPos = lm[childId]
      const dir = new THREE.Vector3()
        .subVectors(childPos, parentPos)
        .normalize()

      // 指の曲げ角度: 手平面の法線との内積（負のdot = 手前方向への曲がり）
      const bendDot = Math.max(0, -dir.dot(handFwd))
      const angle = bendDot * Math.PI * 0.8

      const fingerCap = fingerName.charAt(0).toUpperCase() + fingerName.slice(1)
      let segCap = segName.charAt(0).toUpperCase() + segName.slice(1)
      // Capitalize remainder too
      segCap = segCap.charAt(0).toUpperCase() + segCap.slice(1)

      const paramName = `${side}${fingerCap}${segCap}`
      // 左手は+X, 右手は-X を軸に曲げる
      rotations[paramName] = angleToQuaternion(
        new THREE.Vector3(isLeft ? 1 : -1, 0, 0),
        angle
      )
    }
  }

  return rotations
}
