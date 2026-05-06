/**
 * VRM制御クラス
 * three-vrm を使ってトラッキングデータをVRMモデルに適用する
 */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js'

// VRM ボーン名 → three-vrm VRMHumanBoneName マッピング
const BONE_MAP = {
  hips: 'hips',
  spine: 'spine',
  chest: 'chest',
  upperChest: 'upperChest',
  neck: 'neck',
  head: 'head',
  leftShoulder: 'leftShoulder',
  leftUpperArm: 'leftUpperArm',
  leftLowerArm: 'leftLowerArm',
  leftHand: 'leftHand',
  rightShoulder: 'rightShoulder',
  rightUpperArm: 'rightUpperArm',
  rightLowerArm: 'rightLowerArm',
  rightHand: 'rightHand',
  leftUpperLeg: 'leftUpperLeg',
  leftLowerLeg: 'leftLowerLeg',
  leftFoot: 'leftFoot',
  leftToes: 'leftToes',
  rightUpperLeg: 'rightUpperLeg',
  rightLowerLeg: 'rightLowerLeg',
  rightFoot: 'rightFoot',
  rightToes: 'rightToes',
  // 指
  leftThumbMetacarpal: 'leftThumbMetacarpal',
  leftThumbProximal: 'leftThumbProximal',
  leftThumbDistal: 'leftThumbDistal',
  leftIndexProximal: 'leftIndexProximal',
  leftIndexIntermediate: 'leftIndexIntermediate',
  leftIndexDistal: 'leftIndexDistal',
  leftMiddleProximal: 'leftMiddleProximal',
  leftMiddleIntermediate: 'leftMiddleIntermediate',
  leftMiddleDistal: 'leftMiddleDistal',
  leftRingProximal: 'leftRingProximal',
  leftRingIntermediate: 'leftRingIntermediate',
  leftRingDistal: 'leftRingDistal',
  leftLittleProximal: 'leftLittleProximal',
  leftLittleIntermediate: 'leftLittleIntermediate',
  leftLittleDistal: 'leftLittleDistal',
  rightThumbMetacarpal: 'rightThumbMetacarpal',
  rightThumbProximal: 'rightThumbProximal',
  rightThumbDistal: 'rightThumbDistal',
  rightIndexProximal: 'rightIndexProximal',
  rightIndexIntermediate: 'rightIndexIntermediate',
  rightIndexDistal: 'rightIndexDistal',
  rightMiddleProximal: 'rightMiddleProximal',
  rightMiddleIntermediate: 'rightMiddleIntermediate',
  rightMiddleDistal: 'rightMiddleDistal',
  rightRingProximal: 'rightRingProximal',
  rightRingIntermediate: 'rightRingIntermediate',
  rightRingDistal: 'rightRingDistal',
  rightLittleProximal: 'rightLittleProximal',
  rightLittleIntermediate: 'rightLittleIntermediate',
  rightLittleDistal: 'rightLittleDistal',
}

const BLEND_SHAPE_MAP = {
  blinkLeft: 'blinkLeft',
  blinkRight: 'blinkRight',
  aa: 'aa',
  joy: 'happy',
}

export class VRMController {
  constructor() {
    this.vrm = null
    this._quatBuf = new THREE.Quaternion()
  }

  setVRM(vrm) {
    this.vrm = vrm
  }

  /**
   * トラッキングデータを適用
   * @param {{ bones: Object, blendShapes: Object }} data
   * @param {number} delta - 経過時間(秒)
   */
  apply(data, delta) {
    if (!this.vrm) return

    const humanoid = this.vrm.humanoid
    const expression = this.vrm.expressionManager

    // ── ボーン回転適用 ────────────────────────────────────
    for (const [name, q] of Object.entries(data.bones)) {
      const vrmBoneName = BONE_MAP[name]
      if (!vrmBoneName) continue

      try {
        const boneNode = humanoid.getRawBoneNode(vrmBoneName)
        if (boneNode) {
          // [x,y,z,w] → THREE.Quaternion
          this._quatBuf.set(q[0], q[1], q[2], q[3])
          boneNode.quaternion.copy(this._quatBuf)
        }
      } catch (e) {
        // ボーンが存在しないVRMモデルはスキップ
      }
    }

    // ── BlendShape 適用 ───────────────────────────────────
    if (expression) {
      for (const [name, value] of Object.entries(data.blendShapes)) {
        const vrmName = BLEND_SHAPE_MAP[name] ?? name
        try {
          expression.setValue(vrmName, value)
        } catch (e) {}
      }
    }

    // VRM内部更新 (SpringBone物理など)
    this.vrm.update(delta)
  }

  /** 全ボーンをリセット */
  reset() {
    if (!this.vrm) return
    const humanoid = this.vrm.humanoid
    for (const boneName of Object.values(BONE_MAP)) {
      try {
        const node = humanoid.getRawBoneNode(boneName)
        if (node) node.quaternion.identity()
      } catch (e) {}
    }
    if (this.vrm.expressionManager) {
      this.vrm.expressionManager.setValue('blinkLeft', 0)
      this.vrm.expressionManager.setValue('blinkRight', 0)
      this.vrm.expressionManager.setValue('aa', 0)
      this.vrm.expressionManager.setValue('happy', 0)
    }
  }
}
