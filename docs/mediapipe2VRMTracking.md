MediaPipe + VRM フルトラッキング システム 詳細設計
システム概要
映像入力 → MediaPipe解析 → ボーン変換 → VRMアニメーション出力

1. アーキテクチャ全体図
┌─────────────────────────────────────────────────────────┐
│                     入力レイヤー                          │
│  動画ファイル (.mp4/.avi) or WebカメラストリームURL        │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────┐
│               MediaPipe 解析レイヤー                      │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐ │
│  │  Pose (33点) │ │ Hands (42点) │ │ FaceMesh (478点) │ │
│  └──────────────┘ └──────────────┘ └──────────────────┘ │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────┐
│              座標変換・IKソルバーレイヤー                  │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  World座標正規化 → 関節角度計算 → VRMボーン座標変換   │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────┐
│               VRM制御レイヤー                             │
│  ┌─────────────┐ ┌────────────┐ ┌────────────────────┐  │
│  │ ボーン回転  │ │ BlendShape │ │  SpringBone物理     │  │
│  └─────────────┘ └────────────┘ └────────────────────┘  │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────┐
│                 出力レイヤー                               │
│        three.js WebGL レンダラー / BVH出力                │
└─────────────────────────────────────────────────────────┘

2. 使用技術スタック
レイヤー技術用途映像解析mediapipe (Python)ランドマーク検出数値計算numpy, scipy回転行列・クォータニオンVRM操作three.js + @pixiv/three-vrmレンダリングサーバーFastAPI + WebSocketPython→JS リアルタイム通信フロントVite + React3D表示UI

3. MediaPipeランドマーク → VRMボーンマッピング
3.1 身体ボーンマッピング (Pose 33点)
python# MediaPipe Pose ランドマーク番号 → VRM ボーン名
POSE_TO_VRM_BONE = {
    # 体幹
    11: "leftShoulder",   12: "rightShoulder",
    23: "leftHip",        24: "rightHip",
    
    # 左腕チェーン
    11: "leftShoulder",
    13: "leftUpperArm",   # 肘の位置から上腕方向を計算
    15: "leftLowerArm",   # 手首の位置から前腕方向を計算
    17: "leftHand",
    
    # 右腕チェーン
    12: "rightShoulder",
    14: "rightUpperArm",
    16: "rightLowerArm",
    18: "rightHand",
    
    # 左脚チェーン
    23: "leftUpperLeg",
    25: "leftLowerLeg",
    27: "leftFoot",
    31: "leftToes",
    
    # 右脚チェーン
    24: "rightUpperLeg",
    26: "rightLowerLeg",
    28: "rightFoot",
    32: "rightToes",
}
3.2 脊椎ボーン推定（MediaPipeには脊椎点がないため補間）
pythondef estimate_spine_bones(landmarks):
    """
    肩中点と腰中点から脊椎3ボーンを推定
    VRM: hips → spine → chest → upperChest → neck → head
    """
    left_shoulder  = landmarks[11]
    right_shoulder = landmarks[12]
    left_hip       = landmarks[23]
    right_hip      = landmarks[24]
    
    # 各中点を計算
    shoulder_mid = (left_shoulder + right_shoulder) / 2
    hip_mid      = (left_hip + right_hip) / 2
    spine_vec    = shoulder_mid - hip_mid
    
    # 脊椎を3分割して補間
    hips       = hip_mid
    spine      = hip_mid + spine_vec * 0.25
    chest      = hip_mid + spine_vec * 0.50
    upper_chest= hip_mid + spine_vec * 0.75
    neck       = shoulder_mid
    
    return {
        "hips": hips,
        "spine": spine,
        "chest": chest,
        "upperChest": upper_chest,
        "neck": neck,
    }

4. 関節角度計算（コア処理）
4.1 2点ベクトルから回転クォータニオンを計算
pythonimport numpy as np
from scipy.spatial.transform import Rotation

def calc_bone_rotation(parent_pos, child_pos, rest_direction):
    """
    親→子ボーン方向ベクトルと、レスト姿勢方向から
    回転クォータニオンを計算する
    
    Args:
        parent_pos: 親関節のワールド座標 [x, y, z]
        child_pos:  子関節のワールド座標 [x, y, z]
        rest_direction: VRMレスト姿勢でのボーン向き (例: [0, -1, 0] = 下向き)
    
    Returns:
        quaternion: [x, y, z, w]
    """
    # 現在のボーン方向ベクトル（正規化）
    current_dir = child_pos - parent_pos
    norm = np.linalg.norm(current_dir)
    if norm < 1e-6:
        return np.array([0, 0, 0, 1])  # 単位クォータニオン
    current_dir = current_dir / norm
    
    # レスト方向も正規化
    rest_dir = np.array(rest_direction, dtype=float)
    rest_dir = rest_dir / np.linalg.norm(rest_dir)
    
    # rest_dir → current_dir への最小回転を計算
    cross = np.cross(rest_dir, current_dir)
    dot   = np.dot(rest_dir, current_dir)
    
    cross_norm = np.linalg.norm(cross)
    if cross_norm < 1e-6:
        if dot > 0:
            return np.array([0, 0, 0, 1])   # 同方向: 回転なし
        else:
            # 逆方向: 180度回転（任意軸で）
            perp = np.array([1, 0, 0]) if abs(rest_dir[0]) < 0.9 else np.array([0, 1, 0])
            axis = np.cross(rest_dir, perp)
            axis = axis / np.linalg.norm(axis)
            return np.array([*axis, 0])  # 180度回転
    
    # クォータニオン構築
    w = 1.0 + dot
    q = np.array([cross[0], cross[1], cross[2], w])
    q = q / np.linalg.norm(q)
    return q  # [x, y, z, w]
4.2 肘・膝の曲げ角度計算
pythondef calc_bend_angle(a_pos, b_pos, c_pos):
    """
    3点 A→B→C から B点での曲げ角度を計算
    例: 肩→肘→手首 で肘の曲げ角
    
    Returns:
        angle_rad: 関節角度 (0=まっすぐ, π=完全に曲げた)
        axis: 回転軸ベクトル
    """
    ba = a_pos - b_pos  # B→A ベクトル
    bc = c_pos - b_pos  # B→C ベクトル
    
    ba_norm = ba / (np.linalg.norm(ba) + 1e-9)
    bc_norm = bc / (np.linalg.norm(bc) + 1e-9)
    
    # 角度
    cos_angle = np.clip(np.dot(ba_norm, bc_norm), -1.0, 1.0)
    angle = np.arccos(cos_angle)
    
    # 回転軸（肘の折れる方向）
    axis = np.cross(ba_norm, bc_norm)
    axis_norm = np.linalg.norm(axis)
    if axis_norm > 1e-6:
        axis = axis / axis_norm
    else:
        axis = np.array([0, 0, 1])
    
    return angle, axis

def angle_to_quaternion(axis, angle):
    """軸角度表現からクォータニオンに変換"""
    half = angle / 2.0
    s = np.sin(half)
    return np.array([axis[0]*s, axis[1]*s, axis[2]*s, np.cos(half)])

5. 顔トラッキング（FaceMesh → BlendShape）
5.1 主要な表情ブレンドシェイプ
python# FaceMesh ランドマーク番号
FACE_LANDMARKS = {
    # 目
    "left_eye_upper":  [386, 387, 388, 466],
    "left_eye_lower":  [374, 380, 381, 382],
    "right_eye_upper": [159, 160, 161, 246],
    "right_eye_lower": [145, 153, 154, 155],
    
    # 眉
    "left_brow":  [276, 283, 282, 295, 285],
    "right_brow": [46, 53, 52, 65, 55],
    
    # 口
    "mouth_outer": [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291],
    "mouth_inner": [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308],
    "mouth_left":  [61],
    "mouth_right": [291],
    "mouth_top":   [13],
    "mouth_bottom":[14],
}

def calc_blend_shapes(face_landmarks):
    """FaceMeshランドマークからVRM BlendShape値を計算"""
    lm = face_landmarks  # shape: (478, 3)
    
    blend_shapes = {}
    
    # --- 目の開閉 ---
    def eye_openness(upper_ids, lower_ids):
        upper = np.mean([lm[i] for i in upper_ids], axis=0)
        lower = np.mean([lm[i] for i in lower_ids], axis=0)
        dist = np.linalg.norm(upper - lower)
        return dist
    
    left_open  = eye_openness([386,387,388],[374,380,381])
    right_open = eye_openness([159,160,161],[145,153,154])
    
    # 目の開き度を0~1に正規化（キャリブレーション値で調整）
    EYE_OPEN_MAX = 0.05  # 個人差あり→初期フレームで自動キャリブ
    EYE_CLOSE_MIN = 0.01
    blend_shapes["blinkLeft"]  = 1.0 - np.clip((left_open  - EYE_CLOSE_MIN) / EYE_OPEN_MAX, 0, 1)
    blend_shapes["blinkRight"] = 1.0 - np.clip((right_open - EYE_CLOSE_MIN) / EYE_OPEN_MAX, 0, 1)
    
    # --- 口の開閉 ---
    mouth_top    = lm[13]
    mouth_bottom = lm[14]
    mouth_left   = lm[61]
    mouth_right  = lm[291]
    
    mouth_open  = np.linalg.norm(mouth_top - mouth_bottom)
    mouth_width = np.linalg.norm(mouth_left - mouth_right)
    
    MOUTH_OPEN_SCALE = 0.08
    blend_shapes["aa"] = np.clip(mouth_open / MOUTH_OPEN_SCALE, 0, 1)  # あ
    
    # 口角の上がり具合 → joy
    mouth_center_y = (mouth_top[1] + mouth_bottom[1]) / 2
    corner_avg_y   = (mouth_left[1] + mouth_right[1]) / 2
    smile_val      = np.clip((mouth_center_y - corner_avg_y) * 20, 0, 1)
    blend_shapes["joy"] = smile_val
    
    # --- 頭部回転 ---
    # 顔の向きをFaceMeshの特徴点から推定
    nose_tip    = lm[4]
    chin        = lm[152]
    left_cheek  = lm[234]
    right_cheek = lm[454]
    
    face_width  = np.linalg.norm(right_cheek - left_cheek)
    face_center = (left_cheek + right_cheek) / 2
    
    # Yaw（左右回転）: 鼻が左右どちらにずれているか
    nose_offset_x = (nose_tip[0] - face_center[0]) / (face_width * 0.5)
    # Pitch（上下回転）: 顎と額の比率
    nose_offset_y = (nose_tip[1] - face_center[1]) / (face_width * 0.5)
    
    blend_shapes["_head_yaw"]   = np.clip(nose_offset_x * 1.5, -1, 1)
    blend_shapes["_head_pitch"] = np.clip(nose_offset_y * 1.0, -1, 1)
    
    return blend_shapes

6. 手指トラッキング（Hands 21点×2）
python# MediaPipe Hands ランドマーク → VRM 指ボーン
HAND_BONE_MAP = {
    # 親指
    "thumb": {
        "metacarpal":   (0, 1),   # (親点ID, 子点ID)
        "proximal":     (1, 2),
        "intermediate": (2, 3),
        "distal":       (3, 4),
    },
    # 人差し指
    "index": {
        "metacarpal":   (0, 5),
        "proximal":     (5, 6),
        "intermediate": (6, 7),
        "distal":       (7, 8),
    },
    # 中指
    "middle": {
        "metacarpal":   (0, 9),
        "proximal":     (9, 10),
        "intermediate": (10, 11),
        "distal":       (11, 12),
    },
    # 薬指
    "ring": {
        "metacarpal":   (0, 13),
        "proximal":     (13, 14),
        "intermediate": (14, 15),
        "distal":       (15, 16),
    },
    # 小指
    "pinky": {
        "metacarpal":   (0, 17),
        "proximal":     (17, 18),
        "intermediate": (18, 19),
        "distal":       (19, 20),
    },
}

def calc_finger_rotations(hand_landmarks, hand_side="left"):
    """
    21点の手のランドマークから各指節の回転を計算
    
    Returns:
        dict: ボーン名 → クォータニオン [x,y,z,w]
    """
    rotations = {}
    lm = np.array([[p.x, p.y, p.z] for p in hand_landmarks.landmark])
    
    # 手首座標系を定義（手の向きを正規化するため）
    wrist      = lm[0]
    index_base = lm[5]
    pinky_base = lm[17]
    
    # 手の平の法線ベクトル
    hand_x = index_base - pinky_base
    hand_y = index_base - wrist
    hand_z = np.cross(hand_x, hand_y)
    hand_z = hand_z / (np.linalg.norm(hand_z) + 1e-9)
    
    for finger_name, segments in HAND_BONE_MAP.items():
        for seg_name, (parent_id, child_id) in segments.items():
            bone_name = f"{hand_side}{finger_name.capitalize()}{seg_name.capitalize()}"
            
            # 各指節の曲げを計算（簡易版：隣接3点での角度）
            parent_pos = lm[parent_id]
            child_pos  = lm[child_id]
            
            # 指の方向ベクトル
            direction = child_pos - parent_pos
            direction = direction / (np.linalg.norm(direction) + 1e-9)
            
            # VRMの指レスト方向（手を開いた状態）に対する回転
            rest_dir = np.array([0, -1, 0])  # VRM座標系で下向き
            q = calc_bone_rotation(parent_pos, child_pos, rest_dir)
            rotations[bone_name] = q
    
    return rotations

7. ノイズ除去・スムージング
pythonfrom collections import deque

class LandmarkSmoother:
    """
    ワンユーロフィルター実装
    低速動作時: 強めのスムージング
    高速動作時: 最小遅延
    """
    def __init__(self, min_cutoff=1.0, beta=0.007, d_cutoff=1.0):
        self.min_cutoff = min_cutoff
        self.beta       = beta
        self.d_cutoff   = d_cutoff
        self.x_prev     = None
        self.dx_prev    = 0.0
        self.t_prev     = None
    
    def __call__(self, x, t):
        if self.x_prev is None:
            self.x_prev = x
            self.t_prev = t
            return x
        
        dt = t - self.t_prev
        if dt <= 0:
            return self.x_prev
        
        # 速度推定
        dx = (x - self.x_prev) / dt
        
        # 速度フィルタ
        a_d  = self._alpha(dt, self.d_cutoff)
        dx_h = a_d * dx + (1 - a_d) * self.dx_prev
        
        # カットオフ周波数を速度に応じて調整
        cutoff = self.min_cutoff + self.beta * abs(dx_h)
        
        # 位置フィルタ
        a   = self._alpha(dt, cutoff)
        x_h = a * x + (1 - a) * self.x_prev
        
        self.x_prev  = x_h
        self.dx_prev = dx_h
        self.t_prev  = t
        return x_h
    
    def _alpha(self, dt, cutoff):
        tau = 1.0 / (2 * np.pi * cutoff)
        return 1.0 / (1.0 + tau / dt)


# 全ボーン分のスムーザーを初期化
smoothers = {bone: LandmarkSmoother() for bone in ALL_VRM_BONES}

8. Python → JavaScript WebSocket通信
8.1 Pythonサーバー (FastAPI)
python# server.py
import asyncio, json, cv2, time
import mediapipe as mp
from fastapi import FastAPI, WebSocket
from fastapi.staticfiles import StaticFiles

app = FastAPI()

@app.websocket("/ws/tracking")
async def tracking_websocket(websocket: WebSocket):
    await websocket.accept()
    
    cap = cv2.VideoCapture("input.mp4")  # or 0 for webcam
    
    with mp.solutions.holistic.Holistic(
        model_complexity=2,
        enable_segmentation=False,
        smooth_landmarks=True,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    ) as holistic:
        
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            
            # MediaPipe処理
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results   = holistic.process(frame_rgb)
            
            # ボーンデータ計算
            bone_data = process_results(results)
            
            # JSON送信
            await websocket.send_json({
                "timestamp": time.time(),
                "bones":     bone_data["bones"],      # {boneName: [x,y,z,w]}
                "blendShapes": bone_data["blendShapes"],  # {name: float}
            })
            
            await asyncio.sleep(1/30)  # 30fps
    
    cap.release()
8.2 JavaScriptクライアント (three-vrm)
javascript// vrmController.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

class VRMTrackingController {
    constructor(scene) {
        this.scene = scene;
        this.vrm   = null;
        this.ws    = null;
    }
    
    async loadVRM(url) {
        const loader = new GLTFLoader();
        loader.register(parser => new VRMLoaderPlugin(parser));
        
        const gltf   = await loader.loadAsync(url);
        this.vrm     = gltf.userData.vrm;
        VRMUtils.removeUnnecessaryJoints(this.vrm.scene);
        this.scene.add(this.vrm.scene);
    }
    
    connectWebSocket(wsUrl) {
        this.ws = new WebSocket(wsUrl);
        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.applyTrackingData(data);
        };
    }
    
    applyTrackingData(data) {
        if (!this.vrm) return;
        const humanoid = this.vrm.humanoid;
        
        // ボーン回転を適用
        for (const [boneName, quat] of Object.entries(data.bones)) {
            const bone = humanoid.getRawBoneNode(boneName);
            if (bone) {
                bone.quaternion.set(quat[0], quat[1], quat[2], quat[3]);
            }
        }
        
        // BlendShapeを適用
        const expressionManager = this.vrm.expressionManager;
        if (expressionManager) {
            for (const [name, value] of Object.entries(data.blendShapes)) {
                expressionManager.setValue(name, value);
            }
        }
        
        this.vrm.update(1/30);
    }
}
```

---

## 9. 座標系変換（重要）
```
MediaPipe座標系:
  X: 右向き正  (0~1, 画面左端=0)
  Y: 下向き正  (0~1, 画面上端=0)
  Z: 手前向き正 (奥行き, スケールはXに依存)

VRM / three.js 座標系:
  X: 右向き正
  Y: 上向き正  ← Yが逆！
  Z: 手前向き正
pythondef mediapipe_to_vrm_coords(landmark):
    """MediaPipe → VRM座標変換"""
    return np.array([
         landmark.x - 0.5,   # 中心を0に
        -(landmark.y - 0.5), # Y軸反転 ← 重要
        -landmark.z          # Z軸反転（奥行き）
    ])
```
