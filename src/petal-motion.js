import { screenVector } from './device-tilt.js';

export const PETAL_MARGIN = 70;
const wrap = (value, size) => ((value + PETAL_MARGIN) % (size + PETAL_MARGIN * 2) + size + PETAL_MARGIN * 2) % (size + PETAL_MARGIN * 2) - PETAL_MARGIN;

export function fallingDirection(sample) {
  if (!sample || !Number.isFinite(sample.beta) || !Number.isFinite(sample.gamma) || !Number.isFinite(sample.angle)) return { x: 0, y: 1 };
  const beta = sample.beta * Math.PI / 180, gamma = sample.gamma * Math.PI / 180;
  // Z-X'-Y'' 旋转矩阵的重力投影；不依赖会在翻转时跳变的欧拉角差值。
  const gravity = screenVector(Math.cos(beta) * Math.sin(gamma), Math.sin(beta), sample.angle);
  const length = Math.hypot(gravity.x, gravity.y);
  // 平放时重力投影接近零，柔和回到自动飘落，避免微小读数决定整个方向。
  const t = Math.max(0, Math.min(1, (length - .06) / .28));
  const weight = t * t * (3 - 2 * t);
  if (!weight) return { x: 0, y: 1 };
  return { x: gravity.x / length * weight, y: gravity.y / length * weight + 1 - weight };
}

/** 对受空气阻力的速度积分；重定向只改目标速度，保留当前位置与惯性。 */
export function advancePetal(petal, seconds, direction, width, height) {
  const decay = Math.exp(-seconds / petal.response);
  const targetX = petal.drift + petal.speed * direction.x;
  const targetY = petal.speed * direction.y;
  petal.x = wrap(petal.x + targetX * seconds + (petal.vx - targetX) * petal.response * (1 - decay), width);
  petal.y = wrap(petal.y + targetY * seconds + (petal.vy - targetY) * petal.response * (1 - decay), height);
  petal.vx = targetX + (petal.vx - targetX) * decay;
  petal.vy = targetY + (petal.vy - targetY) * decay;
}

export function seekPetal(petal, seconds, width, height) {
  petal.x = wrap(petal.originX + seconds * petal.drift, width);
  petal.y = wrap(petal.originY + seconds * petal.speed, height);
  petal.vx = petal.drift; petal.vy = petal.speed;
}
