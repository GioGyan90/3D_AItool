import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const folder='artifacts/stage5-e';await mkdir(folder,{recursive:true});
const original=JSON.parse(await readFile('stage5-d-artifact/stage5-d-nose.json','utf8'));
assert.equal(original.vertices.length,101);assert.equal(original.faces.length,100);
const root=[[-.998,-.47,.10],[-.93,-.46,.53],[-.925,-.30,.55],[-.92,-.025,.56],[-1.003,.08,.10],[-1.001,-.18,.10]];
const ear=[[-1.055,-.58,.15],[-1.085,-.43,.39],[-1.17,-.25,.43],[-1.23,.045,.38],[-1.20,.10,.10],[-1.105,-.26,.055]];
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','3017','--strictPort'],{stdio:'ignore'});
let browser,page;const report={sourceRun:45790850022,root,ear,shots:[],errors:[]};
try{
 let ready=false;for(let i=0;i<75;i++){try{if((await fetch('http://127.0.0.1:3017/')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,400))}assert.ok(ready);
 const bin=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert.ok(bin);
 browser=await chromium.launch({executablePath:bin,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']});
 page=await browser.newPage({viewport:{width:1440,height:960},acceptDownloads:true});page.on('pageerror',e=>report.errors.push(String(e)));
 await page.goto('http://127.0.0.1:3017/',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'顶点对照',exact:true}).click();
 const d=page.getByRole('dialog',{name:'顶点参考对照'});
 await d.getByLabel('导入顶点 JSON').setInputFiles({name:'stage5-d.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(original))});
 await d.getByRole('button',{name:'显示 3D 预览',exact:true}).click();
 const bar=d.getByRole('toolbar',{name:'三维视图工具栏'}),view=d.getByLabel('3D 旋转预览');
 const counts=async(v,f)=>d.getByText(new RegExp(v+' 顶点 / '+f+' 面')).first().waitFor();
 const toggle=()=>bar.getByRole('button',{name:/^局部观察 \/ 区域隔离/}).click();
 const shot=async(name)=>{await page.waitForTimeout(350);const path=folder+'/'+name+'.png';await view.locator('canvas').screenshot({path,animations:'disabled'});report.shots.push(path)};
 const inspect=async(tag,ids)=>{
 await bar.getByRole('button',{name:'放大 3D 编辑'}).click();await toggle();await d.getByLabel('观察区域面编号').fill(ids.join(','));await d.getByRole('button',{name:'观察当前区域'}).click();
 await toggle();for(const angle of ['正面','左侧','左 3/4','左低角度','俯视','仰视']){await bar.getByRole('button',{name:angle,exact:true}).click();await shot(tag+'-ghost-'+angle.replace('/','-'))}
 await toggle();await d.getByLabel('观察背景模式').selectOption('isolate');await d.getByRole('checkbox',{name:'凹凸边诊断'}).check();
 report[tag+'Folds']=await d.getByLabel('区域凹凸边报告').innerText();await toggle();
 for(const angle of ['左侧','左 3/4','左低角度','俯视']){await bar.getByRole('button',{name:angle,exact:true}).click();await shot(tag+'-isolated-'+angle.replace('/','-'))}
 await toggle();await d.getByRole('button',{name:'退出区域观察'}).click();await toggle();await bar.getByRole('button',{name:'恢复小预览'}).click();
 };
 await counts(101,100);await inspect('before',[2,3,88,89,90,91,92,93]);
 await d.getByRole('button',{name:'展开精确选择'}).click();
 const vertex=d.getByLabel('选择顶点编号'),face=d.getByLabel('控制面编号');
 const download=async(name)=>{const p=page.waitForEvent('download');await d.getByRole('button',{name:'保存顶点 JSON',exact:true}).click();await(await p).saveAs(folder+'/'+name);return JSON.parse(await readFile(folder+'/'+name,'utf8'))};
 const move=async(id,v)=>{await vertex.fill(String(id));for(const [axis,n] of [['X',v[0]],['Y',v[1]],['Z',v[2]]]){const input=d.getByLabel('顶点 '+axis,{exact:true});if(Math.abs(Number(await input.inputValue())-n)>1e-10){await input.fill(String(n));await input.press('Enter');assert.ok(Math.abs(Number(await input.inputValue())-n)<1e-8)}}};
 const sym=d.locator('summary').filter({hasText:'顶点对称设置'});
 await vertex.fill('89');await d.getByRole('button',{name:'塑形',exact:true}).click();if(!(await sym.locator('..').evaluate(el=>el.open)))await sym.click();
 const symmetry=d.getByRole('checkbox',{name:'对称 X',exact:true});await symmetry.check();
 for(let i=0;i<6;i++)await move(89+i,root[i]);await symmetry.uncheck();await vertex.fill('');await face.fill('');
 const restored=await download('root-restored.json');assert.deepEqual(restored.vertices.slice(0,89),original.vertices.slice(0,89));assert.deepEqual(restored.faces,original.faces);
 await vertex.fill('89');await d.getByRole('button',{name:'塑形',exact:true}).click();
 const region=d.getByLabel('区域内插面编号'),apply=d.getByRole('button',{name:'区域内插 · Region inset'});
 await region.fill('2,3');await apply.click();await counts(107,106);await region.fill('8,9');await apply.click();await counts(113,112);
 const inset=await download('root-inset.json');assert.deepEqual(inset.vertices.slice(0,101),restored.vertices);
 const mirrored=(v,w)=>Math.abs(v[0]+w[0])<1e-7&&Math.abs(v[1]-w[1])<1e-7&&Math.abs(v[2]-w[2])<1e-7;
 const pairs=inset.vertices.map(v=>inset.vertices.findIndex(w=>mirrored(v,w)));assert.ok(pairs.every(i=>i>=0));
 await vertex.fill('101');await d.getByRole('button',{name:'塑形',exact:true}).click();if(!(await sym.locator('..').evaluate(el=>el.open)))await sym.click();await symmetry.check();
 for(let i=0;i<6;i++)await move(101+i,ear[i]);await symmetry.uncheck();await vertex.fill('');await face.fill('');
 const raw=await download('stage5-e-editor-export.json'),candidate={vertices:raw.vertices,faces:raw.faces};
 assert.deepEqual(candidate.vertices.slice(0,89),original.vertices.slice(0,89));assert.deepEqual(candidate.faces,inset.faces);
 for(let i=0;i<6;i++){assert.ok(candidate.vertices[101+i].every((x,k)=>Math.abs(x-ear[i][k])<1e-7));assert.ok(mirrored(candidate.vertices[101+i],candidate.vertices[pairs[101+i]]))}
 const key=f=>[...f].sort((a,b)=>a-b).join(':'),edges=new Map(),fs=new Set(candidate.faces.map(key)),mirrorIds=candidate.vertices.map(v=>candidate.vertices.findIndex(w=>mirrored(v,w)));assert.ok(mirrorIds.every(i=>i>=0));
 for(const f of candidate.faces){assert.ok(fs.has(key(f.map(i=>mirrorIds[i]))));f.forEach((a,i)=>{const b=f[(i+1)%f.length],k=key([a,b]);edges.set(k,(edges.get(k)||0)+1)})}
 assert.ok([...edges.values()].every(n=>n===2));assert.equal(candidate.vertices.length-edges.size+candidate.faces.length,2);
 const V=candidate.vertices,sub=(a,b)=>a.map((x,i)=>x-b[i]),dot=(a,b)=>a.reduce((n,x,i)=>n+x*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const hit=(p,q,a,b,c)=>{const d=sub(q,p),e=sub(b,a),g=sub(c,a),h=cross(d,g),det=dot(e,h);if(Math.abs(det)<1e-9)return false;const s=sub(p,a),u=dot(s,h)/det,r=cross(s,e),v=dot(d,r)/det,t=dot(g,r)/det;return Math.min(u,v,1-u-v,t,1-t)>1e-7};
 const tris=candidate.faces.flatMap((f,fi)=>f.slice(1,-1).map((_,j)=>({fi,ids:[f[0],f[j+1],f[j+2]]})));
 for(const t of tris){const [a,b,c]=t.ids.map(i=>V[i]);assert.ok(Math.hypot(...cross(sub(b,a),sub(c,a)))>1e-8)}
 for(let i=0;i<tris.length;i++)for(let j=i+1;j<tris.length;j++){const a=tris[i],b=tris[j];if(a.fi===b.fi||a.ids.some(k=>b.ids.includes(k)))continue;const p=a.ids.map(k=>V[k]),q=b.ids.map(k=>V[k]);assert.ok(!p.some((v,k)=>hit(v,p[(k+1)%3],...q))&&!q.some((v,k)=>hit(v,q[(k+1)%3],...p)),'triangle crossing '+a.fi+'/'+b.fi)}
 await writeFile(folder+'/stage5-e.json',JSON.stringify(candidate,null,2));report.mesh={vertices:V.length,faces:candidate.faces.length,edges:edges.size,triangles:tris.length};
 await inspect('after',[2,3,88,89,90,91,92,93,100,101,102,103,104,105]);
 await bar.getByRole('button',{name:'放大 3D 编辑'}).click();await bar.getByRole('button',{name:'成品预览',exact:true}).click();
 for(const angle of ['正面','侧面','左侧','3/4','左 3/4','低角度','左低角度','俯视','仰视']){await bar.getByRole('button',{name:angle,exact:true}).click();await shot('full-'+angle.replace('/','-'))}
 assert.deepEqual(report.errors,[]);
}catch(e){report.errors.push(String(e));if(page)await page.screenshot({path:folder+'/failure.png',fullPage:true}).catch(()=>{});throw e}finally{await writeFile(folder+'/report.json',JSON.stringify(report,null,2));await browser?.close();server.kill('SIGTERM')}
