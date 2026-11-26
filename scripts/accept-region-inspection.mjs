import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdir,readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const folder='artifacts/region-inspection';await mkdir(folder,{recursive:true});
const mesh={vertices:[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],faces:[[0,3,2,1],[4,5,6,7],[0,1,5,4],[3,7,6,2],[0,4,7,3],[1,2,6,5]]};
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','3015','--strictPort'],{stdio:'ignore'});let browser,page;
try{
 let ready=false;for(let i=0;i<75;i++){try{if((await fetch('http://127.0.0.1:3015/')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,400))}assert.ok(ready);
 const bin=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert.ok(bin);
 browser=await chromium.launch({executablePath:bin,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']});
 page=await browser.newPage({viewport:{width:1440,height:960},acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:3015/',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'顶点对照',exact:true}).click();const d=page.getByRole('dialog',{name:'顶点参考对照'});
 await d.getByLabel('导入顶点 JSON').setInputFiles({name:'box.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(mesh))});await d.getByRole('button',{name:'显示 3D 预览',exact:true}).click();
 const bar=d.getByRole('toolbar',{name:'三维视图工具栏'}),view=d.getByLabel('3D 旋转预览');await bar.getByRole('button',{name:'放大 3D 编辑'}).click();
 await d.getByText('局部观察 / 区域隔离',{exact:true}).click();await d.getByLabel('观察区域面编号').fill('1,5');await d.getByRole('button',{name:'观察当前区域'}).click();
 const shot=async(name)=>{await page.waitForTimeout(400);const path=folder+'/'+name+'.png';await view.screenshot({path});return readFile(path)};
 const ghost=await shot('ghost');await d.getByLabel('观察背景模式').selectOption('isolate');const isolated=await shot('isolated');assert.ok(!ghost.equals(isolated));
 await d.getByLabel('观察背景模式').selectOption('contrast');const contrast=await shot('contrast');assert.ok(!contrast.equals(isolated));
 await d.getByRole('checkbox',{name:'凹凸边诊断'}).check();await d.getByLabel('区域凹凸边报告').waitFor();
 await bar.getByRole('button',{name:'左低角度',exact:true}).click();const left=await shot('low-left');await bar.getByRole('button',{name:'低角度',exact:true}).click();const right=await shot('low-right');assert.ok(!left.equals(right));
 await d.getByRole('button',{name:'扩展一圈邻面'}).click();await d.getByText('局部观察 / 区域隔离 · 6 面',{exact:true}).waitFor();
 await d.getByRole('button',{name:'退出区域观察'}).click();await bar.getByRole('button',{name:'恢复小预览'}).click();
 const download=page.waitForEvent('download');await d.getByRole('button',{name:'保存顶点 JSON',exact:true}).click();const output=await download;await output.saveAs(folder+'/unchanged.json');const after=JSON.parse(await readFile(folder+'/unchanged.json','utf8'));assert.deepEqual(after.vertices,mesh.vertices);assert.deepEqual(after.faces,mesh.faces);assert.deepEqual(errors,[]);
}catch(e){if(page)await page.screenshot({path:folder+'/failure.png',fullPage:true}).catch(()=>{});throw e}finally{await browser?.close();server.kill('SIGTERM')}
