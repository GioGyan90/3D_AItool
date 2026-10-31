import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as T from 'three';
import {parseCharacter} from '../public/lab/assets.js';
import {GLTFExporter} from '../public/vendor/exporters/GLTFExporter.js';
import {MeshoptSimplifier} from '../public/vendor/meshopt/meshopt_simplifier.module.js';
import {reduceGeometry,modelStats} from '../public/lab/optimize.js';
import {readGLB,writeGLB,compressGLB} from '../public/lab/glb-codec.js';
import {clip,compact,assignRigid,boundaryEdges} from './runner-geometry.mjs';

const source=process.env.CHARABUILDER_SOURCE,pinned='6ff7fa5c7b451c7318cf445038f1514a646343ea';
if(!source)throw Error('Set CHARABUILDER_SOURCE to the reviewed CharaBuilder checkout');
if(execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim()!==pinned)throw Error('CharaBuilder source revision differs');
const assetDir=path.join(source,'dist/assets/anime'),hashes={};
async function sourceFile(name){
  const bytes=await fs.readFile(path.join(assetDir,name)),relative='dist/assets/anime/'+name;
  const expected=execFileSync('git',['rev-parse',pinned+':'+relative],{cwd:source,encoding:'utf8'}).trim(),actual=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
  if(actual!==expected)throw Error('Source file differs from reviewed commit: '+name);
  hashes[name]=createHash('sha256').update(bytes).digest('hex');return bytes;
}
async function pack(id){const manifest=JSON.parse(await sourceFile(id+'-manifest.json')),parts=await Promise.all(manifest.parts.map(sourceFile)),data=Buffer.from(parts.map(p=>p.toString()).join(''),'base64');if(data.length!==manifest.bytes)throw Error('Incomplete source pack');const result=JSON.parse(gunzipSync(data));if(result.license!=='CC0')throw Error('Unexpected source license');return result;}
const female=await pack('female'),bob=await pack('bob');
globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(x=>{this.result=x;this.onloadend?.();});}};
const bodyURL=new URL('../public/lab/characters/running-woman/assembled-running-woman.glb',import.meta.url),bodyBytes=new Uint8Array(await fs.readFile(bodyURL));
const bodyHash=createHash('sha256').update(bodyBytes).digest('hex');
if(bodyHash!=='e0cd65a169eab175529882c2fcf71abd115f433ea0376313ce1d800776cc0847')throw Error('Reviewed adult body changed; inspect before adapting it');
const {json:bodyJSON,bin:bodyBin}=readGLB(bodyBytes);for(const m of bodyJSON.materials||[])delete m.pbrMetallicRoughness.baseColorTexture;bodyJSON.images=[];bodyJSON.textures=[];
const {scene:root}=await parseCharacter(writeGLB(bodyJSON,bodyBin)),metadata=[];root.traverse(o=>{if(o.userData.preset)metadata.push(o.userData);});Object.assign(root.userData,metadata[0]);
const oldHead=root.getObjectByName('head_neck'),skeleton=oldHead.skeleton,headIndex=skeleton.bones.findIndex(b=>b.name==='mixamorigHead'),oldStats=modelStats(root);
const headBone=skeleton.bones[headIndex],neckBone=skeleton.bones.find(b=>b.name==='mixamorigNeck'),targetHead=headBone.getWorldPosition(new T.Vector3()),targetNeck=neckBone.getWorldPosition(new T.Vector3());
const palette={skin:'#f1c7b1',hair:'#5b3b34',line:'#493034',tank:'#16a59c',pants:'#29395c',shoe:'#f1f3e9'};
const skin=new T.MeshStandardMaterial({name:'Anime warm skin',color:palette.skin,roughness:.92,metalness:0});
const lowerY=1.449,upperY=1.462,sourceHead=new T.Vector3(...female.landmarks.head),sourceNeck=new T.Vector3(...female.landmarks.neck),xzScale=.88,sourceTop=1.62928,targetTop=1.708;
const lowerScale=(targetHead.y-targetNeck.y)/(sourceHead.y-sourceNeck.y),upperScale=(targetTop-targetHead.y)/(sourceTop-sourceHead.y);
const mapPoint=p=>{const t=T.MathUtils.smoothstep(p.y,sourceNeck.y,sourceHead.y),fromZ=T.MathUtils.lerp(sourceNeck.z,sourceHead.z,t),toZ=T.MathUtils.lerp(targetNeck.z,targetHead.z,t);return new T.Vector3(targetHead.x+(p.x-sourceHead.x)*xzScale,p.y<sourceHead.y?targetNeck.y+(p.y-sourceNeck.y)*lowerScale:targetHead.y+(p.y-sourceHead.y)*upperScale,toZ+(p.z-fromZ)*xzScale);};
const donorCut=sourceNeck.y+(upperY-targetNeck.y)/lowerScale,chinY=mapPoint(new T.Vector3(0,1.38871,0)).y;
function sourceGeometry(mesh,group){
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(mesh.positions.map(v=>v/1e5),3));g.setAttribute('normal',new T.Float32BufferAttribute(mesh.normals.map(v=>v/32767),3));g.setAttribute('uv',new T.Float32BufferAttribute(mesh.uv.map(v=>v/65535),2));g.setIndex(group.indices);return compact(g);
}
function transformed(g,fn){
  const p=g.attributes.position,n=g.attributes.normal,e=1e-5;
  for(let i=0;i<p.count;i++){
    const before=new T.Vector3().fromBufferAttribute(p,i),after=fn(before),columns=[new T.Vector3(e,0,0),new T.Vector3(0,e,0),new T.Vector3(0,0,e)].map(d=>fn(before.clone().add(d)).sub(after).divideScalar(e));
    const jacobian=new T.Matrix3().set(columns[0].x,columns[1].x,columns[2].x,columns[0].y,columns[1].y,columns[2].y,columns[0].z,columns[1].z,columns[2].z),normal=new T.Vector3().fromBufferAttribute(n,i).applyMatrix3(jacobian.invert().transpose()).normalize();
    p.setXYZ(i,...after.toArray());n.setXYZ(i,...normal.toArray());
  }
  g.computeBoundingBox();g.computeBoundingSphere();return g;
}
function ring(g,y){
  const ids=[...new Set(boundaryEdges(g).filter(e=>[e.a,e.b].every(i=>Math.abs(g.attributes.position.getY(i)-y)<2e-6)).flatMap(e=>[e.a,e.b]))],unique=new Map();
  for(const id of ids){const p=new T.Vector3().fromBufferAttribute(g.attributes.position,id),key=p.toArray().map(v=>Math.round(v*1e6)).join(',');if(!unique.has(key))unique.set(key,{id,p});}
  const rows=[...unique.values()];if(rows.length<8)throw Error('Neck cut did not create a complete ring');const box=new T.Box3().setFromPoints(rows.map(r=>r.p)),center=box.getCenter(new T.Vector3());
  for(const r of rows)r.angle=(Math.atan2(r.p.z-center.z,r.p.x-center.x)+Math.PI*2)%(Math.PI*2);rows.sort((a,b)=>a.angle-b.angle);return {rows,center};
}
function radius(r,a){const dx=Math.cos(a),dz=Math.sin(a),values=[];for(let i=0;i<r.rows.length;i++){const ap=r.rows[i].p.clone().sub(r.center),bp=r.rows[(i+1)%r.rows.length].p.clone().sub(r.center),ex=bp.x-ap.x,ez=bp.z-ap.z,den=dx*ez-dz*ex;if(Math.abs(den)<1e-10)continue;const value=(ap.x*ez-ap.z*ex)/den,t=(ap.x*dz-ap.z*dx)/den;if(value>0&&t>=-1e-6&&t<=1+1e-6)values.push(value);}if(!values.length)throw Error('Neck contour is not star-shaped');return Math.max(...values);}
const retained=compact(clip(oldHead.geometry,[(x,y)=>lowerY-y])),bottom=ring(retained,lowerY);
const bodySource=female.meshes.find(m=>m.name==='Body'),bodyGroup=bodySource.groups.find(g=>female.materials[g.material].name.includes('_SKIN'));
const scalp=assignRigid(transformed(clip(sourceGeometry(bodySource,bodyGroup),[(x,y)=>y-donorCut]),mapPoint),headIndex),unfittedTop=ring(scalp,upperY);
// Match the actual adult neck contour below the lowest facial vertex. This
// preserves the anime jaw/eyes while giving the graft a continuous adult neck.
transformed(scalp,p=>{const w=1-T.MathUtils.smoothstep(p.y,upperY,chinY-.001);if(w===0)return p.clone();const d=p.clone().sub(unfittedTop.center),a=Math.atan2(d.z,d.x),scale=radius(bottom,a)/radius(unfittedTop,a),fit=new T.Vector3(bottom.center.x+d.x*scale,p.y,bottom.center.z+d.z*scale);return p.clone().lerp(fit,w);});
const top=ring(scalp,upperY),parts=[],textures=new Map();
for(const name of ['head_neck','brows','eyes','hair']){const mesh=root.getObjectByName(name);mesh.removeFromParent();}
root.traverse(o=>{if(o.isMesh&&/^skin_/.test(o.name))o.material=skin;});
function add(g,material,id,label,offset,provenance){const geometry=compact(g);geometry.normalizeNormals();const mesh=new T.SkinnedMesh(geometry,material);mesh.name=id;mesh.userData={studyPart:true,partId:id,partLabel:label,explosionOffset:offset,provenance};root.add(mesh);mesh.bind(skeleton,new T.Matrix4());mesh.frustumCulled=false;parts.push(mesh);return mesh;}
add(retained,skin,'anime_neck','成年颈部',[0,.10,0],'Retained calibrated Quaternius adult neck; original upper head removed');
add(scalp,skin,'anime_skull','二次元后脑与颈上段',[0,.17,-.035],'VRoid beta HairSample_Female head skin only; adult neck contour fit');
function neckBridge(){
  const p=[],n=[],si=[],sw=[],uv=[],indices=[],rows=[...bottom.rows,...top.rows],N=bottom.rows.length,M=top.rows.length;
  rows.forEach((row,i)=>{const g=i<N?retained:scalp;p.push(...row.p.toArray());n.push(...new T.Vector3().fromBufferAttribute(g.attributes.normal,row.id).toArray());for(let k=0;k<4;k++){si.push(g.attributes.skinIndex.getComponent(row.id,k));sw.push(g.attributes.skinWeight.getComponent(row.id,k));}uv.push(0,0);});
  let i=0,j=0;while(i<N||j<M){const ai=i<N?bottom.rows[(i+1)%N].angle+((i+1)>=N?Math.PI*2:0):Infinity,aj=j<M?top.rows[(j+1)%M].angle+((j+1)>=M?Math.PI*2:0):Infinity;if(ai<aj){indices.push(i%N,N+j%M,(i+1)%N);i++;}else{indices.push(i%N,N+j%M,N+(j+1)%M);j++;}}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('normal',new T.Float32BufferAttribute(n,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setAttribute('skinIndex',new T.Uint16BufferAttribute(si,4));g.setAttribute('skinWeight',new T.Float32BufferAttribute(sw,4));g.setIndex(indices);return g;
}
add(neckBridge(),skin,'anime_neck_bridge','头颈连续接合',[0,.13,0],'Explicit zipped rings; shared surface positions/normals/skin weights at both boundaries');
async function material(owner,index,hair=false){
  const ref=owner.materials[index],unlit=!hair&&!ref.name.includes('_SKIN'),result=new (unlit?T.MeshBasicMaterial:T.MeshStandardMaterial)({name:hair?'Chestnut bob '+index:ref.name,color:hair?palette.hair:/Brow|Eyeline|Eyelash/.test(ref.name)?palette.line:'#ffffff',side:ref.double?T.DoubleSide:T.FrontSide,transparent:ref.blend===2,alphaTest:ref.blend?.2:0,depthWrite:true});
  if(!unlit){result.roughness=.94;result.metalness=0;}
  if(ref.texture){await sourceFile(ref.texture);result.userData.bobTexture=ref.texture;textures.set(ref.texture,path.join(assetDir,ref.texture));}return result;
}
const face=female.meshes.find(m=>m.name==='Face'),faceLabels={0:['mouth','口腔'],1:['eye_white','眼白'],2:['eyeline','眼线'],3:['eyelash','睫毛'],4:['brows','二次元眉毛'],5:['iris','虹膜'],6:['eye_highlight','眼睛高光'],7:['face_skin','二次元脸部']};
for(const group of face.groups){if(!faceLabels[group.material])continue;const [id,label]=faceLabels[group.material],g=assignRigid(transformed(sourceGeometry(face,group),mapPoint),headIndex);add(g,await material(female,group.material),'anime_'+id,label,[0,.20,.045],'Original CC0 HairSample_Female facial geometry, UV and painted features; rigid Head binding');}
const hairMeshes=[];
for(const sourceMesh of bob.meshes)for(const group of sourceMesh.groups){
  if(![14,15].includes(group.material))continue;const positions=[...sourceMesh.positions],fit=sourceMesh.fits?.female;if(fit)fit.indices.forEach((id,k)=>positions.splice(id*3,3,...fit.positions.slice(k*3,k*3+3)));
  const g=assignRigid(transformed(sourceGeometry({...sourceMesh,positions},group),mapPoint),headIndex),cap=group.material===14;
  hairMeshes.push(add(g,await material(bob,group.material,true),cap?'bob_scalp':'bob_locks',cap?'波波头发底':'波波短发发束',cap?[0,.23,-.07]:[0,.26,.02],'CC0 Sendagaya Shibu bob; source female scalp fit, head-space calibration; hairpin omitted'));
}
root.name='Anime_Bob_Running_Woman';const settings={preset:'anime-bob-woman',variant:'assembled',motionCharacter:true,studyRest:true,restPoseLabel:'源绑定姿势',headFocus:[0,1.592,.008],headSpan:.44,frameSpan:2.10,frameCenter:[0,.88,0],hairstyle:'chin-length bob',animeSourceRevision:pinned};
root.traverse(o=>{if(o.userData.preset)Object.assign(o.userData,settings);});Object.assign(root.userData,settings);root.updateMatrixWorld(true);
const destination=fileURLToPath(new URL('../public/lab/characters/anime-bob-woman/',import.meta.url));await fs.mkdir(destination,{recursive:true});
async function portable(){
  const {json,bin}=readGLB(await new GLTFExporter().parseAsync(root,{binary:true,onlyVisible:false})),ids=new Map(),chunks=[];let length=(bin.length+3)&~3;json.images=[];json.textures=[];json.samplers=[{magFilter:9729,minFilter:9987,wrapS:33071,wrapT:33071}];
  for(const mat of json.materials||[]){const filename=mat.extras?.bobTexture;if(!filename)continue;let id=ids.get(filename);if(id===undefined){const bytes=await fs.readFile(textures.get(filename)),view=json.bufferViews.length;json.bufferViews.push({buffer:0,byteOffset:length,byteLength:bytes.length});chunks.push({bytes,offset:length});length+=(bytes.length+3)&~3;id=json.textures.length;json.textures.push({source:json.images.length,sampler:0});json.images.push({bufferView:view,mimeType:'image/png'});ids.set(filename,id);}mat.pbrMetallicRoughness.baseColorTexture={index:id};delete mat.extras.bobTexture;if(!Object.keys(mat.extras).length)delete mat.extras;}
  const data=new Uint8Array(length);data.set(bin);for(const c of chunks)data.set(c.bytes,c.offset);json.buffers=[{byteLength:length}];return compressGLB(writeGLB(json,data));
}
const before=modelStats(root),reference=await portable();await fs.writeFile(path.join(destination,'source-reference.glb'),Buffer.from(reference));
await MeshoptSimplifier.ready;const simplification=[];
for(const mesh of hairMeshes){const old=mesh.geometry,ratio=mesh.name==='bob_locks'?.22:.7;mesh.geometry=reduceGeometry(old,ratio,.0015);simplification.push({part:mesh.name,before:old.index.count/3,after:mesh.geometry.index.count/3,requestedRatio:ratio});}
const after=modelStats(root),assembled=await portable();await fs.writeFile(path.join(destination,'assembled-anime-bob-woman.glb'),Buffer.from(assembled));
const all=[];root.traverse(o=>{if(o.isMesh)all.push(o);});
const report={version:1,date:'2026-10-31',source:{license:'CC0-1.0 source assets',completeBasePreserved:true,body:{asset:'Quaternius Superhero Female FullBody',path:'../running-woman/assembled-running-woman.glb',sha256:bodyHash,completeBase:'../running-woman/complete-source.glb',proportionsChanged:false},face:{author:'pixiv VRoid Project',asset:'beta HairSample_Female facial and cranial components only',ageClaim:'No adult female body is claimed for this donor; adult body is the independently sourced Quaternius model.'},hair:{author:'pixiv VRoid Project',asset:'beta Sendagaya Shibu bob and scalp; no donor body or costume'},repository:'https://github.com/GioGyan90/CharaBuilder',revision:pinned,hashes,officialLicenseURLs:['https://vroid.pixiv.help/hc/en-us/articles/4402614652569','https://vroid.pixiv.help/hc/en-us/articles/360012381793']},choices:{palette,outfit:'Same full-length athletic tank, fitted yoga leggings and running shoes',style:'Anime facial geometry and chin-length bob; portable basic/rough materials, not full MToon',motion:'Existing authored running plan with both hands looseFist; actual independent validation required'},before,after,sourceGLBBytes:reference.byteLength,modelGLBBytes:assembled.byteLength,rig:{totalJoints:skeleton.bones.length,motionTracks:58,bodySkeletonChanged:false},fitting:{xzScale,lowerScale,upperScale,lowerY,upperY,chinY,sourceNeck:female.landmarks.neck,sourceHead:female.landmarks.head,targetNeck:targetNeck.toArray(),targetHead:targetHead.toArray(),targetTop,neckRings:[bottom.rows.length,top.rows.length],bridgeTriangles:bottom.rows.length+top.rows.length,facialVerticesUnaffectedByNeckWidening:true,neckMaximumGap:0},construction:root.userData.runnerConstruction,simplification,parts:all.map(m=>({id:m.name,label:m.userData.partLabel,vertices:m.geometry.attributes.position.count,triangles:m.geometry.index.count/3,provenance:m.userData.provenance})),limits:['Adult body proportions retained; anime face and bob are sourced components, not a new sculpture from zero.','Face is a neutral rigid-to-Head expression; blinking and lip animation are not authored.','Bob hair follows Head; no secondary hair simulation.','source-reference.glb is the pre-hair-reduction clothed assembly, not an unmasked female base.','Rendering and new character motion validation are recorded separately.']};
await fs.writeFile(path.join(destination,'manifest.json'),JSON.stringify(report,null,2)+'\n');await fs.writeFile(fileURLToPath(new URL('../docs/ANIME_BOB_WOMAN_BUILD.json',import.meta.url)),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({before,after,sourceGLBBytes:reference.byteLength,modelGLBBytes:assembled.byteLength,simplification,neckRings:report.fitting.neckRings},null,2));
