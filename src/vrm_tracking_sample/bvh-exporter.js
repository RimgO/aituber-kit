/**
 * BVH エクスポーター
 * トラッキングデータをBVH形式で記録・ダウンロード
 *
 * BVH構造:
 *   HIERARCHY → スケルトン定義
 *   MOTION    → フレームデータ (オイラー角列)
 */

// VRMボーン → BVH階層定義
const BVH_HIERARCHY = `HIERARCHY
ROOT hips
{
  OFFSET 0.00 0.00 0.00
  CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation
  JOINT spine
  {
    OFFSET 0.00 10.00 0.00
    CHANNELS 3 Zrotation Xrotation Yrotation
    JOINT chest
    {
      OFFSET 0.00 10.00 0.00
      CHANNELS 3 Zrotation Xrotation Yrotation
      JOINT upperChest
      {
        OFFSET 0.00 10.00 0.00
        CHANNELS 3 Zrotation Xrotation Yrotation
        JOINT neck
        {
          OFFSET 0.00 10.00 0.00
          CHANNELS 3 Zrotation Xrotation Yrotation
          JOINT head
          {
            OFFSET 0.00 7.00 0.00
            CHANNELS 3 Zrotation Xrotation Yrotation
            End Site
            {
              OFFSET 0.00 7.00 0.00
            }
          }
        }
        JOINT leftShoulder
        {
          OFFSET 5.00 8.00 0.00
          CHANNELS 3 Zrotation Xrotation Yrotation
          JOINT leftUpperArm
          {
            OFFSET 5.00 0.00 0.00
            CHANNELS 3 Zrotation Xrotation Yrotation
            JOINT leftLowerArm
            {
              OFFSET 25.00 0.00 0.00
              CHANNELS 3 Zrotation Xrotation Yrotation
              JOINT leftHand
              {
                OFFSET 25.00 0.00 0.00
                CHANNELS 3 Zrotation Xrotation Yrotation
                End Site
                {
                  OFFSET 10.00 0.00 0.00
                }
              }
            }
          }
        }
        JOINT rightShoulder
        {
          OFFSET -5.00 8.00 0.00
          CHANNELS 3 Zrotation Xrotation Yrotation
          JOINT rightUpperArm
          {
            OFFSET -5.00 0.00 0.00
            CHANNELS 3 Zrotation Xrotation Yrotation
            JOINT rightLowerArm
            {
              OFFSET -25.00 0.00 0.00
              CHANNELS 3 Zrotation Xrotation Yrotation
              JOINT rightHand
              {
                OFFSET -25.00 0.00 0.00
                CHANNELS 3 Zrotation Xrotation Yrotation
                End Site
                {
                  OFFSET -10.00 0.00 0.00
                }
              }
            }
          }
        }
      }
    }
  }
  JOINT leftUpperLeg
  {
    OFFSET 8.00 0.00 0.00
    CHANNELS 3 Zrotation Xrotation Yrotation
    JOINT leftLowerLeg
    {
      OFFSET 0.00 -40.00 0.00
      CHANNELS 3 Zrotation Xrotation Yrotation
      JOINT leftFoot
      {
        OFFSET 0.00 -38.00 0.00
        CHANNELS 3 Zrotation Xrotation Yrotation
        JOINT leftToes
        {
          OFFSET 0.00 -5.00 8.00
          CHANNELS 3 Zrotation Xrotation Yrotation
          End Site
          {
            OFFSET 0.00 0.00 6.00
          }
        }
      }
    }
  }
  JOINT rightUpperLeg
  {
    OFFSET -8.00 0.00 0.00
    CHANNELS 3 Zrotation Xrotation Yrotation
    JOINT rightLowerLeg
    {
      OFFSET 0.00 -40.00 0.00
      CHANNELS 3 Zrotation Xrotation Yrotation
      JOINT rightFoot
      {
        OFFSET 0.00 -38.00 0.00
        CHANNELS 3 Zrotation Xrotation Yrotation
        JOINT rightToes
        {
          OFFSET 0.00 -5.00 8.00
          CHANNELS 3 Zrotation Xrotation Yrotation
          End Site
          {
            OFFSET 0.00 0.00 6.00
          }
        }
      }
    }
  }
}`

// BVHに書き出すボーン順序（Hierarchyと一致させる）
const BVH_BONE_ORDER = [
  'hips', // ROOT: 6ch (pos + rot)
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
]

const RAD2DEG = 180 / Math.PI

function quatToEulerDeg(q) {
  // [x,y,z,w] → ZXY オイラー角(度)
  const [x, y, z, w] = q
  const sinX = 2 * (w * x + y * z)
  const cosX = 1 - 2 * (x * x + y * y)
  const ex = Math.atan2(sinX, cosX)
  const sinY = Math.max(-1, Math.min(1, 2 * (w * y - z * x)))
  const ey = Math.asin(sinY)
  const sinZ = 2 * (w * z + x * y)
  const cosZ = 1 - 2 * (y * y + z * z)
  const ez = Math.atan2(sinZ, cosZ)
  return {
    x: ex * RAD2DEG,
    y: ey * RAD2DEG,
    z: ez * RAD2DEG,
  }
}

export class BVHExporter {
  constructor(fps = 30) {
    this.fps = fps
    this.frames = []
    this.recording = false
    this.hipPosition = { x: 0, y: 0.9, z: 0 } // デフォルト腰位置
  }

  startRecording() {
    this.frames = []
    this.recording = true
    console.log('[BVH] Recording started')
  }

  stopRecording() {
    this.recording = false
    console.log(
      `[BVH] Recording stopped. ${this.frames.length} frames captured.`
    )
  }

  /**
   * フレームデータを記録
   * @param {{ bones: Object }} trackingData
   */
  addFrame(trackingData) {
    if (!this.recording) return

    const bones = trackingData.bones
    const values = []

    for (let i = 0; i < BVH_BONE_ORDER.length; i++) {
      const boneName = BVH_BONE_ORDER[i]
      const q = bones[boneName] ?? [0, 0, 0, 1]
      const euler = quatToEulerDeg(q)

      if (i === 0) {
        // ROOT(hips): position + rotation (6ch)
        values.push(
          (this.hipPosition.x * 100).toFixed(4), // cm単位
          (this.hipPosition.y * 100).toFixed(4),
          (this.hipPosition.z * 100).toFixed(4),
          euler.z.toFixed(4),
          euler.x.toFixed(4),
          euler.y.toFixed(4)
        )
      } else {
        // 通常ボーン: rotation (3ch)
        values.push(euler.z.toFixed(4), euler.x.toFixed(4), euler.y.toFixed(4))
      }
    }

    this.frames.push(values.join(' '))
  }

  /**
   * BVHファイルを生成してダウンロード
   */
  download(filename = 'tracking.bvh') {
    if (this.frames.length === 0) {
      alert('録画データがありません。録画を開始してから停止してください。')
      return
    }

    const frameTime = (1 / this.fps).toFixed(6)
    const motionSection = [
      'MOTION',
      `Frames: ${this.frames.length}`,
      `Frame Time: ${frameTime}`,
      ...this.frames,
    ].join('\n')

    const bvhContent = BVH_HIERARCHY + '\n' + motionSection

    const blob = new Blob([bvhContent], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)

    console.log(`[BVH] Downloaded: ${filename} (${this.frames.length} frames)`)
  }

  get frameCount() {
    return this.frames.length
  }

  get durationSec() {
    return this.frames.length / this.fps
  }
}
