/**
 * VRMトラッキング用 数学ユーティリティ
 * クォータニオン・ベクトル演算
 */

// ── ベクトル演算 ──────────────────────────────────────────
export const vec3 = {
  fromLandmark(lm) {
    return { x: lm.x, y: lm.y, z: lm.z ?? 0 }
  },

  sub(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
  },

  add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
  },

  scale(v, s) {
    return { x: v.x * s, y: v.y * s, z: v.z * s }
  },

  lerp(a, b, t) {
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t,
    }
  },

  dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z
  },

  cross(a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x,
    }
  },

  length(v) {
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
  },

  normalize(v) {
    const len = vec3.length(v)
    if (len < 1e-9) return { x: 0, y: 1, z: 0 }
    return { x: v.x / len, y: v.y / len, z: v.z / len }
  },

  /** MediaPipe正規化座標 → VRM座標系 */
  mpToVRM(lm) {
    return {
      x: lm.x - 0.5,
      y: -(lm.y - 0.5), // Y反転
      z: -(lm.z ?? 0),
    }
  },
}

// ── クォータニオン演算 ────────────────────────────────────
// クォータニオンは [x, y, z, w] の配列で表現

export const quat = {
  identity() {
    return [0, 0, 0, 1]
  },

  /** 軸角度 → クォータニオン */
  fromAxisAngle(axis, angle) {
    const n = vec3.normalize(axis)
    const s = Math.sin(angle / 2)
    return [n.x * s, n.y * s, n.z * s, Math.cos(angle / 2)]
  },

  /**
   * vec_from → vec_to への最小回転クォータニオン
   * VRMボーンのレスト方向から現在方向への回転に使う
   */
  fromVectors(from, to) {
    const f = vec3.normalize(from)
    const t = vec3.normalize(to)
    const dot = vec3.dot(f, t)

    if (dot > 0.9999) return quat.identity()

    if (dot < -0.9999) {
      // 180度回転: 垂直な軸を探す
      let perp = { x: 1, y: 0, z: 0 }
      if (Math.abs(f.x) > 0.9) perp = { x: 0, y: 1, z: 0 }
      const axis = vec3.normalize(vec3.cross(f, perp))
      return quat.fromAxisAngle(axis, Math.PI)
    }

    const cross = vec3.cross(f, t)
    const w = 1.0 + dot
    const q = [cross.x, cross.y, cross.z, w]
    return quat.normalize(q)
  },

  multiply(a, b) {
    return [
      a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
      a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
      a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
      a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
    ]
  },

  normalize(q) {
    const len = Math.sqrt(q[0] ** 2 + q[1] ** 2 + q[2] ** 2 + q[3] ** 2)
    if (len < 1e-9) return quat.identity()
    return q.map((v) => v / len)
  },

  conjugate(q) {
    return [-q[0], -q[1], -q[2], q[3]]
  },

  /** オイラー角(rad) → クォータニオン (XYZ順) */
  fromEuler(x, y, z) {
    const cx = Math.cos(x / 2),
      sx = Math.sin(x / 2)
    const cy = Math.cos(y / 2),
      sy = Math.sin(y / 2)
    const cz = Math.cos(z / 2),
      sz = Math.sin(z / 2)
    return [
      sx * cy * cz + cx * sy * sz,
      cx * sy * cz - sx * cy * sz,
      cx * cy * sz + sx * sy * cz,
      cx * cy * cz - sx * sy * sz,
    ]
  },

  /** クォータニオン → オイラー角(rad) */
  toEuler(q) {
    const [x, y, z, w] = q
    return {
      x: Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y)),
      y: Math.asin(Math.max(-1, Math.min(1, 2 * (w * y - z * x)))),
      z: Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)),
    }
  },
}

/**
 * 3点から関節角度(曲げ)を計算
 * @param {vec3} parent - 親関節位置
 * @param {vec3} joint  - 対象関節位置
 * @param {vec3} child  - 子関節位置
 * @returns {{ angle: number, axis: vec3 }}
 */
export function calcBendAngle(parent, joint, child) {
  const ba = vec3.normalize(vec3.sub(parent, joint))
  const bc = vec3.normalize(vec3.sub(child, joint))
  const dot = Math.max(-1, Math.min(1, vec3.dot(ba, bc)))
  const angle = Math.acos(dot)
  const axis = vec3.normalize(vec3.cross(ba, bc))
  return { angle, axis }
}

/**
 * ランドマーク配列から [x,y,z] ベクトルを安全取得
 */
export function getLandmark(landmarks, index) {
  if (!landmarks || !landmarks[index]) return { x: 0, y: 0, z: 0 }
  return vec3.mpToVRM(landmarks[index])
}
