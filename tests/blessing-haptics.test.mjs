import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fixture,databaseUrl } from './blessings-fixture.mjs';

test('从祝福表单送出的烟花保留本人身份并在绽放时提供触感',{skip:!databaseUrl&&'需要隔离数据库',timeout:30000},async()=>{
  const f=await fixture(),require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
  const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
  try{
    const {origin}=await f.instance(),page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    await page.addInitScript(()=>{window.vibrations=[];Object.defineProperty(navigator,'vibrate',{value:value=>{window.vibrations.push(value);return true;}});});
    await page.goto(origin);await page.locator('#preloaderOverlay[data-state=ready]').waitFor();await page.locator('#btnEnterInvitation').click();
    await page.locator('#blessingEntry').click();await page.locator('#blessingName').fill('隔离验证者');await page.locator('#blessingMessage').fill('愿你们岁岁相伴');
    await page.locator('.blessing-gift-options [data-gift=fireworks]').click();await page.locator('.blessing-send').click();
    await page.locator('#blessingsModal.open').waitFor({state:'hidden'});await page.waitForFunction(()=>window.vibrations.some(value=>Array.isArray(value)&&value.length>1));
    assert.ok(await page.locator('.blessing-bubble').count()>0);
  }finally{await browser.close();await f.close();}
});
