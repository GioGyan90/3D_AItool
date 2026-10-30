import {parseCharacter} from './assets.js?v=808b43d68f0e';
import {prepareRig} from './rig-adapter.js?v=808b43d68f0e';
import {registerStudyModel} from './procedural-character.js?v=808b43d68f0e';
import {modelStats} from './optimize.js?v=808b43d68f0e';

const cache=new Map(),revision=new URL(import.meta.url).searchParams.get('v');
async function bytes(name){
  if(!cache.has(name)){const url=new URL('./characters/running-woman/'+name,import.meta.url);if(revision)url.searchParams.set('v',revision);cache.set(name,fetch(url).then(r=>{if(!r.ok)throw Error('女性跑步人物资源加载失败：'+r.status);return r.arrayBuffer();}));}
  return (await cache.get(name)).slice(0);
}
export async function loadRunnerPreset(original=false){
  const manifest=JSON.parse(new TextDecoder().decode(await bytes('manifest.json'))),buffer=await bytes(original?'complete-source.glb':'assembled-running-woman.glb'),gltf=await parseCharacter(buffer),root=gltf.scene;
  const metadata=[];root.traverse(o=>{if(o.userData.preset)metadata.push(o.userData);});Object.assign(root.userData,metadata[0],{motionCharacter:true,studyRest:true});
  root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.frustumCulled=false;}});root.updateMatrixWorld(true);registerStudyModel(root);
  const prepared=prepareRig(root);if(!prepared.rig)throw Error('女性人物骨架缺少：'+prepared.missing.join('、'));
  return {root,...prepared,sourceName:original?'成年女性 · 未遮挡源形体':'成年女性 · 运动背心 / 瑜伽裤',defaultMotion:original?null:'run',animations:[],manifest,sourceBytes:null,originalBytes:manifest.sourceGLBBytes,optimizedBytes:buffer.byteLength,report:{before:manifest.before,after:modelStats(root),warnings:[]},studyNote:original?'独立成年身体、原始比例与完整拓扑；内衣来自源贴图。':'青绿背心 · 深蓝贴身瑜伽长裤 · 束发 / 运动鞋 · 可循环跑步'};
}
