import test from 'node:test';
import assert from 'node:assert/strict';
import { advancePetal, fallingDirection, PETAL_MARGIN } from '../src/petal-motion.js';

const near = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≈ ${expected}`);
const petal = () => ({ x: 200, y: 200, vx: 8, vy: 40, drift: 8, speed: 40, response: .5 });
const run = (particle, seconds, direction, fps = 60) => {
  for (let frame = 0; frame < seconds * fps; frame++) advancePetal(particle, 1 / fps, direction, 2000, 2000);
};

test('重力投影随屏幕方向变换，平放和无读数时自然向下', () => {
  for (const sample of [null, { beta: null, gamma: 0, angle: 0 }, { beta: 0, gamma: 0, angle: 0 }, { beta: .2, gamma: -.2, angle: 0 }]) {
    assert.deepEqual(fallingDirection(sample), { x: 0, y: 1 });
  }
  for (const [beta, gamma, angle, x, y] of [
    [90, 0, 0, 0, 1], [0, 90, 0, 1, 0], [0, -90, 0, -1, 0], [-90, 0, 0, 0, -1],
    [0, 90, 270, 0, 1], [0, -90, 90, 0, 1], [-90, 0, 180, 0, 1],
  ]) {
    const direction = fallingDirection({ beta, gamma, angle });
    near(direction.x, x); near(direction.y, y);
  }
  const left = fallingDirection({ beta: 35, gamma: -30, angle: 0 });
  const right = fallingDirection({ beta: 35, gamma: 30, angle: 0 });
  near(left.x, -right.x); near(left.y, right.y);
});

test('倾斜反向保留位置和惯性，随后平滑转向', () => {
  const particle = petal();
  run(particle, 2, { x: 1, y: 0 });
  const before = { ...particle };
  advancePetal(particle, 1 / 60, { x: -1, y: 0 }, 2000, 2000);
  assert.ok(particle.vx > 0 && particle.vx < before.vx, '首帧减速，不能立即翻转速度');
  assert.ok(particle.x > before.x && particle.x - before.x < 1, '方向变化不能移动到另一条轨迹');
  run(particle, 2, { x: -1, y: 0 });
  assert.ok(particle.vx < -28, '持续向左倾斜后，已在下落的花瓣也要转向左侧');
});

test('同一倾斜过程在 30、60、120 Hz 下具有相同轨迹', () => {
  const results = [30, 60, 120].map(fps => {
    const particle = petal();
    for (const direction of [{ x: .8, y: .6 }, { x: -.8, y: .6 }, { x: 0, y: 1 }]) run(particle, 1, direction, fps);
    return particle;
  });
  for (const particle of results.slice(1)) for (const key of ['x', 'y', 'vx', 'vy']) near(particle[key], results[0][key]);
});

test('无倾斜时沿用原速度，各个屏幕边界均在画外循环', () => {
  const particle = petal();
  run(particle, 1, { x: 0, y: 1 });
  near(particle.x, 208); near(particle.y, 240);
  for (const [x, y, vx, vy] of [[-69, 200, -100, 0], [2069, 200, 100, 0], [200, -69, 0, -100], [200, 2069, 0, 100]]) {
    const edge = { ...petal(), x, y, vx, vy };
    advancePetal(edge, .05, { x: vx / 100, y: vy / 100 }, 2000, 2000);
    assert.ok(edge.x >= -PETAL_MARGIN && edge.x <= 2000 + PETAL_MARGIN);
    assert.ok(edge.y >= -PETAL_MARGIN && edge.y <= 2000 + PETAL_MARGIN);
    assert.ok(edge.x < 0 || edge.x > 2000 || edge.y < 0 || edge.y > 2000, '画外循环不能把花瓣移入阅读区');
  }
});
