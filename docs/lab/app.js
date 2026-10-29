import * as THREE from 'three';
import { OrbitControls } from '../vendor/controls/OrbitControls.js';
import { Rig } from '../retarget.js';
import { createCharacter } from './character.js';
import { MOTIONS, bakeMotion } from './motions.js';
import { createRenderer } from './renderer.js';
import { importCharacter, exportCharacter } from './assets.js';
import { modelStats } from './optimize.js';
import { prepareRig, detectBones, MAPPABLE, REQUIRED } from './rig-adapter.js';
import { planToTake, retargetTake, applyRetarget, motionRequest, EXAMPLE_PLAN, PLAN_JOINTS } from './motion-plan.js';
import { API_DEFAULTS, resolveConfig, generatePlan } from './api.js';

const $=s=>document.querySelector(s),viewport=$('#viewport'),status=text=>$('#status').textContent=text;
const bytes=n=>n>=1048576?(n/1048576).toFixed(2)+' MB':(n/1024).toFixed(1)+' KB';
const download=(data,type,name)=>{const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);};
const saveJSON=(data,name)=>download(JSON.stringify(data,null,2),'application/json',name);
try{
  const scene=new THREE.Scene();scene.background=new THREE.Color(0xe9eee5);
  const renderer=createRenderer();if(renderer.compatibility)$('#mode').textContent='Canvas 兼容预览 · 贴图简化显示';viewport.appendChild(renderer.domElement);
  const camera=new THREE.PerspectiveCamera(36,1,.05,60);camera.position.set(3,2.1,4.5);
  const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,.95,0);controls.enableDamping=true;controls.maxDistance=8;controls.minDistance=1.6;controls.maxPolarAngle=Math.PI/2-.02;
  scene.add(new THREE.HemisphereLight(0xffffff,0xc8b897,3));
  const light=new THREE.DirectionalLight(0xfff7e3,3);light.position.set(3,5,4);light.castShadow=true;light.shadow.mapSize.set(2048,2048);light.shadow.camera.left=-3;light.shadow.camera.right=3;light.shadow.camera.top=3;light.shadow.camera.bottom=-3;light.shadow.normalBias=.025;scene.add(light);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0xe9eee5,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.015;floor.receiveShadow=true;scene.add(floor);
  const grid=new THREE.GridHelper(12,24,0xc2d0c1,0xd4ddd0);grid.position.y=-.01;scene.add(grid);
  const driverModel=createCharacter();driverModel.userData.motionCharacter=true;const driver=new Rig(driverModel);
  let asset={root:driverModel,rig:driver,sourceName:'内置测试人物',animations:[],...detectBones(driverModel)},helper=null,mixer=null,nativeIndex=-1;
  const takes=MOTIONS.map(m=>({...m,...bakeMotion(driver,m),loop:true}));
  let selected=takes[0],time=0,playing=true,last=performance.now(),busy=false,exporting=false,controller=null,config={...API_DEFAULTS,key:''};
  try{config={...config,...JSON.parse(localStorage.getItem('motion-lab-api')||'{}'),key:''};config=resolveConfig(config);}catch{config={...API_DEFAULTS,key:''};}
  const setBusy=value=>{busy=value;for(const id of ['file-model','reset-model','mapping-open','sample-model'])$('#'+id).disabled=value;$('#reprocess').disabled=value||!asset.sourceBytes;$('#generate').disabled=value||!asset.rig;$('#export').disabled=value;};
  function replaceHelper(){if(helper){scene.remove(helper);helper.geometry.dispose();helper.material.dispose();}helper=new THREE.SkeletonHelper(asset.root);helper.material.depthTest=false;helper.material.transparent=true;helper.material.opacity=.85;helper.visible=$('#skeleton').checked;helper.renderOrder=2;scene.add(helper);}
  function disposeRoot(root){if(root===driverModel)return;const textures=new Set(),geometries=new Set(),materials=new Set();root.traverse(o=>{if(o.isMesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const t of Object.values(m))if(t?.isTexture)textures.add(t);}}});for(const t of textures)t.dispose();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();}
  function showAssetInfo(){
    const stats=modelStats(asset.root),report=asset.report;$('#asset-name').textContent=asset.sourceName;$('#stage-character').textContent=asset.sourceName+' / 归一化预览';
    $('#asset-stats').textContent=report?`面数 ${report.before.triangles.toLocaleString()} → ${report.after.triangles.toLocaleString()} · 顶点 ${stats.vertices.toLocaleString()}\n文件 ${bytes(asset.originalBytes)} → ${bytes(asset.optimizedBytes)}${report.warnings.length?'\n部分区域保留原数据，详情见处理提示':''}`:`${stats.triangles.toLocaleString()} 面 · ${stats.vertices.toLocaleString()} 顶点`;
    $('#rig-status').textContent=asset.rig?`骨架就绪 · ${asset.rig.order.length} 根骨骼`:stats.bones?`待映射：${asset.missing.slice(0,3).join('、')}`:'未发现骨架 · 可优化导出，动作需先绑骨';
    $('#source-animation').hidden=!asset.animations.length;$('#reprocess').disabled=busy||!asset.sourceBytes;$('#generate').disabled=busy||!asset.rig;$('#export-info').textContent=asset.optimizedBytes?'已处理 '+bytes(asset.optimizedBytes):'';
  }
  function installAsset(next){
    mixer?.stopAllAction();mixer=null;nativeIndex=-1;const previous=asset.root;scene.remove(previous);asset=next;asset.root.userData.motionCharacter=true;scene.add(asset.root);replaceHelper();disposeRoot(previous);showAssetInfo();
    for(const take of takes)delete take.boundClip;select(takes[0],true);renderLibrary();
  }
  scene.add(asset.root);replaceHelper();showAssetInfo();
  function renderPose(){
    if(selected.kind==='native'){mixer?.setTime(time);}else{driver.applySnapshot(selected.track.sample(time));if(asset.rig&&asset.rig!==driver)applyRetarget(driver,asset.rig);}
    $('#seek').value=time;$('#time').textContent=`${time.toFixed(2)} / ${selected.duration.toFixed(2)} s`;
  }
  function select(take,quiet=false){
    mixer?.stopAllAction();mixer=null;selected=take;time=0;playing=true;$('#play').textContent='暂停';$('#name').textContent=take.name;$('#description').textContent=take.description||'';$('#seek').max=take.duration;
    if(asset.rig)asset.rig.reset();
    if(take.kind==='native'){mixer=new THREE.AnimationMixer(asset.root);mixer.clipAction(take.clip).play();}
    $('#json').disabled=take.kind==='native';renderLibrary();renderPose();
    if(!quiet)status(take.kind==='native'?'正在播放模型原有动画':asset.rig?`${take.duration} 秒 · ${take.track.length} 帧 · ${take.plan?'动作方案':'关键帧测试'}`:'模型可查看和优化；绑定动作前请补齐骨骼映射');
  }
  function renderLibrary(){
    $('#motions').replaceChildren();for(const [i,take] of takes.entries()){const b=document.createElement('button');b.className='motion'+(selected===take?' active':'');b.setAttribute('aria-pressed',String(selected===take));const number=document.createElement('span'),name=document.createElement('b'),duration=document.createElement('span');number.textContent=String(i+1).padStart(2,'0');name.textContent=take.name;duration.textContent=take.duration+'s';b.append(number,name,duration);b.onclick=()=>select(take);$('#motions').appendChild(b);}$('#library-count').textContent=takes.length+' 段';
  }
  $('#play').onclick=()=>{playing=!playing;$('#play').textContent=playing?'暂停':'播放';};$('#restart').onclick=()=>{time=0;renderPose();};$('#seek').oninput=e=>{playing=false;$('#play').textContent='播放';time=Number(e.target.value);renderPose();};$('#skeleton').onchange=e=>helper.visible=e.target.checked;
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{camera.position.set(...({front:[0,1.4,4.8],side:[4.8,1.4,0],three:[3,2.1,4.5]})[b.dataset.view]);controls.target.set(0,.95,0);controls.update();});
  $('#source-animation').onclick=()=>{if(!asset.animations.length)return;nativeIndex=(nativeIndex+1)%asset.animations.length;const clip=asset.animations[nativeIndex];select({kind:'native',name:clip.name||'原有动画',duration:Math.max(.01,clip.duration),clip,loop:true,description:'来自导入 GLB 的原有动画'});};
  async function loadBytes(buffer,name){
    if(busy)return;setBusy(true);const wasPlaying=playing;playing=false;
    try{const next=await importCharacter(buffer,name,{optimize:$('#auto-optimize').checked,ratio:Number($('#ratio').value),maxTexture:Number($('#texture-size').value),onProgress:status});installAsset(next);status(`导入完成。${next.rig?'已自动匹配骨架，可绑定动作。':'请先检查骨骼映射；无骨架模型需先绑骨。'}${next.report.warnings.join('；')}`);}
    catch(error){playing=wasPlaying;status('导入失败：'+error.message);}finally{setBusy(false);}
  }
  async function loadFile(file){if(!file)return;if(!/\.glb$/i.test(file.name)){status('请选择 .glb 文件');return;}if(file.size>100*1048576){status('单个 GLB 请控制在 100 MB 以内');return;}await loadBytes(await file.arrayBuffer(),file.name);}
  $('#file-model').onchange=e=>{loadFile(e.target.files[0]);e.target.value='';};$('#reprocess').onclick=()=>asset.sourceBytes&&loadBytes(asset.sourceBytes,asset.sourceName);
  $('#sample-model').onclick=async()=>{try{const response=await fetch(new URL('./examples/test-character.glb',import.meta.url));if(!response.ok)throw new Error('样本文件暂时无法加载');await loadBytes(await response.arrayBuffer(),'test-character.glb');}catch(error){status(error.message);}};
  $('#dropzone').ondragover=e=>{e.preventDefault();$('#dropzone').classList.add('dragging');};$('#dropzone').ondragleave=()=>$('#dropzone').classList.remove('dragging');$('#dropzone').ondrop=e=>{e.preventDefault();$('#dropzone').classList.remove('dragging');if(!busy)loadFile(e.dataTransfer.files[0]);};
  $('#reset-model').onclick=()=>{if(busy)return;driver.reset();installAsset({root:driverModel,rig:driver,sourceName:'内置测试人物',animations:[],...detectBones(driverModel)});status('已恢复内置样机');};
  const openDialog=id=>{const dialog=$('#'+id);if(!dialog.open)dialog.showModal();};document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$('#'+b.dataset.close).close());
  function refreshAPI(){const c=resolveConfig(config);$('#api-open').textContent='API 设置 · '+(c.provider==='openai'?'OpenAI':'自定义');$('#api-destination').textContent=new URL(c.baseUrl).host;$('#api-note').textContent=c.key?'将请求发送到 '+new URL(c.baseUrl).host+' · '+c.model:'默认使用 '+(c.provider==='openai'?'OpenAI':'自定义接口')+'；首次调用请填写自己的 API Key。';}
  function openAPI(){for(const [id,key] of [['api-provider','provider'],['api-base','baseUrl'],['api-model','model'],['api-protocol','protocol'],['api-key','key']])$('#'+id).value=config[key]||'';$('#api-error').textContent='';openDialog('api-dialog');}
  $('#api-open').onclick=openAPI;
  $('#api-provider').onchange=e=>{$('#api-key').value='';if(e.target.value==='openai'){$('#api-base').value=API_DEFAULTS.baseUrl;$('#api-model').value=API_DEFAULTS.model;$('#api-protocol').value='responses';}else{$('#api-base').value='';$('#api-model').value='';$('#api-protocol').value='chat';}};
  $('#api-base').oninput=()=>$('#api-key').value='';
  $('#clear-key').onclick=()=>{config.key='';$('#api-key').value='';refreshAPI();$('#api-error').textContent='API Key 已清除';};
  $('#api-form').onsubmit=e=>{e.preventDefault();try{config=resolveConfig({provider:$('#api-provider').value,baseUrl:$('#api-base').value,model:$('#api-model').value,protocol:$('#api-protocol').value,key:$('#api-key').value});const {key,...publicSettings}=config;try{localStorage.setItem('motion-lab-api',JSON.stringify(publicSettings));}catch{}refreshAPI();$('#api-dialog').close();status('API 设置已应用；Key 只保留在当前页面内存。');}catch(error){$('#api-error').textContent=error.message;}};
  function attachPlan(plan,prompt=''){if(!asset.rig)throw new Error('当前模型骨架未匹配，请先完成骨骼映射');const take=planToTake(driver,plan);take.prompt=prompt;takes.push(take);select(take);return take;}
  $('#generate').onclick=async()=>{
    if(busy)return;if(!config.key){openAPI();$('#api-error').textContent='请先填写自己的 API Key。若在聊天中制作，可导出任务后导入动作方案。';return;}
    if(!$('#action-prompt').value.trim()){status('请先描述想要的人物动作');return;}
    setBusy(true);controller=new AbortController();$('#cancel-generate').hidden=false;const timeout=setTimeout(()=>controller?.abort(),90000);status('正在请求 '+new URL(config.baseUrl).host+' 生成动作方案…');
    try{const prompt=$('#action-prompt').value,plan=await generatePlan({...config},prompt,Number($('#plan-duration').value),{signal:controller.signal});attachPlan(plan,prompt);status('动作方案已检查并绑定到当前人物。');}
    catch(error){status(error.name==='AbortError'?'生成已取消或超时；未新增动作。':'生成失败：'+error.message);}finally{clearTimeout(timeout);controller=null;$('#cancel-generate').hidden=true;setBusy(false);}
  };$('#cancel-generate').onclick=()=>controller?.abort();
  $('#plan-open').onclick=()=>{$('#plan-error').textContent='';openDialog('plan-dialog');};$('#plan-example').onclick=()=>$('#plan-json').value=JSON.stringify(EXAMPLE_PLAN,null,2);
  $('#file-plan').onchange=async e=>{const f=e.target.files[0];if(!f)return;if(f.size>250000){$('#plan-error').textContent='动作 JSON 文件过大';return;}$('#plan-json').value=await f.text();};
  $('#apply-plan').onclick=()=>{try{attachPlan($('#plan-json').value);$('#plan-dialog').close();status('已导入并绑定动作方案');}catch(error){$('#plan-error').textContent=error.message;}};
  $('#chat-request').onclick=()=>saveJSON(motionRequest($('#action-prompt').value||'请描述人物动作',Number($('#plan-duration').value)),'luckybreak-motion-request.json');
  $('#copy-request').onclick=async()=>{const request=motionRequest($('#action-prompt').value||'先点头，再右手挥手三次',Number($('#plan-duration').value));const text='请为 Lucky Break Motion Lab 生成动作方案，只输出符合下列任务 schema 的 JSON，供工具直接导入：\n'+JSON.stringify(request,null,2);try{await navigator.clipboard.writeText(text);$('#plan-error').textContent='制作指令已复制，可粘贴到此聊天。';}catch{saveJSON(request,'luckybreak-motion-request.json');$('#plan-error').textContent='浏览器无法复制，已导出任务文件。';}};
  function showMapping(overrides){const d=detectBones(asset.root,overrides);$('#mapping-fields').replaceChildren();for(const canonical of MAPPABLE){const label=document.createElement('label');label.textContent=canonical+(REQUIRED.includes(canonical)?' *':'');const select=document.createElement('select');select.dataset.canonical=canonical;select.setAttribute('aria-label',canonical+' 骨骼');select.add(new Option('未匹配',''));for(const bone of d.bones)select.add(new Option(bone.name||bone.uuid,bone.uuid));select.value=d.map[canonical]?.uuid||'';label.appendChild(select);$('#mapping-fields').appendChild(label);}$('#mapping-error').textContent=d.bones.length?'':'模型没有骨架，请先在建模软件中绑定骨骼与蒙皮。';}
  $('#mapping-open').onclick=()=>{showMapping(Object.fromEntries(Object.entries(asset.map||{}).map(([k,b])=>[k,b.uuid])));openDialog('mapping-dialog');};$('#mapping-auto').onclick=()=>showMapping();
  $('#mapping-apply').onclick=()=>{try{const overrides=Object.fromEntries([...document.querySelectorAll('[data-canonical]')].map(s=>[s.dataset.canonical,s.value]));mixer?.stopAllAction();asset.rig?.reset();const next=prepareRig(asset.root,overrides);if(!next.rig)throw new Error('仍缺少：'+next.missing.join('、'));Object.assign(asset,next);for(const take of takes)delete take.boundClip;showAssetInfo();select(takes[0],true);$('#mapping-dialog').close();status('骨骼映射已更新');}catch(error){$('#mapping-error').textContent=error.message;}};
  async function exportGLB(take=selected,save=true){
    if(exporting)throw new Error('正在导出，请稍候');exporting=true;const wasPlaying=playing,savedTime=time;playing=false;setBusy(true);
    try{
      mixer?.stopAllAction();asset.rig?.reset();let clip=take.kind==='native'?take.clip:asset.rig?(take.boundClip||=retargetTake(driver,asset.rig,take)):null;
      const clips=$('#keep-original').checked?[...asset.animations]:[];if(clip&&!clips.includes(clip))clips.push(clip);
      status('正在导出人物、骨架与动作…');const glb=await exportCharacter(asset.root,clips,{compressed:$('#export-format').value==='meshopt'});
      if(save)download(glb,'model/gltf-binary','luckybreak_'+(asset.rig?take.name:'optimized_model').replace(/[^\p{L}\p{N}_-]/gu,'_')+'.glb');$('#export-info').textContent='本次导出 '+bytes(glb.byteLength);status(asset.rig||take.kind==='native'?'已导出人物 + 动作 GLB':'已导出优化模型 GLB（模型没有可用的动作骨架）');return glb;
    }finally{exporting=false;setBusy(false);playing=wasPlaying;time=savedTime;if(selected.kind==='native'){mixer=new THREE.AnimationMixer(asset.root);mixer.clipAction(selected.clip).play();}renderPose();}
  }
  $('#export').onclick=()=>exportGLB().catch(error=>status('导出失败：'+error.message));
  function exportPlan(take){if(take.plan)return take.plan;const frames=[];for(let i=0;i<=16;i++){const t=take.duration*i/16,s=take.track.sample(t),rotations=[];for(const joint of PLAN_JOINTS){const index=driver.order.indexOf(joint);if(index<0)continue;const q=new THREE.Quaternion().fromArray(s.q,index*4),e=new THREE.Euler().setFromQuaternion(q);rotations.push({joint,degrees:[e.x,e.y,e.z].map(x=>Number(THREE.MathUtils.radToDeg(x).toFixed(5)))});}frames.push({t,root:[...s.p].map((x,j)=>Number((x-driver.rest.Hips.wp.getComponent(j)).toFixed(6))),rotations});}return {version:1,name:take.name,duration:take.duration,loop:take.loop!==false,frames};}
  $('#json').onclick=()=>{if(selected.kind!=='native')saveJSON(exportPlan(selected),'luckybreak-motion-plan.json');};
  new ResizeObserver(()=>{const w=viewport.clientWidth,h=viewport.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();}).observe(viewport);
  refreshAPI();select(takes[0]);$('#boot').remove();
  function frame(now){requestAnimationFrame(frame);const dt=Math.min((now-last)/1000,.1);last=now;if(playing){time+=dt*Number($('#speed').value);if(time>selected.duration){if(selected.loop===false){time=selected.duration;playing=false;$('#play').textContent='播放';}else time%=selected.duration;}renderPose();}controls.update();renderer.render(scene,camera);}requestAnimationFrame(frame);
  // Reusable data workflow; credentials deliberately excluded.
  window.motionLab={THREE,driver,takes,get rig(){return asset.rig;},get asset(){return {name:asset.sourceName,stats:modelStats(asset.root),missing:asset.missing};},select,seek(t){playing=false;time=t;renderPose();},exportGLB,attachPlan,request:motionRequest,get selected(){return selected;},get time(){return time;}};
}catch(error){$('#boot').textContent='启动失败：'+error.message;console.error(error);}
