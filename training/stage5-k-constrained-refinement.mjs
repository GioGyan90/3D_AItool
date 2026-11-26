import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {triangulateFaces} from '../src/components/traceGeometry.ts';
import {regionDimensions,landmarkMeasurement,regionFolds,renderedRegionDiagnostics} from '../src/components/regionInspection.ts';
const folder='artifacts/stage5-k';await mkdir(folder,{recursive:true});
const original=JSON.parse(await readFile('stage5-j-artifact/stage5-j.json','utf8'));
assert.equal(original.vertices.length,113);assert.equal(original.faces.length,112);
// Search symmetric Z-only corrections on the provisional 05J baseline, after 05J.
const region=[30,31,34,35,...Array.from({length:12},(_,i)=>64+i),26,29,32,33,38,39,40,41];
const mirror=original.vertices.map(v=>original.vertices.findIndex(w=>Math.abs(v[0]+w[0])<1e-7&&Math.abs(v[1]-w[1])<1e-7&&Math.abs(v[2]-w[2])<1e-7));
const diagnostics=m=>renderedRegionDiagnostics(m,triangulateFaces(m.vertices,m.faces,false,true),m.faces.map((_,i)=>i)).folds;
const base=diagnostics(original),key=e=>e.faces.join(':')+':'+Math.min(e.a,e.b)+':'+Math.max(e.a,e.b),limits=new Map(base.map(e=>[key(e),Math.abs(e.degrees)]));
const score=es=>es.reduce((s,e)=>s+(e.internal?1:.3)*Math.max(0,Math.abs(e.degrees)-(e.internal?25:35))**2,0);
let best=original,bestScore=score(base);
for(const id of [44,37,38,62,66,53,55,43,54,56])for(const dz of [-.015,-.01,-.005,.005,.01,.015]){
 const j=mirror[id];if(j<0||j===id)continue;
 const m={faces:original.faces,vertices:original.vertices.map(v=>[...v])};m.vertices[id][2]+=dz;m.vertices[j][2]+=dz;
 const es=diagnostics(m);if(es.some(e=>!limits.has(key(e))||Math.abs(e.degrees)>Math.max(e.internal?25:35,limits.get(key(e)))+.5))continue;
 const value=score(es);if(value<bestScore-1e-6){best=m;bestScore=value}
}
assert.ok(best!==original,'No constrained improvement found; preserve 05J');
const changes=best.vertices.flatMap((v,i)=>i<mirror[i]&&v.some((x,k)=>x!==original.vertices[i][k])?[[i,v]]:[]);
const ids=[30,31,34,35,...Array.from({length:12},(_,i)=>64+i),26,29,32,33,38,39,40,41,64,65,66,67,68,69,70,71,72,73,74,75].filter((x,i,a)=>a.indexOf(x)===i),report={sourceRun:45847010497,changes,shots:[],errors:[]};
const expected=original.vertices.map(v=>[...v]),pairs=original.vertices.map(v=>original.vertices.findIndex(w=>Math.abs(v[0]+w[0])<1e-7&&Math.abs(v[1]-w[1])<1e-7&&Math.abs(v[2]-w[2])<1e-7));
for(const [id,v] of changes){assert.ok(pairs[id]>=0);expected[id]=v;expected[pairs[id]]=[-v[0],v[1],v[2]]}
const measure=m=>({region:regionDimensions(m,ids),eyeWidth:landmarkMeasurement(m,64,67),eyeHeight:landmarkMeasurement(m,63,65),outerEye:landmarkMeasurement(m,45,67),folds:regionFolds(m,ids),rendered:renderedRegionDiagnostics(m,triangulateFaces(m.vertices,m.faces,false,true),ids).folds});
report.before=measure(original);report.search={baselineScore:score(base),candidateScore:bestScore};
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','3023','--strictPort'],{stdio:'ignore'});
let browser,page;
try{
 let ready=false;for(let i=0;i<75;i++){try{if((await fetch('http://127.0.0.1:3023/')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,400))}assert.ok(ready);
 const bin=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert.ok(bin);
 browser=await chromium.launch({executablePath:bin,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']});
 page=await browser.newPage({viewport:{width:1440,height:960},acceptDownloads:true});page.on('pageerror',e=>report.errors.push(String(e)));
 await page.goto('http://127.0.0.1:3023/',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'顶点对照',exact:true}).click();
 const d=page.getByRole('dialog',{name:'顶点参考对照'});
 await d.getByLabel('导入顶点 JSON').setInputFiles({name:'stage5-j.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(original))});
 await d.getByRole('button',{name:'显示 3D 预览',exact:true}).click();
 const bar=d.getByRole('toolbar',{name:'三维视图工具栏'}),view=d.getByLabel('3D 旋转预览');
 const toggle=()=>bar.getByRole('button',{name:/^局部观察 \/ 区域隔离/}).click();
 const shot=async(name)=>{await page.waitForTimeout(350);const path=folder+'/'+name+'.png';await view.locator('canvas').screenshot({path,animations:'disabled'});report.shots.push(path)};
 const full=async(tag)=>{await bar.getByRole('button',{name:'放大 3D 编辑'}).click();await bar.getByRole('button',{name:'成品预览',exact:true}).click();for(const angle of ['正面','侧面','左侧','3/4','左 3/4','低角度','左低角度','俯视','仰视']){await bar.getByRole('button',{name:angle,exact:true}).click();await shot(tag+'-full-'+angle.replace('/','-'))}await bar.getByRole('button',{name:'显示布线',exact:true}).click();await bar.getByRole('button',{name:'恢复小预览'}).click()};
 const inspect=async(tag,capture)=>{
 await bar.getByRole('button',{name:'放大 3D 编辑'}).click();await toggle();await d.getByLabel('观察区域面编号').fill(ids.join(','));await d.getByRole('button',{name:'观察当前区域'}).click();
 if(capture)await d.getByRole('button',{name:'保存修形前基线'}).click();else await d.getByText('已保存同拓扑基线',{exact:true}).waitFor();
 await d.getByLabel('测量顶点 A').fill('64');await d.getByLabel('测量顶点 B').fill('67');
 report[tag+'Dimensions']=await d.getByLabel('区域尺寸比例').innerText();report[tag+'Landmarks']=await d.getByLabel('标志点距离').innerText();
 await toggle();for(const angle of ['正面','侧面','左侧','3/4','左 3/4','低角度','左低角度','俯视','仰视']){await bar.getByRole('button',{name:angle,exact:true}).click();await shot(tag+'-ghost-'+angle.replace('/','-'))}
 await toggle();await d.getByLabel('观察背景模式').selectOption('isolate');await d.getByRole('checkbox',{name:'凹凸边诊断'}).check();report[tag+'Folds']=await d.getByLabel('区域凹凸边报告').innerText();await toggle();
 for(const angle of ['正面','侧面','低角度','左低角度']){await bar.getByRole('button',{name:angle,exact:true}).click();await shot(tag+'-isolated-'+angle)}
 await toggle();await d.getByRole('checkbox',{name:'凹凸边诊断'}).uncheck();await d.getByRole('checkbox',{name:'渲染三角法线'}).check();report[tag+'RenderedFolds']=await d.getByLabel('渲染三角折角报告').innerText();await toggle();for(const angle of ['正面','3/4','左低角度']){await bar.getByRole('button',{name:angle,exact:true}).click();await shot(tag+'-normals-'+angle.replace('/','-'))}await toggle();await d.getByRole('checkbox',{name:'渲染三角法线'}).uncheck();await d.getByRole('checkbox',{name:'局部剖切分析'}).check();await bar.getByRole('button',{name:'俯视',exact:true}).click();
 for(const p of [.2,.35,.5,.65,.8]){await d.getByLabel('剖切位置').fill(String(p));const svg=d.getByRole('img',{name:'局部截面轮廓'});await svg.waitFor();assert.ok(await svg.locator('line[stroke-dasharray]').count()>0);await svg.screenshot({path:folder+'/'+tag+'-section-'+p+'.png'});}
 await page.screenshot({path:folder+'/'+tag+'-ui.png',fullPage:true});
 await d.getByRole('button',{name:'退出区域观察'}).click();await toggle();await bar.getByRole('button',{name:'恢复小预览'}).click();
 };
 await full('before');await inspect('before',true);
 await d.getByRole('button',{name:'展开精确选择'}).click();const vertex=d.getByLabel('选择顶点编号'),face=d.getByLabel('控制面编号');
 await vertex.fill('44');await d.getByRole('button',{name:'塑形',exact:true}).click();const sym=d.locator('summary').filter({hasText:'顶点对称设置'});if(!(await sym.locator('..').evaluate(el=>el.open)))await sym.click();const symmetry=d.getByRole('checkbox',{name:'对称 X',exact:true});await symmetry.check();
 for(const [id,v] of changes){await vertex.fill(String(id));for(const [axis,n] of [['X',v[0]],['Y',v[1]],['Z',v[2]]]){const input=d.getByLabel('顶点 '+axis,{exact:true});if(Math.abs(Number(await input.inputValue())-n)>1e-10){await input.fill(String(n));await input.press('Enter');assert.ok(Math.abs(Number(await input.inputValue())-n)<1e-8)}}}
 await symmetry.uncheck();await vertex.fill('');await face.fill('');
 const output=page.waitForEvent('download');await d.getByRole('button',{name:'保存顶点 JSON',exact:true}).click();await(await output).saveAs(folder+'/stage5-k-editor-export.json');
 const raw=JSON.parse(await readFile(folder+'/stage5-k-editor-export.json','utf8')),candidate={vertices:raw.vertices,faces:raw.faces};assert.deepEqual(candidate.faces,original.faces);
 for(let i=0;i<113;i++)assert.ok(candidate.vertices[i].every((v,k)=>Math.abs(v-expected[i][k])<1e-7),'unexpected coordinate '+i);
 const V=candidate.vertices,idx=triangulateFaces(V,candidate.faces,false,true),T=[];
 for(let i=0;i<idx.length;i+=3)T.push(idx.slice(i,i+3));assert.equal(T.length,222);
 const sub=(a,b)=>a.map((x,i)=>x-b[i]),dot=(a,b)=>a.reduce((n,x,i)=>n+x*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const hit=(p,q,a,b,c)=>{const d=sub(q,p),e=sub(b,a),g=sub(c,a),h=cross(d,g),det=dot(e,h);if(Math.abs(det)<1e-9)return false;const s=sub(p,a),u=dot(s,h)/det,r=cross(s,e),v=dot(d,r)/det,t=dot(g,r)/det;return Math.min(u,v,1-u-v,t,1-t)>1e-7};
 for(const t of T){const [a,b,c]=t.map(i=>V[i]);assert.ok(Math.hypot(...cross(sub(b,a),sub(c,a)))>1e-8)}
 for(let i=0;i<T.length;i++)for(let j=i+1;j<T.length;j++){const a=T[i],b=T[j];if(a.some(k=>b.includes(k)))continue;const p=a.map(k=>V[k]),q=b.map(k=>V[k]);assert.ok(!p.some((v,k)=>hit(v,p[(k+1)%3],...q))&&!q.some((v,k)=>hit(v,q[(k+1)%3],...p)),'rendered triangle crossing '+i+'/'+j)}
 report.after=measure(candidate);report.changed=V.filter((v,i)=>v.some((x,k)=>Math.abs(x-original.vertices[i][k])>1e-7)).length;assert.equal(report.changed,changes.length*2);
 await writeFile(folder+'/stage5-k.json',JSON.stringify(candidate,null,2));await inspect('after',false);await full('after');assert.deepEqual(report.errors,[]);
}catch(e){report.errors.push(String(e));if(page)await page.screenshot({path:folder+'/failure.png',fullPage:true}).catch(()=>{});throw e}finally{await writeFile(folder+'/report.json',JSON.stringify(report,null,2));await browser?.close();server.kill('SIGTERM')}
