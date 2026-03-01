// @ts-ignore
import * as Kalidokit from 'kalidokit'
import { Results } from '@mediapipe/holistic'

const Vector = Kalidokit.Vector
const RIGHT = 'Right'
const LEFT = 'Left'
const PI = Math.PI

const clamp = (val: number, min: number, max: number) => {
  return Math.max(min, Math.min(max, val))
}

const rigArm = (UpperArm: any, LowerArm: any, Hand: any, side = RIGHT) => {
  // Invert modifier based on left vs right side
  const invert = side === RIGHT ? 1 : -1

  UpperArm.z *= -2.3 * invert

  // Modify UpperArm rotationY by LowerArm X and Z rotations
  // Reduced dampening factor to improve lower arm responsiveness
  UpperArm.y *= PI * invert
  UpperArm.y -= Math.max(LowerArm.x) * 0.05
  UpperArm.y -= -invert * Math.max(LowerArm.z, 0) * 0.05

  UpperArm.x -= 0.3 * invert

  LowerArm.z *= -2.14 * invert
  LowerArm.y *= 2.14 * invert
  LowerArm.x *= 2.14 * invert

  // Clamp values to human limits
  UpperArm.x = clamp(UpperArm.x, -0.5, PI)

  // Relaxed LowerArm.x clamp to allow more twist
  LowerArm.x = clamp(LowerArm.x, -1.3, 1.3)

  Hand.y = clamp(Hand.z * 2, -0.6, 0.6) // side to side
  Hand.z = Hand.z * -2.3 * invert // up down

  return {
    // Returns Values in Radians for direct 3D usage
    UpperArm: UpperArm,
    LowerArm: LowerArm,
    Hand: Hand,
  }
}

export const solveArms = (lm: any[]) => {
  // Pure Rotation Calculations
  // These use Kalidokit.Vector static methods directly as seen in source
  const UpperArm = {
    r: Vector.findRotation(lm[11], lm[13]),
    l: Vector.findRotation(lm[12], lm[14]),
  }

  UpperArm.r.y = Vector.angleBetween3DCoords(lm[12], lm[11], lm[13])
  UpperArm.l.y = Vector.angleBetween3DCoords(lm[11], lm[12], lm[14])

  const LowerArm = {
    r: Vector.findRotation(lm[13], lm[15]),
    l: Vector.findRotation(lm[14], lm[16]),
  }

  LowerArm.r.y = Vector.angleBetween3DCoords(lm[11], lm[13], lm[15])
  LowerArm.l.y = Vector.angleBetween3DCoords(lm[12], lm[14], lm[16])

  LowerArm.r.z = clamp(LowerArm.r.z, -2.14, 0)
  LowerArm.l.z = clamp(LowerArm.l.z, -2.14, 0)

  const Hand = {
    r: Vector.findRotation(
      Vector.fromArray(lm[15]),
      Vector.lerp(Vector.fromArray(lm[17]), Vector.fromArray(lm[19]), 0.5)
    ),
    l: Vector.findRotation(
      Vector.fromArray(lm[16]),
      Vector.lerp(Vector.fromArray(lm[18]), Vector.fromArray(lm[20]), 0.5)
    ),
  }

  // Modify Rotations slightly for more natural movement
  const rightArmRig = rigArm(UpperArm.r, LowerArm.r, Hand.r, RIGHT)
  const leftArmRig = rigArm(UpperArm.l, LowerArm.l, Hand.l, LEFT)

  return {
    RightUpperArm: rightArmRig.UpperArm,
    RightLowerArm: rightArmRig.LowerArm,
    LeftUpperArm: leftArmRig.UpperArm,
    LeftLowerArm: leftArmRig.LowerArm,
    RightHand: rightArmRig.Hand,
    LeftHand: leftArmRig.Hand,
  }
}
