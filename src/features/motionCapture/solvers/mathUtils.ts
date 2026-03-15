import * as THREE from 'three'

/**
 * Math utilities for converting MediaPipe landmarks to VRM Quaternions and BlendShapes
 */

export const calcBoneRotation = (
  parentPos: THREE.Vector3,
  childPos: THREE.Vector3,
  restDirection: THREE.Vector3
): THREE.Quaternion => {
  const currentDir = new THREE.Vector3().subVectors(childPos, parentPos)
  if (currentDir.length() < 1e-6) return new THREE.Quaternion().identity()
  currentDir.normalize()
  const restDir = restDirection.clone().normalize()
  return new THREE.Quaternion().setFromUnitVectors(restDir, currentDir)
}

export const calcBoneRotationTwist = (
  parentPos: THREE.Vector3,
  childPos: THREE.Vector3,
  restDir: THREE.Vector3,
  localTwistAxis: THREE.Vector3,
  worldTwistTarget: THREE.Vector3
): THREE.Quaternion => {
  const currentDir = new THREE.Vector3().subVectors(childPos, parentPos)
  if (currentDir.length() < 1e-6) return new THREE.Quaternion().identity()
  currentDir.normalize()

  const rd = restDir.clone().normalize()
  const q = new THREE.Quaternion().setFromUnitVectors(rd, currentDir)

  const currentTwistAxis = localTwistAxis.clone().applyQuaternion(q).normalize()
  const targetProj = worldTwistTarget.clone().projectOnPlane(currentDir).normalize()
  const currentProj = currentTwistAxis.clone().projectOnPlane(currentDir).normalize()

  if (targetProj.lengthSq() > 1e-4 && currentProj.lengthSq() > 1e-4) {
    const twistQ = new THREE.Quaternion().setFromUnitVectors(currentProj, targetProj)
    q.premultiply(twistQ)
  }
  return q
}

export const calcBendAngle = (
  aPos: THREE.Vector3,
  bPos: THREE.Vector3,
  cPos: THREE.Vector3
): { angle: number; axis: THREE.Vector3 } => {
  const ba = new THREE.Vector3().subVectors(aPos, bPos).normalize()
  const bc = new THREE.Vector3().subVectors(cPos, bPos).normalize()
  const cosAngle = Math.max(-1.0, Math.min(1.0, ba.dot(bc)))
  const angle = Math.acos(cosAngle)
  let axis = new THREE.Vector3().crossVectors(ba, bc)
  if (axis.lengthSq() < 1e-6) axis.set(0, 0, 1)
  else axis.normalize()
  return { angle, axis }
}

export const angleToQuaternion = (axis: THREE.Vector3, angle: number): THREE.Quaternion => {
  return new THREE.Quaternion().setFromAxisAngle(axis, angle)
}

/**
 * MediaPipe Screen Normalized (0..1) -> VRM Space
 * Mirror Mode: 
 * Screen Left (0) -> THREE X- (-0.5)
 * Screen Right (1) -> THREE X+ (+0.5)
 */
export const mediapipeToVRMCoords = (landmark: {
  x: number
  y: number
  z: number
}): THREE.Vector3 => {
  return new THREE.Vector3(
    landmark.x - 0.5,      // Screen Left 0 → Three.js Left -0.5
    -(landmark.y - 0.5),   // Screen Top 0 → Three.js Up +0.5 （Y 反転）
    -landmark.z            // Depth is mirrored to face the camera
  )
}

/**
 * MediaPipe World (Meters) -> VRM Space
 * Mirror Mode Mapping:
 * X: Subject's Right (+X) -> Screen-Left / Avatar Right side (-X). 
 *    Formula: -landmark.x
 * Y: MediaPipe の「上 / 下」を VRM の「上 / 下」と一致させるため、ここで反転する。
 *    MediaPipe World では下向きが正になるケースが多いため、VRM(three.js) の上向き正に合わせて -landmark.y とする。
 *    Formula: -landmark.y
 * Z: Subject's Back/Forward (+Z) -> Avatar Depth.
 *    上下反転には関係しないので、そのまま扱う（必要に応じてあとで調整）。
 *    Formula: landmark.z
 */
export const mediapipeWorldToVRMCoords = (landmark: {
  x: number
  y: number
  z: number
}): THREE.Vector3 => {
  return new THREE.Vector3(
    -landmark.x, 
    -landmark.y, 
    landmark.z
  )
}

export class QuatSmoother {
  private factor: number
  private prev: THREE.Quaternion | null = null
  constructor(factor = 0.35) { this.factor = factor }
  filter(q: THREE.Quaternion): THREE.Quaternion {
    if (!this.prev) { this.prev = q.clone(); return q; }
    const dot = q.x * this.prev.x + q.y * this.prev.y + q.z * this.prev.z + q.w * this.prev.w
    const sign = dot < 0 ? -1 : 1
    const t = 1 - this.factor
    const result = new THREE.Quaternion(
      this.prev.x + t * (sign * q.x - this.prev.x),
      this.prev.y + t * (sign * q.y - this.prev.y),
      this.prev.z + t * (sign * q.z - this.prev.z),
      this.prev.w + t * (sign * q.w - this.prev.w)
    ).normalize()
    this.prev.copy(result)
    return result
  }
  reset() { this.prev = null }
}

export class OneEuroFilter {
  private minCutoff: number
  private beta: number
  private dCutoff: number
  private xPrev: number | null = null
  private dxPrev = 0
  private tPrev: number | null = null
  constructor(minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
    this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = dCutoff
  }
  private alpha(dt: number, cutoff: number): number {
    const tau = 1.0 / (2 * Math.PI * cutoff)
    return 1.0 / (1.0 + tau / dt)
  }
  filter(x: number, t: number): number {
    if (this.xPrev === null || this.tPrev === null) { this.xPrev = x; this.tPrev = t; return x; }
    const dt = Math.max(t - this.tPrev, 1e-9)
    const dx = (x - this.xPrev) / dt
    const aD = this.alpha(dt, this.dCutoff)
    const dxHat = aD * dx + (1 - aD) * this.dxPrev
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat)
    const a = this.alpha(dt, cutoff)
    const xHat = a * x + (1 - a) * this.xPrev
    this.xPrev = xHat; this.dxPrev = dxHat; this.tPrev = t
    return xHat
  }
  reset() { this.xPrev = null; this.dxPrev = 0; this.tPrev = null; }
}
