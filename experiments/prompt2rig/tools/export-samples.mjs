import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {createCharacter} from '../public/lab/character.js';
import {MOTIONS,bakeMotion} from '../public/lab/motions.js';
import {Rig} from '../public/retarget.js';
import {GLTFExporter} from '../public/vendor/exporters/GLTFExporter.js';

globalThis.FileReader=class {
  readAsArrayBuffer(blob){blob.arrayBuffer().then(data=>{this.result=data;this.onloadend?.();});}
  readAsDataURL(blob){blob.arrayBuffer().then(data=>{this.result=`data:${blob.type};base64,${Buffer.from(data).toString('base64')}`;this.onloadend?.();});}
};
const destination=fileURLToPath(new URL('../samples/',import.meta.url));
await fs.mkdir(destination,{recursive:true});
const records=[];
for(const motion of MOTIONS){
  const model=createCharacter(),rig=new Rig(model),{track,clip}=bakeMotion(rig,motion);
  rig.reset();const data=await new GLTFExporter().parseAsync(model,{binary:true,animations:[clip]});
  const filename=`luckybreak_${motion.id}.glb`;
  await fs.writeFile(path.join(destination,filename),Buffer.from(data));
  await fs.writeFile(path.join(destination,`luckybreak_${motion.id}.animation.json`),JSON.stringify(THREE.AnimationClip.toJSON(clip))+'\n');
  records.push({...motion,file:filename,frames:track.length,bones:rig.order.length,bytes:data.byteLength,source:'authored-keyframes'});
  console.log(filename, data.byteLength+' bytes');
}
await fs.writeFile(path.join(destination,'manifest.json'),JSON.stringify({upstream:'fe3d3eec992772b538992374ca933020ed517938',motions:records},null,2)+'\n');
