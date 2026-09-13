import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

test('本人烟花在绽放时请求触感，其他宾客烟花及减少动态效果不振动',{timeout:30000},async()=>{
  const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
  const vite=await createServer({server:{host:'127.0.0.1',port:0,hmr:false},logLevel:'silent'});await vite.listen();
  const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    await page.route('**/api/game/**',route=>route.fulfill({json:{enabled:false}}));
    await page.addInitScript(()=>{window.vibrations=[];Object.defineProperty(navigator,'vibrate',{value:value=>{window.vibrations.push(value);return true;}});});
    await page.goto('http://127.0.0.1:'+vite.httpServer.address().port+'/game.html');
    await page.evaluate(async()=>{
      const {GiftEffects}=await import('/src/celebration/gift-effects.js');
      const stage=document.createElement('div');stage.style.cssText='position:fixed;inset:0;pointer-events:none';const canvas=document.createElement('canvas');stage.append(canvas);document.body.append(stage);window.effects=new GiftEffects(canvas,'chinese');
      const button=document.createElement('button');button.id='testFirework';button.textContent='烟花';button.style.cssText='position:fixed;bottom:30px;right:30px;z-index:99999';button.onclick=()=>window.effects.play('fireworks',{local:true});document.body.append(button);
    });
    await page.locator('#testFirework').click();await page.waitForFunction(()=>window.vibrations.some(value=>Array.isArray(value)&&value.length>1));
    const before=await page.evaluate(()=>{window.effects.clear();const count=window.vibrations.length;window.effects.play('fireworks');return count;});
    await page.waitForTimeout(700);assert.equal(await page.evaluate(()=>window.vibrations.length),before);
    await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#testFirework').click();assert.equal(await page.evaluate(()=>window.vibrations.length),before);
  }finally{await browser.close();await vite.close();}
});
