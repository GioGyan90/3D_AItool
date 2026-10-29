import * as THREE from 'three';

// Original rigid-weight, low-poly mannequin. Mixamo bone names and T-pose.
// No external character, texture, or model downloads are needed.
export function createCharacter() {
  const root = new THREE.Group(); root.name = 'LuckyBreak_TestCharacter';
  const bones = [], byName = {};
  const bone = (name, parent, x, y, z = 0) => {
    const b = new THREE.Bone(); b.name = 'mixamorig' + name;
    b.position.set(x, y, z); (parent || root).add(b); bones.push(b); byName[name] = b; return b;
  };
  const hips = bone('Hips', null, 0, .94);
  const spine = bone('Spine', hips, 0, .12);
  const spine1 = bone('Spine1', spine, 0, .14);
  const chest = bone('Spine2', spine1, 0, .16);
  const neck = bone('Neck', chest, 0, .16);
  const head = bone('Head', neck, 0, .1);
  for (const [side, sign] of [['Left', 1], ['Right', -1]]) {
    const shoulder = bone(side + 'Shoulder', chest, sign * .1, .1);
    const arm = bone(side + 'Arm', shoulder, sign * .13, 0);
    const fore = bone(side + 'ForeArm', arm, sign * .28, 0);
    const hand = bone(side + 'Hand', fore, sign * .25, 0);
    bone(side + 'HandMiddle1', hand, sign * .07, 0);
    const leg = bone(side + 'UpLeg', hips, sign * .115, -.04);
    const shin = bone(side + 'Leg', leg, 0, -.41);
    const foot = bone(side + 'Foot', shin, 0, -.4);
    bone(side + 'ToeBase', foot, 0, -.035, .14);
  }
  root.updateMatrixWorld(true);
  const palette = [0x304c83, 0xf6f3e7, 0xf1be94, 0x40352f, 0x172f55, 0xf3b950, 0x20354a];
  const materials = palette.map(color => new THREE.MeshStandardMaterial({color, roughness:.8, flatShading:true}));
  const positions = [], normals = [], indices = [], skinIndices = [], skinWeights = [], groups = [];
  function part(name, geometry, xyz, scale, mat) {
    geometry.scale(...scale); geometry.translate(...xyz); geometry.applyMatrix4(byName[name].matrixWorld);
    const start = indices.length, offset = positions.length / 3, bi = bones.indexOf(byName[name]);
    positions.push(...geometry.attributes.position.array); normals.push(...geometry.attributes.normal.array);
    for (let i=0;i<geometry.attributes.position.count;i++) { skinIndices.push(bi,0,0,0); skinWeights.push(1,0,0,0); }
    const order = geometry.index?.array || Array.from({length:geometry.attributes.position.count},(_,i)=>i);
    for (const i of order) indices.push(offset+i);
    groups.push({start,count:indices.length-start,materialIndex:mat}); geometry.dispose();
  }
  const box = (n,p,s,m) => part(n,new THREE.BoxGeometry(1,1,1),p,s,m);
  const ball = (n,p,s,m) => part(n,new THREE.SphereGeometry(1,10,7),p,s,m);
  box('Hips',[0,-.015,0],[.3,.18,.21],0);
  box('Spine',[0,.06,0],[.285,.18,.2],0);
  box('Spine1',[0,.07,0],[.33,.18,.22],0);
  box('Spine2',[0,.055,0],[.38,.18,.23],0);
  box('Spine2',[0,.05,.12],[.09,.19,.015],1);
  box('Spine2',[0,.05,.133],[.025,.14,.012],5);
  ball('Neck',[0,.04,0],[.06,.09,.06],2);
  ball('Head',[0,.09,0],[.125,.155,.115],2);
  ball('Head',[0,.17,-.015],[.128,.085,.113],3);
  for (const x of [-.045,.045]) { ball('Head',[x,.1,.104],[.016,.012,.009],6); }
  box('Head',[0,.045,.11],[.045,.008,.008],3);
  for (const [s,sign] of [['Left',1],['Right',-1]]) {
    ball(s+'Arm',[0,0,0],[.084,.09,.085],1);
    box(s+'Arm',[sign*.125,0,0],[.25,.135,.14],1);
    ball(s+'ForeArm',[0,0,0],[.066,.066,.066],2);
    box(s+'ForeArm',[sign*.115,0,0],[.23,.102,.105],2);
    box(s+'Hand',[sign*.045,0,.008],[.095,.075,.065],2);
    box(s+'UpLeg',[0,-.2,0],[.135,.4,.15],0);
    ball(s+'Leg',[0,0,0],[.069,.068,.075],0);
    box(s+'Leg',[0,-.185,0],[.117,.37,.13],0);
    box(s+'Foot',[0,-.025,.055],[.13,.1,.25],4);
    box(s+'Foot',[0,-.078,.055],[.133,.018,.255],1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(skinIndices,4));
  geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(skinWeights,4));
  geometry.setIndex(indices); for (const g of groups) geometry.addGroup(g.start,g.count,g.materialIndex);
  const mesh = new THREE.SkinnedMesh(geometry,materials); mesh.name = 'Mannequin'; mesh.castShadow = true; mesh.frustumCulled = false;
  root.add(mesh); mesh.bind(new THREE.Skeleton(bones));
  root.userData = {source:'Original procedural test mannequin', unit:'metre', facing:'+Z'};
  return root;
}
