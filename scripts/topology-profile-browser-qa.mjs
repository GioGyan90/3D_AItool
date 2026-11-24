// P0 profile QA: run two independent cross sections in the real browser and compare WebGL canvases.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,stat,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';

const folder='artifacts/topology-profile-browser';
await mkdir(folder,{recursive:true});
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','3013','--strictPort'],{stdio:'ignore'});
let browser;
const result={checks:[],screenshots:[],errors:[]};
try{
 let ready=false;
 for(let i=0;i<50;i++){
  if(server.exitCode!==null)throw Error('Vite stopped early');
  try{const r=await fetch('http://127.0.0.1:3013');if(r.ok){ready=true;break;}}catch{}
  await new Promise(r=>setTimeout(r,400));
 }
 assert.ok(ready,'Profile QA editor was not started');
 const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
 assert.ok(executablePath,'Chrome not found');
 browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1});
 page.on('pageerror',e=>result.errors.push(String(e)));
 await page.goto('http://127.0.0.1:3013',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'顶点对照',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:/顶点参考对照/});
 await dialog.waitFor();
 const vertices=[];
 for(let y=0;y<3;y++)for(let x=0;x<3;x++)vertices.push([x-1,y,x===1?(.75-.03*y):1]);
 const faces=[];
 for(let y=0;y<2;y++)for(let x=0;x<2;x++){const a=y*3+x;faces.push([a,a+1,a+4,a+3]);}
 const fixture={vertices,faces};
 await dialog.getByLabel('导入顶点 JSON').setInputFiles({name:'temporary-profile-qa.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
 await dialog.getByText(/9 顶点 \/ 4 面/).first().waitFor();
 await dialog.getByRole('button',{name:'塑形',exact:true}).click();
 const profile=dialog.locator('summary').filter({hasText:'局部曲面校准 · 截面'}).locator('..');
 await profile.locator('summary').first().click();
 await profile.getByRole('checkbox',{name:/同时修正X镜像点/}).uncheck();
 await profile.getByLabel('截面起点编号').fill('0');
 await profile.getByLabel('截面终点编号').fill('2');
 const scanner=profile.locator('summary').filter({hasText:'自动检测截面偏差'}).locator('..');
 await scanner.locator('summary').click();
 await scanner.getByRole('button',{name:'检测并选择偏差点'}).click();
 await scanner.getByText(/检测到 1 个偏差点/).waitFor();
 assert.equal(await profile.getByLabel('截面中间点编号').inputValue(),'1');
 result.checks.push('Real UI detected one connected depressed vertex in a narrow plane slab');
 await profile.getByLabel('截面校准预览').waitFor();
 await profile.getByRole('button',{name:'加入联合校准队列'}).click();
 await profile.getByLabel('截面起点编号').fill('6');
 await profile.getByLabel('截面终点编号').fill('8');
 await scanner.getByRole('button',{name:'检测并选择偏差点'}).click();
 assert.equal(await profile.getByLabel('截面中间点编号').inputValue(),'7');
 await profile.getByRole('button',{name:'加入联合校准队列'}).click();
 await profile.getByText('截面 2：#6 → #8').waitFor();
 result.checks.push('Two independent cross sections queued and previewed before atomic edit');
 await profile.getByRole('button',{name:'三维对照预览'}).click();
 const before=profile.getByLabel('修正前三维预览');
 const after=profile.getByLabel('修正后三维预览');
 await before.locator('canvas').waitFor();
 await after.locator('canvas').waitFor();
 const shot=async(locator,name)=>{
  const canvas=locator.locator('canvas');
  assert.ok(await canvas.evaluate(el=>Boolean(el.getContext('webgl2')||el.getContext('webgl'))),'Missing WebGL 3D comparison');
  const filename=folder+'/'+name+'.png';
  const bytes=await canvas.screenshot({path:filename,animations:'disabled'});
  const bytesOnDisk=(await stat(filename)).size;
  console.log('PROFILE_VISUAL_DIMENSIONS_'+name,JSON.stringify(await canvas.boundingBox()),'pngBytes',bytesOnDisk);
  const jpeg=await canvas.screenshot({type:'jpeg',quality:38,animations:'disabled'});
  console.log('PROFILE_VISUAL_JPEG_'+name+':'+jpeg.toString('base64'));
  assert.ok(bytesOnDisk>350,'Empty comparison image '+name+' ('+bytesOnDisk+' bytes)');
  result.screenshots.push({name,filename});
  return bytes;
 };
 await page.waitForTimeout(350);
 const first=await shot(before,'01-profile-before');
 const second=await shot(after,'02-profile-after');
 assert.ok(!first.equals(second),'Before/after WebGL comparison images identical');
 result.checks.push('WebGL before and after calibration are visually distinct');
 await profile.getByRole('button',{name:/应用联合校准（2条）/}).click();
 await dialog.getByText('局部截面校准').first().waitFor({timeout:10000}).catch(()=>{});
 await dialog.getByText(/9 顶点 \/ 4 面/).first().waitFor();
 await dialog.getByRole('button',{name:'展开精确选择'}).click();
 const select=dialog.getByLabel('选择顶点编号');
 for(const id of [1,7]){
  await select.fill(String(id));
  const z=Number(await dialog.getByLabel('顶点 Z').inputValue());
  assert.ok(Math.abs(z-1.04)<1e-6,'Joint profile did not restore #'+id+': '+z);
 }
 result.checks.push('Applied joint calibration moves both midpoint Z values to 1.04');
 assert.deepEqual(result.errors,[],'Browser runtime errors');
 console.log('PROFILE_CALIBRATION_BROWSER_ACCEPTANCE_SUCCESS',JSON.stringify(result));
}finally{
 await writeFile(folder+'/report.json',JSON.stringify(result,null,2));
 await browser?.close();
 server.kill('SIGTERM');
}
