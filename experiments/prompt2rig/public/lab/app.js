import * as THREE from 'three';
import { OrbitControls } from '../vendor/controls/OrbitControls.js';
import { GLTFExporter } from '../vendor/exporters/GLTFExporter.js';
import { Rig } from '../retarget.js';
import { createCharacter } from './character.js';
import { MOTIONS, bakeMotion } from './motions.js';
import { createRenderer } from './renderer.js';

const $=s=>document.querySelector(s), viewport=$('#viewport');
try {
  const scene=new THREE.Scene(); scene.background=new THREE.Color(0xe9eee5);
  const renderer=createRenderer();
  if(renderer.compatibility) $('#mode').textContent='程序关键帧 · Canvas 兼容预览';
  viewport.appendChild(renderer.domElement);
  const camera=new THREE.PerspectiveCamera(36,1,.05,60); camera.position.set(3,2.1,4.5);
  const controls=new OrbitControls(camera,renderer.domElement); controls.target.set(0,.95,0); controls.enableDamping=true; controls.maxDistance=8;controls.minDistance=1.6;controls.maxPolarAngle=Math.PI/2-.02;
  scene.add(new THREE.HemisphereLight(0xffffff,0xc8b897,3));
  const light=new THREE.DirectionalLight(0xfff7e3,3); light.position.set(3,5,4); light.castShadow=true; light.shadow.mapSize.set(2048,2048);light.shadow.camera.left=-3;light.shadow.camera.right=3;light.shadow.camera.top=3;light.shadow.camera.bottom=-3;light.shadow.normalBias=.025;scene.add(light);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0xe9eee5,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.015;floor.receiveShadow=true;scene.add(floor);
  const grid=new THREE.GridHelper(12,24,0xc2d0c1,0xd4ddd0);grid.position.y=-.01;scene.add(grid);
  const podium=new THREE.Mesh(new THREE.CylinderGeometry(1.15,1.18,.04,80),new THREE.MeshStandardMaterial({color:0xf6f5eb,roughness:1}));podium.position.y=-.04;podium.receiveShadow=true;scene.add(podium);
  const model=createCharacter();scene.add(model); const rig=new Rig(model);
  const helper=new THREE.SkeletonHelper(model);helper.material.depthTest=false;helper.material.transparent=true;helper.material.opacity=.85;helper.visible=false;helper.renderOrder=2;scene.add(helper);
  const takes=MOTIONS.map(m=>({...m,...bakeMotion(rig,m)}));
  let selected=takes[0],time=0,playing=true,last=performance.now();
  const buttons=[];
  function select(take){selected=take;time=0;playing=true;$('#play').textContent='暂停';$('#name').textContent=take.name;$('#description').textContent=take.description;$('#prompt').value=take.prompt;$('#seek').max=take.duration;buttons.forEach(b=>{b.classList.toggle('active',b.dataset.id===take.id);b.setAttribute('aria-pressed',String(b.dataset.id===take.id));});$('#status').textContent=`${take.duration} 秒 · ${take.track.length} 帧 · ${rig.order.length} 根骨骼 · 关键帧测试`;
    renderPose();}
  for(const [i,take] of takes.entries()){const b=document.createElement('button');b.className='motion';b.dataset.id=take.id;b.innerHTML=`<span>0${i+1}</span><b>${take.name}</b><span>${take.duration}s ↗</span>`;b.onclick=()=>select(take);buttons.push(b);$('#motions').appendChild(b);}
  function renderPose(){rig.applySnapshot(selected.track.sample(time));$('#seek').value=time;$('#time').textContent=`${time.toFixed(2)} / ${selected.duration.toFixed(2)} s`;}
  $('#play').onclick=()=>{playing=!playing;$('#play').textContent=playing?'暂停':'播放';};
  $('#restart').onclick=()=>{time=0;renderPose();};
  $('#seek').oninput=e=>{playing=false;$('#play').textContent='播放';time=Number(e.target.value);renderPose();};
  $('#skeleton').onchange=e=>helper.visible=e.target.checked;
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{camera.position.set(...({front:[0,1.4,4.8],side:[4.8,1.4,0],three:[3,2.1,4.5]})[b.dataset.view]);controls.target.set(0,.95,0);controls.update();});
  $('#copy').onclick=async()=>{try{await navigator.clipboard.writeText($('#prompt').value);$('#status').textContent='提示词已复制，可粘贴到原版 AI 页面';}catch{$('#prompt').select();$('#status').textContent='请按 Ctrl+C 复制提示词';}};
  function download(data,type,name){const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
  async function exportGLB(take=selected,save=true){
    const wasPlaying=playing, savedTime=time;playing=false;
    try {rig.reset(); const glb=await new GLTFExporter().parseAsync(model,{binary:true,animations:[take.clip],onlyVisible:true});if(save)download(glb,'model/gltf-binary',`luckybreak_${take.id}.glb`);return glb;}
    finally {playing=wasPlaying;time=savedTime;renderPose();}
  }
  $('#export').onclick=async()=>{const b=$('#export');b.disabled=true;try{await exportGLB();$('#status').textContent='已导出 GLB：包含人物蒙皮、骨骼和当前动作';}catch(e){$('#status').textContent='导出失败：'+e.message;}finally{b.disabled=false;}};
  $('#json').onclick=()=>download(JSON.stringify({format:'three-animation-clip',source:'authored-keyframes',upstream:'fe3d3eec992772b538992374ca933020ed517938',character:'LuckyBreak_TestCharacter',clip:THREE.AnimationClip.toJSON(selected.clip)},null,2),'application/json',`luckybreak_${selected.id}.animation.json`);
  new ResizeObserver(()=>{const w=viewport.clientWidth,h=viewport.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();}).observe(viewport);
  select(takes[0]);$('#boot').remove();
  function frame(now){requestAnimationFrame(frame);const dt=Math.min((now-last)/1000,.1);last=now;if(playing){time=(time+dt*Number($('#speed').value))%selected.duration;renderPose();}controls.update();renderer.render(scene,camera);}requestAnimationFrame(frame);
  // QA / automation surface: observes actual rig state and exported bytes.
  window.motionLab={THREE,rig,takes,select,seek(t){playing=false;time=t;renderPose();},exportGLB,get time(){return time;},get selected(){return selected;}};
} catch(e){$('#boot').textContent='3D 场景启动失败：'+e.message;console.error(e);}
