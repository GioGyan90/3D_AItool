import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile,stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';
const folder='artifacts/stage4-h-training';await mkdir(folder,{recursive:true});
const original=JSON.parse(await readFile('training/stage4-g-source.json','utf8'));
const ref=JSON.parse(await readFile('training/stage4-h-reference-notes.json','utf8'));
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
 await d.getByLabel('导入顶点 JSON').setInputFiles({name:'stage4-g.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(original))});
 const counts=async(v,f)=>d.getByText(new RegExp(v+' 顶点 / '+f+' 面')).first().waitFor();
 await counts(62,60);
 await d.getByRole('button',{name:'显示 3D 预览',exact:true}).click();
 const camera=d.getByLabel('三维视图工具栏'),view=d.getByLabel('3D 旋转预览');
 const shot=async(tag,angles)=>{for(const angle of angles){await camera.getByRole('button',{name:angle,exact:true}).click();await page.waitForTimeout(350);const path=folder+'/'+tag+'-'+angle+'.png';await view.locator('canvas').waitFor();assert.ok(await view.locator('canvas').evaluate(c=>!!(c.getContext('webgl2')||c.getContext('webgl'))));await view.screenshot({path,animations:'disabled'});report.screenshots.push({path,size:(await stat(path)).size})}};
 await camera.getByRole('button',{name:'正交投影',exact:true}).click();
 await camera.getByRole('button',{name:'放大 3D 编辑'}).click();await shot('before',['正面','侧面','左侧','3/4','俯视','低角度']);await camera.getByRole('button',{name:'恢复小预览'}).click();
 await d.getByRole('button',{name:'展开精确选择'}).click();
 const vertex=d.getByLabel('选择顶点编号');
 await vertex.fill('38');
 await d.getByRole('button',{name:'塑形',exact:true}).click();
 const sym=d.locator('summary').filter({hasText:'顶点对称设置'});if(!(await sym.locator('..').evaluate(el=>el.open)))await sym.click();
 await d.getByRole('checkbox',{name:'对称 X',exact:true}).check();
 const scale=ref.frame.front.scale,cy=ref.frame.front.cy;
 const desired=original.vertices.map(v=>[...v]);
 for(const t of ref.targets){
   const v=desired[t.id];
   if(t.front)v[0]=(t.front[0]-ref.frame.front.cx)/scale;
   v[1]=(cy-(t.front??t.side)[1])/scale;if(t.side)v[2]=(t.side[0]-ref.frame.side.cx)/scale;
   if(t.mirror!==undefined)desired[t.mirror]=[-v[0],v[1],v[2]];
   await vertex.fill(String(t.id));
   for(const [i,axis] of ['X','Y','Z'].entries()){
     const input=d.getByLabel('顶点 '+axis,{exact:true});if(Math.abs(Number(await input.inputValue())-v[i])<1e-12)continue;
     await input.fill(String(v[i]));await input.press('Enter');
     assert.ok(Math.abs(Number(await input.inputValue())-v[i])<1e-9,'Coordinate input did not commit');
   }
 }
 await d.getByRole('checkbox',{name:'对称 X',exact:true}).uncheck();
 await counts(62,60);await camera.getByRole('button',{name:'放大 3D 编辑'}).click();await shot('after',['正面','侧面','左侧','3/4','俯视','低角度']);await camera.getByRole('button',{name:'恢复小预览'}).click();
 const downloaded=page.waitForEvent('download');await d.getByRole('button',{name:'保存顶点 JSON',exact:true}).click();await (await downloaded).saveAs(folder+'/stage4-h-editor-export.json');
 const raw=JSON.parse(await readFile(folder+'/stage4-h-editor-export.json','utf8')),candidate={vertices:raw.vertices,faces:raw.faces};
 assert.equal(candidate.vertices.length,62);assert.equal(candidate.faces.length,60);
 for(let i=0;i<desired.length;i++)assert.ok(candidate.vertices[i].every((n,k)=>Math.abs(n-desired[i][k])<1e-7),'Unexpected coordinate #'+i+': '+JSON.stringify(candidate.vertices[i])+' expected '+JSON.stringify(desired[i]));
 assert.deepEqual(candidate.faces,original.faces,'H must preserve every control face');
 const normal=(vs,f)=>{const n=[0,0,0];for(let i=0;i<f.length;i++){const a=vs[f[i]],b=vs[f[(i+1)%f.length]];n[0]+=(a[1]-b[1])*(a[2]+b[2]);n[1]+=(a[2]-b[2])*(a[0]+b[0]);n[2]+=(a[0]-b[0])*(a[1]+b[1])}return n};
 let maxAngle=0,minAreaRatio=Infinity;for(const f of candidate.faces){const a=normal(original.vertices,f),b=normal(candidate.vertices,f),la=Math.hypot(...a),lb=Math.hypot(...b);maxAngle=Math.max(maxAngle,Math.acos(Math.max(-1,Math.min(1,a.reduce((s,n,k)=>s+n*b[k],0)/la/lb)))*180/Math.PI);minAreaRatio=Math.min(minAreaRatio,lb/la)}assert.ok(maxAngle<15&&minAreaRatio>.8,'Local face deformation too large');report.deformation={maxAngle,minAreaRatio};
 const edges=new Map();for(const f of candidate.faces){assert.ok(new Set(f).size===f.length&&f.length>=3);f.forEach((a,i)=>{const b=f[(i+1)%f.length],k=[a,b].sort((a,b)=>a-b).join(':');edges.set(k,(edges.get(k)||0)+1)})}
 assert.equal(edges.size,120);assert.ok([...edges.values()].every(n=>n===2));assert.equal(candidate.vertices.length-edges.size+candidate.faces.length,2);
 assert.ok(candidate.vertices.every(v=>candidate.vertices.some(w=>Math.abs(v[0]+w[0])<1e-7&&Math.abs(v[1]-w[1])<1e-7&&Math.abs(v[2]-w[2])<1e-7)));
 const key=f=>[...f].sort((a,b)=>a-b).join(':');
 const mirror=candidate.vertices.map(v=>candidate.vertices.findIndex(w=>Math.abs(v[0]+w[0])<1e-7&&Math.abs(v[1]-w[1])<1e-7&&Math.abs(v[2]-w[2])<1e-7));
 const faceKeys=new Set(candidate.faces.map(key));assert.ok(candidate.faces.every(f=>faceKeys.has(key(f.map(i=>mirror[i])))),'Unmatched mirrored control face');
 await writeFile(folder+'/stage4-h.json',JSON.stringify(candidate,null,2));
 report.checks.push('Actual editor coordinate edits with X symmetry, protected anchors, identical face connectivity, controlled face normal changes, closed manifold edge incidence');
 report.mesh={vertices:candidate.vertices.length,faces:candidate.faces.length,edges:edges.size,triangles:candidate.faces.reduce((n,f)=>n+f.length-2,0)};
 assert.deepEqual(report.errors,[]);console.log('STAGE4_H_TRAINING_SUCCESS',JSON.stringify(report));
}catch(e){report.errors.push(String(e));if(page)await page.screenshot({path:folder+'/failure.png',fullPage:true}).catch(()=>{});throw e}
finally{await writeFile(folder+'/report.json',JSON.stringify(report,null,2));await browser?.close();server.kill('SIGTERM')}
