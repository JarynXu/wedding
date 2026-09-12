import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

test('榜单更新名次时保留阅读位置，长名单不需要滚到底才能刷新',{timeout:30000},async()=>{
  const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
  const vite=await createServer({server:{host:'127.0.0.1',port:0,hmr:false},logLevel:'silent'});await vite.listen();
  const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}});
    await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/game.html`);await page.locator('#gameApp[data-state=ready]').waitFor();
    const reading=await page.evaluate(async()=>{
      const {LeaderboardView}=await import('/src/game/leaderboard.js');const board=new LeaderboardView();
      document.querySelector('#gameApp').dataset.view='board';const content=document.querySelector('#gameContent');content.dataset.mode='board';content.replaceChildren(board.root);
      const entries=Array.from({length:80},(_,i)=>({id:'person-'+i,rank:i+1,name:'来宾'+i,score:Math.max(0,6-Math.floor(i/15))}));board.update({entries});board.list.scrollTop=640;
      const box=board.list.getBoundingClientRect(),anchor=[...board.list.children].find(row=>row.getBoundingClientRect().bottom>box.top);const before=anchor.getBoundingClientRect().top;
      const previous=board.list.children[0];board.update({entries:[entries.at(-1),...entries.slice(0,-1)].map((entry,i)=>({...entry,rank:i+1}))});
      return {delta:anchor.getBoundingClientRect().top-before,retained:previous===board.list.children[1],height:document.body.scrollHeight,viewport:innerHeight,rows:board.list.children.length};
    });
    assert.ok(Math.abs(reading.delta)<1);assert.equal(reading.retained,true);assert.equal(reading.rows,80);assert.equal(reading.height,reading.viewport);
  }finally{await browser.close();await vite.close();}
});
