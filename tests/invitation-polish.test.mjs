import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import express from 'express';
import { createInvitationApp } from '../server/app.js';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const browserOptions={headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})};
const phone={viewport:{width:390,height:752},isMobile:true,hasTouch:true};
const wechat='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0';
const enter=async(page,url)=>{
  await page.goto(url);
  await page.locator('#preloaderOverlay[data-state=ready]').waitFor();
  await page.locator('#btnEnterInvitation').click();
  await page.locator('#preloaderOverlay').waitFor({state:'hidden'});
};
const navigate=async(page,index)=>{
  await page.locator(`.nav-dot[data-index="${index}"]`).click();
  await page.waitForFunction(index=>document.querySelector('.page.active').dataset.index===String(index)&&document.getElementById('swiperWrapper').dataset.transition==='idle',index);
};
const settle=async(page,selector)=>page.locator(selector).evaluate(element=>Promise.allSettled(element.getAnimations({subtree:true}).filter(animation=>animation.effect.getTiming().iterations!==Infinity).map(animation=>animation.finished)));
const appFixture=async()=>{
  const app=express();
  app.get('/api/game/config',(_req,res)=>res.json({enabled:true,phase:'open'}));
  app.get('/api/blessings/config',(_req,res)=>res.json({enabled:true,aiWritingEnabled:true}));
  app.get('/api/blessings/stream',(_req,res)=>{
    res.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache'});
    res.write('event: sync\ndata: {"cursor":"0","messages":[]}\n\n');
  });
  app.get('/api/blessings/history',(_req,res)=>res.json({messages:[],hasMore:false}));
  app.post('/api/blessings/polish',(_req,res)=>res.json({text:'一起把三餐四季过成喜欢的模样。',retryAfter:20}));
  app.use(createInvitationApp());
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  return {origin:`http://127.0.0.1:${server.address().port}`,async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
};

test('两套请柬的材质入场、右下挑战、祝福提醒与倾斜流光',{timeout:90000},async suite=>{
  const f=await appFixture(),browser=await chromium.launch(browserOptions);
  await mkdir('.temp/polish-qa',{recursive:true});
  try {
    for(const theme of ['classic','chinese']) await suite.test(theme,async()=>{
      const page=await browser.newPage(phone),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      try {
        await enter(page,`${f.origin}/?theme=${theme}`);
        for(const [index,selector] of [[1,'.p2-calendar-wrap'],[2,'.p3-map-btn-wrap']]) {
          await navigate(page,index);
          const samples=await page.locator(selector).evaluate(element=>{
            const animation=element.getAnimations()[0],timing=animation.effect.getTiming();animation.pause();
            return [.05,.5,.99,1].map(fraction=>{
              animation.currentTime=timing.delay+timing.duration*fraction;
              const style=getComputedStyle(element),button=getComputedStyle(element.querySelector('button'));
              return {opacity:style.opacity,backdrop:button.backdropFilter,background:button.backgroundImage};
            });
          });
          assert.ok(samples.every(sample=>sample.opacity==='1'));
          assert.ok(samples.every(sample=>sample.background===samples[0].background&&sample.backdrop===samples[0].backdrop));
        }
        await navigate(page,1);
        assert.deepEqual(await page.locator('.p2-agenda-row').allTextContents().then(rows=>rows.map(row=>row.replace(/\s+/g,' ').trim())),['11:30 宾客进场','12:08 婚礼仪式']);
        await page.locator('.p2-date-box').evaluate(element=>Promise.all(element.getAnimations().map(animation=>animation.finished)));
        await page.evaluate(()=>window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',{beta:40,gamma:0})));
        const before=await page.locator('#p2Day').evaluate(element=>({rect:element.getBoundingClientRect().toJSON(),ink:getComputedStyle(element).backgroundImage}));
        await page.evaluate(()=>window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',{beta:45,gamma:23})));
        await page.waitForFunction(ink=>getComputedStyle(document.getElementById('p2Day')).backgroundImage!==ink,before.ink);
        const after=await page.locator('#p2Day').evaluate(element=>element.getBoundingClientRect().toJSON());
        assert.deepEqual(after,before.rect,'感应只改变反光，文字不倾斜、不位移');
        await page.evaluate(()=>window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',{beta:40,gamma:0})));
        await page.screenshot({path:`.temp/polish-qa/${theme}-time.png`});
        await navigate(page,3);
        await page.locator('#gameEntry:not([hidden])').waitFor();
        for(const viewport of [{width:320,height:568},{width:390,height:752},{width:430,height:932}]) {
          await page.setViewportSize(viewport);
          const layout=await page.evaluate(()=>{
            const app=document.getElementById('app').getBoundingClientRect(),entry=document.getElementById('gameEntry'),button=entry.getBoundingClientRect(),dock=document.querySelector('.blessing-dock').getBoundingClientRect();
            return {right:app.right-button.right,bottom:app.bottom-button.bottom,width:button.width,height:button.height,clear:button.bottom<dock.top,hittable:document.elementFromPoint(button.x+button.width/2,button.y+button.height/2)?.closest('#gameEntry')!==null,animated:getComputedStyle(entry,'::before').animationName};
          });
          assert.ok(layout.right>=12&&layout.right<=24&&layout.bottom>=70&&layout.bottom<110,JSON.stringify(layout));
          assert.ok(layout.width>=160&&layout.height>=56&&layout.clear&&layout.hittable,JSON.stringify(layout));
          assert.equal(layout.animated,'action-glint');
        }
        await page.setViewportSize(phone.viewport);
        await settle(page,'.page-4');
        await page.screenshot({path:`.temp/polish-qa/${theme}-challenge.png`});
        await page.locator('#blessingEntry').click();
        const ai=page.locator('.blessing-ai-write');
        assert.match(await ai.innerText(),/AI 写祝福/);
        assert.equal(await ai.evaluate(element=>getComputedStyle(element,'::before').animationName),'action-glint');
        await settle(page,'#blessingsModal');
        await page.screenshot({path:`.temp/polish-qa/${theme}-blessings.png`});
        await ai.click();
        await page.waitForFunction(()=>document.getElementById('blessingMessage').value.includes('三餐四季'));
        assert.equal(await ai.isDisabled(),true);
        assert.equal(await ai.evaluate(element=>getComputedStyle(element,'::before').animationName),'none');
        await page.emulateMedia({reducedMotion:'reduce'});
        assert.equal(await page.locator('#app').evaluate(element=>element.classList.contains('foil-enabled')),false);
        assert.equal(await page.locator('#gameEntry').evaluate(element=>getComputedStyle(element,'::before').animationName),'none');
        assert.deepEqual(errors,[]);
      } finally {await page.close();}
    });
    await suite.test('传感器授权只由专用按钮触发，拒绝后继续显示自动流光',async()=>{
      const page=await browser.newPage(phone);
      try {
        await page.addInitScript(()=>{
          window.permissionCalls=0;
          DeviceOrientationEvent.requestPermission=async()=>{window.permissionCalls++;return 'denied';};
        });
        await enter(page,f.origin);
        assert.equal(await page.evaluate(()=>window.permissionCalls),0);
        await page.locator('.foil-permission').click();
        assert.equal(await page.evaluate(()=>window.permissionCalls),1);
        assert.equal(await page.locator('.foil-permission').isVisible(),false);
        assert.match(await page.locator('#copyToast').innerText(),/自动流光/);
        assert.equal(await page.locator('#app').evaluate(element=>element.classList.contains('foil-enabled')),true);
      } finally {await page.close();}
    });
  } finally {await browser.close();await f.close();}
});

test('日历真实往返恢复音乐，页面快照与完整重建都保留手动暂停',{timeout:90000},async suite=>{
  const f=await appFixture();
  try {
    for(const cached of [false,true]) await suite.test(cached?'页面快照':'完整重建',async()=>{
      const browser=await chromium.launch({...browserOptions,...(cached?{ignoreDefaultArgs:['--disable-back-forward-cache']}:{})});
      try {
        const page=await browser.newPage({...phone,userAgent:wechat,reducedMotion:'reduce'});
        const cacheFailures=[],protocol=await page.context().newCDPSession(page);
        await protocol.send('Page.enable');protocol.on('Page.backForwardCacheNotUsed',event=>cacheFailures.push(event.notRestoredExplanations));
        await enter(page,f.origin+'/?theme=chinese');
        await page.waitForFunction(()=>!document.getElementById('bgm').paused);
        const index=await page.locator('#bgm').getAttribute('data-track-index');
        await page.evaluate(()=>{
          window.restoredFromMemory=false;
          window.addEventListener('pageshow',event=>{window.restoredFromMemory=event.persisted;});
        });
        const roundtrip=async()=>{
          await navigate(page,1);
          await page.locator('.calendar-button').click();
          await page.locator('[data-action=system-calendar]').click();
          await page.waitForURL('**/calendar.html?**');
          await page.locator('.back-link').click();
          await page.locator('.page-2.active').waitFor();
          await page.locator('#preloaderOverlay').waitFor({state:'hidden'});
        };
        await roundtrip();
        await page.waitForFunction(()=>!document.getElementById('bgm').paused);
        assert.equal(await page.locator('#bgm').getAttribute('data-track-index'),index);
        if(cached)assert.equal(await page.evaluate(()=>window.restoredFromMemory),true,JSON.stringify(cacheFailures));
        const time=await page.locator('#bgm').evaluate(audio=>audio.currentTime);
        await page.waitForFunction(time=>document.getElementById('bgm').currentTime>time+.05,time);
        await page.locator('#musicBtn').click();
        await roundtrip();
        assert.equal(await page.locator('#bgm').evaluate(audio=>audio.paused),true);
        await page.locator('.nav-dot[data-index="2"]').click();
        assert.equal(await page.locator('#bgm').evaluate(audio=>audio.paused),true);
      } finally {await browser.close();}
    });
  } finally {await f.close();}
});
