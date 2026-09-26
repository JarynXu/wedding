import test from 'node:test';
import assert from 'node:assert/strict';
import { WeddingMusic } from '../src/music.js';
import { MusicContinuity } from '../src/music-continuity.js';

function fixture() {
  const audio = Object.assign(new EventTarget(), {
    paused:true, ended:false, currentTime:23, dataset:{}, calls:0,
    play() { this.calls++; this.paused=false; this.dispatchEvent(new Event('playing')); return Promise.resolve(); },
    pause() { this.paused=true; this.dispatchEvent(new Event('pause')); },
    load() {}, removeAttribute() {},
  });
  const music = new WeddingMusic({audio,theme:'classic'});
  music.prepared=true;
  music.tracks=[{title:'A',objectUrl:'blob:a'},{title:'B',objectUrl:'blob:b'}];
  const host = Object.assign(new EventTarget(), {
    document:Object.assign(new EventTarget(), {hidden:false}),
    history:{state:{invitation:{entered:true,page:1}},replaceState(value) { this.state=value; }},
  });
  const continuity = new MusicContinuity(music,host);
  return {audio,music,host,close() { continuity.destroy(); music.destroy(); }};
}

test('日历中断后恢复同一曲目，重复恢复事件不重新加载或重播', async () => {
  const f=fixture();
  try {
    await f.music.playTrack(1);
    f.audio.pause();
    f.host.dispatchEvent(new Event('pagehide'));
    assert.deepEqual(f.host.history.state.invitation.music,{playing:true,index:1,time:23,nextOnPlay:false});
    f.host.dispatchEvent(new Event('pageshow'));
    f.host.dispatchEvent(new Event('focus'));
    await Promise.resolve();
    assert.equal(f.audio.paused,false);
    assert.equal(f.audio.calls,2);
    assert.equal(f.music.index,1);
    assert.equal(f.audio.currentTime,23);
  } finally { f.close(); }
});

test('手动暂停不会被返回、切换前后台或普通点击唤醒', async () => {
  const f=fixture();
  try {
    await f.music.play(); f.music.pause();
    f.host.dispatchEvent(new Event('pagehide'));
    f.host.dispatchEvent(new Event('pageshow'));
    f.host.document.dispatchEvent(new Event('pointerdown'));
    f.host.document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(f.audio.paused,true);
    assert.equal(f.audio.calls,1);
    assert.equal(f.host.history.state.invitation.music.playing,false);
    await f.music.restore(f.host.history.state.invitation.music);
    assert.equal(f.audio.paused,true);
    await f.music.play();
    assert.equal(f.music.index,1,'仍保留主动暂停后顺序切歌的原有行为');
  } finally { f.close(); }
});

test('完整重建恢复播放进度，自动播放被拒绝后在下一次手势重试', async () => {
  const f=fixture();
  try {
    const native=f.audio.play;
    f.audio.play=()=>Promise.reject(new DOMException('需要手势','NotAllowedError'));
    assert.equal(await f.music.restore({playing:true,index:1,time:37}),false);
    f.audio.play=native;
    f.host.document.dispatchEvent(new Event('pointerdown'));
    await Promise.resolve();
    assert.equal(f.audio.paused,false);
    assert.equal(f.music.index,1);
    assert.equal(f.audio.currentTime,37);
  } finally { f.close(); }
});
