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
import settingsStore from '@/features/stores/settings'
import { mediapipeWorldToVRMCoords } from '../motionCapture/solvers/mathUtils'

const POSE_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10], [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21],
  [17, 19], [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [27, 29], [27, 31],
  [29, 31], [24, 26], [26, 28], [28, 30], [28, 32], [30, 32],
]

export class Model {
  public vrm?: VRM | null
  public mixer?: THREE.AnimationMixer
  public emoteController?: EmoteController

  private _lookAtTargetParent: THREE.Object3D
  private _lipSync?: LipSync
  private _initialHipY: number = 1.0

  private _gestureTime: number = 0
  private _activeGesture: string = ''

  private _debugSkeletonGroup?: THREE.Group
  private _debugPoints?: THREE.Points
  private _debugLines?: THREE.LineSegments
  private _vrmDebugPoints?: THREE.Points
  private _vrmDebugLines?: THREE.LineSegments

  constructor(lookAtTargetParent: THREE.Object3D) {
    this._lookAtTargetParent = lookAtTargetParent
    this._lipSync = new LipSync(new AudioContext(), { forceStart: true })
  }

  public async loadVRM(url: string): Promise<void> {
    const loader = new GLTFLoader()
    loader.register((parser) => new VRMLoaderPlugin(parser, { lookAtPlugin: new VRMLookAtSmootherLoaderPlugin(parser) }))
    const gltf = await loader.loadAsync(url)
    const vrm = (this.vrm = gltf.userData.vrm)
    if (!vrm) return
    vrm.scene.name = 'VRMRoot'
    VRMUtils.rotateVRM0(vrm)
    this.mixer = new THREE.AnimationMixer(vrm.scene)
    this.emoteController = new EmoteController(vrm, this._lookAtTargetParent)
    const hipsNode = vrm.humanoid?.getNormalizedBoneNode('hips')
    if (hipsNode) {
      const pos = new THREE.Vector3()
      hipsNode.getWorldPosition(pos)
      this._initialHipY = pos.y
    }
  }

  public unLoadVrm() {
    if (this.vrm) {
      VRMUtils.deepDispose(this.vrm.scene)
      this.vrm = null
    }
    if (this._debugSkeletonGroup?.parent) {
      this._debugSkeletonGroup.parent.remove(this._debugSkeletonGroup)
      this._debugSkeletonGroup = undefined
    }
  }

  private _currentAction?: THREE.AnimationAction

  public async loadAnimation(vrmAnimation: VRMAnimation): Promise<void> {
    if (!this.vrm || !this.mixer) return
    const clip = vrmAnimation.createAnimationClip(this.vrm)
    this._currentAction = this.mixer.clipAction(clip)
    this._currentAction.play()
  }

  public stopAnimation() {
    this._currentAction?.stop()
  }

  public animateFromPose(riggedPose: any) {
    if (!this.vrm || !this.vrm.humanoid) return
    if (this.vrm.lookAt) this.vrm.lookAt.autoUpdate = false

    const setRot = (name: string, q: any) => {
      const node = this.vrm?.humanoid?.getNormalizedBoneNode(name as any)
      if (node && q) {
        const targetQ = q instanceof THREE.Quaternion ? q : new THREE.Quaternion().setFromEuler(new THREE.Euler(q.x, q.y, q.z, 'YXZ'))
        // Robust slerp
        node.quaternion.slerp(targetQ, 0.2)
      }
    }

    if (riggedPose.UpperChest) setRot('upperChest', riggedPose.UpperChest)
    if (riggedPose.Chest) setRot('chest', riggedPose.Chest)
    if (riggedPose.Spine) setRot('spine', riggedPose.Spine)
    if (riggedPose.Neck) setRot('neck', riggedPose.Neck)
    if (riggedPose.Head) setRot('head', riggedPose.Head)

    if (riggedPose.Hips) {
      const hips = this.vrm.humanoid.getNormalizedBoneNode('hips')
      if (hips) {
        // Apply vertical position from screenHips, adding initial Y offset
        const targetPos = new THREE.Vector3(
          riggedPose.Hips.worldPosition.x, 
          riggedPose.Hips.worldPosition.y + this._initialHipY, 
          riggedPose.Hips.worldPosition.z
        )
        hips.position.lerp(targetPos, 0.2)
        if (riggedPose.Hips.rotation) setRot('hips', riggedPose.Hips.rotation)
      }
    }

    const bones = [
      'RightUpperArm', 'LeftUpperArm', 
      'RightLowerArm', 'LeftLowerArm', 
      'RightHand', 'LeftHand',
      'RightUpperLeg', 'LeftUpperLeg', 
      'RightLowerLeg', 'LeftLowerLeg', 
      'RightFoot', 'LeftFoot', 
      'RightToes', 'LeftToes'
    ]
    bones.forEach(b => {
      if (riggedPose[b]) {
        const boneName = b.charAt(0).toLowerCase() + b.slice(1)
        setRot(boneName, riggedPose[b])
      }
    })

    if (settingsStore.getState().enableFingerTracking) {
      ['Right', 'Left'].forEach(side => {
        const s = side.toLowerCase()
        if (riggedPose[`${side}ThumbProximal`]) setRot(`${s}ThumbMetacarpal`, riggedPose[`${side}ThumbProximal`])
        if (riggedPose[`${side}ThumbIntermediate`]) setRot(`${s}ThumbProximal`, riggedPose[`${side}ThumbIntermediate`])
        if (riggedPose[`${side}ThumbDistal`]) setRot(`${s}ThumbDistal`, riggedPose[`${side}ThumbDistal`])
        ;['Ring', 'Index', 'Little', 'Middle'].forEach(f => {
          ;['Proximal', 'Intermediate', 'Distal'].forEach(seg => {
            const key = side + f + seg
            if (riggedPose[key]) setRot(s + f + seg, riggedPose[key])
          })
        })
      })
    }

    if (riggedPose.Face && this.vrm.expressionManager) {
      const em = this.vrm.expressionManager
      if (riggedPose.Face.blendShapes) {
        Object.entries(riggedPose.Face.blendShapes).forEach(([k, v]) => {
          em.setValue(k, v as number)
        })
      }
    }
  }

  public getBoneWorldPositions(): Record<string, { x: number; y: number; z: number }> {
    if (!this.vrm || !this.vrm.humanoid) return {}
    
    const bones = [
      'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
      'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand',
      'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
      'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'leftToes',
      'rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'rightToes'
    ]

    const positions: Record<string, { x: number; y: number; z: number }> = {}
    
    bones.forEach(b => {
      const node = this.vrm!.humanoid!.getNormalizedBoneNode(b as any)
      if (node) {
        const pos = node.getWorldPosition(new THREE.Vector3())
        positions[b] = { x: pos.x, y: pos.y, z: pos.z }
      }
    })

    return positions
  }

  public async speak(buffer: ArrayBuffer, talk: Talk, isNeedDecode: boolean = true) {
    this.emoteController?.playEmotion(talk.emotion)
    this.playGesture(talk.emotion)
    await new Promise(r => this._lipSync?.playFromArrayBuffer(buffer, () => r(true), isNeedDecode))
  }

  public stopSpeaking() {
    this._lipSync?.stopCurrentPlayback()
  }

  public async playEmotion(preset: VRMExpressionPresetName) {
    this.emoteController?.playEmotion(preset)
  }

  public playGesture(emotion: string) {
    if (!this.vrm || !this.vrm.humanoid) return;
    if (['happy', 'sad', 'angry', 'surprised', 'relaxed'].includes(emotion)) {
      // 同じ感情が連続した場合は、アニメーションを最初からリセットせずに継続させる
      // ただし、前回のアニメーションが完全に終わっている(>3.0)場合はリセットする
      if (this._activeGesture !== emotion || this._gestureTime > 3.0) {
        this._gestureTime = 0;
        this._activeGesture = emotion;
      }
    } else {
      this._activeGesture = '';
    }
  }

  public update(delta: number): void {
    if (this._lipSync) {
      const { volume } = this._lipSync.update()
      this.emoteController?.lipSync('aa', volume)
    }
    this.emoteController?.update(delta)
    this.mixer?.update(delta)

    if (this._activeGesture && this.vrm && this.vrm.humanoid) {
      this._gestureTime += delta;
      const t = this._gestureTime;
      const tMax = 3.0; // Gesture lasts 3 seconds
      
      if (t < tMax) {
        const progress = t / tMax;
        const wave = Math.sin(progress * Math.PI); // 0 -> 1 -> 0

        const leftArm = this.vrm.humanoid.getNormalizedBoneNode('leftUpperArm');
        const rightArm = this.vrm.humanoid.getNormalizedBoneNode('rightUpperArm');
        const head = this.vrm.humanoid.getNormalizedBoneNode('head');
        const spine = this.vrm.humanoid.getNormalizedBoneNode('spine');

        if (this._activeGesture === 'happy') {
            // Happy: Arms up (バンザイ), slightly jumping or swinging
            if (leftArm && rightArm) {
                const raiseRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2.5 * wave));
                const raiseRotR = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2.5 * wave));
                leftArm.quaternion.slerp(raiseRot, wave);
                rightArm.quaternion.slerp(raiseRotR, wave);
            }
        } else if (this._activeGesture === 'sad') {
            // Sad: Look down, slouch
            if (head) {
                const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 6 * wave, 0, 0));
                head.quaternion.slerp(tilt, wave);
            }
            if (leftArm && rightArm) {
                const droop = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 8 * wave));
                const droopR = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 8 * wave));
                leftArm.quaternion.slerp(droop, wave);
                rightArm.quaternion.slerp(droopR, wave);
            }
        } else if (this._activeGesture === 'angry') {
            // Angry: Head shake slightly
            if (head) {
                const shake = Math.sin(progress * Math.PI * 12) * 0.1 * wave;
                const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, shake, 0));
                head.quaternion.slerp(tilt, wave);
            }
        } else if (this._activeGesture === 'surprised') {
            // Surprised: lean back, arms slightly open
            if (spine) {
                const lean = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 12 * wave, 0, 0));
                spine.quaternion.slerp(lean, wave);
            }
            if (leftArm && rightArm) {
                const open = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 6 * wave, 0, Math.PI / 6 * wave));
                const openR = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 6 * wave, 0, -Math.PI / 6 * wave));
                leftArm.quaternion.slerp(open, wave);
                rightArm.quaternion.slerp(openR, wave);
            }
        } else if (this._activeGesture === 'relaxed') {
            // Relaxed: gentle body sway
            if (spine) {
                const sway = Math.sin(progress * Math.PI * 2) * 0.05 * wave;
                const lean = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, sway));
                spine.quaternion.slerp(lean, wave);
            }
        }
      } else {
        this._activeGesture = '';
      }
    }

    this.vrm?.update(delta)
  }

  public drawDebugSkeleton(poseWorldLandmarks: any, riggedPose: any = null) {
    if (!settingsStore.getState().showDebugSkeleton) {
      if (this._debugSkeletonGroup) this._debugSkeletonGroup.visible = false
      return
    }
    if (!poseWorldLandmarks || poseWorldLandmarks.length === 0) return

    if (!this._debugSkeletonGroup) {
      const group = new THREE.Group()
      this._debugSkeletonGroup = group
      const matPoints = new THREE.PointsMaterial({ color: 0x00ff00, size: 0.05, depthTest: false, depthWrite: false })
      const matLines = new THREE.LineBasicMaterial({ color: 0xff0000, depthTest: false, depthWrite: false })
      const geoPoints = new THREE.BufferGeometry()
      geoPoints.setAttribute('position', new THREE.BufferAttribute(new Float32Array(33 * 3), 3))
      this._debugPoints = new THREE.Points(geoPoints, matPoints)

      const geoLines = new THREE.BufferGeometry()
      geoLines.setAttribute('position', new THREE.BufferAttribute(new Float32Array(POSE_CONNECTIONS.length * 2 * 3), 3))
      this._debugLines = new THREE.LineSegments(geoLines, matLines)

      const matVrmP = new THREE.PointsMaterial({ color: 0x00aaff, size: 0.05, depthTest: false, depthWrite: false })
      const matVrmL = new THREE.LineBasicMaterial({ color: 0x0055ff, depthTest: false, depthWrite: false })
      const geoVrmP = new THREE.BufferGeometry()
      geoVrmP.setAttribute('position', new THREE.BufferAttribute(new Float32Array(33 * 3), 3))
      this._vrmDebugPoints = new THREE.Points(geoVrmP, matVrmP)

      const geoVrmL = new THREE.BufferGeometry()
      geoVrmL.setAttribute('position', new THREE.BufferAttribute(new Float32Array(POSE_CONNECTIONS.length * 2 * 3), 3))
      this._vrmDebugLines = new THREE.LineSegments(geoVrmL, matVrmL)

      this._debugPoints.renderOrder = 2000
      this._debugLines.renderOrder = 2000
      this._vrmDebugPoints.renderOrder = 2001
      this._vrmDebugLines.renderOrder = 2001

      group.add(this._debugPoints, this._debugLines, this._vrmDebugPoints, this._vrmDebugLines)
    }

    // Ensure the group is in the scene
    if (this._debugSkeletonGroup && !this._debugSkeletonGroup.parent && this.vrm) {
       ;(this.vrm.scene.parent || this.vrm.scene).add(this._debugSkeletonGroup)
    }

    this._debugSkeletonGroup.visible = true
    const hipOffset = new THREE.Vector3(
      riggedPose?.Hips?.worldPosition?.x || 0,
      (riggedPose?.Hips?.worldPosition?.y || 0) + this._initialHipY,
      riggedPose?.Hips?.worldPosition?.z || 0
    )
    // MediaPipe デバッグ骨格を VRM の横に並べて表示するためのオフセット
    // ユーザーの指示: VRMの左側に配置
    const mocapSideBySideOffset = new THREE.Vector3(-0.8, 0, 0)

    // MediaPipeの頭の基準 (POSE_LANDMARKS.nose は通常 0)
    // VRMの頭の高さ (Hipsから上のNeck/Headの位置。簡易的に _initialHipY * some_factor または実測)
    // ここでは MediaPipe の Skeleton 全体を、頭(Nose)が VRM の Hips + 身長の 80% 程度の位置に来るように調整
    let mpTopAdjustment = 0
    if (poseWorldLandmarks[0]) {
      const noseLM = mediapipeWorldToVRMCoords(poseWorldLandmarks[0])
      // VRMの頭の位置想定 (簡易)
      const vrmHeadY = this._initialHipY * 1.8 
      mpTopAdjustment = vrmHeadY - (noseLM.y + hipOffset.y)
    }

    // Update raw landmarks (Red)
    const points = this._debugPoints!.geometry.attributes.position.array as Float32Array
    for (let i = 0; i < 33; i++) {
        const rawLM = poseWorldLandmarks[i]
        const vrmLM = mediapipeWorldToVRMCoords(rawLM) 
        points[i * 3] = vrmLM.x + hipOffset.x + mocapSideBySideOffset.x
        points[i * 3 + 1] = vrmLM.y + hipOffset.y + mocapSideBySideOffset.y + mpTopAdjustment
        points[i * 3 + 2] = vrmLM.z + hipOffset.z + mocapSideBySideOffset.z
    }
    this._debugPoints!.geometry.attributes.position.needsUpdate = true

    const lines = this._debugLines!.geometry.attributes.position.array as Float32Array
    let lineIdx = 0
    for (const [startIdx, endIdx] of POSE_CONNECTIONS) {
        const p1Raw = poseWorldLandmarks[startIdx]
        const p2Raw = poseWorldLandmarks[endIdx]
        if (p1Raw && p2Raw) {
            const p1 = mediapipeWorldToVRMCoords(p1Raw)
            const p2 = mediapipeWorldToVRMCoords(p2Raw)
            lines[lineIdx++] = p1.x + hipOffset.x + mocapSideBySideOffset.x; lines[lineIdx++] = p1.y + hipOffset.y + mocapSideBySideOffset.y + mpTopAdjustment; lines[lineIdx++] = p1.z + hipOffset.z + mocapSideBySideOffset.z
            lines[lineIdx++] = p2.x + hipOffset.x + mocapSideBySideOffset.x; lines[lineIdx++] = p2.y + hipOffset.y + mocapSideBySideOffset.y + mpTopAdjustment; lines[lineIdx++] = p2.z + hipOffset.z + mocapSideBySideOffset.z
        }
    }
    this._debugLines!.geometry.attributes.position.needsUpdate = true

    // Update VRM bone positions (Blue)
    if (this.vrm?.humanoid) {
        const vrmP = this._vrmDebugPoints!.geometry.attributes.position.array as Float32Array
        const vrmL = this._vrmDebugLines!.geometry.attributes.position.array as Float32Array
        const getP = (b: string) => this.vrm!.humanoid!.getNormalizedBoneNode(b as any)?.getWorldPosition(new THREE.Vector3()) || new THREE.Vector3()
        
        const map: Record<number, string> = { 
          0: 'head', 
          11: 'leftShoulder', 12: 'rightShoulder', 
          13: 'leftLowerArm', 14: 'rightLowerArm', 
          15: 'leftHand', 16: 'rightHand', 
          23: 'leftUpperLeg', 24: 'rightUpperLeg', 
          25: 'leftLowerLeg', 26: 'rightLowerLeg', 
          27: 'leftFoot', 28: 'rightFoot', 
          31: 'leftToes', 32: 'rightToes' 
        }

        for (let i = 0; i < 33; i++) { 
          const name = map[i] || 'hips';
          const pos = getP(name); 
          vrmP[i * 3] = pos.x; vrmP[i * 3 + 1] = pos.y; vrmP[i * 3 + 2] = pos.z 
        }
        this._vrmDebugPoints!.geometry.attributes.position.needsUpdate = true
        
        lineIdx = 0
        for (const [startIdx, endIdx] of POSE_CONNECTIONS) {
            vrmL[lineIdx++] = vrmP[startIdx * 3]; vrmL[lineIdx++] = vrmP[startIdx * 3 + 1]; vrmL[lineIdx++] = vrmP[startIdx * 3 + 2]
            vrmL[lineIdx++] = vrmP[endIdx * 3]; vrmL[lineIdx++] = vrmP[endIdx * 3 + 1]; vrmL[lineIdx++] = vrmP[endIdx * 3 + 2]
        }
        this._vrmDebugLines!.geometry.attributes.position.needsUpdate = true
    }
  }
}
