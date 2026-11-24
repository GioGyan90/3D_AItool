// P0 interactive acceptance for vertex edge slide + session-local region locks.
// Actual Chromium / WebGL; artifacts deliberately remain separate from product presets.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';

const out='artifacts/topology-edge-lock';
await mkdir(out,{recursive:true});
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','3011','--strictPort'],{stdio:'ignore'});
let browser;
const report={checks:[],screenshots:[],errors:[]};
try{
 let ready=false;
 for(let i=0;i<50;i++){
  if(server.exitCode!==null)throw Error('Vite exited before acceptance');
  try{const r=await fetch('http://127.0.0.1:3011/');if(r.ok){ready=true;break}}catch{}
  await new Promise(r=>setTimeout(r,400));
 }
 assert.ok(ready,'Vite editor did not become ready');
 const bin=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
 assert.ok(bin,'GitHub runner lacks Chromium / Chrome');
 browser=await chromium.launch({executablePath:bin,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 page.on('pageerror',e=>report.errors.push(String(e)));
 await page.goto('http://127.0.0.1:3011/',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'布线建模',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:/场景顶点编辑/});
 await dialog.waitFor();
 await dialog.getByText(/8 顶点 \/ 6 面/).first().waitFor();
 await dialog.getByRole('button',{name:'展开精确选择'}).click();
 const selected=dialog.getByLabel('选择顶点编号');
 await selected.fill('0');
 await dialog.getByText('顶点 #0 · 精确坐标',{exact:false}).waitFor();
 const locks=dialog.locator('summary').filter({hasText:'区域锁定'}).locator('..');
 const slide=dialog.locator('summary').filter({hasText:'顶点沿边滑动'}).locator('..');
 await locks.locator('summary').click();
 await slide.locator('summary').click();
 const target=dialog.getByLabel('滑动目标点');
 await target.selectOption({index:1});
 assert.equal(await dialog.getByLabel('沿边滑动比例').inputValue(),'0.25');
 const view=dialog.getByLabel('3D 旋转预览');
 const snapshot=async(name)=>{
  const canvas=view.locator('canvas');await canvas.waitFor();
  assert.ok(await canvas.evaluate(c=>!!(c.getContext('webgl2')||c.getContext('webgl'))),'WebGL context missing');
  const path=`${out}/${name}.png`;await view.screenshot({path,animations:'disabled'});
  const size=(await stat(path)).size;assert.ok(size>3500,`Empty WebGL screenshot ${name}`);
  report.screenshots.push({name,path,size});
  if(['01-before','03-slid','07-open-edge-chain-slid'].includes(name)){
   const jpg=await view.screenshot({type:'jpeg',quality:30,animations:'disabled'});
   console.log('EDGE_LOCK_VISUAL_JPEG_'+name+':'+jpg.toString('base64'));
  }
 };
 await snapshot('01-before');
 await locks.getByRole('button',{name:'锁定当前选择'}).click();
 await locks.getByText('#0 ×').waitFor();
 report.checks.push('Region-locking selected vertex is visible');
 await snapshot('02-locked');
 await slide.getByRole('button',{name:'应用沿边滑动'}).click();
 await dialog.getByText(/锁定顶点 #0/).waitFor();
 report.checks.push('Protected vertex refuses edge sliding');
 await locks.getByRole('button',{name:'解除全部锁定'}).click();
 await slide.getByRole('button',{name:'应用沿边滑动'}).click();
 await dialog.getByText(/沿边滑动完成/).waitFor();
 await dialog.getByText(/8 顶点 \/ 6 面/).first().waitFor();
 report.checks.push('Unlocked edge slide preserves vertex and face counts');
 await snapshot('03-slid');
 await dialog.getByRole('button',{name:'撤销',exact:true}).click();
 await dialog.getByText(/8 顶点 \/ 6 面/).first().waitFor();
 await snapshot('04-undo');
 await dialog.getByRole('button',{name:'重做',exact:true}).click();
 await dialog.getByText(/8 顶点 \/ 6 面/).first().waitFor();
 await snapshot('05-redo');
 report.checks.push('Undo and redo still operate after unlocking');
 await selected.fill('1');
 const current=await target.inputValue();
 assert.ok(!current || await target.locator('option').evaluateAll((els,value)=>els.some(el=>el.value===value),current),'Stale slide target was not represented by dropdown');
 await locks.getByRole('button',{name:'锁定当前选择'}).click();
 await dialog.getByRole('button',{name:'撤销',exact:true}).click();
 await dialog.getByText(/请先解锁再撤销/).waitFor();
 report.checks.push('Undo of a protected edit is refused explicitly');
 await snapshot('06-protected-undo');

 // P1 acceptance: connected two-vertex edge chain with guide-side quad strip.
 await locks.getByRole('button',{name:'解除全部锁定'}).click();
 const ring=dialog.locator('summary').filter({hasText:'整条环线滑动'}).locator('..');
 await selected.fill('4');
 await ring.locator('summary').click();
 await ring.getByRole('button',{name:'追加当前顶点'}).click();
 await selected.fill('5');
 await ring.getByRole('button',{name:'追加当前顶点'}).click();
 await ring.getByText('有序链：#4 → #5').waitFor();
 await ring.getByLabel('环线引导顶点编号').selectOption('7');
 await ring.getByLabel('整条环线滑动比例').fill('0.25');
 await ring.getByLabel('环线滑动预估偏差').waitFor();
 await ring.getByRole('button',{name:'应用整条环线滑动'}).click();
 await dialog.getByText('连续环线滑动完成').waitFor();
 await dialog.getByText(/8 顶点 \/ 6 面/).first().waitFor();
 await snapshot('07-open-edge-chain-slid');
 report.checks.push('Real WebGL: open edge-chain guided slide, deviation preview and unchanged topology');
 await dialog.getByRole('button',{name:'撤销',exact:true}).click();
 await dialog.getByText(/8 顶点 \/ 6 面/).first().waitFor();
 await snapshot('08-edge-chain-undo');
 report.checks.push('Guided edge-chain slide is undoable');

 assert.deepEqual(report.errors,[],'Browser JavaScript errors');
 console.log('EDGE_LOCK_ACCEPTANCE_SUCCESS',JSON.stringify(report));
}finally{
 await writeFile(out+'/report.json',JSON.stringify(report,null,2));
 await browser?.close();
 server.kill('SIGTERM');
}
