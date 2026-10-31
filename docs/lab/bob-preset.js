import {parseCharacter} from './assets.js?v=444eb157cd97';
import {prepareRig} from './rig-adapter.js?v=444eb157cd97';
import {registerStudyModel} from './procedural-character.js?v=444eb157cd97';
import {modelStats} from './optimize.js?v=444eb157cd97';

const cache=new Map(),revision=new URL(import.meta.url).searchParams.get('v');
async function bytes(name){
  if(!cache.has(name)){const url=new URL('./characters/anime-bob-woman/'+name,import.meta.url);if(revision)url.searchParams.set('v',revision);cache.set(name,fetch(url).then(r=>{if(!r.ok)throw Error('波波头人物资源加载失败：'+r.status);return r.arrayBuffer();}));}
  return (await cache.get(name)).slice(0);
}
export async function loadBobPreset(original=false){
  const manifest=JSON.parse(new TextDecoder().decode(await bytes('manifest.json'))),buffer=await bytes(original?'source-reference.glb':'assembled-anime-bob-woman.glb'),gltf=await parseCharacter(buffer),root=gltf.scene;
  const metadata=[];root.traverse(o=>{if(o.userData.preset)metadata.push(o.userData);});Object.assign(root.userData,metadata[0],{motionCharacter:true,studyRest:true});
  root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.frustumCulled=false;}});root.updateMatrixWorld(true);registerStudyModel(root);
  const prepared=prepareRig(root);if(!prepared.rig)throw Error('波波头人物骨架缺少：'+prepared.missing.join('、'));
  return {root,...prepared,sourceName:original?'二次元女性 · 优化前装配':'二次元女性 · 波波头 / 运动装',defaultMotion:original?null:'run',animations:[],manifest,sourceBytes:null,originalBytes:manifest.sourceGLBBytes,optimizedBytes:buffer.byteLength,report:{before:manifest.before,after:modelStats(root),warnings:[]},studyNote:original?'同一成年身体与二次元头脸，保留优化前的波波头发束。':'二次元脸型 · 齐下巴波波短发 · 运动背心 / 瑜伽裤 · 跑步松握拳'};
}
