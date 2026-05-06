/**
 * One Euro Filter - 低速時は強めのスムージング、高速時は最小遅延
 * 参考: https://cristal.univ-lille.fr/~casiez/1euro/
 */
export class OneEuroFilter {
  constructor(minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
    this.minCutoff = minCutoff
    this.beta = beta
    this.dCutoff = dCutoff
    this.xPrev = null
    this.dxPrev = 0
    this.tPrev = null
  }

  alpha(dt, cutoff) {
    const tau = 1.0 / (2 * Math.PI * cutoff)
    return 1.0 / (1.0 + tau / dt)
  }

  filter(x, t) {
    if (this.xPrev === null) {
      this.xPrev = x
      this.tPrev = t
      return x
    }
    const dt = Math.max(t - this.tPrev, 1e-9)
    const dx = (x - this.xPrev) / dt
    const aD = this.alpha(dt, this.dCutoff)
    const dxHat = aD * dx + (1 - aD) * this.dxPrev
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat)
    const a = this.alpha(dt, cutoff)
    const xHat = a * x + (1 - a) * this.xPrev
    this.xPrev = xHat
    this.dxPrev = dxHat
    this.tPrev = t
    return xHat
  }

  reset() {
    this.xPrev = null
    this.dxPrev = 0
    this.tPrev = null
  }
}

/**
 * 3D座標用スムーザー (x,y,z 各軸独立)
 */
export class Vec3Smoother {
  constructor(minCutoff = 1.0, beta = 0.007) {
    this.fx = new OneEuroFilter(minCutoff, beta)
    this.fy = new OneEuroFilter(minCutoff, beta)
    this.fz = new OneEuroFilter(minCutoff, beta)
  }

  filter(v, t) {
    return {
      x: this.fx.filter(v.x, t),
      y: this.fy.filter(v.y, t),
      z: this.fz.filter(v.z, t),
    }
  }

  reset() {
    this.fx.reset()
    this.fy.reset()
    this.fz.reset()
  }
}

/**
 * クォータニオン用スムーザー (slerp ベース)
 */
export class QuatSmoother {
  constructor(factor = 0.5) {
    this.factor = factor // 0=即時, 1=変化なし
    this.prev = null
  }

  filter(q) {
    if (!this.prev) {
      this.prev = [...q]
      return q
    }
    // 最短経路を選択
    const dot =
      q[0] * this.prev[0] +
      q[1] * this.prev[1] +
      q[2] * this.prev[2] +
      q[3] * this.prev[3]
    const sign = dot < 0 ? -1 : 1
    const t = 1 - this.factor
    const result = [
      this.prev[0] + t * (sign * q[0] - this.prev[0]),
      this.prev[1] + t * (sign * q[1] - this.prev[1]),
      this.prev[2] + t * (sign * q[2] - this.prev[2]),
      this.prev[3] + t * (sign * q[3] - this.prev[3]),
    ]
    const len = Math.sqrt(result.reduce((s, v) => s + v * v, 0))
    const norm = result.map((v) => v / len)
    this.prev = norm
    return norm
  }

  reset() {
    this.prev = null
  }
}

/**
 * 全ボーン用スムーザーを一括管理
 */
export class BoneSmoothers {
  constructor(boneNames, quatFactor = 0.4) {
    this.smoothers = {}
    for (const name of boneNames) {
      this.smoothers[name] = new QuatSmoother(quatFactor)
    }
  }

  filter(boneName, quat) {
    if (!this.smoothers[boneName]) {
      this.smoothers[boneName] = new QuatSmoother(0.4)
    }
    return this.smoothers[boneName].filter(quat)
  }

  reset() {
    for (const s of Object.values(this.smoothers)) s.reset()
  }
}
