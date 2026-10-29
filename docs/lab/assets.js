import * as THREE from 'three';
import { GLTFLoader } from '../vendor/loaders/GLTFLoader.js?v=05c2e9e16450';
import { DRACOLoader } from '../vendor/loaders/DRACOLoader.js?v=05c2e9e16450';
import { MeshoptDecoder } from '../vendor/meshopt/meshopt_decoder.module.js?v=05c2e9e16450';
import { GLTFExporter } from '../vendor/exporters/GLTFExporter.js?v=05c2e9e16450';
import { readGLB, compressGLB } from './glb-codec.js?v=05c2e9e16450';
import { normalizeCharacter, prepareRig } from './rig-adapter.js?v=05c2e9e16450';
import { optimizeModel, modelStats } from './optimize.js?v=05c2e9e16450';
import { prepareProceduralExport } from './procedural-character.js?v=05c2e9e16450';

export async function parseCharacter(buffer){
  const {json}=readGLB(buffer);
  if([...(json.buffers||[]),...(json.images||[])].some(x=>x.uri&&!x.uri.startsWith('data:')))throw new Error('GLB 引用了外部文件，请重新导出为嵌入贴图和资源的 GLB');
  if(json.extensionsRequired?.includes('KHR_texture_basisu'))throw new Error('此 GLB 使用 KTX2 贴图，请先导出为 PNG/JPEG 贴图版');
  const manager=new THREE.LoadingManager(),decoderPath=new URL('../vendor/draco/',import.meta.url).href;
  manager.setURLModifier(url=>{if(url.startsWith('blob:')||url.startsWith('data:')||url.startsWith(decoderPath))return url;throw new Error('GLB 中的外部资源请求已停止，请使用嵌入资源的 GLB');});
  const draco=new DRACOLoader(manager).setDecoderPath(decoderPath),loader=new GLTFLoader(manager).setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);
  try{return await loader.parseAsync(buffer,'');}finally{draco.dispose();}
}

export async function exportCharacter(root,clips=[],{compressed=true}={}){
  const restore=prepareProceduralExport(root);
  try{const glb=await new GLTFExporter().parseAsync(root,{binary:true,animations:clips,onlyVisible:false});return compressed?await compressGLB(glb):glb;}finally{restore();}
}

export async function importCharacter(buffer,name,{optimize=true,ratio=.7,maxTexture=1024,onProgress=()=>{}}={}){
  onProgress('读取 GLB、贴图和骨架…');const gltf=await parseCharacter(buffer),root=normalizeCharacter(gltf.scene);root.userData.motionCharacter=true;
  const report=optimize?await optimizeModel(root,{ratio,maxTexture,onProgress}):{before:modelStats(root),after:modelStats(root),textures:0,warnings:[]};
  onProgress('压缩几何和原有动画…');const prepared=prepareRig(root),output=await exportCharacter(root,gltf.animations,{compressed:true});
  return {root,...prepared,animations:gltf.animations,sourceBytes:buffer,sourceName:name,originalBytes:buffer.byteLength,optimizedBytes:output.byteLength,report,output};
}
