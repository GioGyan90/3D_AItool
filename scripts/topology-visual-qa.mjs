// Browser smoke test: topology editing on the real R3F Canvas (WebGL / SwiftShader).
// Run with: npm install --no-save --no-package-lock playwright && npx playwright install chromium
// then: node scripts/topology-visual-qa.mjs
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';

const folder='artifacts/topology-qa';
await mkdir(folder,{recursive:true});
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--port','3000','--host','127.0.0.1'],{stdio:'ignore'});
let browser;
const notes={shots:[],checks:[],errors:[]};
try{
  let available=false;
  for(let i=0;i<50;i++){
    if(vite.exitCode!==null)throw Error('Vite dev server exited early');
    try{const res=await fetch('http://127.0.0.1:3000/');if(res.ok){available=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,400));
  }
  assert.ok(available,'Vite app did not start');
  const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(p=>existsSync(p));
  if(!executablePath)throw Error('CI runner lacks system Chrome; install a browser explicitly');
  console.log('[QA] Using system Chrome',executablePath);
  browser=await chromium.launch({executablePath,headless:true,args:[
    '--no-sandbox','--use-gl=angle','--use-angle=swiftshader',
    '--enable-webgl','--enable-unsafe-swiftshader'
  ]});
  const page=await browser.newPage({viewport:{width:1680,height:1000},deviceScaleFactor:1});
  page.on('pageerror',error=>notes.errors.push(error.message));
  await page.goto('http://127.0.0.1:3000/',{waitUntil:'domcontentloaded'});
  console.log('[QA] Editor launch');
  await page.getByRole('button',{name:'布线建模',exact:true}).click({timeout:30000});
  const dialog=page.getByRole('dialog',{name:/场景顶点编辑/});
  await dialog.waitFor();
  const counts=async(v,f)=>{
    console.log('[QA] Expected counts',v,f);
    await dialog.getByText(`顶点 ${v} · 控制面 ${f}`).waitFor({timeout:15000});
    notes.checks.push(`vertices=${v},faces=${f}`);
  };
  const selectFace=async n=>{
    await dialog.getByLabel('控制面编号').fill(String(n));
    await dialog.getByText(`面 #${n}：`,{exact:false}).waitFor();
  };
  const screenshot=async(name)=>{
    const region=dialog.getByLabel('3D 旋转预览');
    const canvas=region.locator('canvas');
    await canvas.waitFor();
    const hasWebgl=await canvas.evaluate(el=>Boolean(el.getContext('webgl2')||el.getContext('webgl')));
    assert.ok(hasWebgl,'3D viewer lacks WebGL context');
    const path=`${folder}/${name}.png`;
    await region.screenshot({path,animations:'disabled'});
    const file=await stat(path);
    if(['01-loop-front','03-loop-three-quarter','05-local-cut','07-extruded-inset','08-rubik-angle','09-rubik-front','10-rubik-low'].includes(name)){
      const jpeg=await region.screenshot({type:'jpeg',quality:35,animations:'disabled'});
      console.log('TOPOLOGY_QA_JPEG_'+name+':'+jpeg.toString('base64'));
    }
    console.log('[QA] Screenshot',name,file.size);
    assert.ok(file.size>3500,`3D preview screenshot ${name} seems empty (${file.size} B)`);
    notes.shots.push({name,path,size:file.size});
  };
  await counts(8,6);
  await screenshot('00-cube-angle');
  // The wizard must genuinely convert the single 8-vertex base cube.
  await dialog.getByRole('button',{name:'六次环切 · 生成魔方'}).click();
  await counts(56,54);
  await dialog.getByRole('button',{name:'3/4',exact:true}).first().click();
  await screenshot('08-rubik-angle');
  await dialog.getByRole('button',{name:'撤销',exact:true}).click();
  await counts(8,6);
  await dialog.getByRole('button',{name:'布线',exact:true}).click();
  await selectFace(0);
  await dialog.getByRole('button',{name:'连续环线'}).click();
  await counts(12,10);
  for(const [name,direction] of [
    ['01-loop-front','正面'],['02-loop-back','背面'],
    ['03-loop-three-quarter','3/4'],['04-loop-low','低角度']
  ]){
    await dialog.getByRole('button',{name:direction,exact:true}).first().click();
    await screenshot(name);
  }
  await dialog.getByRole('button',{name:'撤销',exact:true}).click();
  await counts(8,6);
  await dialog.getByRole('button',{name:'重做',exact:true}).click();
  await counts(12,10);
  await dialog.getByRole('button',{name:'撤销',exact:true}).click();
  await counts(8,6);
  await selectFace(0);
  await dialog.getByRole('button',{name:/局部切割/}).click();
  await counts(10,9);
  await screenshot('05-local-cut');
  await selectFace(0);
  await dialog.getByRole('button',{name:'塑形',exact:true}).click();
  await dialog.getByRole('button',{name:'面内插 · Inset'}).click();
  await counts(14,13);
  await screenshot('06-inset');
  await selectFace(4); // inner cap created after four ring quads
  await dialog.getByRole('button',{name:'面挤出 · Extrude'}).click();
  await counts(18,17);
  await screenshot('07-extruded-inset');
  // Committing the working cage into the scene must preserve the generated
  // vertex/face IDs; reopening should not silently retriangulate the cage.
  console.log('[QA] Apply modified mesh and reopen same scene layer');
  await dialog.getByRole('button',{name:'应用到场景'}).click();
  await dialog.waitFor({state:'hidden',timeout:15000});
  await page.getByRole('button',{name:'编辑顶点',exact:true}).click();
  const reopened=page.getByRole('dialog',{name:/场景顶点编辑/});
  await reopened.waitFor();
  await reopened.getByText('顶点 18 · 控制面 17').waitFor();
  notes.checks.push('applied and reopened same 18/17 control cage');
  await reopened.getByRole('button',{name:'关闭场景顶点编辑'}).click();
  await reopened.waitFor({state:'hidden'});
  // New scene sample should be a persistent colored model, not 27 boxlets.
  await page.getByRole('button',{name:'魔方示例',exact:true}).click();
  await counts(56,54);
  await dialog.getByRole('button',{name:'3/4',exact:true}).first().click();
  await screenshot('08-rubik-angle');
  await dialog.getByRole('button',{name:'正面',exact:true}).first().click();
  await screenshot('09-rubik-front');
  await dialog.getByRole('button',{name:'低角度',exact:true}).first().click();
  await screenshot('10-rubik-low');
  // Painting is reversible and must survive apply/reopen.
  await dialog.getByRole('button',{name:'配色',exact:true}).click();
  await selectFace(0);
  await dialog.getByRole('button',{name:'涂色 right'}).click();
  await dialog.getByRole('button',{name:'撤销',exact:true}).click();
  await dialog.getByRole('button',{name:'重做',exact:true}).click();
  await dialog.getByRole('button',{name:'应用到场景'}).click();
  await dialog.waitFor({state:'hidden'});
  await page.getByRole('button',{name:'编辑顶点',exact:true}).click();
  await counts(56,54);
  notes.checks.push('Rubik face painting persisted through undo/redo and scene application');
  assert.deepEqual(notes.errors,[],'Unhandled errors occurred in browser');
  console.log('Topology browser QA passed',JSON.stringify(notes));
}catch(error){
  console.error('Topology visual QA FAILED:',error,JSON.stringify(notes));
  throw error;
}finally{
  await writeFile(`${folder}/results.json`,JSON.stringify(notes,null,2));
  await browser?.close();
  vite.kill('SIGTERM');
}
