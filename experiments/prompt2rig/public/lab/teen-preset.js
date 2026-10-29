import {parseCharacter} from './assets.js';
import {prepareRig} from './rig-adapter.js';
import {registerStudyModel} from './procedural-character.js';
import {modelStats} from './optimize.js';
const cache=new Map(),revision=new URL(import.meta.url).searchParams.get('v');
async function bytes(name){if(!cache.has(name))cache.set(name,fetch((()=>{const url=new URL('./characters/teen-boy/'+name,import.meta.url);if(revision)url.searchParams.set('v',revision);return url;})()).then(r=>{if(!r.ok)throw Error('少年资源加载失败：'+r.status);return r.arrayBuffer();}));return (await cache.get(name)).slice(0);}
export async function loadTeenPreset(original=false){
 const manifest=JSON.parse(new TextDecoder().decode(await bytes('manifest.json'))),buffer=await bytes(original?'source-preset.glb':'reassembled-boy.glb'),gltf=await parseCharacter(buffer),root=gltf.scene;
 const metadata=[];root.traverse(o=>{if(o.userData.preset)metadata.push(o.userData);});Object.assign(root.userData,metadata[0],{motionCharacter:true,studyRest:true});
 root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.frustumCulled=false;}});root.updateMatrixWorld(true);registerStudyModel(root);const prepared=prepareRig(root);if(!prepared.rig)throw Error('少年预设骨架缺少：'+prepared.missing.join('、'));
 return {root,...prepared,sourceName:original?'CharaBuilder 少年 · 原始对比':'日漫少年 · T 恤 / 反戴帽',animations:[],manifest,sourceBytes:null,originalBytes:manifest.sourceGLBBytes,optimizedBytes:buffer.byteLength,report:{before:manifest.before,after:modelStats(root),warnings:[]},studyNote:original?'来自捏人仓库的少年预设；统一缩放，保留原比例。':'帽口保留头发 · 连续肩腋 · 下摆避让裤腰'};
}
