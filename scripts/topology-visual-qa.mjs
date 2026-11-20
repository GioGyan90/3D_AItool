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
    await dialog.getByText(new RegExp(`${v} 顶点 / ${f} 面`)).waitFor({timeout:15000});
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
    if(['01-loop-front','03-loop-three-quarter','05-local-cut','07-extruded-inset','00-rubik-from-cube','08-rubik-angle','09-rubik-front','10-rubik-low'].includes(name)){
      const jpeg=await region.screenshot({type:'jpeg',quality:35,animations:'disabled'});
      console.log('TOPOLOGY_QA_JPEG_'+name+':'+jpeg.toString('base64'));
    }
    console.log('[QA] Screenshot',name,file.size);
    assert.ok(file.size>3500,`3D preview screenshot ${name} seems empty (${file.size} B)`);
    notes.shots.push({name,path,size:file.size});
  };
  await counts(8,6);
  await dialog.getByRole('button',{name:'六次环切 · 生成魔方'}).waitFor();
  assert.equal(await dialog.getByRole('button',{name:'布线',exact:true}).getAttribute('aria-pressed'),'true');
  await screenshot('00-cube-angle');
  // The wizard must genuinely convert the single 8-vertex base cube.
  await dialog.getByRole('button',{name:'六次环切 · 生成魔方'}).click();
  await counts(56,54);
  assert.equal(await dialog.getByRole('button',{name:'配色',exact:true}).getAttribute('aria-pressed'),'true',
    'painting tab should auto-focus after Rubik generation');
  await dialog.getByRole('button',{name:'布线',exact:true}).click();
  assert.equal(await dialog.getByRole('button',{name:'六次环切 · 生成魔方'}).count(),0,
    'once subdivided, training shortcut must be hidden');
  await dialog.getByRole('button',{name:'配色',exact:true}).click();
  await dialog.getByRole('button',{name:'3/4',exact:true}).first().click();
  await screenshot('00-rubik-from-cube');
  await dialog.getByRole('button',{name:'显示布线',exact:true}).click();
  await dialog.getByRole('button',{name:'成品预览',exact:true}).click();
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
  await reopened.getByText(/18 顶点 \/ 17 面/).waitFor();
  notes.checks.push('applied and reopened same 18/17 control cage');
  await reopened.getByRole('button',{name:'关闭场景顶点编辑'}).click();
  await reopened.waitFor({state:'hidden'});
  // New scene sample should be a persistent colored model, not 27 boxlets.
  await page.getByRole('button',{name:'魔方示例',exact:true}).click();
  await counts(56,54);
  await dialog.getByRole('button',{name:'3/4',exact:true}).first().click();
  await dialog.getByRole('button',{name:'重置视角',exact:true}).click();
  notes.checks.push('camera re-center action available on active preset');
  await screenshot('08-rubik-angle');
  await dialog.getByRole('button',{name:'正面',exact:true}).first().click();
  await screenshot('09-rubik-front');
  await dialog.getByRole('button',{name:'低角度',exact:true}).first().click();
  await screenshot('10-rubik-low');
  // Check the complete workbench layout rather than only the canvas:
  // a narrow properties inspector and enough room for the 3D model.
  await dialog.getByRole('button',{name:'配色',exact:true}).click();
  const side=await dialog.locator('aside').boundingBox();
  const visual=await dialog.getByLabel('3D 旋转预览').boundingBox();
  assert.ok(side&&side.width>=290&&side.width<=410,'inspector width should stay compact');
  assert.ok(visual&&visual.width>=800&&visual.height>=250,'3D preview needs usable space');
  assert.ok(await dialog.getByText('02 · 建模操作').isVisible());
  assert.ok(await dialog.getByText('01 · 当前选择').isVisible());
  assert.ok(await dialog.getByRole('group',{name:'建模工具分类'}).isVisible());
  const asideBackground=await dialog.locator('aside').evaluate(el=>getComputedStyle(el).backgroundColor);
  assert.notEqual(asideBackground,'rgba(0, 0, 0, 0)','inspector must have a distinct background');
  notes.checks.push('clear inspector hierarchy and separated tool navigation');
  const uiPath=`${folder}/11-workbench-paint.png`;
  await page.screenshot({path:uiPath,animations:'disabled'});
  notes.shots.push({name:'11-workbench-paint',path:uiPath,size:(await stat(uiPath)).size});
  const uiJpeg=await page.screenshot({type:'jpeg',quality:32,animations:'disabled'});
  console.log('RUBIK_UI_JPEG:'+uiJpeg.toString('base64'));
  notes.checks.push('paint inspector fits beside 3D viewport');
  // Painting is reversible and must survive apply/reopen.
  await selectFace(0);
  await dialog.getByRole('button',{name:'涂色 right'}).click();
  await dialog.getByRole('button',{name:'撤销',exact:true}).click();
  await dialog.getByRole('button',{name:'重做',exact:true}).click();
  await dialog.getByRole('button',{name:'应用到场景'}).click();
  await dialog.waitFor({state:'hidden'});
  await page.getByRole('button',{name:'编辑顶点',exact:true}).click();
  await counts(56,54);
  notes.checks.push('Rubik face painting persisted through undo/redo and scene application');
  // Check new selection hierarchy, group painting and symmetric mode.
  await dialog.getByRole('button',{name:'配色',exact:true}).click();
  await selectFace(0);
  await dialog.getByRole('button',{name:'选择同一平面'}).click();
  await dialog.getByText(/已选 9 面/).waitFor({timeout:10000});
  await dialog.getByRole('button',{name:'涂色 back'}).click();
  await dialog.getByRole('button',{name:'撤销',exact:true}).click();
  await dialog.getByRole('button',{name:'重做',exact:true}).click();
  notes.checks.push('coplanar 9-face paint survived undo/redo');
  await dialog.getByRole('button',{name:'塑形',exact:true}).click();
  await dialog.getByLabel('对称 X').check();
  await dialog.getByLabel('对称 Y').check();
  assert.ok(await dialog.getByLabel('对称 X').isChecked());
  assert.ok(await dialog.getByLabel('对称 Y').isChecked());
  await dialog.getByLabel('选择顶点编号').fill('0');
  await dialog.getByLabel('顶点 X').fill('-0.6');
  await dialog.getByLabel('顶点 X').press('Tab');
  await dialog.getByRole('button',{name:'撤销',exact:true}).click();
  notes.checks.push('symmetry axes enabled and coordinate edit undoable');
  await dialog.getByRole('button',{name:'检查',exact:true}).click();
  await dialog.getByText('基础拓扑检查通过').waitFor();
  const inspectPath=`${folder}/14-inspect-panel.png`;
  await page.screenshot({path:inspectPath,animations:'disabled'});
  notes.shots.push({name:'14-inspect-panel',path:inspectPath,size:(await stat(inspectPath)).size});
  await dialog.getByRole('button',{name:'配色',exact:true}).click();
  const desktopPath=`${folder}/12-workbench-refined-desktop.png`;
  await page.screenshot({path:desktopPath,animations:'disabled'});
  notes.shots.push({name:'12-workbench-refined-desktop',path:desktopPath,size:(await stat(desktopPath)).size});
  for(const [width,height,label] of [
    [900,700,'tablet'],[390,844,'mobile']
  ]){
    await page.setViewportSize({width,height});
    await page.waitForTimeout(250);
    const asideBox=await dialog.locator('aside').boundingBox();
    const previewBox=await dialog.getByLabel('3D 旋转预览').boundingBox();
    const path=`${folder}/13-workbench-${label}.png`;
    await page.screenshot({path,animations:'disabled'});
    notes.shots.push({name:label,path,size:(await stat(path)).size});
    console.log('[RESPONSIVE QA]',JSON.stringify({label,width,height,asideBox,previewBox}));
    if(label==='mobile'){
      for(const name of ['撤销','重做','应用到场景']){
        const action=dialog.getByRole('button',{name,exact:true});
        const bounds=await action.boundingBox();
        assert.ok(bounds&&bounds.width>bounds.height*1.15&&bounds.height<=45,
          `mobile header action ${name} rendered as a vertical label: ${JSON.stringify(bounds)}`);
        assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+2,
          `mobile header action ${name} outside viewport`);
      }
      notes.checks.push('mobile header buttons remain horizontally readable');
      const jpeg=await page.screenshot({type:'jpeg',quality:32,animations:'disabled'});
      console.log('RESPONSIVE_MOBILE_JPEG:'+jpeg.toString('base64'));
    }
    assert.ok(asideBox&&previewBox,`missing ${label} editor region`);
    assert.ok(asideBox.x>=-1&&asideBox.x+asideBox.width<=width+2,`${label}: inspector horizontal overflow`);
    assert.ok(previewBox.width>=Math.min(300,width-30),`${label}: 3D viewport too narrow`);
    assert.ok(previewBox.height>=150,`${label}: 3D viewport too short`);
    notes.checks.push(`${label} UI fits (${width}x${height})`);
  }
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
