import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile,stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';
const folder='artifacts/stage5-c';await mkdir(folder,{recursive:true});
const original=JSON.parse(await readFile('training/stage5-b-source.json','utf8'));
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','3013','--strictPort'],{stdio:'ignore'});
let browser,page;const report={checks:[],screenshots:[],errors:[]};
try{
 let ready=false;for(let i=0;i<75;i++){try{if((await fetch('http://127.0.0.1:3013/')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,400))}assert.ok(ready);
 const bin=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert.ok(bin);
 browser=await chromium.launch({executablePath:bin,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']});
 page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1,acceptDownloads:true});page.on('pageerror',e=>report.errors.push(String(e)));
 await page.goto('http://127.0.0.1:3013/',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'顶点对照',exact:true}).click();
 const d=page.getByRole('dialog',{name:'顶点参考对照'});
 await d.getByLabel('导入顶点 JSON').setInputFiles({name:'stage5-b.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(original))});
 const counts=async(v,f)=>d.getByText(new RegExp(v+' 顶点 / '+f+' 面')).first().waitFor();
 await counts(89,88);await d.getByRole('button',{name:'显示 3D 预览',exact:true}).click();
 const camera=d.getByLabel('三维视图工具栏'),view=d.getByLabel('3D 旋转预览');
 const shot=async(tag,angles)=>{await camera.getByRole('button',{name:'放大 3D 编辑'}).click();for(const angle of angles){await camera.getByRole('button',{name:angle,exact:true}).click();await page.waitForTimeout(350);const path=folder+'/'+tag+'-'+angle.replace('/','-')+'.png';await view.locator('canvas').waitFor();assert.ok(await view.locator('canvas').evaluate(c=>!!(c.getContext('webgl2')||c.getContext('webgl'))));await view.screenshot({path,animations:'disabled'});report.screenshots.push({path,size:(await stat(path)).size})}await camera.getByRole('button',{name:'恢复小预览'}).click()};
 await camera.getByRole('button',{name:'正交投影',exact:true}).click();await shot('before',['正面','侧面','3/4']);
 await d.getByRole('button',{name:'展开精确选择'}).click();
 const vertex=d.getByLabel('选择顶点编号'),face=d.getByLabel('控制面编号');
 const download=async(name)=>{const promise=page.waitForEvent('download');await d.getByRole('button',{name:'保存顶点 JSON',exact:true}).click();await (await promise).saveAs(folder+'/'+name);return JSON.parse(await readFile(folder+'/'+name,'utf8'))};
 await vertex.fill('46');await d.getByRole('button',{name:'塑形',exact:true}).click();
 const region=d.getByLabel('区域内插面编号'),apply=d.getByRole('button',{name:'区域内插 · Region inset'});
 await region.fill('2,3');await apply.click();await counts(95,94);
 await region.fill('8,9');await apply.click();await counts(101,100);
 const inset=await download('ear-inset.json');assert.deepEqual(inset.vertices.slice(0,89),original.vertices);
 const mirror=(v,w)=>Math.abs(v[0]+w[0])<1e-7&&Math.abs(v[1]-w[1])<1e-7&&Math.abs(v[2]-w[2])<1e-7;
 const pairs=inset.vertices.map(v=>inset.vertices.findIndex(w=>mirror(v,w)));assert.ok(pairs.every(i=>i>=0));
 const ear=[[-1.06,-.64,.26],[-1.09,-.50,.51],[-1.24,-.28,.53],[-1.30,.06,.48],[-1.26,.13,.19],[-1.13,-.29,.15]];
 const adjust=[[62,[-.68,-.42,1.16]],[63,[-.38,-.47,1.29]],[64,[-.28,-.32,1.25]],[65,[-.36,-.19,1.30]],[66,[-.65,-.18,1.19]],[67,[-.75,-.30,1.125]],[74,[-.34,-1.27,1.31]],[75,[-.245,-1.37,1.37]],[76,[-.105,-1.43,1.46]],[77,[0,-1.445,1.47]],[82,[.105,-1.165,1.48]],[83,[0,-1.185,1.48]],[85,[-.245,-1.205,1.39]],[86,[-.175,-1.30,1.43]],[87,[0,-1.315,1.455]]];
 const desired=inset.vertices.map(v=>[...v]);
 const sym=d.locator('summary').filter({hasText:'顶点对称设置'});await vertex.fill('89');await d.getByRole('button',{name:'塑形',exact:true}).click();if(!(await sym.locator('..').evaluate(el=>el.open)))await sym.click();
 const symmetry=d.getByRole('checkbox',{name:'对称 X',exact:true});
 const move=async(id,v)=>{await vertex.fill(String(id));for(const [axis,n] of [['X',v[0]],['Y',v[1]],['Z',v[2]]]){const input=d.getByLabel('顶点 '+axis,{exact:true});if(Math.abs(Number(await input.inputValue())-n)>1e-10){await input.fill(String(n));await input.press('Enter');assert.ok(Math.abs(Number(await input.inputValue())-n)<1e-8)}}};
 await symmetry.check();
 for(const [id,v] of ear.map((v,i)=>[89+i,v])){await move(id,v);desired[id]=v;desired[pairs[id]]=[-v[0],v[1],v[2]]}
 await symmetry.uncheck();await vertex.fill('');await face.fill('');await shot('ears',['正面','侧面','3/4']);
 await vertex.fill('62');await d.getByRole('button',{name:'塑形',exact:true}).click();if(!(await sym.locator('..').evaluate(el=>el.open)))await sym.click();
 await symmetry.check();
 for(const [id,v] of adjust){await move(id,v);desired[id]=v;desired[pairs[id]]=[-v[0],v[1],v[2]]}
 await symmetry.uncheck();await vertex.fill('');await face.fill('');await counts(101,100);
 await shot('after',['正面','侧面','左侧','3/4','俯视','低角度']);
 const raw=await download('stage5-c-editor-export.json'),candidate={vertices:raw.vertices,faces:raw.faces};
 assert.deepEqual(candidate.vertices.slice(0,62),original.vertices.slice(0,62));
 assert.deepEqual(candidate.faces,inset.faces);
 for(let i=0;i<desired.length;i++)assert.ok(candidate.vertices[i].every((v,k)=>Math.abs(v-desired[i][k])<1e-7),'Coordinate mismatch #'+i);
 assert.equal(candidate.vertices.length,101);assert.equal(candidate.faces.length,100);
 const mirrorIds=candidate.vertices.map(v=>candidate.vertices.findIndex(w=>mirror(v,w)));assert.ok(mirrorIds.every(i=>i>=0));
 const key=f=>[...f].sort((a,b)=>a-b).join(':');const fs=new Set(candidate.faces.map(key)),edges=new Map();
 for(const f of candidate.faces){assert.ok(fs.has(key(f.map(i=>mirrorIds[i]))));assert.ok(new Set(f).size===f.length);f.forEach((a,i)=>{const b=f[(i+1)%f.length],k=key([a,b]);edges.set(k,(edges.get(k)||0)+1)})}
 assert.ok([...edges.values()].every(n=>n===2));assert.equal(candidate.vertices.length-edges.size+candidate.faces.length,2);
 const V=candidate.vertices,sub=(a,b)=>a.map((x,i)=>x-b[i]),dot=(a,b)=>a.reduce((n,x,i)=>n+x*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const hit=(p,q,a,b,c)=>{const d=sub(q,p),e=sub(b,a),g=sub(c,a),h=cross(d,g),det=dot(e,h);if(Math.abs(det)<1e-9)return false;const s=sub(p,a),u=dot(s,h)/det,r=cross(s,e),v=dot(d,r)/det,t=dot(g,r)/det;return Math.min(u,v,1-u-v,t,1-t)>1e-7};
 const tris=candidate.faces.flatMap((f,fi)=>f.slice(1,-1).map((_,j)=>({fi,ids:[f[0],f[j+1],f[j+2]]})));
 for(let i=0;i<tris.length;i++)for(let j=i+1;j<tris.length;j++){const a=tris[i],b=tris[j];if(a.fi===b.fi||a.ids.some(k=>b.ids.includes(k)))continue;const p=a.ids.map(k=>V[k]),q=b.ids.map(k=>V[k]);assert.ok(!p.some((v,k)=>hit(v,p[(k+1)%3],...q))&&!q.some((v,k)=>hit(v,q[(k+1)%3],...p)),'Nonadjacent triangle crossing '+a.fi+'/'+b.fi)}
 await writeFile(folder+'/stage5-c.json',JSON.stringify(candidate,null,2));
 report.mesh={vertices:101,faces:100,edges:edges.size,triangles:candidate.faces.reduce((n,f)=>n+f.length-2,0)};
 report.reference={source:'Original stage 5 first row, visual reading; depth approximate',ear,adjust};
 report.checks.push('Actual bilateral two-face region inset, shared six-point ear roots, local orbital and lip calibration, original 62 vertices retained, closed symmetric topology and no strict nonadjacent fan-triangle crossings');assert.deepEqual(report.errors,[]);console.log('STAGE5_C_SUCCESS',JSON.stringify(report));
}catch(e){report.errors.push(String(e));if(page)await page.screenshot({path:folder+'/failure.png',fullPage:true}).catch(()=>{});throw e}finally{await writeFile(folder+'/report.json',JSON.stringify(report,null,2));await browser?.close();server.kill('SIGTERM')}
