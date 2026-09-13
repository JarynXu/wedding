import test from 'node:test';
import assert from 'node:assert/strict';
import { WritingCooldown } from '../src/celebration/writing-cooldown.js';

test('AI按钮结束请求后保留冷却，重建页面恢复剩余时间，冷却期间不能调用',()=>{
  const prior=globalThis.window;globalThis.window=new EventTarget();
  let now=1000,stored=0;
  const button=()=>({dataset:{},style:{setProperty(){}},setAttribute(){}});
  const settings={read:()=>stored,write:value=>{stored=value;},label:()=> 'AI 润色祝福',clock:()=>now};
  const first=new WritingCooldown(button(),settings);let restored;
  try{
    assert.equal(first.button.textContent,'✧ AI');first.wait(20);first.setBusy(true);assert.equal(first.button.dataset.state,'writing');
    first.setBusy(false);assert.equal(first.button.disabled,true);assert.equal(first.button.textContent,'✧ 20s');
    now+=6000;restored=new WritingCooldown(button(),settings);assert.equal(restored.remaining,14);assert.equal(restored.button.disabled,true);
    restored.wait(60);assert.equal(first.remaining,60,'同客户端其他页面也遵守更长的服务端等待');
    now+=60001;restored.refresh();assert.equal(restored.button.disabled,false);assert.equal(restored.button.textContent,'✧ AI');
  }finally{first.destroy();restored?.destroy();globalThis.window=prior;}
});
