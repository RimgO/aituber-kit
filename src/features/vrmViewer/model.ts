import * as THREE from 'three'
import {
  VRM,
  VRMExpressionPresetName,
  VRMLoaderPlugin,
  VRMUtils,
} from '@pixiv/three-vrm'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMAnimation } from '../../lib/VRMAnimation/VRMAnimation'
import { VRMLookAtSmootherLoaderPlugin } from '@/lib/VRMLookAtSmootherLoaderPlugin/VRMLookAtSmootherLoaderPlugin'
import { LipSync } from '../lipSync/lipSync'
import { EmoteController } from '../emoteController/emoteController'
import { Talk } from '../messages/messages'

/**
 * 3Dキャラクターを管理するクラス
 */
export class Model {
  public vrm?: VRM | null
  public mixer?: THREE.AnimationMixer
  public emoteController?: EmoteController

  private _lookAtTargetParent: THREE.Object3D
  private _lipSync?: LipSync

  constructor(lookAtTargetParent: THREE.Object3D) {
    this._lookAtTargetParent = lookAtTargetParent
    this._lipSync = new LipSync(new AudioContext(), { forceStart: true })
  }

  public async loadVRM(url: string): Promise<void> {
    const loader = new GLTFLoader()
    loader.register(
      (parser) =>
        new VRMLoaderPlugin(parser, {
          lookAtPlugin: new VRMLookAtSmootherLoaderPlugin(parser),
        })
    )

    const gltf = await loader.loadAsync(url)

    const vrm = (this.vrm = gltf.userData.vrm)
    vrm.scene.name = 'VRMRoot'

    VRMUtils.rotateVRM0(vrm)
    this.mixer = new THREE.AnimationMixer(vrm.scene)

    this.emoteController = new EmoteController(vrm, this._lookAtTargetParent)
  }

  public unLoadVrm() {
    if (this.vrm) {
      VRMUtils.deepDispose(this.vrm.scene)
      this.vrm = null
    }
  }

  private _currentAction?: THREE.AnimationAction

  /**
   * VRMアニメーションを読み込む
   *
   * https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm_animation-1.0/README.ja.md
   */
  public async loadAnimation(vrmAnimation: VRMAnimation): Promise<void> {
    const { vrm, mixer } = this
    if (vrm == null || mixer == null) {
      throw new Error('You have to load VRM first')
    }

    const clip = vrmAnimation.createAnimationClip(vrm)
    this._currentAction = mixer.clipAction(clip)
    this._currentAction.play()
  }

  public stopAnimation() {
    if (this._currentAction) {
      this._currentAction.stop()
    }
  }

  /**
   * Kalidokitのポーズデータを適用する
   */
  public animateFromPose(riggedPose: any) {
    if (!this.vrm || !this.vrm.humanoid) return

    // Disable auto lookAt to prevent conflict with head rotation from MediaPipe
    if (this.vrm.lookAt) {
      this.vrm.lookAt.autoUpdate = false
    }

    const setRotation = (name: string, rotation: any, lerpAmount = 0.5) => {
      const boneNode = this.vrm?.humanoid.getNormalizedBoneNode(name as any)
      if (boneNode && rotation) {
        const targetQuat = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(rotation.x, rotation.y, rotation.z, 'YXZ')
        )
        boneNode.quaternion.slerp(targetQuat, lerpAmount)
      }
    }

    if (riggedPose.UpperChest) setRotation('upperChest', riggedPose.UpperChest)
    if (riggedPose.Chest) setRotation('chest', riggedPose.Chest)
    if (riggedPose.Neck) setRotation('neck', riggedPose.Neck)
    if (riggedPose.Head) setRotation('head', riggedPose.Head)

    if (riggedPose.Hips) {
      const hips = this.vrm.humanoid.getNormalizedBoneNode('hips')
      if (hips) {
        hips.position.set(
          -riggedPose.Hips.worldPosition.x,
          riggedPose.Hips.worldPosition.y + 1.0,
          -riggedPose.Hips.worldPosition.z
        )
        if (riggedPose.Hips.rotation) {
          setRotation('hips', riggedPose.Hips.rotation)
        }
      }
    }

    if (riggedPose.RightUpperArm)
      setRotation('rightUpperArm', riggedPose.RightUpperArm)
    if (riggedPose.LeftUpperArm)
      setRotation('leftUpperArm', riggedPose.LeftUpperArm)
    if (riggedPose.RightLowerArm)
      setRotation('rightLowerArm', riggedPose.RightLowerArm)
    if (riggedPose.LeftLowerArm)
      setRotation('leftLowerArm', riggedPose.LeftLowerArm)
    if (riggedPose.RightHand) setRotation('rightHand', riggedPose.RightHand)
    if (riggedPose.LeftHand) setRotation('leftHand', riggedPose.LeftHand)
    if (riggedPose.RightUpperLeg)
      setRotation('rightUpperLeg', riggedPose.RightUpperLeg)
    if (riggedPose.LeftUpperLeg)
      setRotation('leftUpperLeg', riggedPose.LeftUpperLeg)
    if (riggedPose.RightLowerLeg)
      setRotation('rightLowerLeg', riggedPose.RightLowerLeg)
    if (riggedPose.LeftLowerLeg)
      setRotation('leftLowerLeg', riggedPose.LeftLowerLeg)
    if (riggedPose.RightLowerLeg)
      setRotation('rightLowerLeg', riggedPose.RightLowerLeg)
    if (riggedPose.LeftLowerLeg)
      setRotation('leftLowerLeg', riggedPose.LeftLowerLeg)

    // Handle Face Expressions (Blink, Mouth)
    if (riggedPose.Face && this.vrm.expressionManager) {
      const face = riggedPose.Face
      const em = this.vrm.expressionManager

      // Blink
      // Kalidokit: 1 = Open, 0 = Closed
      // VRM: 0 = Open, 1 = Closed
      if (face.eye) {
        const blinkL = 1 - (face.eye.l || 1)
        const blinkR = 1 - (face.eye.r || 1)
        em.setValue('blink_l', blinkL)
        em.setValue('blink_r', blinkR)
      }

      // Mouth (Lipsync)
      // Note: If LipSync via Audio is active, this might conflict.
      // We should prioritise Audio LipSync if speaking?
      // But here we just apply what we have.
      // Kalidokit gives shape: { A, E, I, O, U }
      if (face.mouth && face.mouth.shape) {
        const shape = face.mouth.shape
        em.setValue('aa', shape.A || 0)
        em.setValue('ih', shape.I || 0)
        em.setValue('ou', shape.U || 0)
        em.setValue('ee', shape.E || 0)
        em.setValue('oh', shape.O || 0)
      }
    }
  }

  /**
   * 音声を再生し、リップシンクを行う
   */
  public async speak(
    buffer: ArrayBuffer,
    talk: Talk,
    isNeedDecode: boolean = true
  ) {
    this.emoteController?.playEmotion(talk.emotion)
    await new Promise((resolve) => {
      this._lipSync?.playFromArrayBuffer(
        buffer,
        () => {
          resolve(true)
        },
        isNeedDecode
      )
    })
  }

  /**
   * 現在の音声再生を停止
   */
  public stopSpeaking() {
    this._lipSync?.stopCurrentPlayback()
  }

  /**
   * 感情表現を再生する
   */
  public async playEmotion(preset: VRMExpressionPresetName) {
    this.emoteController?.playEmotion(preset)
  }

  public update(delta: number): void {
    if (this._lipSync) {
      const { volume } = this._lipSync.update()
      this.emoteController?.lipSync('aa', volume)
    }

    this.emoteController?.update(delta)
    this.mixer?.update(delta)
    this.vrm?.update(delta)
  }
}
