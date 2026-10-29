import * as THREE from 'three';
import { MeshoptSimplifier } from '../vendor/meshopt/meshopt_simplifier.module.js';

export function modelStats(root) {
  let triangles=0,vertices=0,meshes=0,bones=0;root.traverse(o=>{if(o.isBone)bones++;if(o.isMesh){meshes++;vertices+=o.geometry.attributes.position?.count||0;triangles+=(o.geometry.index?.count||o.geometry.attributes.position?.count||0)/3;}});return {triangles:Math.round(triangles),vertices,meshes,bones};
}
const raw=(a,i,c)=>a.isInterleavedBufferAttribute?a.data.array[i*a.data.stride+a.offset+c]:a.array[i*a.itemSize+c];
function copyAttribute(attribute,used) {
  const array=new (attribute.isInterleavedBufferAttribute?attribute.data.array.constructor:attribute.array.constructor)(used.length*attribute.itemSize);
  for(let n=0;n<used.length;n++)for(let c=0;c<attribute.itemSize;c++)array[n*attribute.itemSize+c]=raw(attribute,used[n],c);
  const out=new THREE.BufferAttribute(array,attribute.itemSize,attribute.normalized);out.name=attribute.name;return out;
}

export function reduceGeometry(g,ratio=.7,error=.005) {
  const position=g.attributes.position;if(!position||position.count<60||ratio>=1)return g.clone();
  const indices=g.index?Uint32Array.from(g.index.array):Uint32Array.from({length:position.count},(_,i)=>i);
  if(indices.length%3)return g.clone();
  const pos=new Float32Array(position.count*3);for(let i=0;i<position.count;i++)for(let c=0;c<3;c++)pos[i*3+c]=position.getComponent(i,c);
  const attributes=[],weights=[];
  for(const [name,weight] of [['normal',.15],['uv',.5],['skinIndex',1],['skinWeight',4]])if(g.attributes[name]){const a=g.attributes[name];attributes.push(a);for(let i=0;i<a.itemSize;i++)weights.push(weight);}
  const stride=weights.length,values=new Float32Array(position.count*stride);
  for(let i=0;i<position.count;i++){let offset=i*stride;for(const a of attributes)for(let c=0;c<a.itemSize;c++)values[offset++]=a.getComponent(i,c);}
  const locks=new Uint8Array(position.count);
  // Keep vertices that participate in facial/expression morphs untouched.
  for(const morph of g.morphAttributes.position||[])for(let i=0;i<position.count;i++){
    const dx=morph.getX(i)-(g.morphTargetsRelative?0:position.getX(i)),dy=morph.getY(i)-(g.morphTargetsRelative?0:position.getY(i)),dz=morph.getZ(i)-(g.morphTargetsRelative?0:position.getZ(i));
    if(dx*dx+dy*dy+dz*dz>1e-12)locks[i]=1;
  }
  const groups=g.groups.length?g.groups:[{start:0,count:indices.length,materialIndex:0}],result=[],newGroups=[];
  for(const group of groups){
    const source=indices.slice(group.start,group.start+group.count),target=Math.max(3,Math.floor(source.length*ratio/3)*3);
    if(source.length%3){result.push(...source);continue;}
    const [reduced]=stride?MeshoptSimplifier.simplifyWithAttributes(source,pos,3,values,stride,weights,locks,target,error,['LockBorder']):MeshoptSimplifier.simplify(source,pos,3,target,error,['LockBorder']);
    newGroups.push({start:result.length,count:reduced.length,materialIndex:group.materialIndex});for(const i of reduced)result.push(i);
  }
  const used=[],map=new Map(),remapped=result.map(i=>{if(!map.has(i)){map.set(i,used.length);used.push(i);}return map.get(i);});
  const out=new THREE.BufferGeometry();out.name=g.name;out.userData={...g.userData};out.morphTargetsRelative=g.morphTargetsRelative;
  for(const [name,a] of Object.entries(g.attributes))out.setAttribute(name,copyAttribute(a,used));
  for(const [name,list] of Object.entries(g.morphAttributes))out.morphAttributes[name]=list.map(a=>copyAttribute(a,used));
  out.setIndex(remapped);for(const group of newGroups)out.addGroup(group.start,group.count,group.materialIndex);
  out.computeBoundingBox();out.computeBoundingSphere();return out;
}

export async function optimizeModel(root,{ratio=.7,maxTexture=1024,onProgress=()=>{}}={}) {
  await MeshoptSimplifier.ready;const before=modelStats(root),meshes=[];root.traverse(o=>{if(o.isMesh)meshes.push(o);});
  const warnings=[],textureCache=new Map(),materialCache=new Map();let textures=0;
  for(let i=0;i<meshes.length;i++){
    const mesh=meshes[i];onProgress(`减面与贴图处理 ${i+1}/${meshes.length}`);
    try{mesh.geometry=reduceGeometry(mesh.geometry,ratio);}catch(error){warnings.push(`${mesh.name||'网格'}保留原面数：${error.message}`);}
    const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    const updated=materials.map(material=>{
      if(materialCache.has(material))return materialCache.get(material);
      const copy=material.clone();
      materialCache.set(material,copy);
      for(const [slot,texture] of Object.entries(material)){
        if(!texture?.isTexture||!texture.image||typeof document==='undefined')continue;
        const mimeType=(slot==='map'&&!material.transparent&&!material.alphaTest&&!material.alphaMap)||slot==='emissiveMap'?'image/jpeg':'image/png';
        if(textureCache.get(texture)?.has(mimeType)){copy[slot]=textureCache.get(texture).get(mimeType);continue;}
        const image=texture.image,w=image.width,h=image.height;if(!w||!h||texture.isCompressedTexture||image.data)continue;
        const scale=Math.min(1,maxTexture/Math.max(w,h)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));
        try{const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,canvas.width,canvas.height);const t=texture.clone();t.source=new THREE.Source(canvas);t.needsUpdate=true;
          t.userData={...texture.userData,mimeType};
          if(!textureCache.has(texture))textureCache.set(texture,new Map());textureCache.get(texture).set(mimeType,t);copy[slot]=t;textures++;
        }catch(error){warnings.push('一张贴图未能重采样，已保留原图');}
      }
      return copy;
    });mesh.material=Array.isArray(mesh.material)?updated:updated[0];
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  return {before,after:modelStats(root),textures,warnings};
}
