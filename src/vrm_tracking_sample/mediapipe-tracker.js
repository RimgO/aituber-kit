/**
 * MediaPipe Holistic → VRM ボーン変換コア
 * 全身（上半身・下半身・顔・手指）対応
 */
import { vec3, quat, calcBendAngle, getLandmark } from './math-utils.js'
import { BoneSmoothers, OneEuroFilter } from './smoother.js'

// ── MediaPipe Pose ランドマーク定義 ───────────────────────
const PL = {
  NOSE: 0,
  LEFT_EYE: 2,
  RIGHT_EYE: 5,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
}

// ── VRM ボーン名一覧 ──────────────────────────────────────
const ALL_BONES = [
  'hips',
  'spine',
  'chest',
  'upperChest',
  'neck',
  'head',
  'leftShoulder',
  'leftUpperArm',
  'leftLowerArm',
  'leftHand',
  'rightShoulder',
  'rightUpperArm',
  'rightLowerArm',
  'rightHand',
  'leftUpperLeg',
  'leftLowerLeg',
  'leftFoot',
  'leftToes',
  'rightUpperLeg',
  'rightLowerLeg',
  'rightFoot',
  'rightToes',
  // 指
  'leftThumbMetacarpal',
  'leftThumbProximal',
  'leftThumbDistal',
  'leftIndexProximal',
  'leftIndexIntermediate',
  'leftIndexDistal',
  'leftMiddleProximal',
  'leftMiddleIntermediate',
  'leftMiddleDistal',
  'leftRingProximal',
  'leftRingIntermediate',
  'leftRingDistal',
  'leftLittleProximal',
  'leftLittleIntermediate',
  'leftLittleDistal',
  'rightThumbMetacarpal',
  'rightThumbProximal',
  'rightThumbDistal',
  'rightIndexProximal',
  'rightIndexIntermediate',
  'rightIndexDistal',
  'rightMiddleProximal',
  'rightMiddleIntermediate',
  'rightMiddleDistal',
  'rightRingProximal',
  'rightRingIntermediate',
  'rightRingDistal',
  'rightLittleProximal',
  'rightLittleIntermediate',
  'rightLittleDistal',
]

export class MediaPipeTracker {
  constructor() {
    this.smoothers = new BoneSmoothers(ALL_BONES, 0.35)
    this.blendSmoothers = {
      blinkLeft: new OneEuroFilter(2.0, 0.1),
      blinkRight: new OneEuroFilter(2.0, 0.1),
      aa: new OneEuroFilter(3.0, 0.2),
      joy: new OneEuroFilter(2.0, 0.05),
    }
    this.calibration = null
    this.frameCount = 0
    this.calibFrames = []
  }

  /**
   * メインエントリ: Holistic結果 → {bones, blendShapes}
   */
  process(results, timestamp) {
    const t = timestamp ?? performance.now() / 1000
    const bones = {}
    const blendShapes = {}

    const pose = results.poseLandmarks
    const face = results.faceLandmarks
    const lh = results.leftHandLandmarks
    const rh = results.rightHandLandmarks

    if (!pose) return { bones, blendShapes }

    // ── 自動キャリブレーション (最初30フレーム) ──
    this._calibrate(pose)

    // ── 1. Hips (腰・ルート) ─────────────────────────────
    const lHip = getLandmark(pose, PL.LEFT_HIP)
    const rHip = getLandmark(pose, PL.RIGHT_HIP)
    const lSho = getLandmark(pose, PL.LEFT_SHOULDER)
    const rSho = getLandmark(pose, PL.RIGHT_SHOULDER)

    const hipMid = vec3.lerp(lHip, rHip, 0.5)
    const shoMid = vec3.lerp(lSho, rSho, 0.5)

    // 腰の向き: 左右のhipベクトルから回転を計算
    bones.hips = this._smooth(
      'hips',
      this._calcHipsRotation(lHip, rHip, shoMid),
      t
    )

    // ── 2. 脊椎チェーン ──────────────────────────────────
    // hips→shoulder のベクトルで脊椎全体の傾きを推定
    const spineVec = vec3.sub(shoMid, hipMid)
    const spineQ = quat.fromVectors({ x: 0, y: 1, z: 0 }, spineVec)

    // 各脊椎ボーンに傾きを分配 (spine 40%, chest 30%, upperChest 20%, neck 10%)
    const distribute = (base, factor) => {
      const e = quat.toEuler(base)
      return quat.fromEuler(e.x * factor, e.y * factor, e.z * factor)
    }

    bones.spine = this._smooth('spine', distribute(spineQ, 0.4), t)
    bones.chest = this._smooth('chest', distribute(spineQ, 0.3), t)
    bones.upperChest = this._smooth('upperChest', distribute(spineQ, 0.2), t)

    // ── 3. 首・頭 ────────────────────────────────────────
    if (face && face.length > 0) {
      const { neckQ, headQ, blends } = this._calcFaceRotation(face, t)
      bones.neck = this._smooth('neck', neckQ, t)
      bones.head = this._smooth('head', headQ, t)
      Object.assign(blendShapes, blends)
    } else {
      bones.neck = quat.identity()
      bones.head = quat.identity()
    }

    // ── 4. 左腕チェーン ──────────────────────────────────
    Object.assign(bones, this._calcArmChain(pose, 'left', t))

    // ── 5. 右腕チェーン ──────────────────────────────────
    Object.assign(bones, this._calcArmChain(pose, 'right', t))

    // ── 6. 左脚チェーン ──────────────────────────────────
    Object.assign(bones, this._calcLegChain(pose, 'left', t))

    // ── 7. 右脚チェーン ──────────────────────────────────
    Object.assign(bones, this._calcLegChain(pose, 'right', t))

    // ── 8. 左手指 ────────────────────────────────────────
    if (lh) Object.assign(bones, this._calcFingers(lh, 'left', t))

    // ── 9. 右手指 ────────────────────────────────────────
    if (rh) Object.assign(bones, this._calcFingers(rh, 'right', t))

    return { bones, blendShapes }
  }

  // ── 腰の回転計算 ────────────────────────────────────────
  _calcHipsRotation(lHip, rHip, shoMid) {
    // 腰の横向き: left→right ベクトル
    const hipRight = vec3.normalize(vec3.sub(rHip, lHip))
    // 腰の前向き: 横ベクトル × 上ベクトルで前方を推定
    const up = { x: 0, y: 1, z: 0 }
    const fwd = vec3.normalize(vec3.cross(hipRight, up))
    // 腰のYaw (左右回転)
    const yaw = Math.atan2(fwd.x, fwd.z)
    // 腰のRoll (左右傾き)
    const hipMid = vec3.lerp({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 0.5)
    const roll =
      Math.atan2(rHip.y - lHip.y, vec3.length(vec3.sub(rHip, lHip))) * 0.5

    return quat.fromEuler(0, yaw, roll)
  }

  // ── 腕チェーン計算 ──────────────────────────────────────
  _calcArmChain(pose, side, t) {
    const isLeft = side === 'left'
    const bones = {}

    const shoulder = getLandmark(
      pose,
      isLeft ? PL.LEFT_SHOULDER : PL.RIGHT_SHOULDER
    )
    const elbow = getLandmark(pose, isLeft ? PL.LEFT_ELBOW : PL.RIGHT_ELBOW)
    const wrist = getLandmark(pose, isLeft ? PL.LEFT_WRIST : PL.RIGHT_WRIST)
    const index = getLandmark(pose, isLeft ? PL.LEFT_INDEX : PL.RIGHT_INDEX)
    const pinky = getLandmark(pose, isLeft ? PL.LEFT_PINKY : PL.RIGHT_PINKY)

    // 肩: ほぼ固定, 腕の付け根の傾きのみ
    const shoQ = quat.identity()
    bones[`${side}Shoulder`] = this._smooth(`${side}Shoulder`, shoQ, t)

    // 上腕: 肩→肘 ベクトルから回転
    const upperArmDir = vec3.sub(elbow, shoulder)
    const restUpperArm = isLeft ? { x: -1, y: 0, z: 0 } : { x: 1, y: 0, z: 0 }
    const upperArmQ = quat.fromVectors(restUpperArm, upperArmDir)
    bones[`${side}UpperArm`] = this._smooth(`${side}UpperArm`, upperArmQ, t)

    // 前腕: 上腕空間内での肘の曲げ
    const { angle: elbowAngle, axis: elbowAxis } = calcBendAngle(
      shoulder,
      elbow,
      wrist
    )
    // 肘は主にZ軸(内外旋)で曲がる
    const lowerArmQ = quat.fromAxisAngle(
      { x: 0, y: 0, z: isLeft ? 1 : -1 },
      Math.max(0, Math.PI - elbowAngle)
    )
    bones[`${side}LowerArm`] = this._smooth(`${side}LowerArm`, lowerArmQ, t)

    // 手首: 手の向きから回転
    if (index.x !== 0 || pinky.x !== 0) {
      const handRight = isLeft ? vec3.sub(pinky, index) : vec3.sub(index, pinky)
      const handFwd = vec3.sub(wrist, vec3.lerp(index, pinky, 0.5))
      const handUp = vec3.normalize(vec3.cross(handRight, handFwd))
      const restHand = isLeft ? { x: -1, y: 0, z: 0 } : { x: 1, y: 0, z: 0 }
      const handQ = quat.fromVectors(restHand, handUp)
      bones[`${side}Hand`] = this._smooth(`${side}Hand`, handQ, t)
    } else {
      bones[`${side}Hand`] = quat.identity()
    }

    return bones
  }

  // ── 脚チェーン計算 ──────────────────────────────────────
  _calcLegChain(pose, side, t) {
    const isLeft = side === 'left'
    const bones = {}

    const hip = getLandmark(pose, isLeft ? PL.LEFT_HIP : PL.RIGHT_HIP)
    const knee = getLandmark(pose, isLeft ? PL.LEFT_KNEE : PL.RIGHT_KNEE)
    const ankle = getLandmark(pose, isLeft ? PL.LEFT_ANKLE : PL.RIGHT_ANKLE)
    const heel = getLandmark(pose, isLeft ? PL.LEFT_HEEL : PL.RIGHT_HEEL)
    const toes = getLandmark(
      pose,
      isLeft ? PL.LEFT_FOOT_INDEX : PL.RIGHT_FOOT_INDEX
    )

    // 大腿: 腰→膝 ベクトルから回転
    const upperLegDir = vec3.sub(knee, hip)
    const restUpperLeg = { x: 0, y: -1, z: 0 } // VRMは下向きがレスト
    const upperLegQ = quat.fromVectors(restUpperLeg, upperLegDir)
    bones[`${side}UpperLeg`] = this._smooth(`${side}UpperLeg`, upperLegQ, t)

    // 下腿: 膝の曲げ角度
    const { angle: kneeAngle } = calcBendAngle(hip, knee, ankle)
    // 膝は主にX軸(前後)で曲がる
    const bentAngle = Math.max(0, Math.PI - kneeAngle)
    const lowerLegQ = quat.fromAxisAngle({ x: 1, y: 0, z: 0 }, bentAngle)
    bones[`${side}LowerLeg`] = this._smooth(`${side}LowerLeg`, lowerLegQ, t)

    // 足首: 踵→爪先 ベクトルから足の向きを計算
    if (heel.x !== 0 || toes.x !== 0) {
      const footDir = vec3.sub(toes, heel)
      const restFoot = { x: 0, y: 0, z: 1 } // VRMは前向きがレスト
      const footQ = quat.fromVectors(restFoot, footDir)

      // 足首の背屈/底屈
      const ankleDir = vec3.sub(ankle, knee)
      const { angle: ankleAngle } = calcBendAngle(knee, ankle, toes)
      const ankleQ = quat.fromAxisAngle(
        { x: 1, y: 0, z: 0 },
        (Math.PI - ankleAngle) * 0.3
      )

      bones[`${side}Foot`] = this._smooth(
        `${side}Foot`,
        quat.multiply(footQ, ankleQ),
        t
      )

      // つま先
      const toesDir = vec3.sub(toes, ankle)
      const toesQ = quat.fromVectors({ x: 0, y: 0, z: 1 }, toesDir)
      bones[`${side}Toes`] = this._smooth(`${side}Toes`, toesQ, t)
    } else {
      bones[`${side}Foot`] = quat.identity()
      bones[`${side}Toes`] = quat.identity()
    }

    return bones
  }

  // ── 顔・表情計算 ────────────────────────────────────────
  _calcFaceRotation(face, t) {
    // FaceMesh重要ランドマーク
    const noseTip = vec3.mpToVRM(face[4])
    const chin = vec3.mpToVRM(face[152])
    const leftCheek = vec3.mpToVRM(face[234])
    const rightCheek = vec3.mpToVRM(face[454])
    const foreHead = vec3.mpToVRM(face[10])

    const faceCenter = vec3.lerp(leftCheek, rightCheek, 0.5)
    const faceWidth = vec3.length(vec3.sub(rightCheek, leftCheek))

    // Yaw (左右): 鼻先の左右オフセット
    const yaw = -((noseTip.x - faceCenter.x) / (faceWidth * 0.5)) * 0.8
    // Pitch (上下): 鼻先の上下オフセット
    const pitch = -((noseTip.y - faceCenter.y) / (faceWidth * 0.5)) * 0.6
    // Roll (傾き): 左右目の高さ差
    const roll = ((leftCheek.y - rightCheek.y) / faceWidth) * 0.5

    const headQ = quat.fromEuler(pitch, yaw, roll)
    // 首は頭の半分の回転
    const neckQ = quat.fromEuler(pitch * 0.4, yaw * 0.4, roll * 0.3)

    // BlendShapes
    const blends = this._calcBlendShapes(face, t)

    return { headQ, neckQ, blends }
  }

  _calcBlendShapes(face, t) {
    const now = performance.now() / 1000

    // 目の開き: 上瞼と下瞼の距離
    const leftEyeOpen = this._eyeOpenness(
      face,
      [386, 387, 388],
      [374, 380, 381]
    )
    const rightEyeOpen = this._eyeOpenness(
      face,
      [159, 160, 161],
      [145, 153, 154]
    )

    const EYE_MAX = this.calibration?.eyeMax ?? 0.04
    const EYE_MIN = 0.005

    const blinkL =
      1 - Math.max(0, Math.min(1, (leftEyeOpen - EYE_MIN) / EYE_MAX))
    const blinkR =
      1 - Math.max(0, Math.min(1, (rightEyeOpen - EYE_MIN) / EYE_MAX))

    // 口の開き
    const mTop = vec3.mpToVRM(face[13])
    const mBottom = vec3.mpToVRM(face[14])
    const mLeft = vec3.mpToVRM(face[61])
    const mRight = vec3.mpToVRM(face[291])

    const mouthOpen = vec3.length(vec3.sub(mTop, mBottom))
    const mouthWidth = vec3.length(vec3.sub(mLeft, mRight))
    const mouthMidY = (mTop.y + mBottom.y) / 2
    const cornerMidY = (mLeft.y + mRight.y) / 2

    const MOUTH_SCALE = this.calibration?.mouthScale ?? 0.07
    const aa = Math.max(0, Math.min(1, mouthOpen / MOUTH_SCALE))
    const joy = Math.max(0, Math.min(1, (mouthMidY - cornerMidY) * 25))

    return {
      blinkLeft: this.blendSmoothers.blinkLeft.filter(blinkL, now),
      blinkRight: this.blendSmoothers.blinkRight.filter(blinkR, now),
      aa: this.blendSmoothers.aa.filter(aa, now),
      joy: this.blendSmoothers.joy.filter(joy, now),
    }
  }

  _eyeOpenness(face, upperIds, lowerIds) {
    const upper = upperIds.reduce(
      (s, i) => vec3.add(s, vec3.mpToVRM(face[i])),
      { x: 0, y: 0, z: 0 }
    )
    const lower = lowerIds.reduce(
      (s, i) => vec3.add(s, vec3.mpToVRM(face[i])),
      { x: 0, y: 0, z: 0 }
    )
    const uAvg = vec3.scale(upper, 1 / upperIds.length)
    const lAvg = vec3.scale(lower, 1 / lowerIds.length)
    return vec3.length(vec3.sub(uAvg, lAvg))
  }

  // ── 手指計算 ────────────────────────────────────────────
  _calcFingers(hand, side, t) {
    const isLeft = side === 'left'
    const bones = {}
    const lm = hand

    // 指の定義: [metacarpal親, 各関節のID配列]
    const FINGERS = [
      {
        name: isLeft ? 'leftThumb' : 'rightThumb',
        ids: [1, 2, 3, 4],
        segs: ['Metacarpal', 'Proximal', 'Distal'],
      },
      {
        name: isLeft ? 'leftIndex' : 'rightIndex',
        ids: [5, 6, 7, 8],
        segs: ['Proximal', 'Intermediate', 'Distal'],
      },
      {
        name: isLeft ? 'leftMiddle' : 'rightMiddle',
        ids: [9, 10, 11, 12],
        segs: ['Proximal', 'Intermediate', 'Distal'],
      },
      {
        name: isLeft ? 'leftRing' : 'rightRing',
        ids: [13, 14, 15, 16],
        segs: ['Proximal', 'Intermediate', 'Distal'],
      },
      {
        name: isLeft ? 'leftLittle' : 'rightLittle',
        ids: [17, 18, 19, 20],
        segs: ['Proximal', 'Intermediate', 'Distal'],
      },
    ]

    // 手首座標系の構築
    const wrist = vec3.mpToVRM(lm[0])
    const idxBase = vec3.mpToVRM(lm[5])
    const pnkBase = vec3.mpToVRM(lm[17])
    const handRight = isLeft
      ? vec3.normalize(vec3.sub(pnkBase, idxBase))
      : vec3.normalize(vec3.sub(idxBase, pnkBase))
    const handUp = vec3.normalize(vec3.sub(idxBase, wrist))
    const handFwd = vec3.normalize(vec3.cross(handRight, handUp))

    for (const finger of FINGERS) {
      for (let i = 0; i < finger.segs.length; i++) {
        const boneName = `${finger.name}${finger.segs[i]}`
        const parentId = finger.ids[i]
        const childId = finger.ids[i + 1]

        const parent = vec3.mpToVRM(lm[parentId])
        const child = vec3.mpToVRM(lm[childId])
        const dir = vec3.sub(child, parent)

        // 指の曲げ角度（手の平面内での回転）
        const angle =
          Math.max(0, -vec3.dot(vec3.normalize(dir), handFwd)) * Math.PI * 0.8

        const segQ = quat.fromAxisAngle(
          { x: isLeft ? 1 : -1, y: 0, z: 0 },
          angle
        )
        bones[boneName] = this._smooth(boneName, segQ, t)
      }
    }

    return bones
  }

  // ── キャリブレーション ───────────────────────────────────
  _calibrate(pose) {
    this.frameCount++
    if (this.frameCount > 30 || this.calibration) return

    this.calibFrames.push(pose)

    if (this.frameCount === 30) {
      // 最初30フレームの平均値でスケールを決定
      this.calibration = {
        eyeMax: 0.04,
        mouthScale: 0.07,
      }
      console.log('[Tracker] Calibration complete')
    }
  }

  _smooth(boneName, q, t) {
    return this.smoothers.filter(boneName, quat.normalize(q))
  }

  reset() {
    this.smoothers.reset()
    for (const s of Object.values(this.blendSmoothers)) s.reset()
    this.calibration = null
    this.frameCount = 0
    this.calibFrames = []
  }
}
