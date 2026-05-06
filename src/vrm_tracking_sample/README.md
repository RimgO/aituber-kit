# VRM Full-Body Tracker

MediaPipe Holistic + three-vrm を用いた全身VRMトラッキングシステム。  
**JavaScriptのみ** — サーバー不要、ブラウザだけで動作します。

---

## 機能

| 機能 | 詳細 |
|------|------|
| **全身トラッキング** | 上半身・下半身・手指・顔・表情すべて対応 |
| **入力** | Webカメラ（リアルタイム）+ 動画ファイル（.mp4等）|
| **出力** | WebGLでVRMアニメーション + BVHファイルダウンロード |
| **スムージング** | One Euro Filterでノイズ除去 |
| **鏡モード** | 自撮り映像の左右反転 |

---

## セットアップ

### 方法① ローカルサーバー（推奨）

```bash
# Node.js がある場合
npx serve .

# Python がある場合
python -m http.server 8080
```

ブラウザで `http://localhost:8080` を開く。

### 方法② VS Code の Live Server 拡張

拡張機能「Live Server」をインストールして `index.html` を右クリック → 「Open with Live Server」

> ⚠️ **ファイルを直接ダブルクリックでは動作しません**  
> MediaPipeはHTTPサーバー経由でのみ動作します。

---

## 使い方

1. **VRMファイルを読み込む** — 左パネルのドロップゾーンにVRMをドラッグ&ドロップ
2. **入力ソースを選択**
   - `📷 Webカメラ` ボタン → カメラ許可を承認
   - 動画ファイルをドロップ → 自動再生 & トラッキング開始
3. **BVH録画**（オプション）
   - `⏺ 録画開始` → 動作を録画
   - `⏹ 停止` → 録画終了
   - `💾 BVHダウンロード` → .bvhファイルを保存

---

## トラッキング仕様

### 身体ボーン対応表

| 部位 | VRMボーン | MediaPipe入力 |
|------|-----------|---------------|
| 腰 | hips | landmark 23,24 (hips) |
| 脊椎 | spine/chest/upperChest | 肩-腰 補間 |
| 首・頭 | neck, head | FaceMesh yaw/pitch/roll |
| 上腕 | leftUpperArm / rightUpperArm | 肩→肘ベクトル |
| 前腕 | leftLowerArm / rightLowerArm | 肘の曲げ角度 |
| 手首 | leftHand / rightHand | 手平面の向き |
| 指 | thumb/index/.../little × L/R | Hands 21点 |
| 大腿 | leftUpperLeg / rightUpperLeg | 腰→膝ベクトル |
| 下腿 | leftLowerLeg / rightLowerLeg | 膝の曲げ角度 |
| 足首 | leftFoot / rightFoot | 踵→爪先ベクトル |
| つま先 | leftToes / rightToes | 足首→爪先 |

### 表情 (BlendShape)

| VRM表情 | 計算方法 |
|---------|---------|
| blinkLeft/Right | FaceMesh上下瞼の距離 |
| aa（あ） | 口の上下開き量 |
| happy（笑顔） | 口角の上がり具合 |

---

## 設定パラメーター

| パラメーター | デフォルト | 説明 |
|------------|-----------|------|
| スムージング | 0.35 | 0=即時、1=固定。ノイズと応答性のトレードオフ |
| モデル精度 | 1 | 0=軽量、1=標準、2=高精度（CPU負荷大） |
| 手指トラッキング | ON | OFFで負荷軽減 |
| 顔・表情 | ON | OFFで顔固定 |
| 鏡モード | ON | Webカメラ使用時はONを推奨 |

---

## トラブルシューティング

**MediaPipeが初期化されない**  
→ ブラウザを更新、またはローカルサーバー経由でアクセスしているか確認

**VRMが表示されない**  
→ VRM 0.x / 1.x 両対応。ファイルが破損していないか確認

**トラッキングがガタガタ**  
→ スムージングスライダーを右（高め）に調整。照明を明るくする

**BVHが正しく再生されない**  
→ Blender等でインポート時、スケール0.01、Y-upで設定

---

## ファイル構成

```
vrm-tracker/
├── index.html          ← メインアプリ（これだけで動作）
└── src/                ← モジュール分割版（参考用）
    ├── math-utils.js   ← ベクトル・クォータニオン演算
    ├── smoother.js     ← One Euro Filter
    ├── mediapipe-tracker.js ← トラッキングコア
    ├── vrm-controller.js    ← VRM制御
    └── bvh-exporter.js      ← BVH書き出し
```

> 実際の動作は `index.html` 単体で完結しています。  
> `src/` 配下は保守性向上のためのモジュール分割版です。
