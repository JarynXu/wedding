import test from 'node:test';
import assert from 'node:assert/strict';
import { HapticFeedback } from '../src/haptics.js';

test('触感反馈检查设备能力、前台、用户手势与节奏，不替代业务结果',()=>{
  let now=1000;const calls=[],document=new EventTarget();document.hidden=false;
  const motion={matches:false},host={document,matchMedia:()=>motion,navigator:{userActivation:{hasBeenActive:false},vibrate:value=>{calls.push(value);return true;}}};
  const haptics=new HapticFeedback(host,()=>now);
  try{
    assert.equal(haptics.pulse('tap'),false);assert.equal(calls.length,0);
    host.navigator.userActivation.hasBeenActive=true;assert.equal(haptics.pulse('tap'),true);
    assert.equal(haptics.pulse('tap'),false);now+=150;assert.equal(haptics.pulse('correct'),true);
    assert.ok(calls[1].length>calls[0].length);now+=500;motion.matches=true;assert.equal(haptics.pulse('fireworks'),false);
    motion.matches=false;document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));assert.equal(calls.at(-1),0);
    assert.equal(haptics.pulse('send'),false);document.hidden=false;host.navigator.vibrate=undefined;assert.equal(haptics.pulse('tap'),false);
  }finally{haptics.destroy();}
});
