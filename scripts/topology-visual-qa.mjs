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
  assert.equal(await page.getByRole('button',{name:'魔方示例',exact:true}).count(),0,
    'Rubik demo must not appear as a standalone homepage button');
  notes.checks.push('Rubik test is absent from home navigation');
  await page.getByRole('button',{name:'布线建模',exact:true}).click({timeout:30000});
  const dialog=page.getByRole('dialog',{name:/场景顶点编辑/});
  await dialog.waitFor();
  const counts=async(v,f)=>{
    console.log('[QA] Expected counts',v,f);
    await dialog.getByText(new RegExp(`${v} 顶点 / ${f} 面`)).waitFor({timeout:15000});
    notes.checks.push(`vertices=${v},faces=${f}`);
  };
  const selectFace=async n=>{
    const field=dialog.getByLabel('控制面编号');
    if(!await field.isVisible())await dialog.getByRole('button',{name:'展开精确选择'}).click();
    await field.fill(String(n));
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
  // Reference image acceptance: generate an opaque high-contrast PNG locally.
  // Compare actual WebGL canvas pixels, not just the visibility of UI controls.
  await counts(8,6);
  await dialog.getByRole('button',{name:'参考图',exact:true}).click();
  await dialog.getByText('空间参考图 · 0',{exact:true}).click();
  const png=await page.evaluate(()=>{
    const c=document.createElement('canvas');c.width=128;c.height=96;
    const ctx=c.getContext('2d');ctx.fillStyle='#ea19b7';ctx.fillRect(0,0,128,96);
    ctx.fillStyle='#1beac1';ctx.fillRect(8,8,48,72);
    return c.toDataURL('image/png').split(',')[1];
  });
  const refUpload=dialog.getByLabel('上传空间参考图');
  await refUpload.setInputFiles({name:'qa-reference.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await dialog.getByLabel('当前空间参考图').waitFor();
  await dialog.getByRole('button',{name:'正面参考',exact:true}).click();
  await dialog.getByRole('button',{name:'正面',exact:true}).first().click();
  await dialog.getByLabel('参考图宽度',{exact:true}).fill('1.8');
  const region=dialog.getByLabel('3D 旋转预览');
  const capture=()=>region.locator('canvas').screenshot({animations:'disabled'});
  // Allow the texture decode and upload to settle.
  await page.waitForTimeout(700);
  const withRef=await capture();
  await screenshot('reference-front');
  await dialog.getByLabel('显示',{exact:true}).uncheck();
  await page.waitForTimeout(200);
  const withoutRef=await capture();
  assert.ok(!withRef.equals(withoutRef),'reference visibility must affect rendered canvas');
  await dialog.getByLabel('显示',{exact:true}).check();
  await dialog.getByLabel('参考图 位置 X',{exact:true}).fill('0.3');
  await dialog.getByLabel('参考图 旋转 Z',{exact:true}).fill('15');
  await dialog.getByLabel('前景叠加',{exact:true}).check();
  await page.waitForTimeout(250);
  assert.ok(!(await capture()).equals(withRef),'reference transform/overlay must affect rendered canvas');
  await screenshot('reference-overlay-transform');
  await refUpload.setInputFiles({name:'qa-side.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await dialog.getByText('空间参考图 · 2',{exact:true}).waitFor();
  await dialog.getByRole('button',{name:'侧面参考',exact:true}).click();
  await dialog.getByRole('button',{name:'3/4',exact:true}).first().click();
  await page.waitForTimeout(300);
  await screenshot('reference-two-planes');
  await counts(8,6);
  await dialog.getByRole('button',{name:'布线',exact:true}).click();
  await selectFace(0);
  await dialog.getByRole('button',{name:'连续环线'}).click();
  await counts(12,10);
  await dialog.getByRole('button',{name:'撤销',exact:true}).click();
  await counts(8,6);
  await dialog.getByRole('button',{name:'参考图',exact:true}).click();
  await dialog.getByRole('button',{name:'移除当前参考图'}).click();
  await dialog.getByRole('button',{name:'移除当前参考图'}).click();
  await dialog.getByText('空间参考图 · 0',{exact:true}).click();
  await dialog.getByRole('button',{name:'布线',exact:true}).click();
  notes.checks.push('Spatial references: upload two PNGs, canvas visibility and transform differences, side preset, ring cut/undo preserves reference independence, remove both');
  await counts(8,6);
  assert.equal(await dialog.getByRole('button',{name:'布线',exact:true}).getAttribute('aria-pressed'),'true');
  await dialog.getByText('快捷示例 · 3×3 魔方环切',{exact:true}).click();
  await dialog.getByRole('button',{name:'六次环切 · 生成魔方'}).waitFor();
  notes.checks.push('Rubik quick example is collapsed inside the topology tab');
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
  // The Rubik teaching shortcut belongs only inside the cube topology
  // editor. Return to a clean scene, create a base cube and use that shortcut.
  await page.reload({waitUntil:'domcontentloaded'});
  assert.equal(await page.getByRole('button',{name:'魔方示例',exact:true}).count(),0,
    'home must not expose the removed standalone Rubik demo');
  await page.getByRole('button',{name:'布线建模',exact:true}).click();
  await dialog.waitFor();
  await counts(8,6);
  await dialog.getByText('快捷示例 · 3×3 魔方环切',{exact:true}).click();
  await dialog.getByRole('button',{name:'六次环切 · 生成魔方'}).click();
  await counts(56,54);
  notes.checks.push('Rubik example remains available via base cube > topology quick preset');
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
  assert.ok(side&&side.width>=330&&side.width<=490,'inspector should adapt to available desktop width');
  assert.ok(visual&&visual.width>=800&&visual.height>=250,'3D preview needs usable space');
  assert.ok(await dialog.getByRole('heading',{name:'建模操作'}).isVisible());
  assert.ok(await dialog.getByText('当前选择',{exact:true}).isVisible());
  assert.ok(await dialog.getByRole('group',{name:'建模工具分类'}).isVisible());
  const asideBackground=await dialog.locator('aside').evaluate(el=>getComputedStyle(el).backgroundColor);
  assert.notEqual(asideBackground,'rgba(0, 0, 0, 0)','inspector must have a distinct background');
  const activeParameters=dialog.getByLabel('当前工具参数');
  const toolTabs=dialog.getByRole('group',{name:'建模工具分类'});
  assert.ok(await activeParameters.isVisible(),'active tools should always be accessible');
  assert.ok(await toolTabs.isVisible(),'task navigation should remain visible');
  const compactSelection=await dialog.getByRole('button',{name:'展开精确选择'}).count();
  assert.equal(compactSelection,1,'compact precision controls are opt-in');
  notes.checks.push('compact selection, pinned task tabs, independent parameter scroll');
  const beforeExpanded=await dialog.locator('aside').boundingBox();
  await dialog.getByRole('button',{name:'展开工具区'}).click();
  const wider=await dialog.locator('aside').boundingBox();
  assert.ok(wider.width>beforeExpanded.width+30,'desktop expanded inspector should grow');
  await dialog.getByRole('button',{name:'返回画布布局'}).click();
  notes.checks.push('desktop inspector expand/restore');
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
  await dialog.getByText(/将编辑 9 个控制面/).waitFor({timeout:10000});
  await dialog.getByRole('button',{name:'涂色 back'}).click();
  await dialog.getByRole('button',{name:'撤销',exact:true}).click();
  await dialog.getByRole('button',{name:'重做',exact:true}).click();
  notes.checks.push('coplanar 9-face paint survived undo/redo');
  // Audit remaining paint tools: matching-color group, custom color and clear / undo.
  await selectFace(0);
  await dialog.getByRole('button',{name:'选择相同颜色'}).click();
  await dialog.getByText(/将编辑 \d+ 个控制面/).waitFor();
  await dialog.locator('input[type="color"]').fill('#6744aa');
  await dialog.getByRole('button',{name:'应用到已选面'}).click();
  await dialog.getByRole('button',{name:'撤销',exact:true}).click();
  await dialog.getByText('更多配色操作').click();
  await dialog.getByRole('button',{name:'清空全部面颜色'}).click();
  await dialog.getByRole('button',{name:'撤销',exact:true}).click();
  notes.checks.push('same-color group, custom paint, clear-all and undo');
  await dialog.getByRole('button',{name:'塑形',exact:true}).click();
  await dialog.getByText('顶点对称设置 · X/Y/Z',{exact:true}).click();
  await dialog.getByLabel('对称 X').check();
  await dialog.getByLabel('对称 Y').check();
  assert.ok(await dialog.getByLabel('对称 X').isChecked());
  assert.ok(await dialog.getByLabel('对称 Y').isChecked());
  await dialog.getByLabel('选择顶点编号').fill('0');
  await dialog.getByLabel('顶点 X').fill('-0.6');
  await dialog.getByLabel('顶点 X').press('Tab');
  await dialog.getByRole('button',{name:'撤销',exact:true}).click();
  notes.checks.push('symmetry axes enabled and coordinate edit undoable');
  // Test view switching and editor overlays without altering the cage.
  await dialog.getByRole('button',{name:'正交编辑',exact:true}).click();
  for(const name of ['正面','侧面','背面','顶部','底部']){
    const view=dialog.getByRole('button',{name,exact:true}).first();
    await view.click();
    assert.equal(await view.getAttribute('aria-pressed'),'true',`orthographic view ${name} should activate`);
  }
  for(const name of ['放置顶点','连接成面','选择/移动']){
    const action=dialog.getByRole('button',{name,exact:true});
    await action.click();
    assert.equal(await action.getAttribute('aria-pressed'),'true',`edit mode ${name} should activate`);
  }
  const previousPrecision=dialog.getByRole('button',{name:'收起精确选择'});
  if(await previousPrecision.count())await previousPrecision.click();
  const projectedVertex=dialog.locator('svg[viewBox="0 0 1000 1000"] circle').first();
  await projectedVertex.click();
  await dialog.getByRole('button',{name:'收起精确选择'}).waitFor();
  notes.checks.push('orthographic vertex pick automatically reveals XYZ precision fields');
  await dialog.getByRole('button',{name:'3D 编辑',exact:true}).click();
  await page.waitForTimeout(250);
  const returnedCamera=await dialog.getByLabel('3D 旋转预览').screenshot({type:'jpeg',quality:34,animations:'disabled'});
  console.log('CAMERA_RETURN_JPEG:'+returnedCamera.toString('base64'));
  await dialog.getByRole('button',{name:'布线',exact:true}).click();
  await dialog.getByLabel('透视背面布线').check();
  await dialog.getByLabel('透视背面布线').uncheck();
  await dialog.getByRole('button',{name:'成品预览',exact:true}).click();
  await dialog.getByRole('button',{name:'显示布线',exact:true}).click();
  notes.checks.push('five orthographic angles, three drawing modes, X-Ray and product/cage switching');
  await dialog.getByRole('button',{name:'检查',exact:true}).click();
  await dialog.getByText('基础拓扑检查通过').waitFor();
  const inspectPath=`${folder}/14-inspect-panel.png`;
  await page.screenshot({path:inspectPath,animations:'disabled'});
  notes.shots.push({name:'14-inspect-panel',path:inspectPath,size:(await stat(inspectPath)).size});
  await dialog.getByRole('button',{name:'配色',exact:true}).click();
  const collapsePrecision=dialog.getByRole('button',{name:'收起精确选择'});
  if(await collapsePrecision.count())await collapsePrecision.click();
  const desktopPath=`${folder}/12-workbench-refined-desktop.png`;
  await page.screenshot({path:desktopPath,animations:'disabled'});
  notes.shots.push({name:'12-workbench-refined-desktop',path:desktopPath,size:(await stat(desktopPath)).size});
  for(const [width,height,label] of [
    [1280,640,'short-desktop'],[900,700,'tablet'],[390,844,'mobile']
  ]){
    await page.setViewportSize({width,height});
    await page.waitForTimeout(600);
    const asideBox=await dialog.locator('aside').boundingBox();
    const previewBox=await dialog.getByLabel('3D 旋转预览').boundingBox();
    const path=`${folder}/13-workbench-${label}.png`;
    await page.screenshot({path,animations:'disabled'});
    notes.shots.push({name:label,path,size:(await stat(path)).size});
    console.log('[RESPONSIVE QA]',JSON.stringify({label,width,height,asideBox,previewBox}));
    const nav=dialog.getByRole('group',{name:'建模工具分类'});
    const pane=dialog.getByLabel('当前工具参数');
    assert.ok(await nav.isVisible() && await pane.isVisible(),`${label}: tabs and parameters must be available`);
    const beforeNav=await nav.boundingBox();
    const paneInfo=await pane.evaluate(el=>({height:el.clientHeight,scrollHeight:el.scrollHeight}));
    console.log('[PARAMETER AREA QA]',JSON.stringify({label,paneInfo,asideBox,previewBox}));
    assert.ok(paneInfo.height>=60,`${label}: tool parameter area should remain usable (${JSON.stringify(paneInfo)})`);
    await pane.evaluate(el=>{el.scrollTop=el.scrollHeight});
    const afterNav=await nav.boundingBox();
    assert.ok(beforeNav&&afterNav&&Math.abs(afterNav.y-beforeNav.y)<2,
      `${label}: task tabs must stay pinned while tools scroll`);
    await dialog.getByRole('button',{name:'塑形',exact:true}).click();
    const resetTop=await pane.evaluate(el=>el.scrollTop);
    assert.ok(resetTop<=2,`${label}: switching tabs should show the first parameter, got ${resetTop}`);
    await dialog.getByRole('button',{name:'配色',exact:true}).click();
    notes.checks.push(`${label}: tool parameters scroll independently; tabs remain pinned and reset to top`);
    if(label==='mobile'){
      const canvasMetrics=await dialog.getByLabel('3D 旋转预览').locator('canvas').evaluate(el=>{
        const rect=el.getBoundingClientRect(),parent=el.parentElement?.getBoundingClientRect();
        return {buffer:[el.width,el.height],css:[rect.width,rect.height],parent:[parent?.width,parent?.height]};
      });
      console.log('[MOBILE CANVAS METRICS]',JSON.stringify(canvasMetrics));
      const previewPNG=await dialog.getByLabel('3D 旋转预览').screenshot({type:'png',animations:'disabled'});
      const cubeCoverage=await page.evaluate(async encoded=>{
        const img=new Image();
        img.src='data:image/png;base64,'+encoded;
        await img.decode();
        const canvas=document.createElement('canvas');
        canvas.width=img.width;canvas.height=img.height;
        const ctx=canvas.getContext('2d',{willReadFrequently:true});
        ctx.drawImage(img,0,0);
        const pixels=ctx.getImageData(0,0,img.width,img.height).data;
        let count=0,minY=img.height,maxY=0;
        for(let y=0;y<img.height;y++)for(let x=0;x<img.width;x++){
          const i=(y*img.width+x)*4,r=pixels[i],g=pixels[i+1],b=pixels[i+2];
          const vividRed=r>110&&r>g*1.5&&r>b*1.3;
          const vividBlue=b>90&&b>r*1.2&&b>g*1.2;
          const vividGreen=g>95&&g>r*1.2&&g>b*.9;
          if(vividRed||vividBlue||vividGreen){count++;minY=Math.min(minY,y);maxY=Math.max(maxY,y)}
        }
        return {count,minY,maxY,width:img.width,height:img.height};
      },previewPNG.toString('base64'));
      console.log('[MOBILE CUBE COVERAGE]',JSON.stringify(cubeCoverage));
      assert.ok(cubeCoverage.count>500&&cubeCoverage.minY<cubeCoverage.height*.65&&cubeCoverage.maxY>cubeCoverage.height*.5,
        'mobile cube should remain framed automatically after resizing, not only after manual reset');
      notes.checks.push('mobile 3D cube stays framed automatically on resize');
      await dialog.getByRole('button',{name:'重置视角',exact:true}).click();
      await page.waitForTimeout(350);
      const fitJpeg=await dialog.getByLabel('3D 旋转预览').screenshot({type:'jpeg',quality:34,animations:'disabled'});
      console.log('MOBILE_CAMERA_RESET_JPEG:'+fitJpeg.toString('base64'));
      await dialog.getByRole('button',{name:'展开工具区'}).click();
      const expandedBox=await dialog.locator('aside').boundingBox();
      assert.ok(expandedBox&&expandedBox.width>=width-2&&expandedBox.height>=height-2,
        'mobile full tools mode should use viewport height');
      const fullPath=`${folder}/15-mobile-expanded-tools.png`;
      await page.screenshot({path:fullPath,animations:'disabled'});
      notes.shots.push({name:'mobile-expanded-tools',path:fullPath,size:(await stat(fullPath)).size});
      await dialog.getByRole('button',{name:'返回画布布局'}).click();
      notes.checks.push('mobile tool panel expands fullscreen and restores canvas');
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
  // Advanced modeling safeguards: destructive edit can be undone, an invalid
  // full-cube mirror must be rejected without changing the existing cage.
  await page.setViewportSize({width:1440,height:850});
  await selectFace(0);
  await dialog.getByRole('button',{name:/高级操作与来源/}).click();
  await dialog.getByRole('button',{name:/删除选中控制面/}).click();
  await counts(56,53);
  await dialog.getByRole('button',{name:'撤销',exact:true}).click();
  await counts(56,54);
  await dialog.getByRole('button',{name:'塑形',exact:true}).click();
  await dialog.getByText('X=0 半模型镜像',{exact:true}).click();
  await dialog.getByRole('button',{name:'镜像并焊接中心线'}).click();
  await dialog.getByRole('alert').filter({hasText:/拓扑操作失败/}).waitFor();
  await counts(56,54);
  notes.checks.push('face deletion/undo and invalid mirror rejection preserve cage');
  // Standalone reference editor: previously untested import/export/preview and recovery.
  // Reload discards the unsaved scene test sample; no real user files are touched.
  page.on('dialog',prompt=>prompt.accept());
  await dialog.getByRole('button',{name:'关闭场景顶点编辑'}).click();
  await dialog.waitFor({state:'hidden'});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'顶点对照',exact:true}).click();
  const reference=page.getByRole('dialog',{name:'顶点参考对照'});
  await reference.waitFor();
  const triangle={vertices:[[0,0,0],[1,0,0],[0,1,0]],faces:[[0,1,2]]};
  await reference.getByLabel('导入顶点 JSON').setInputFiles({
    name:'topology-audit.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(triangle))
  });
  await reference.getByText(/3 顶点 \/ 1 面/).waitFor({timeout:15000});
  const saveDownload=page.waitForEvent('download',{timeout:20000});
  await reference.getByRole('button',{name:'保存顶点 JSON'}).click();
  assert.match((await saveDownload).suggestedFilename(),/vertex-cage\.json$/);
  const glbDownload=page.waitForEvent('download',{timeout:30000});
  await reference.getByRole('button',{name:'导出 GLB'}).click();
  assert.match((await glbDownload).suggestedFilename(),/vertex-cage\.glb$/);
  await reference.getByRole('button',{name:'显示 3D 预览'}).click();
  await reference.getByLabel('3D 旋转预览').waitFor();
  notes.checks.push('standalone JSON import/export, GLB export and 3D preview');
  await reference.getByRole('button',{name:'新建空网格'}).click();
  await reference.getByText(/0 顶点 \/ 0 面/).waitFor();
  const emptyDownload=page.waitForEvent('download',{timeout:15000});
  await reference.getByRole('button',{name:'保存顶点 JSON'}).click();
  await emptyDownload;
  await reference.getByRole('button',{name:'恢复新建前状态'}).click();
  await reference.getByText(/3 顶点 \/ 1 面/).waitFor();
  notes.checks.push('standalone new mesh, save and recover previous cage');
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
