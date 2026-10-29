import * as THREE from 'three';

// Independently authored cross-section cages. No reference GLB or fitted
// offsets are loaded. Coordinates remain in assembly space (+Y up, +Z front).
const MODELS=new WeakMap();
const smooth=(a,b,x)=>{const t=THREE.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const mix=(a,b,t)=>[[a,1-t],[b,t]].filter(([,w])=>w>1e-8);
const R=(x,y,z,a,b,tilt=0)=>({c:[x,y,z],a,b,tilt});
const ELBOW=R(.485,1.35,-.005,.044,.046,.009);
const WRIST=R(.72,1.35,-.005,.028,.032);
const KNEE=R(.11,.50,.012,.045,.043,.009);

export const PART_LABELS={head:'头部',neck:'颈部',chest:'胸廓',abdomen:'腹部',pelvis:'骨盆',upperArm:'上臂',forearm:'前臂',thigh:'大腿',calf:'小腿',foot:'脚',palm:'手掌',Thumb:'拇指',Index:'食指',Middle:'中指',Ring:'无名指',Pinky:'小指',ear:'耳部'};
const COLORS={head:0xd9bba1,neck:0xd5c3aa,chest:0x90b7ba,abdomen:0xa8c5b6,pelvis:0xb0a6c3,upperArm:0xd9b57e,forearm:0xe2ca9d,thigh:0x92accb,calf:0xa0bed1,foot:0x738c9b,palm:0xd9bba1,Thumb:0xc8b7a6,Index:0xc8b7a6,Middle:0xc8b7a6,Ring:0xc8b7a6,Pinky:0xc8b7a6,ear:0xd9bba1};

function axialWeights([,y]){
  if(y<.96)return [['Hips',1]];
  const anchors=[['Hips',.96],['Spine',1.055],['Spine1',1.18],['Spine2',1.32],['Neck',1.47],['Head',1.58]];
  for(let i=1;i<anchors.length;i++)if(y<=anchors[i][1])return mix(anchors[i-1][0],anchors[i][0],smooth(anchors[i-1][1],anchors[i][1],y));
  return [['Head',1]];
}
function armWeights([x]){
  if(x<.235)return mix('Spine2','LeftArm',smooth(.175,.235,x));
  if(x<.45)return [['LeftArm',1]];
  if(x<.525)return mix('LeftArm','LeftForeArm',smooth(.45,.525,x));
  if(x<.69)return [['LeftForeArm',1]];
  return mix('LeftForeArm','LeftHand',smooth(.69,.75,x));
}
function legWeights([,y]){
  if(y>.87)return mix('LeftUpLeg','Hips',smooth(.87,.97,y)*.65);
  if(y>.545)return [['LeftUpLeg',1]];
  if(y>.46)return mix('LeftLeg','LeftUpLeg',smooth(.46,.545,y));
  if(y>.15)return [['LeftLeg',1]];
  return mix('LeftFoot','LeftLeg',smooth(.09,.15,y));
}
function volume(positions,indices){let sum=0;for(let i=0;i<indices.length;i+=3){const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;sum+=(positions[a]*(positions[b+1]*positions[c+2]-positions[b+2]*positions[c+1])+positions[a+1]*(positions[b+2]*positions[c]-positions[b]*positions[c+2])+positions[a+2]*(positions[b]*positions[c+1]-positions[b+1]*positions[c]))/6;}return sum;}

// Every ring has stable sector IDs; caps share ring vertices with the side.
function loft(id,category,axis,rings,sides,weights,shape){
  const p=[],index=[],influences=[];
  const point=(ring,sector)=>{
    const angle=sector*Math.PI*2/sides,c=Math.cos(angle),s=Math.sin(angle),v=[...ring.c];
    if(axis==='y'){v[0]+=ring.a*c;v[2]+=ring.b*s;v[1]+=ring.tilt*c;}
    if(axis==='x'){v[1]+=ring.a*c;v[2]+=ring.b*s;v[0]+=ring.tilt*s;}
    if(axis==='z'){v[0]+=ring.a*c;v[1]+=ring.b*s;}
    return shape?shape(v,ring,sector,angle):v;
  };
  for(let r=0;r<rings.length;r++)for(let s=0;s<sides;s++){const v=point(rings[r],s);p.push(...v);influences.push(weights(v));}
  for(let r=0;r<rings.length-1;r++)for(let s=0;s<sides;s++){const a=r*sides+s,an=r*sides+(s+1)%sides,b=a+sides,bn=an+sides;index.push(a,b,an,an,b,bn);}
  for(const [r,end] of [[0,false],[rings.length-1,true]]){
    const center=[0,0,0];for(let s=0;s<sides;s++)for(let k=0;k<3;k++)center[k]+=p[(r*sides+s)*3+k]/sides;
    const ci=p.length/3;p.push(...center);influences.push(weights(center));
    for(let s=0;s<sides;s++){const a=r*sides+s,b=r*sides+(s+1)%sides;index.push(...(end?[ci,b,a]:[ci,a,b]));}
  }
  if(volume(p,index)<0)for(let i=0;i<index.length;i+=3)[index[i+1],index[i+2]]=[index[i+2],index[i+1]];
  const geometry=new THREE.BufferGeometry();geometry.name=id;geometry.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geometry.setIndex(index);geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return {id,category,label:PART_LABELS[category],geometry,influences,rings:rings.length,sides};
}
function mirror(part){
  const geometry=part.geometry.clone(),p=geometry.attributes.position;for(let i=0;i<p.count;i++)p.setX(i,-p.getX(i));
  const a=geometry.index.array;for(let i=0;i<a.length;i+=3)[a[i+1],a[i+2]]=[a[i+2],a[i+1]];
  geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();geometry.name=part.id.replace('_L','_R');
  return {...part,id:geometry.name,geometry,influences:part.influences.map(list=>list.map(([n,w])=>[n.replace('Left','Right'),w]))};
}

export function createProceduralParts(){
  const parts=[];const add=(...args)=>{const part=loft(...args);parts.push(part);return part;};
  add('pelvis','pelvis','y',[
    R(0,.805,-.005,.145,.086),R(0,.87,-.013,.177,.105),R(0,.93,-.01,.163,.101),R(0,.975,0,.14,.09)
  ],12,axialWeights,(v,r,s,a)=>{if(r.c[1]===.805)v[1]+=.045*Math.abs(Math.cos(a));return v;});
  add('abdomen','abdomen','y',[R(0,.96,0,.142,.091),R(0,1.025,.002,.132,.087),R(0,1.09,.002,.146,.1),R(0,1.145,0,.163,.107)],12,axialWeights);
  add('chest','chest','y',[R(0,1.13,0,.16,.105),R(0,1.21,-.003,.19,.117),R(0,1.30,-.006,.208,.119),R(0,1.365,-.008,.203,.108),R(0,1.408,-.004,.146,.077),R(0,1.443,0,.068,.058)],12,axialWeights);
  add('neck','neck','y',[R(0,1.425,0,.065,.059),R(0,1.48,0,.056,.055),R(0,1.535,.005,.058,.058)],10,axialWeights);
  add('head','head','y',[R(0,1.512,.015,.047,.052),R(0,1.54,.016,.075,.07),R(0,1.585,.01,.102,.085),R(0,1.635,0,.109,.095),R(0,1.69,-.008,.105,.094),R(0,1.74,-.015,.092,.081),R(0,1.775,-.017,.063,.053),R(0,1.785,-.017,.034,.029)],12,()=>[['Head',1]],(v,r,s,a)=>{if(Math.sin(a)>.7&&r.c[1]<1.70)v[2]=r.c[2]+r.b*(.93+(s===3?.07:0));return v;});
  const left=[];const limb=(...args)=>{const part=loft(...args);left.push(part);return part;};
  limb('upperArm_L','upperArm','x',[R(.15,1.355,-.005,.041,.049),R(.225,1.36,-.005,.082,.079),R(.29,1.352,-.006,.074,.071),R(.36,1.347,-.007,.06,.061),R(.447,1.347,-.005,.049,.052,.006),ELBOW],10,armWeights);
  limb('forearm_L','forearm','x',[ELBOW,R(.535,1.35,-.004,.057,.054,.004),R(.60,1.35,-.005,.049,.047),R(.67,1.35,-.005,.035,.037),WRIST],10,armWeights);
  limb('thigh_L','thigh','y',[R(.105,.955,-.005,.040,.055),R(.11,.875,-.003,.085,.104),R(.115,.77,.003,.078,.087),R(.113,.65,.009,.06,.064),R(.11,.55,.013,.047,.049,.006),KNEE],10,legWeights);
  limb('calf_L','calf','y',[KNEE,R(.11,.455,0,.045,.049,.005),R(.108,.388,-.017,.055,.066),R(.104,.28,-.023,.047,.054),R(.103,.16,-.016,.032,.035),R(.103,.105,-.012,.027,.03)],10,legWeights);
  limb('foot_L','foot','z',[R(.103,.053,-.075,.04,.049),R(.103,.062,-.025,.049,.062),R(.103,.056,.055,.055,.053),R(.103,.038,.135,.051,.034),R(.103,.032,.18,.037,.027)],10,v=>v[2]<.01?legWeights(v):[['LeftFoot',1]],v=>{if(v[1]<.025)v[1]=0;return v;});
  limb('palm_L','palm','x',[WRIST,R(.755,1.35,0,.045,.023),R(.792,1.352,.001,.046,.019),R(.81,1.354,.002,.039,.016)],8,armWeights);
  for(const [finger,y,length,radius] of [['Index',1.321,.087,.012],['Middle',1.346,.101,.0125],['Ring',1.371,.092,.0115],['Pinky',1.392,.073,.01]]){
    const x=.80;limb(finger+'_L',finger,'x',[R(x,y,.002,radius,.011),R(x+length*.36,y,-.001,radius*.9,.010),R(x+length*.70,y,.005,radius*.75,.008),R(x+length,y,.014,radius*.48,.0055)],8,v=>{
      const t=(v[0]-x)/length;if(t<.18)return mix('LeftHand','LeftHand'+finger+'1',smooth(0,.18,t));if(t<.47)return mix('LeftHand'+finger+'1','LeftHand'+finger+'2',smooth(.28,.47,t));return mix('LeftHand'+finger+'2','LeftHand'+finger+'3',smooth(.61,.80,t));
    });
  }
  limb('Thumb_L','Thumb','x',[R(.749,1.319,.006,.017,.014),R(.773,1.29,.012,.015,.013),R(.797,1.272,.017,.011,.011),R(.819,1.262,.024,.007,.007)],8,v=>v[0]<.77?mix('LeftHand','LeftHandThumb1',smooth(.745,.77,v[0])):v[0]<.795?mix('LeftHandThumb1','LeftHandThumb2',smooth(.77,.795,v[0])):mix('LeftHandThumb2','LeftHandThumb3',smooth(.795,.815,v[0])));
  limb('ear_L','ear','x',[R(.103,1.632,-.006,.024,.014),R(.128,1.633,-.008,.039,.018),R(.144,1.63,-.008,.025,.011)],8,()=>[['Head',1]]);
  for(const part of left){parts.push(part,mirror(part));}
  return parts;
}

function skeleton(root){
  const bones=[],map={};const add=(name,parent,world)=>{const b=new THREE.Bone();b.name='mixamorig'+name;const parentPosition=parent?map[parent].userData.restWorld:[0,0,0];b.position.fromArray(world.map((v,i)=>v-parentPosition[i]));b.userData.restWorld=world;(parent?map[parent]:root).add(b);map[name]=b;bones.push(b);return b;};
  add('Hips',null,[0,.93,0]);add('Spine','Hips',[0,1.055,0]);add('Spine1','Spine',[0,1.18,0]);add('Spine2','Spine1',[0,1.31,-.005]);add('Neck','Spine2',[0,1.46,0]);add('Head','Neck',[0,1.56,0]);
  for(const [side,sign] of [['Left',1],['Right',-1]]){
    const w=(x,y,z=0)=>[sign*x,y,z];add(side+'Shoulder','Spine2',w(.15,1.36,-.005));add(side+'Arm',side+'Shoulder',w(.215,1.36,-.005));add(side+'ForeArm',side+'Arm',w(.485,1.35,-.005));add(side+'Hand',side+'ForeArm',w(.72,1.35,-.005));
    for(const [finger,y,length] of [['Index',1.321,.087],['Middle',1.346,.101],['Ring',1.371,.092],['Pinky',1.392,.073]]){
      add(side+'Hand'+finger+'1',side+'Hand',w(.80,y,.002));add(side+'Hand'+finger+'2',side+'Hand'+finger+'1',w(.80+length*.36,y,-.001));add(side+'Hand'+finger+'3',side+'Hand'+finger+'2',w(.80+length*.70,y,.005));
    }
    add(side+'HandThumb1',side+'Hand',w(.752,1.314,.008));add(side+'HandThumb2',side+'HandThumb1',w(.777,1.286,.014));add(side+'HandThumb3',side+'HandThumb2',w(.80,1.27,.019));
    add(side+'UpLeg','Hips',w(.105,.91,0));add(side+'Leg',side+'UpLeg',w(.11,.50,.012));add(side+'Foot',side+'Leg',w(.103,.105,-.012));add(side+'ToeBase',side+'Foot',w(.103,.035,.13));
  }
  root.updateMatrixWorld(true);return {bones,map,skeleton:new THREE.Skeleton(bones)};
}

export function createProceduralCharacter(){
  const root=new THREE.Group();root.name='Procedural_Cage_Character';root.userData={motionCharacter:true,proceduralCages:true,source:'Independently authored cross-section cages; no reference mesh loaded',parts:29,height:1.785,facing:'+Z',stage:'first-pass body study'};
  const rig=skeleton(root),parts=createProceduralParts(),grey=new THREE.MeshStandardMaterial({color:0x9da8a4,roughness:.85,flatShading:true}),materials=new Map(),state={parts:[],explosion:0,isolated:'all',surface:'grey',wireframe:false,grey};
  grey.name='Neutral_Clay';
  for(const part of parts){
    const si=[],sw=[];for(const list of part.influences){const sum=list.reduce((n,[,v])=>n+v,0);for(let i=0;i<4;i++){si.push(list[i]?rig.bones.indexOf(rig.map[list[i][0]]):0);sw.push(list[i]?list[i][1]/sum:0);}}
    part.geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(si,4));part.geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(sw,4));
    const mesh=new THREE.SkinnedMesh(part.geometry,grey);mesh.name=part.id;mesh.castShadow=true;mesh.frustumCulled=false;mesh.userData={part:part.id,category:part.category,ringCount:part.rings,sectors:part.sides};root.add(mesh);mesh.bind(rig.skeleton,new THREE.Matrix4());
    if(!materials.has(part.category))materials.set(part.category,new THREE.MeshStandardMaterial({name:part.category,color:COLORS[part.category],roughness:.85,flatShading:true}));
    const rest=Float32Array.from(part.geometry.attributes.position.array);state.parts.push({...part,mesh,rest,material:materials.get(part.category)});
  }
  MODELS.set(root,state);return root;
}

export function getProceduralParts(root){return MODELS.get(root)?.parts||[];}
export function proceduralSettings(root){const s=MODELS.get(root);return s?{explosion:s.explosion,isolated:s.isolated,surface:s.surface,wireframe:s.wireframe}:null;}

export function setProceduralView(root,changes={}){
  const state=MODELS.get(root);if(!state)return;Object.assign(state,changes);state.explosion=THREE.MathUtils.clamp(state.explosion,0,1);
  const offsets={head:[0,.34,0],neck:[0,.17,0],chest:[0,.075,0],abdomen:[0,0,0],pelvis:[0,-.10,0],upperArm:[.16,0,0],forearm:[.32,0,0],palm:[.47,0,0],thigh:[.13,-.04,0],calf:[.20,-.15,0],foot:[.25,-.26,0],ear:[.17,.34,0]};
  for(const part of state.parts){
    const sign=part.id.endsWith('_R')?-1:1,offset=offsets[part.category]||[.59,(part.category==='Pinky'?.055:part.category==='Index'?-.025:0),.025];
    const a=part.geometry.attributes.position;for(let i=0;i<a.count;i++)a.setXYZ(i,part.rest[i*3]+sign*offset[0]*state.explosion,part.rest[i*3+1]+offset[1]*state.explosion,part.rest[i*3+2]+offset[2]*state.explosion);a.needsUpdate=true;
    part.mesh.visible=state.isolated==='all'||state.isolated===part.id;part.mesh.material=state.surface==='parts'?part.material:state.grey;part.mesh.material.wireframe=state.wireframe;
    part.geometry.computeBoundingSphere();
  }
}

export function prepareProceduralExport(root){const state=proceduralSettings(root);if(!state)return ()=>{};setProceduralView(root,{explosion:0,isolated:'all',wireframe:false});return ()=>setProceduralView(root,state);}
export function createPartExport(root,id){
  const part=MODELS.get(root)?.parts.find(p=>p.id===id);if(!part)throw new Error('请先选择一个自建人物零件');
  const geometry=part.geometry.clone();geometry.setAttribute('position',new THREE.Float32BufferAttribute(part.rest,3));geometry.deleteAttribute('skinIndex');geometry.deleteAttribute('skinWeight');geometry.computeVertexNormals();
  const material=part.mesh.material.clone();material.wireframe=false;const mesh=new THREE.Mesh(geometry,material);mesh.name=part.id;mesh.userData={part:part.id,coordinates:'original assembly space; no preview centering or explosion'};return mesh;
}

export function validateProceduralParts(parts=createProceduralParts()){
  return parts.map(part=>{const p=part.geometry.attributes.position.array,index=part.geometry.index.array,edges=new Map();let degenerate=0;
    for(let i=0;i<index.length;i+=3){const ids=[index[i],index[i+1],index[i+2]],a=new THREE.Vector3().fromArray(p,ids[0]*3),b=new THREE.Vector3().fromArray(p,ids[1]*3),c=new THREE.Vector3().fromArray(p,ids[2]*3);if(b.sub(a).cross(c.sub(a)).lengthSq()<1e-18)degenerate++;
      for(let j=0;j<3;j++){const u=ids[j],v=ids[(j+1)%3],key=Math.min(u,v)+':'+Math.max(u,v);const e=edges.get(key)||{count:0,direction:0};e.count++;e.direction+=u<v?1:-1;edges.set(key,e);}}
    const boundary=[...edges.values()].filter(e=>e.count!==2).length,badWinding=[...edges.values()].filter(e=>e.direction!==0).length,signedVolume=volume(p,index);
    return {part:part.id,vertices:p.length/3,triangles:index.length/3,rings:part.rings,sectors:part.sides,boundary,badWinding,degenerate,signedVolume,pass:!boundary&&!badWinding&&!degenerate&&signedVolume>0};
  });
}
