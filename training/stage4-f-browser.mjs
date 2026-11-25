import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile,stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';
const folder='artifacts/stage4-f-training';await mkdir(folder,{recursive:true});
const original=JSON.parse(await readFile('training/stage4-e-source.json','utf8'));
const ref=JSON.parse(await readFile('training/stage4-reference-notes.json','utf8'));
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','3013','--strictPort'],{stdio:'ignore'});
let browser,page;
const report={checks:[],screenshots:[],errors:[],reference:ref};
try{
 let ready=false;for(let i=0;i<75;i++){try{if((await fetch('http://127.0.0.1:3013/')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,400))}assert.ok(ready);
 const bin=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert.ok(bin);
 browser=await chromium.launch({executablePath:bin,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']});
 page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1,acceptDownloads:true});
 page.on('pageerror',e=>report.errors.push(String(e)));
 await page.goto('http://127.0.0.1:3013/',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'顶点对照',exact:true}).click();
 const d=page.getByRole('dialog',{name:'顶点参考对照'});
 await d.getByLabel('导入顶点 JSON').setInputFiles({name:'stage4-e.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(original))});
 const counts=async(v,f)=>d.getByText(new RegExp(v+' 顶点 / '+f+' 面')).first().waitFor();
 await counts(62,56);
 await d.getByRole('button',{name:'显示 3D 预览',exact:true}).click();
 const camera=d.getByLabel('三维视图工具栏'),view=d.getByLabel('3D 旋转预览');
 const shot=async(tag,angles)=>{for(const angle of angles){await camera.getByRole('button',{name:angle,exact:true}).click();await page.waitForTimeout(350);const path=folder+'/'+tag+'-'+angle+'.png';await view.locator('canvas').waitFor();assert.ok(await view.locator('canvas').evaluate(c=>!!(c.getContext('webgl2')||c.getContext('webgl'))));await view.screenshot({path,animations:'disabled'});report.screenshots.push({path,size:(await stat(path)).size})}};
 await camera.getByRole('button',{name:'正交投影',exact:true}).click();
 await shot('before',['正面','侧面','左侧','3/4','俯视','低角度']);
 await d.getByRole('button',{name:'展开精确选择'}).click();
 const vertex=d.getByLabel('选择顶点编号'),section=d.getByLabel('自由拓扑编辑');
 const merge=async(remove,keep)=>{
   await vertex.fill(String(remove));await d.getByRole('button',{name:'布线',exact:true}).click();
   const summary=section.locator('summary').filter({hasText:'相邻顶点合并'});
   if(!(await summary.locator('..').evaluate(el=>el.open)))await summary.click();
   await section.getByLabel('合并保留顶点').selectOption(String(keep));
   const button=section.getByRole('button',{name:'应用顶点合并'});
   if(await button.isDisabled())throw Error('Merge refused: '+await section.innerText());
   await button.click();await d.getByText('相邻顶点合并完成').first().waitFor();
 };
 await merge(37,8);await counts(61,56);
 await merge(40,25);await counts(60,56);
 await shot('after',['正面','侧面','左侧','3/4','俯视','低角度']);
 const undo=()=>d.getByRole('button',{name:'撤销',exact:true}).click(),redo=()=>d.getByRole('button',{name:'重做',exact:true}).click();
 await undo();await counts(61,56);await undo();await counts(62,56);await redo();await counts(61,56);await redo();await counts(60,56);
 const downloaded=page.waitForEvent('download');await d.getByRole('button',{name:'保存顶点 JSON',exact:true}).click();await (await downloaded).saveAs(folder+'/stage4-f-editor-export.json');
 const raw=JSON.parse(await readFile(folder+'/stage4-f-editor-export.json','utf8')),candidate={vertices:raw.vertices,faces:raw.faces};
 assert.deepEqual(candidate.vertices,original.vertices.filter((_,i)=>i!==37&&i!==41));
 assert.equal(candidate.faces.length,56);
 const edges=new Map();for(const f of candidate.faces){assert.ok(new Set(f).size===f.length&&f.length>=3);f.forEach((a,i)=>{const b=f[(i+1)%f.length],k=[a,b].sort((a,b)=>a-b).join(':');edges.set(k,(edges.get(k)||0)+1)})}
 assert.ok([...edges.values()].every(n=>n===2));assert.equal(candidate.vertices.length-edges.size+candidate.faces.length,2);
 assert.ok(candidate.vertices.every(v=>candidate.vertices.some(w=>Math.abs(v[0]+w[0])<1e-7&&Math.abs(v[1]-w[1])<1e-7&&Math.abs(v[2]-w[2])<1e-7)));
 await writeFile(folder+'/stage4-f.json',JSON.stringify(candidate,null,2));
 report.checks.push('Two actual editor merges, undo twice and redo twice, export, preserved all survivor coordinates, closed edge incidence and X symmetry');
 report.mesh={vertices:candidate.vertices.length,faces:candidate.faces.length,edges:edges.size,triangles:candidate.faces.reduce((n,f)=>n+f.length-2,0)};
 assert.deepEqual(report.errors,[]);console.log('STAGE4_F_TRAINING_SUCCESS',JSON.stringify(report));
}catch(e){report.errors.push(String(e));if(page)await page.screenshot({path:folder+'/failure.png',fullPage:true}).catch(()=>{});throw e}
finally{await writeFile(folder+'/report.json',JSON.stringify(report,null,2));await browser?.close();server.kill('SIGTERM')}
