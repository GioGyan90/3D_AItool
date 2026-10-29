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
  let width=1,height=1,lastSignature='';const v=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3(),normal=new THREE.Vector3();
  const sun=new THREE.Vector3(3,5,4).normalize();
  const textureCache=new WeakMap();
  function texturePixels(material){const texture=material?.map,image=texture?.image;if(!image?.width||!image?.height)return null;if(textureCache.has(texture))return textureCache.get(texture);const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const c=canvas.getContext('2d',{willReadFrequently:true});c.drawImage(image,0,0);const data=c.getImageData(0,0,canvas.width,canvas.height);textureCache.set(texture,data);return data;}
  function raster(triangles){
    const frame=ctx.getImageData(0,0,width,height),pixels=frame.data,depth=new Float32Array(width*height);depth.fill(Infinity);
    for(const t of triangles){if(t.wireframe)continue;const [a,b,c]=t.p,den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-8)continue;
      const left=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),right=Math.min(width-1,Math.ceil(Math.max(a[0],b[0],c[0]))),top=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),bottom=Math.min(height-1,Math.ceil(Math.max(a[1],b[1],c[1])));
      for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
        const u=((b[1]-c[1])*(x+.5-c[0])+(c[0]-b[0])*(y+.5-c[1]))/den,v=((c[1]-a[1])*(x+.5-c[0])+(a[0]-c[0])*(y+.5-c[1]))/den,w=1-u-v;if(u< -1e-7||v< -1e-7||w< -1e-7)continue;
        const i=y*width+x,z=u*a[2]+v*b[2]+w*c[2]-t.order*1e-7;if(z>=depth[i])continue;
        let r=t.rgb[0],g=t.rgb[1],bcolor=t.rgb[2],alpha=t.opacity;
        if(t.image){const tx=Math.max(0,Math.min(t.image.width-1,Math.floor((u*t.uv[0][0]+v*t.uv[1][0]+w*t.uv[2][0])*t.image.width))),ty=Math.max(0,Math.min(t.image.height-1,Math.floor((u*t.uv[0][1]+v*t.uv[1][1]+w*t.uv[2][1])*t.image.height))),j=(ty*t.image.width+tx)*4;alpha*=t.image.data[j+3]/255;if(alpha<t.alphaTest||alpha<.015)continue;r*=t.image.data[j]/255;g*=t.image.data[j+1]/255;bcolor*=t.image.data[j+2]/255;}
        const shade=Math.pow(u*t.shades[0]+v*t.shades[1]+w*t.shades[2],1/2.2),j=i*4;
        pixels[j]=r*shade*alpha+pixels[j]*(1-alpha);pixels[j+1]=g*shade*alpha+pixels[j+1]*(1-alpha);pixels[j+2]=bcolor*shade*alpha+pixels[j+2]*(1-alpha);depth[i]=z;
      }
    }ctx.putImageData(frame,0,0);
  }
  function project(p,camera){const q=p.clone().project(camera);return [(q.x+1)*width/2,(1-q.y)*height/2,q.z];}
  return {domElement,compatibility:true,
    setSize(w,h){if(width===w&&height===h)return;width=w;height=h;domElement.width=w;domElement.height=h;lastSignature='';},
    render(scene,camera){
      scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
      const signature=[width,height,...camera.matrixWorld.elements,...camera.projectionMatrix.elements,scene.userData.labFloorY];
      scene.traverse(o=>{if(o.isBone)signature.push(...o.matrixWorld.elements);if(o.isMesh)signature.push(o.uuid,o.visible,o.geometry.uuid,o.geometry.attributes.position?.version,o.material?.uuid,o.material?.wireframe);if(o.isSkeletonHelper)signature.push(o.visible);});
      const nextSignature=signature.map(v=>typeof v==='number'?Math.round(v*1e6):v).join(',');if(nextSignature===lastSignature)return;lastSignature=nextSignature;
      ctx.fillStyle='#e9eee5';ctx.fillRect(0,0,width,height);
      ctx.strokeStyle='#d4ddd0';ctx.lineWidth=.6;
      const floorY=scene.userData.labFloorY||0;
      for(let i=-3;i<=3;i++){for(const line of [[[-3,floorY,i],[3,floorY,i]],[[i,floorY,-3],[i,floorY,3]]]){const p=line.map(x=>project(new THREE.Vector3(...x),camera));if(p.some(x=>x[2]>1||x[2]<-1))continue;ctx.beginPath();ctx.moveTo(...p[0].slice(0,2));ctx.lineTo(...p[1].slice(0,2));ctx.stroke();}}
      const ground=project(new THREE.Vector3(0,floorY,0),camera);ctx.fillStyle='#b2bdae66';ctx.beginPath();ctx.ellipse(ground[0],ground[1],width*.095,height*.025,0,0,Math.PI*2);ctx.fill();
      const triangles=[];
      scene.traverse(mesh=>{
        if(!mesh.isMesh||!mesh.visible)return;
        let parent=mesh;while(parent&&!parent.userData.motionCharacter)parent=parent.parent;if(!parent)return;
        const g=mesh.geometry,points=[],projected=[],shades=[],normals=g.attributes.normal;
        const boneNormals=mesh.isSkinnedMesh?mesh.skeleton.bones.map((bone,i)=>new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().multiplyMatrices(bone.matrixWorld,mesh.skeleton.boneInverses[i]))):null;
        const worldNormal=new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld),bindNormal=mesh.isSkinnedMesh?new THREE.Matrix3().getNormalMatrix(mesh.bindMatrix):null,unbindNormal=mesh.isSkinnedMesh?new THREE.Matrix3().getNormalMatrix(mesh.bindMatrixInverse):null;
        if(!g.attributes.position)return;
        for(let i=0;i<g.attributes.position.count;i++){
          mesh.getVertexPosition(i,v);v.applyMatrix4(mesh.matrixWorld);
          points.push(v.clone());projected.push(project(v,camera));
          const n=normals?new THREE.Vector3().fromBufferAttribute(normals,i):new THREE.Vector3(0,1,0);
          if(boneNormals){n.applyMatrix3(bindNormal);const blended=new THREE.Vector3();for(let k=0;k<4;k++){const weight=g.attributes.skinWeight.getComponent(i,k);if(weight)blended.addScaledVector(n.clone().applyMatrix3(boneNormals[g.attributes.skinIndex.getComponent(i,k)]),weight);}n.copy(blended).applyMatrix3(unbindNormal);}
          n.applyMatrix3(worldNormal).normalize();shades.push(.7+.3*Math.max(0,n.dot(sun)));
        }
        const groups=g.groups.length?g.groups:[{start:0,count:g.index?.count||g.attributes.position.count,materialIndex:0}];
        for(const group of groups){
          const material=Array.isArray(mesh.material)?mesh.material[group.materialIndex]:mesh.material;
          const color=material?.color||new THREE.Color(0xcccccc);
          for(let j=group.start;j<group.start+group.count;j+=3){
            const ids=g.index?[g.index.getX(j),g.index.getX(j+1),g.index.getX(j+2)]:[j,j+1,j+2];if(ids[2]>=points.length)continue;
            a.subVectors(points[ids[1]],points[ids[0]]);b.subVectors(points[ids[2]],points[ids[0]]);normal.crossVectors(a,b).normalize();
            const p=ids.map(i=>projected[i]);if(p.some(x=>x[2]>1||x[2]<-1))continue;
            const area=(p[1][0]-p[0][0])*(p[2][1]-p[0][1])-(p[1][1]-p[0][1])*(p[2][0]-p[0][0]);
            if(!material?.wireframe&&((material?.side===THREE.FrontSide&&area>0)||(material?.side===THREE.BackSide&&area<0)))continue;
            if(area>0)normal.negate();const shade=material?.isMeshBasicMaterial?1:.7+.3*Math.max(0,normal.dot(sun)),c=color.clone().multiplyScalar(shade),uv=g.attributes.uv;
            const image=!material?.wireframe&&uv?texturePixels(material):null;const hex=color.getHex(),rgb=[hex>>16&255,hex>>8&255,hex&255];
            triangles.push({p,z:p.reduce((n,x)=>n+x[2],0)/3,color:'#'+c.getHexString(),wireframe:material?.wireframe,rgb,shades:material?.isMeshBasicMaterial?[1,1,1]:material?.flatShading?[shade,shade,shade]:ids.map(i=>shades[i]),order:mesh.renderOrder||0,opacity:material?.opacity??1,alphaTest:material?.alphaTest||0,image,uv:image?ids.map(i=>[uv.getX(i),material.map.flipY?1-uv.getY(i):uv.getY(i)]):null});
          }
        }
      });
      triangles.sort((x,y)=>y.z-x.z);
      raster(triangles);
      for(const t of triangles.filter(t=>t.wireframe)){ctx.strokeStyle='#476458';ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(...t.p[0].slice(0,2));ctx.lineTo(...t.p[1].slice(0,2));ctx.lineTo(...t.p[2].slice(0,2));ctx.closePath();ctx.stroke();}
      scene.traverse(o=>{
        if(!o.isSkeletonHelper||!o.visible)return;
        ctx.strokeStyle='#cf6b35';ctx.lineWidth=2;
        for(const bone of o.bones){if(!bone.parent?.isBone)continue;const p=project(bone.getWorldPosition(new THREE.Vector3()),camera),q=project(bone.parent.getWorldPosition(new THREE.Vector3()),camera);ctx.beginPath();ctx.moveTo(...p.slice(0,2));ctx.lineTo(...q.slice(0,2));ctx.stroke();}
      });
    }
  };
}
