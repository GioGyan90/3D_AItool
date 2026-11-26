import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const folder='artifacts/stage5-d-nose';await mkdir(folder,{recursive:true});
const source='stage5-c-artifact/stage5-c.json',mesh=JSON.parse(await readFile(source,'utf8'));assert.equal(mesh.vertices.length,101);assert.equal(mesh.faces.length,100);
const ids=[26,27,28,29,36,37,38,39],report={sourceRun:45781507748,faces:ids,shots:[],errors:[]};
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','3016','--strictPort'],{stdio:'ignore'});let browser,page;
try{
 let ready=false;for(let i=0;i<75;i++){try{if((await fetch('http://127.0.0.1:3016/')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,400))}assert.ok(ready);
 const bin=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert.ok(bin);
 browser=await chromium.launch({executablePath:bin,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']});
 page=await browser.newPage({viewport:{width:1440,height:960},acceptDownloads:true});page.on('pageerror',e=>report.errors.push(String(e)));
 await page.goto('http://127.0.0.1:3016/',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'顶点对照',exact:true}).click();const d=page.getByRole('dialog',{name:'顶点参考对照'});
 await d.getByLabel('导入顶点 JSON').setInputFiles({name:'stage5-c.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(mesh))});await d.getByRole('button',{name:'显示 3D 预览',exact:true}).click();
 const bar=d.getByRole('toolbar',{name:'三维视图工具栏'}),view=d.getByLabel('3D 旋转预览');
 await bar.getByRole('button',{name:'放大 3D 编辑'}).click();
 await bar.getByRole('button',{name:'局部观察 / 区域隔离',exact:true}).click();await d.getByLabel('观察区域面编号').fill(ids.join(','));await d.getByRole('button',{name:'观察当前区域'}).click();
 await d.getByLabel('区域名称').fill('鼻部核心');await d.getByRole('button',{name:'保存命名区域'}).click();
 const shot=async(name)=>{await page.waitForTimeout(350);const path=folder+'/'+name+'.png';await view.locator('canvas').screenshot({path,animations:'disabled'});report.shots.push(path)};
 const toggle=()=>bar.getByRole('button',{name:/^局部观察 \/ 区域隔离/}).click();
 await toggle();for(const angle of ['正面','侧面','左侧','3/4','左 3/4','低角度','左低角度','俯视','仰视']){await bar.getByRole('button',{name:angle,exact:true}).click();await shot('ghost-'+angle.replace('/','-'))}
 await toggle();await d.getByLabel('观察背景模式').selectOption('isolate');await d.getByRole('checkbox',{name:'凹凸边诊断'}).check();report.foldText=await d.getByLabel('区域凹凸边报告').innerText();
 await toggle();for(const angle of ['低角度','左低角度','正面','侧面']){await bar.getByRole('button',{name:angle,exact:true}).click();await shot('isolated-fold-'+angle)}
 await toggle();await d.getByRole('checkbox',{name:'凹凸边诊断'}).uncheck();await d.getByRole('checkbox',{name:'局部剖切分析'}).check();await bar.getByRole('button',{name:'俯视',exact:true}).click();
 for(const p of [.2,.35,.5,.65,.8]){await d.getByLabel('剖切位置').fill(String(p));await d.getByRole('img',{name:'局部截面轮廓'}).waitFor();await d.getByRole('img',{name:'局部截面轮廓'}).screenshot({path:folder+'/section-profile-'+p+'.png'});await shot('section-'+p)}
 await d.getByRole('button',{name:'矢状面',exact:true}).click();await d.getByRole('checkbox',{name:'隐藏截面一侧'}).check();await bar.getByRole('button',{name:'左低角度',exact:true}).click();await shot('sagittal-clipped');await page.screenshot({path:folder+'/section-ui.png',fullPage:true});
 await d.getByRole('button',{name:'退出区域观察'}).click();await toggle();await bar.getByRole('button',{name:'恢复小预览'}).click();
 const download=page.waitForEvent('download');await d.getByRole('button',{name:'保存顶点 JSON',exact:true}).click();await (await download).saveAs(folder+'/unchanged.json');const after=JSON.parse(await readFile(folder+'/unchanged.json','utf8'));assert.deepEqual(after.vertices,mesh.vertices);assert.deepEqual(after.faces,mesh.faces);assert.deepEqual(report.errors,[]);
}catch(e){report.errors.push(String(e));if(page)await page.screenshot({path:folder+'/failure.png',fullPage:true}).catch(()=>{});throw e}finally{await writeFile(folder+'/report.json',JSON.stringify(report,null,2));await browser?.close();server.kill('SIGTERM')}
