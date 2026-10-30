import {parseCharacter} from './assets.js?v=355115890893';
import {prepareRig} from './rig-adapter.js?v=355115890893';
import {registerStudyModel} from './procedural-character.js?v=355115890893';
import {modelStats} from './optimize.js?v=355115890893';

const cache=new Map(),revision=new URL(import.meta.url).searchParams.get('v');
async function bytes(name){
  if(!cache.has(name)){
    const url=new URL('./characters/suit-man/'+name,import.meta.url);if(revision)url.searchParams.set('v',revision);
    cache.set(name,fetch(url).then(r=>{if(!r.ok)throw Error('西装人物资源加载失败：'+r.status);return r.arrayBuffer();}));
  }
  return (await cache.get(name)).slice(0);
}
export async function loadSuitPreset(original=false){
  const manifest=JSON.parse(new TextDecoder().decode(await bytes('manifest.json'))),buffer=await bytes(original?'source-reference.glb':'assembled-suit-man.glb'),gltf=await parseCharacter(buffer),root=gltf.scene;
  const metadata=[];root.traverse(o=>{if(o.userData.preset)metadata.push(o.userData);});Object.assign(root.userData,metadata[0],{motionCharacter:true,studyRest:true});
  root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.frustumCulled=false;}});root.updateMatrixWorld(true);registerStudyModel(root);
  const prepared=prepareRig(root);if(!prepared.rig)throw Error('西装人物骨架缺少：'+prepared.missing.join('、'));
  return {root,...prepared,sourceName:original?'Quaternius 商务男子 · 源形体对比':'青年男士 · 藏蓝西装 / 酒红领带',animations:[],manifest,sourceBytes:null,originalBytes:manifest.sourceGLBBytes,optimizedBytes:buffer.byteLength,report:{before:manifest.before,after:modelStats(root),warnings:[]},studyNote:original?'源形体、原配色；已统一单位与静止姿势，脚骨接回腿链。':'独立成年基础 · 合体西装 / 白衬衫 / 皮鞋 · 19 个装配零件'};
}
