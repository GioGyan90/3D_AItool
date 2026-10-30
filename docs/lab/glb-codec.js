import { MeshoptEncoder } from '../vendor/meshopt/meshopt_encoder.module.js?v=6f8d754605aa';
import { MeshoptDecoder } from '../vendor/meshopt/meshopt_decoder.module.js?v=6f8d754605aa';

export function readGLB(buffer) {
  const bytes=buffer instanceof Uint8Array?buffer:new Uint8Array(buffer);
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(bytes.length<20||view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==bytes.length)throw new Error('请选择有效的 glTF 2.0 GLB 文件');
  let json=null,bin=new Uint8Array();
  for(let offset=12;offset+8<=bytes.length;){
    const length=view.getUint32(offset,true),type=view.getUint32(offset+4,true);offset+=8;
    if(offset+length>bytes.length)throw new Error('GLB 数据不完整');
    if(type===0x4e4f534a)json=JSON.parse(new TextDecoder().decode(bytes.subarray(offset,offset+length)).trim());
    if(type===0x004e4942)bin=bytes.slice(offset,offset+length);
    offset+=length;
  }
  if(!json)throw new Error('GLB 缺少 JSON 数据');
  return {json,bin};
}

export function writeGLB(json,bin) {
  const text=new TextEncoder().encode(JSON.stringify(json)),jl=(text.length+3)&~3,bl=(bin.length+3)&~3;
  const out=new Uint8Array(12+8+jl+8+bl),dv=new DataView(out.buffer);
  dv.setUint32(0,0x46546c67,true);dv.setUint32(4,2,true);dv.setUint32(8,out.length,true);
  dv.setUint32(12,jl,true);dv.setUint32(16,0x4e4f534a,true);out.fill(32,20,20+jl);out.set(text,20);
  dv.setUint32(20+jl,bl,true);dv.setUint32(24+jl,0x004e4942,true);out.set(bin,28+jl);return out.buffer;
}

// Lossless EXT_meshopt_compression. INDICES mode preserves exact index order.
// Only compatible whole accessor views are compressed; image bytes stay raw.
export async function compressGLB(buffer) {
  await MeshoptEncoder.ready;
  const {json,bin}=readGLB(buffer);if(json.extensionsUsed?.includes('EXT_meshopt_compression'))return buffer;
  const references=new Map();
  for(const a of json.accessors||[])if(a.bufferView!==undefined){const list=references.get(a.bufferView)||[];list.push(a);references.set(a.bufferView,list);}
  const components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16},sizes={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
  const chunks=[];let length=0,fallbackLength=0,count=0;
  const append=data=>{const offset=length;chunks.push({offset,data});length+=(data.length+3)&~3;return offset;};
  for(const [i,bv] of (json.bufferViews||[]).entries()){
    if(bv.buffer!==0)return buffer;
    const data=bin.slice(bv.byteOffset||0,(bv.byteOffset||0)+bv.byteLength),accessors=references.get(i)||[];
    const a=accessors.length===1?accessors[0]:null;
    const stride=a?(bv.byteStride||sizes[a.componentType]*components[a.type]):0;
    const mode=bv.target===34963?'INDICES':'ATTRIBUTES';
    const can=a&&!a.sparse&&!(a.byteOffset||0)&&stride*a.count===bv.byteLength&&((mode==='INDICES'&&[2,4].includes(stride))||(mode==='ATTRIBUTES'&&stride%4===0&&stride<=256));
    const encoded=can?MeshoptEncoder.encodeGltfBuffer(data,a.count,stride,mode):null;
    if(encoded&&encoded.length+100<data.length){
      const byteOffset=append(encoded);
      bv.buffer=1;bv.byteOffset=fallbackLength;fallbackLength+=(bv.byteLength+3)&~3;
      bv.extensions={...(bv.extensions||{}),EXT_meshopt_compression:{buffer:0,byteOffset,byteLength:encoded.length,byteStride:stride,count:a.count,mode,filter:'NONE'}};count++;
    }else {bv.buffer=0;bv.byteOffset=append(data);}
  }
  if(!count)return buffer;
  const output=new Uint8Array(length);for(const c of chunks)output.set(c.data,c.offset);
  json.buffers=[{byteLength:length},{byteLength:fallbackLength,extensions:{EXT_meshopt_compression:{fallback:true}}}];
  json.extensionsUsed=[...new Set([...(json.extensionsUsed||[]),'EXT_meshopt_compression'])];
  json.extensionsRequired=[...new Set([...(json.extensionsRequired||[]),'EXT_meshopt_compression'])];
  const compressed=writeGLB(json,output);return compressed.byteLength<buffer.byteLength?compressed:buffer;
}

export async function decodeView(json,bin,index) {
  const bv=json.bufferViews[index],e=bv.extensions?.EXT_meshopt_compression;
  if(!e)return bin.slice(bv.byteOffset||0,(bv.byteOffset||0)+bv.byteLength);
  await MeshoptDecoder.ready;const out=new Uint8Array(e.count*e.byteStride);
  MeshoptDecoder.decodeGltfBuffer(out,e.count,e.byteStride,bin.subarray(e.byteOffset||0,(e.byteOffset||0)+e.byteLength),e.mode,e.filter);return out;
}
