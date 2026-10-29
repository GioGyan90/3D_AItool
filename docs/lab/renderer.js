import * as THREE from 'three';

export function createRenderer() {
  const canvas=document.createElement('canvas');
  const context=canvas.getContext('webgl2',{antialias:true});
  if(context) {
    const renderer=new THREE.WebGLRenderer({canvas,context,antialias:true});
    renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;
    return renderer;
  }
  // CPU skinning + painter's triangles: a compatibility preview for remote
  // browsers without WebGL. Uses the same skinned mesh, bones and camera.
  const domElement=document.createElement('canvas'),ctx=domElement.getContext('2d');
  if(!ctx)throw new Error('浏览器未提供 WebGL 或 Canvas 2D');
  let width=1,height=1;const v=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3(),normal=new THREE.Vector3();
  const sun=new THREE.Vector3(3,5,4).normalize();
  function project(p,camera){const q=p.clone().project(camera);return [(q.x+1)*width/2,(1-q.y)*height/2,q.z];}
  return {domElement,compatibility:true,
    setSize(w,h){width=w;height=h;domElement.width=w;domElement.height=h;},
    render(scene,camera){
      scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
      ctx.fillStyle='#e9eee5';ctx.fillRect(0,0,width,height);
      ctx.strokeStyle='#d4ddd0';ctx.lineWidth=.6;
      const floorY=scene.userData.labFloorY||0;
      for(let i=-3;i<=3;i++){for(const line of [[[-3,floorY,i],[3,floorY,i]],[[i,floorY,-3],[i,floorY,3]]]){const p=line.map(x=>project(new THREE.Vector3(...x),camera));if(p.some(x=>x[2]>1||x[2]<-1))continue;ctx.beginPath();ctx.moveTo(...p[0].slice(0,2));ctx.lineTo(...p[1].slice(0,2));ctx.stroke();}}
      const ground=project(new THREE.Vector3(0,floorY,0),camera);ctx.fillStyle='#b2bdae66';ctx.beginPath();ctx.ellipse(ground[0],ground[1],width*.095,height*.025,0,0,Math.PI*2);ctx.fill();
      const triangles=[];
      scene.traverse(mesh=>{
        if(!mesh.isMesh||!mesh.visible)return;
        let parent=mesh;while(parent&&!parent.userData.motionCharacter)parent=parent.parent;if(!parent)return;
        const g=mesh.geometry,points=[],projected=[];
        if(!g.attributes.position)return;
        for(let i=0;i<g.attributes.position.count;i++){
          mesh.getVertexPosition(i,v);v.applyMatrix4(mesh.matrixWorld);
          points.push(v.clone());projected.push(project(v,camera));
        }
        const groups=g.groups.length?g.groups:[{start:0,count:g.index?.count||g.attributes.position.count,materialIndex:0}];
        for(const group of groups){
          const material=Array.isArray(mesh.material)?mesh.material[group.materialIndex]:mesh.material;
          const color=material?.color||new THREE.Color(0xcccccc);
          for(let j=group.start;j<group.start+group.count;j+=3){
            const ids=g.index?[g.index.getX(j),g.index.getX(j+1),g.index.getX(j+2)]:[j,j+1,j+2];if(ids[2]>=points.length)continue;
            a.subVectors(points[ids[1]],points[ids[0]]);b.subVectors(points[ids[2]],points[ids[0]]);normal.crossVectors(a,b).normalize();
            const c=color.clone().multiplyScalar(.65+.35*Math.max(0,normal.dot(sun)));
            const p=ids.map(i=>projected[i]);if(p.some(x=>x[2]>1||x[2]<-1))continue;
            triangles.push({p,z:p.reduce((n,x)=>n+x[2],0)/3,color:'#'+c.getHexString(),wireframe:material?.wireframe});
          }
        }
      });
      triangles.sort((x,y)=>y.z-x.z);
      for(const t of triangles){ctx.fillStyle=t.color;ctx.strokeStyle=t.wireframe?'#476458':t.color;ctx.lineWidth=t.wireframe ? .6 : .45;ctx.beginPath();ctx.moveTo(...t.p[0].slice(0,2));ctx.lineTo(...t.p[1].slice(0,2));ctx.lineTo(...t.p[2].slice(0,2));ctx.closePath();if(!t.wireframe)ctx.fill();ctx.stroke();}
      scene.traverse(o=>{
        if(!o.isSkeletonHelper||!o.visible)return;
        ctx.strokeStyle='#cf6b35';ctx.lineWidth=2;
        for(const bone of o.bones){if(!bone.parent?.isBone)continue;const p=project(bone.getWorldPosition(new THREE.Vector3()),camera),q=project(bone.parent.getWorldPosition(new THREE.Vector3()),camera);ctx.beginPath();ctx.moveTo(...p.slice(0,2));ctx.lineTo(...q.slice(0,2));ctx.stroke();}
      });
    }
  };
}
