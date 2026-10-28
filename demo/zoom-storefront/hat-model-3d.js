import { FontLoader } from '/rotation-vendor/FontLoader.js';
import { TextGeometry } from '/rotation-vendor/TextGeometry.js';

// Photo-guided product model: +Z is the embroidered front, +Y is up.
// The shell stays open below; every visible surface is actual geometry.
export async function createHat(THREE, renderer) {
  const root = new THREE.Group();
  root.name = 'Los Niños photo-guided snapback';
  const bins = new Map();
  const add = (geometry, material, matrix) => {
    if (matrix) geometry.applyMatrix4(matrix);
    if (!bins.has(material)) bins.set(material, []);
    bins.get(material).push(geometry);
  };
  const transform = (x, y, z, rx=0, ry=0, rz=0, sx=1, sy=1, sz=1) => {
    const m = new THREE.Matrix4();
    return m.compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz)),new THREE.Vector3(sx,sy,sz));
  };
  const weaveCanvas = document.createElement('canvas');
  weaveCanvas.width = weaveCanvas.height = 256;
  const ctx = weaveCanvas.getContext('2d');
  ctx.fillStyle='#808080'; ctx.fillRect(0,0,256,256);
  for(let y=0;y<256;y+=4) for(let x=0;x<256;x+=4) {
    ctx.fillStyle=((x+y)/4)%4<2?'#969696':'#727272';
    ctx.fillRect(x,y,3,2);
  }
  const weave=new THREE.CanvasTexture(weaveCanvas);
  weave.wrapS=weave.wrapT=THREE.RepeatWrapping;
  weave.repeat.set(6,4);
  weave.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  // Diffuse fibers break up the plastic-looking perfectly uniform base colour.
  const fiberCanvas=document.createElement('canvas');fiberCanvas.width=fiberCanvas.height=256;
  const fx=fiberCanvas.getContext('2d'),pixels=fx.createImageData(256,256);
  let seed=14921;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
    const diagonal=((x+y)%8)<4?5:-4;
    const shade=Math.round(229+diagonal+(random()-.5)*13+3*Math.sin(x*.22)*Math.sin(y*.31));
    const k=(y*256+x)*4;pixels.data[k]=pixels.data[k+1]=pixels.data[k+2]=shade;pixels.data[k+3]=255;
  }
  fx.putImageData(pixels,0,0);
  // Use the reference's actual twill fibres, normalized so the photographed
  // lighting does not get baked into a rotating surface. The crop contains
  // only navy cloth: no lettering, seam, eyelet or silhouette.
  try {
    const reference=await new THREE.TextureLoader().loadAsync('/assets/hat-spin/optimized/ai-v1-frame-000.webp');
    const sample=document.createElement('canvas');sample.width=sample.height=128;
    const sc=sample.getContext('2d');sc.drawImage(reference.image,270,555,110,110,0,0,128,128);
    const sampled=sc.getImageData(0,0,128,128);
    let mean=0;for(let i=0;i<sampled.data.length;i+=4)mean+=(sampled.data[i]+sampled.data[i+1]+sampled.data[i+2])/3;
    mean/=128*128;
    for(let i=0;i<sampled.data.length;i+=4){
      const value=(sampled.data[i]+sampled.data[i+1]+sampled.data[i+2])/3;
      const shade=Math.max(165,Math.min(255,220+(value-mean)*3.2));
      sampled.data[i]=sampled.data[i+1]=sampled.data[i+2]=shade;sampled.data[i+3]=255;
    }
    sc.putImageData(sampled,0,0);fx.clearRect(0,0,256,256);fx.drawImage(sample,0,0,256,256);
    ctx.clearRect(0,0,256,256);ctx.drawImage(sample,0,0,256,256);weave.needsUpdate=true;
    reference.dispose();
  } catch { /* The deterministic woven texture remains a complete fallback. */ }
  const fibers=new THREE.CanvasTexture(fiberCanvas);fibers.colorSpace=THREE.SRGBColorSpace;
  fibers.wrapS=fibers.wrapT=THREE.RepeatWrapping;fibers.repeat.set(6,4);fibers.anisotropy=weave.anisotropy;
  const fabric=(color,extra={})=>new THREE.MeshPhysicalMaterial({color,map:fibers,roughness:.9,metalness:0,sheen:.32,sheenRoughness:.82,sheenColor:0x344866,bumpMap:weave,bumpScale:.005,...extra});
  const navy=fabric(0x0b172c);
  const navyAlternate=fabric(0x0d192e);
  const seam=fabric(0x23334b,{bumpScale:.001,roughness:1});
  const inside=fabric(0x0d1520,{side:THREE.BackSide});
  const buckram=fabric(0xb3b5b1,{side:THREE.BackSide,roughness:1});
  const black=fabric(0x080e16);
  const white=fabric(0xf2f0e8,{bumpScale:.0014,roughness:.98});
  const satinCanvas=document.createElement('canvas');satinCanvas.width=satinCanvas.height=128;
  const tx=satinCanvas.getContext('2d');tx.fillStyle='#a4a4a4';tx.fillRect(0,0,128,128);
  for(let x=0;x<128;x+=2){tx.fillStyle=x%4?'#767676':'#c2c2c2';tx.fillRect(x,0,1,128);}
  const satin=new THREE.CanvasTexture(satinCanvas);satin.wrapS=satin.wrapT=THREE.RepeatWrapping;satin.repeat.set(2,1);satin.anisotropy=weave.anisotropy;
  const thread=fabric(0xf0eee5,{map:null,roughness:.7,sheen:.8,sheenColor:0xffffff,bumpMap:satin,bumpScale:.0016});
  const paleStitch=fabric(0xc4c4bc,{bumpScale:0});
  const RX=1.09,RZ=1.06,H=1.40,profilePower=2.18;
  // Slightly squared cross-sections hold the structured front panels upright.
  const rounded=value=>Math.sign(value)*Math.pow(Math.abs(value),2/profilePower);
  const radius=y=>Math.sqrt(Math.max(0,1-Math.pow(Math.min(1,y/H),2.8)));
  const point=(phi,y,inset=0)=>{
    const r=radius(y);
    return new THREE.Vector3(rounded(Math.sin(phi))*(RX*r-inset),y,rounded(Math.cos(phi))*(RZ*r-inset));
  };
  const backY=phi=>{
    const d=Math.abs(Math.atan2(Math.sin(phi-Math.PI),Math.cos(phi-Math.PI)));
    return d<.43?.46*Math.sqrt(Math.max(0,1-(d/.43)**2)):0;
  };
  function surface(a,b,interior=false) {
    const positions=[],uvs=[],ids=[],columns=28,rows=34;
    for(let j=0;j<=rows;j++) for(let i=0;i<=columns;i++) {
      const phi=a+(b-a)*i/columns, floor=backY(phi);
      const y=floor+(H-floor)*j/rows;
      const p=point(phi,y,interior?.019:0);
      if(interior && y>H-.015) {p.x=0;p.z=0;p.y=H-.017;}
      positions.push(p.x,p.y,p.z);uvs.push(phi/(Math.PI*2),y/H);
    }
    for(let j=0;j<rows;j++) for(let i=0;i<columns;i++){
      const a=j*(columns+1)+i,b=a+1,c=a+columns+1,d=c+1;
      ids.push(a,b,c,b,d,c);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(ids);g.computeVertexNormals();return g;
  }
  function tube(points,r,material,segments) {
    if(points.length<2)return;
    const curve=new THREE.CatmullRomCurve3(points);
    add(new THREE.TubeGeometry(curve,segments||Math.max(24,points.length*2),r,5,false),material);
  }
  function dashes(curve,r,material,count=70) {
    for(let i=0;i<count;i++) {
      const a=curve.getPoint(i/count),b=curve.getPoint((i+.57)/count);
      const v=b.clone().sub(a),m=new THREE.Matrix4();
      m.compose(a.clone().add(b).multiplyScalar(.5),new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),v.clone().normalize()),new THREE.Vector3(1,1,1));
      add(new THREE.CylinderGeometry(r,r,v.length(),4,1),material,m);
    }
  }
  for(let panel=0;panel<6;panel++) {
    const a=panel*Math.PI/3,b=(panel+1)*Math.PI/3;
    add(surface(a,b),panel%2?navyAlternate:navy);
    add(surface(a,b,true),panel===0||panel===5?buckram:inside);
    const phi=a,pts=[];
    for(let j=0;j<=55;j++) {
      const y=backY(phi)+.012+(H-backY(phi)-.02)*j/55;
      pts.push(point(phi,y,-.003));
    }
    tube(pts,.005,navy);
    for(const offset of [-.020,.020]) {
      const stitches=[];
      for(let j=0;j<52;j++) {const y=backY(phi+offset)+.02+(H-backY(phi+offset)-.05)*j/51;stitches.push(point(phi+offset,y,-.003));}
      dashes(new THREE.CatmullRomCurve3(stitches),.0017,seam,64);
    }
    const lining=[];
    for(let j=0;j<48;j++){const y=backY(phi)+.025+(H-backY(phi)-.07)*j/47;lining.push(point(phi,y,.026));}
    tube(lining,.018,black);
  }
  // Stitched bottom edge and separate inner sweatband, both broken at the rear opening.
  for(const [a,b] of [[-.001,Math.PI-.43],[Math.PI+.43,Math.PI*2+.001]]) {
    const edge=[],band=[],stitch=[];
    for(let j=0;j<=96;j++) {const p=a+(b-a)*j/96;edge.push(point(p,.012));band.push(point(p,.041,.035));stitch.push(point(p,.047,-.002));}
    tube(edge,.013,navy);tube(band,.032,black);dashes(new THREE.CatmullRomCurve3(stitch),.0018,seam,110);
  }
  const arch=[];
  for(let i=0;i<=80;i++){const phi=Math.PI-.43+.86*i/80;arch.push(point(phi,backY(phi),-.001));}
  tube(arch,.018,navy);
  // A flat visor with just the slight crosswise easing seen in the product photos.
  const outline=new THREE.Shape();
  outline.moveTo(-1.02,.30);
  outline.bezierCurveTo(-1.23,.69,-1.30,1.38,-1.14,1.82);
  outline.bezierCurveTo(-.93,2.23,.93,2.23,1.14,1.82);
  outline.bezierCurveTo(1.30,1.38,1.23,.69,1.02,.30);
  outline.quadraticCurveTo(0,1.25,-1.02,.30);
  const visorY=(x,z)=>-.018-.029*(x/1.3)**2-.018*Math.max(0,z-1);
  const visorGeo=new THREE.ShapeGeometry(outline,64);
  const va=visorGeo.attributes.position;
  for(let i=0;i<va.count;i++){const x=va.getX(i),z=va.getY(i);va.setXYZ(i,x,visorY(x,z),z);}
  // ShapeGeometry's +Z winding becomes upward after mapping XY to XZ.
  const vi=visorGeo.index;for(let i=0;i<vi.count;i+=3){const b=vi.getX(i+1);vi.setX(i+1,vi.getX(i+2));vi.setX(i+2,b);}
  visorGeo.computeVertexNormals();add(visorGeo,navy);
  const underside=visorGeo.clone();underside.translate(0,-.036,0);
  const ui=underside.index;for(let i=0;i<ui.count;i+=3){const b=ui.getX(i+1);ui.setX(i+1,ui.getX(i+2));ui.setX(i+2,b);}underside.computeVertexNormals();add(underside,white);
  const edgePoints=outline.getPoints(140);
  tube(edgePoints.map(p=>new THREE.Vector3(p.x,visorY(p.x,p.y)-.013,p.y)),.017,navy);
  tube(edgePoints.map(p=>new THREE.Vector3(p.x,visorY(p.x,p.y)-.032,p.y)),.007,white);
  for(let row=0;row<7;row++) {
    const s=1-row*.033,top=[],bottom=[];
    for(let i=0;i<=100;i++){const t=i/100*Math.PI,x=-1.18*Math.cos(t)*s,z=.93+1.17*Math.sin(t)*s;top.push(new THREE.Vector3(x,visorY(x,z)+.002,z));bottom.push(new THREE.Vector3(x,visorY(x,z)-.038,z));}
    dashes(new THREE.CatmullRomCurve3(top),.00145,seam,100);
    dashes(new THREE.CatmullRomCurve3(bottom),.0015,paleStitch,100);
  }
  // Soft fabric-covered crown button and embroidered ventilation eyelets.
  add(new THREE.SphereGeometry(.08,24,12),navy,transform(0,H+.013,0,0,0,0,1,.48,1));
  for(let i=0;i<6;i++) {
    const phi=(i+.5)*Math.PI/3,y=1.03,p=point(phi,y,-.006);
    const normal=new THREE.Vector3(Math.sin(phi),.50,Math.cos(phi)).normalize();
    const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),normal);
    const m=new THREE.Matrix4().compose(p,q,new THREE.Vector3(1,1,1));
    add(new THREE.CircleGeometry(.019,18),black,m);
    add(new THREE.TorusGeometry(.027,.006,8,24),seam,m);
  }
  // Two overlapping closure tabs, real inset holes on one half and pegs on the other.
  add(new THREE.BoxGeometry(.92,.105,.033,1,1,1),navy,transform(0,.058,-1.054));
  add(new THREE.BoxGeometry(.48,.093,.025),black,transform(.19,.059,-1.077));
  for(let i=0;i<7;i++){
    const x=-.34+i*.105;
    add(new THREE.TorusGeometry(.016,.004,5,12),seam,transform(x,.060,-1.098));
    add(new THREE.CircleGeometry(.012,12),black,transform(x,.060,-1.100,0,Math.PI));
  }
  // Raised embroidery follows the exact reference artwork, including letter holes.
  // Coordinates arrive in image pixels, top down; the whole mark is 1.20 units wide.
  function frontZ(x,y) {
    const r=radius(y),normalized=Math.min(.999,Math.abs(x)/(RX*r));
    return RZ*r*Math.pow(Math.max(.001,1-Math.pow(normalized,profilePower)),1/profilePower);
  }
  const embroideryResponse=await fetch(new URL('/rotation-assets/front-embroidery.json',location.href));
  if(!embroideryResponse.ok)throw new Error('Front embroidery artwork unavailable');
  const artwork=await embroideryResponse.json();
  const bounds=artwork.sourceBounds;
  if(!Array.isArray(bounds)||bounds.length!==4||!bounds.every(Number.isFinite)||bounds[2]<=0||bounds[3]<=0||!Array.isArray(artwork.shapes))throw new Error('Invalid front embroidery artwork');
  const [sourceX,sourceY,sourceW,sourceH]=bounds,artScale=1.20/sourceW;
  const contourPath=(points,Path)=>{
    const path=new Path();
    points.forEach(([px,py],index)=>{
      const x=(px-sourceX-sourceW/2)*artScale,y=.23+(sourceY+sourceH-py)*artScale;
      if(index===0)path.moveTo(x,y);else path.lineTo(x,y);
    });
    path.closePath();return path;
  };
  let embroideryPoints=0;
  for(const contour of artwork.shapes) {
    if(!Array.isArray(contour.outer)||contour.outer.length<3)continue;
    const shape=contourPath(contour.outer,THREE.Shape);
    embroideryPoints+=contour.outer.length;
    for(const hole of contour.holes||[])if(hole.length>=3){shape.holes.push(contourPath(hole,THREE.Path));embroideryPoints+=hole.length;}
    const g=new THREE.ExtrudeGeometry(shape,{depth:.018,steps:1,curveSegments:1,bevelEnabled:true,bevelThickness:.004,bevelSize:.004,bevelSegments:3});
    const positions=g.attributes.position;
    for(let i=0;i<positions.count;i++){
      const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i);
      positions.setXYZ(i,x,y,frontZ(x,y)+.01+z);
    }
    g.computeVertexNormals();add(g,thread);
  }
  root.userData.embroidery={source:'/rotation-assets/front-embroidery.json',width:1.20,height:sourceH*artScale,contourPoints:embroideryPoints};
  const fontLoader=new FontLoader();
  const [serif,sans]=await Promise.all([
    fontLoader.loadAsync(new URL('/rotation-vendor/gentilis.json',location.href).href),
    fontLoader.loadAsync(new URL('/rotation-vendor/helvetiker.json',location.href).href)
  ]);
  // Interlocking serif LN sits on the wearer's left side (+X viewed from front).
  for(const [letter,dx,dy] of [['L',-.09,.055],['N',-.007,-.032]]) {
    const g=new TextGeometry(letter,{font:serif,size:.19,depth:.008,curveSegments:8,bevelEnabled:true,bevelThickness:.002,bevelSize:.002,bevelSegments:2});
    const p=g.attributes.position;
    for(let i=0;i<p.count;i++) {
      const u=p.getX(i)+dx,y=p.getY(i)+dy+.31,phi=Math.PI/2+u/RZ;
      const c=point(phi,y,-.009-p.getZ(i));p.setXYZ(i,c.x,c.y,c.z);
    }
    g.computeVertexNormals();add(g,thread);
  }
  const backText='los niños con sueños';
  const letterWidths=[...backText].map(c=>(sans.data.glyphs[c]||sans.data.glyphs[c==='ñ'?'n':'?']).ha/1000*.060);
  const total=letterWidths.reduce((a,b)=>a+b,0);let cursor=-total/2;
  [...backText].forEach((letter,index)=>{
    const fallback=letter==='ñ'&&!sans.data.glyphs['ñ']?'n':letter;
    const g=new TextGeometry(fallback,{font:sans,size:.060,depth:.0045,curveSegments:6,bevelEnabled:true,bevelThickness:.0008,bevelSize:.0008,bevelSegments:1});
    const p=g.attributes.position;
    for(let i=0;i<p.count;i++){
      const u=cursor+p.getX(i),y=.55+p.getY(i)+.115*(1-(u/(total*.56))**2);
      const phi=Math.PI+u/(RX*radius(y));const c=point(phi,y,-.007-p.getZ(i));p.setXYZ(i,c.x,c.y,c.z);
    }
    g.computeVertexNormals();add(g,thread);
    if(letter==='ñ' && fallback==='n') {
      const pts=[];
      for(const [dx,dy] of [[.008,0],[.019,.005],[.028,-.002],[.038,.004]]){
        const u=cursor+dx,y=.60+dy+.115*(1-(u/(total*.56))**2);
        pts.push(point(Math.PI+u/(RX*radius(y)),y,-.010));
      }
      tube(pts,.0025,thread,14);
    }
    cursor+=letterWidths[index];
  });
  // Consolidate detail by material: thousands of tiny stitches cost only a handful of draws.
  let triangleCount=0;
  for(const [material,geometries] of bins) {
    const flat=geometries.map(g=>g.index?g.toNonIndexed():g);
    const count=flat.reduce((n,g)=>n+g.attributes.position.count,0);
    const merged=new THREE.BufferGeometry();
    for(const [name,size] of [['position',3],['normal',3],['uv',2]]) {
      const out=new Float32Array(count*size);let offset=0;
      for(const g of flat){const attr=g.getAttribute(name);if(attr)out.set(attr.array,offset);offset+=g.attributes.position.count*size;}
      merged.setAttribute(name,new THREE.BufferAttribute(out,size));
    }
    triangleCount+=count/3;
    merged.computeBoundingSphere();const mesh=new THREE.Mesh(merged,material);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
    for(const geometry of new Set([...geometries,...flat]))geometry.dispose();
  }
  // Keep the rotation axis through the crown, never the visor's bounding-box center.
  root.children.forEach(mesh=>mesh.geometry.translate(0,-H*.5,0));
  const modelBounds=new THREE.Box3().setFromObject(root);
  root.userData.photoGuided=true;
  root.userData.reference='Photo-derived front embroidery and structured snapback construction';
  root.userData.dimensions=modelBounds.getSize(new THREE.Vector3()).toArray();
  root.userData.bounds={min:modelBounds.min.toArray(),max:modelBounds.max.toArray()};
  root.userData.turntableAxis=[0,0,0];
  root.userData.triangles=triangleCount;
  root.userData.drawCalls=root.children.length;
  return root;
}
