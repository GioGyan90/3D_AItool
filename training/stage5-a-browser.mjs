import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile,stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';
const folder='artifacts/stage5-a';await mkdir(folder,{recursive:true});
const original=JSON.parse(await readFile('training/stage4-h-source.json','utf8'));
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','3013','--strictPort'],{stdio:'ignore'});
let browser,page;const report={checks:[],screenshots:[],errors:[]};
try{
 let ready=false;for(let i=0;i<75;i++){try{if((await fetch('http://127.0.0.1:3013/')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,400))}assert.ok(ready);
 const bin=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert.ok(bin);
 browser=await chromium.launch({executablePath:bin,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']});
 page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1,acceptDownloads:true});page.on('pageerror',e=>report.errors.push(String(e)));
 await page.goto('http://127.0.0.1:3013/',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'顶点对照',exact:true}).click();
 const d=page.getByRole('dialog',{name:'顶点参考对照'});
 await d.getByLabel('导入顶点 JSON').setInputFiles({name:'stage4-h.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(original))});
 const counts=async(v,f)=>d.getByText(new RegExp(v+' 顶点 / '+f+' 面')).first().waitFor();
 await counts(62,60);await d.getByRole('button',{name:'显示 3D 预览',exact:true}).click();
 const camera=d.getByLabel('三维视图工具栏'),view=d.getByLabel('3D 旋转预览');
 const shot=async(tag,angles)=>{await camera.getByRole('button',{name:'放大 3D 编辑'}).click();for(const angle of angles){await camera.getByRole('button',{name:angle,exact:true}).click();await page.waitForTimeout(350);const path=folder+'/'+tag+'-'+angle.replace('/','-')+'.png';await view.locator('canvas').waitFor();assert.ok(await view.locator('canvas').evaluate(c=>!!(c.getContext('webgl2')||c.getContext('webgl'))));await view.screenshot({path,animations:'disabled'});report.screenshots.push({path,size:(await stat(path)).size})}await camera.getByRole('button',{name:'恢复小预览'}).click()};
 await camera.getByRole('button',{name:'正交投影',exact:true}).click();await shot('before',['正面','侧面','3/4']);
 await d.getByRole('button',{name:'展开精确选择'}).click();const vertex=d.getByLabel('选择顶点编号');
 await vertex.fill('44');
 const region=d.getByLabel('区域内插面编号'),apply=d.getByRole('button',{name:'区域内插 · Region inset'});
 await region.fill('30,31');await apply.click();await counts(68,66);
 await region.fill('34,35');await apply.click();await counts(74,72);
 await shot('orbit-blockout',['正面','侧面','3/4']);
 const download=async(name)=>{const promise=page.waitForEvent('download');await d.getByRole('button',{name:'保存顶点 JSON',exact:true}).click();await (await promise).saveAs(folder+'/'+name);return JSON.parse(await readFile(folder+'/'+name,'utf8'))};
 const inset=await download('inset-export.json');
 assert.deepEqual(inset.vertices.slice(0,62),original.vertices);
 const mirror=(v,w)=>Math.abs(v[0]+w[0])<1e-7&&Math.abs(v[1]-w[1])<1e-7&&Math.abs(v[2]-w[2])<1e-7;
 const pairs=inset.vertices.slice(62,68).map((v,i)=>[i+62,inset.vertices.findIndex((w,j)=>j>=68&&mirror(v,w))]);assert.ok(pairs.every(p=>p[1]>=68));
 // Boundary ring order determined from the original directed face boundary.
 // Upper outer, upper inner, corners and lower contour are placed manually
 // from stage 5 front view; depth is a conservative estimate, not a pixel fit.
 const ring=[2,38,44,37,5,45];
 const targets={2:[-.70,-.43],38:[-.37,-.49],44:[-.27,-.34],37:[-.34,-.17],5:[-.68,-.15],45:[-.76,-.31]};
 const sym=d.locator('summary').filter({hasText:'顶点对称设置'});await vertex.fill('62');await d.getByRole('button',{name:'塑形',exact:true}).click();if(!(await sym.locator('..').evaluate(el=>el.open)))await sym.click();await d.getByRole('checkbox',{name:'对称 X',exact:true}).check();
 for(let i=0;i<6;i++){const id=62+i,p=targets[ring[i]],v=inset.vertices[id];await vertex.fill(String(id));for(const [axis,n] of [['X',p[0]],['Y',p[1]],['Z',v[2]-.025]]){const input=d.getByLabel('顶点 '+axis,{exact:true});if(Math.abs(Number(await input.inputValue())-n)>1e-10){await input.fill(String(n));await input.press('Enter');}}}
 await d.getByRole('checkbox',{name:'对称 X',exact:true}).uncheck();
 await counts(74,72);await shot('after',['正面','侧面','左侧','3/4','俯视','低角度']);
 const raw=await download('stage5-a-editor-export.json'),candidate={vertices:raw.vertices,faces:raw.faces};
 assert.deepEqual(candidate.vertices.slice(0,62),original.vertices);
 assert.equal(candidate.vertices.length,74);assert.equal(candidate.faces.length,72);
 const ids=candidate.vertices.map(v=>candidate.vertices.findIndex(w=>mirror(v,w)));assert.ok(ids.every(i=>i>=0));const key=f=>[...f].sort((a,b)=>a-b).join(':');const fs=new Set(candidate.faces.map(key)),edges=new Map();
 for(const f of candidate.faces){assert.ok(fs.has(key(f.map(i=>ids[i]))));assert.ok(new Set(f).size===f.length);f.forEach((a,i)=>{const b=f[(i+1)%f.length],k=key([a,b]);edges.set(k,(edges.get(k)||0)+1)})}
 assert.ok([...edges.values()].every(n=>n===2));assert.equal(candidate.vertices.length-edges.size+candidate.faces.length,2);
 for(const [a,b] of pairs)assert.ok(mirror(candidate.vertices[a],candidate.vertices[b]));
 await writeFile(folder+'/stage5-a.json',JSON.stringify(candidate,null,2));
 report.mesh={vertices:74,faces:72,edges:edges.size,triangles:candidate.faces.reduce((n,f)=>n+f.length-2,0)};report.checks.push('Actual two adjacent-face region insets, symmetric six-point eye support loops, protected original vertices and closed topology');assert.deepEqual(report.errors,[]);console.log('STAGE5_A_SUCCESS',JSON.stringify(report));
}catch(e){report.errors.push(String(e));if(page)await page.screenshot({path:folder+'/failure.png',fullPage:true}).catch(()=>{});throw e}finally{await writeFile(folder+'/report.json',JSON.stringify(report,null,2));await browser?.close();server.kill('SIGTERM')}
