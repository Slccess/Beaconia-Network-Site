/* Local Three.js stage. Geometry, lighting and water are rendered in 3D;
   the persistent, accessible navigation and the archive keep their existing DOM. */
window.createCoast3D = function (towerFaces) {
  const T=window.THREE, canvas=document.getElementById('three-canvas');
  if(!T||!canvas)return null;
  const mount=canvas.parentElement, materials=new Set(), geometries=new Set(), textures=new Set();
  let renderer;
  try {
    const context=canvas.getContext('webgl2',{alpha:true,antialias:true,powerPreference:'low-power'});
    if(!context)return null;
    renderer=new T.WebGLRenderer({canvas,context,alpha:true,antialias:true});
  } catch { return null; }
  let active=true,disposed=false,frame=0,width=innerWidth,height=innerHeight,view=null,prologue=false;
  let pointer={x:.5,y:.5},environmentTime=0,arrival=1,journey=0,renderCount=0,resolveReady;
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  const shell=document.getElementById('site-shell');
  const cameraPose={yaw:0,pitch:0,dolly:0,track:0};
  let cameraClock=0,cameraLast=0,horizon=.454*height;
  const ready=new Promise(resolve=>resolveReady=resolve);
  const clamp=x=>Math.max(0,Math.min(1,x));
  const random=i=>{const n=Math.sin(i*127.1+311.7)*43758.5453;return n-Math.floor(n);};
  const geometry=g=>(geometries.add(g),g);
  const material=m=>(materials.add(m),m);
  const standard=(color,options={})=>material(new T.MeshStandardMaterial({color,roughness:.89,...options}));
  renderer.setClearColor(0x000000,0);
  renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.toneMapping=T.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.08;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=T.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate=false;
  const scene=new T.Scene();scene.name='Lighthouse coast';
  // The scene sits about 80 units away. A near plane at .1 wastes depth
  // precision there and makes the thin door panels fight over the same pixels.
  const camera=new T.PerspectiveCamera(8,1,5,400);
  camera.name='Gently moving coastal camera';
  const referenceCamera=camera.clone();
  const skyProjection=new T.Matrix4(),skyRotation=new T.Matrix4(),referenceRotation=new T.Matrix4();
  const land=new T.Group();land.name='Solid coastal headland';scene.add(land);
  const tower=new T.Group();tower.name='Shared sand and coast lighthouse';scene.add(tower);
  scene.add(new T.HemisphereLight(0xd9e8eb,0x566c6d,1.55));
  const sun=new T.DirectionalLight(0xffd9a3,2.5);sun.position.set(-6,9,7);sun.castShadow=true;
  sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-8;sun.shadow.camera.right=9;
  sun.shadow.camera.top=8;sun.shadow.camera.bottom=-8;sun.shadow.camera.near=.1;sun.shadow.camera.far=40;
  sun.shadow.normalBias=.035;sun.shadow.bias=-.0002;scene.add(sun);
  const fill=new T.DirectionalLight(0x98c8df,.8);fill.position.set(5,4,-7);scene.add(fill);

  // A screen-filling shader supplies the sky, while all foreground surfaces have depth.
  const skyUniforms={uTime:{value:0},uArrival:{value:1},uJourney:{value:0},uAspect:{value:1},uSkyProjection:{value:skyProjection}};
  const sky=new T.Mesh(geometry(new T.PlaneGeometry(2,2)),material(new T.ShaderMaterial({
    depthTest:false,depthWrite:false,transparent:false,premultipliedAlpha:true,toneMapped:false,uniforms:skyUniforms,
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,.999,1.);}',
    fragmentShader:`varying vec2 vUv;uniform float uTime,uArrival,uJourney,uAspect;uniform mat4 uSkyProjection;
      void main(){
        vec4 skyPoint=uSkyProjection*vec4(vUv*2.-1.,1.,1.);
        vec2 skyUv=skyPoint.xy/skyPoint.w*.5+.5;
        float y=1.-skyUv.y+uJourney*.12-(1.-uArrival)*.15;
        vec3 blue=vec3(.074,.142,.216),mid=vec3(.31,.42,.50),warm=vec3(.79,.54,.34);
        vec3 color=mix(blue,mid,smoothstep(0.,.39,y));
        color=mix(color,warm,smoothstep(.26,.49,y));
        vec2 halo=(skyUv-vec2(.80,.54))*vec2(uAspect,.8);
        color+=vec3(.22,.13,.055)*exp(-dot(halo,halo)*12.);
        float clouds=sin(skyUv.x*8.+y*32.+uTime*.012)*sin(skyUv.x*2.7-y*21.);
        color+=vec3(.028,.026,.023)*smoothstep(.4,.9,clouds)*(1.-smoothstep(.12,.43,y));
        gl_FragColor=vec4(color,clamp(uArrival*2.,0.,1.));
        #include <colorspace_fragment>
        #include <premultiplied_alpha_fragment>
      }`
  })));sky.name='Dusk atmosphere';sky.frustumCulled=false;sky.renderOrder=-1000;scene.add(sky);

  const sandUniforms={uAssembly:{value:1},uSandTime:{value:0}};
  const sandShader=`
    attribute vec3 sandCentre;attribute float sandSeed;uniform float uAssembly,uSandTime;
    vec3 gatherSand(vec3 original){
      if(uAssembly>.9999)return original;
      float level=clamp(sandCentre.y/5.,0.,1.);
      float local=smoothstep(0.,1.,clamp((uAssembly-level*.72)/.28,0.,1.));
      float a=sandSeed*25.1327+uSandTime*(1.-local)*1.6;
      float radius=(1.-local)*(.9+sandSeed*2.4);
      vec3 centre=mix(vec3(cos(a)*radius,0.,sin(a)*radius),sandCentre,local);
      centre.y+=sin(local*3.14159)*(.4+sandSeed*.8);
      float spin=(1.-local)*(uSandTime*1.8+sandSeed*8.);
      float c=cos(spin),s=sin(spin);vec3 p=(original-sandCentre)*mix(.09,1.,local);
      p=vec3(p.x*c-p.y*s,p.x*s+p.y*c,p.z);
      return centre+p;
    }`;
  function towerGeometry(faces){
    const positions=[],normals=[],colors=[],centres=[],seeds=[];
    for(const f of faces){
      const centre=f.v.reduce((a,p)=>a.map((v,i)=>v+p[i]/3),[0,0,0]);
      const c=new T.Color().setRGB(...f.c.map(v=>v/255),T.SRGBColorSpace);
      for(const p of f.v){positions.push(...p);normals.push(...f.n);colors.push(c.r,c.g,c.b);centres.push(...centre);seeds.push(f.seed);}
    }
    const g=geometry(new T.BufferGeometry());
    for(const [name,array,size] of [['position',positions,3],['normal',normals,3],['color',colors,3],['sandCentre',centres,3],['sandSeed',seeds,1]])g.setAttribute(name,new T.Float32BufferAttribute(array,size));
    g.computeBoundingSphere();return g;
  }
  const towerMeshes=[];
  for(const kind of ['stone','lantern','insets']){
    const faces=towerFaces.filter(f=>kind==='insets'?f.overlay:!f.overlay&&(kind==='lantern'?f.emission:!f.emission));
    const m=standard(0xffffff,{vertexColors:true,side:T.DoubleSide,roughness:kind==='lantern'?.35:.84,
      emissive:kind==='lantern'?0xffcd76:0x000000,emissiveIntensity:kind==='lantern'?.65:0});
    m.onBeforeCompile=shader=>{Object.assign(shader.uniforms,sandUniforms);shader.vertexShader=sandShader+'\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','vec3 transformed = gatherSand(position);');};
    m.customProgramCacheKey=()=>`coast-sand-${kind}`;
    const piece=new T.Mesh(towerGeometry(faces),m);piece.name=`Lighthouse ${kind}`;piece.castShadow=kind==='stone';piece.receiveShadow=kind==='stone';piece.frustumCulled=false;
    tower.add(piece);towerMeshes.push(piece);
  }
  const glowCanvas=document.createElement('canvas');glowCanvas.width=glowCanvas.height=128;
  const glowContext=glowCanvas.getContext('2d'),gradient=glowContext.createRadialGradient(64,64,0,64,64,64);
  gradient.addColorStop(0,'rgba(255,255,255,.85)');gradient.addColorStop(.18,'rgba(255,255,255,.28)');gradient.addColorStop(1,'rgba(255,255,255,0)');
  glowContext.fillStyle=gradient;glowContext.fillRect(0,0,128,128);
  const glowTexture=new T.CanvasTexture(glowCanvas);textures.add(glowTexture);
  const glow=new T.Sprite(material(new T.SpriteMaterial({map:glowTexture,color:0xffdb94,transparent:true,depthWrite:false,blending:T.AdditiveBlending,opacity:.7})));
  glow.position.set(0,4.04,0);glow.scale.set(1.5,1.5,1);tower.add(glow);
  const lantern=new T.PointLight(0xffd794,3,3,2);lantern.position.set(0,4.03,0);tower.add(lantern);
  const spot=new T.SpotLight(0xffd794,45,70,.30,.85,1);spot.name='Interactive lighthouse beam';scene.add(spot,spot.target);

  function addMesh(g,m,parent=land){const o=new T.Mesh(geometry(g),m);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
  function box(w,h,d,x,y,z,m,parent=land){const o=addMesh(new T.BoxGeometry(w,h,d),m,parent);o.position.set(x,y,z);return o;}
  function rod(a,b,r,m,parent=land){const from=new T.Vector3(...a),to=new T.Vector3(...b),delta=to.clone().sub(from);const o=addMesh(new T.CylinderGeometry(r,r,delta.length(),6),m,parent);o.position.copy(from.add(to).multiplyScalar(.5));o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());return o;}

  // An irregular, closed volume: grassy upper terraces and three strata of cliff faces.
  const outline=[[-1.55,1.10],[-1.30,-.75],[-.55,-1.65],[.27,-1.30],[1.08,-.65],[1.80,-.78],[2.40,-.25],[3.08,-.68],[3.65,-.35],[5.8,-.50],[7.8,6.2],[5.2,5.5],[3.8,3.65],[2.8,3.1],[1.8,2.25],[.9,.65],[-.05,1.78],[-.80,2.15]];
  const terrainPositions=[],terrainColors=[];
  function terrainTriangle(a,b,c,hex,variation=0){const color=new T.Color(hex).multiplyScalar(1+variation);for(const p of [a,b,c]){terrainPositions.push(...p);terrainColors.push(color.r,color.g,color.b);}}
  const top=outline.map(([x,z],i)=>[x,-.08+random(i)*.045,z]);
  const contours=outline.map(([x,z])=>new T.Vector2(x,z));
  for(const [a,b,c] of T.ShapeUtils.triangulateShape(contours,[]))terrainTriangle(top[a],top[c],top[b],0x758178,(random(a+b)*2-1)*.06);
  let ring=top;
  for(let level=0;level<3;level++){
    const next=outline.map(([x,z],i)=>[x+.22+level*.39+(random(i+level*23)-.5)*.25,-[.7,1.6,2.8][level]+random(i+level*13)*.15,z+(random(i+level*39)-.5)*.3]);
    for(let i=0;i<ring.length;i++){const j=(i+1)%ring.length,hex=[0x647a79,0x4b646c,0x314f5b][level];terrainTriangle(ring[i],next[i],ring[j],hex,(random(i*3+level)-.5)*.30);terrainTriangle(ring[j],next[i],next[j],hex,(random(i*5+level)-.5)*.32);}
    ring=next;
  }
  for(const [a,b,c] of T.ShapeUtils.triangulateShape(contours,[]))terrainTriangle(ring[a],ring[b],ring[c],0x314f5b);
  const terrainGeometry=new T.BufferGeometry();terrainGeometry.setAttribute('position',new T.Float32BufferAttribute(terrainPositions,3));terrainGeometry.setAttribute('color',new T.Float32BufferAttribute(terrainColors,3));terrainGeometry.computeVertexNormals();
  const terrain=addMesh(terrainGeometry,standard(0xffffff,{vertexColors:true,flatShading:true,side:T.DoubleSide}));terrain.name='Volumetric cliff and grass';
  const stone=standard(0x6a7d7c,{flatShading:true});
  for(let i=0;i<10;i++){
    const o=addMesh(new T.IcosahedronGeometry(1,0),stone),t=i/9;
    o.position.set(-.48+t*2.8+(random(i+40)-.5)*.3,-2.48+random(i)*.11,2.3+t*2.9);o.scale.set(.12+random(i+10)*.16,.12+random(i+31)*.16,.18+random(i+5)*.24);o.rotation.set(random(i),random(i+9),random(i+3));
  }
  const cabin=new T.Group();cabin.name='Keeper cottage';cabin.position.set(1.57,-.04,-.18);cabin.rotation.y=-.21;land.add(cabin);
  const wall=standard(0xc1c4b1),roofMat=standard(0x3d5c67,{roughness:.73}),windowMat=standard(0xe6c07a,{emissive:0xffc46d,emissiveIntensity:1.25});
  box(1.08,.59,.75,0,.295,0,wall,cabin);
  const roofPositions=[-.67,.57,-.49,.67,.57,-.49,0,1.02,-.49,-.67,.57,.49,0,1.02,.49,.67,.57,.49,-.67,.57,-.49,0,1.02,-.49,0,1.02,.49,-.67,.57,-.49,0,1.02,.49,-.67,.57,.49,0,1.02,-.49,.67,.57,-.49,.67,.57,.49,0,1.02,-.49,.67,.57,.49,0,1.02,.49];
  for(let i=0;i<roofPositions.length;i+=9)for(let axis=0;axis<3;axis++){const value=roofPositions[i+3+axis];roofPositions[i+3+axis]=roofPositions[i+6+axis];roofPositions[i+6+axis]=value;}
  const roofGeometry=new T.BufferGeometry();roofGeometry.setAttribute('position',new T.Float32BufferAttribute(roofPositions,3));roofGeometry.computeVertexNormals();addMesh(roofGeometry,roofMat,cabin);
  box(.15,.36,.16,.32,.89,-.12,roofMat,cabin);
  box(.16,.22,.012,-.26,.32,.383,windowMat,cabin);box(.16,.22,.012,.26,.32,.383,windowMat,cabin);
  box(.012,.22,.16,.548,.32,.04,windowMat,cabin);
  const fenceMat=standard(0xb0b4a0,{metalness:.12,roughness:.7});
  const fence=[];
  for(let i=0;i<7;i++){const t=i/6,x=-1.39+t*.75,z=1.25+t*.44;fence.push([x,.24,z]);rod([x,-.06,z],[x,.35,z],.012,fenceMat);}
  for(let i=1;i<fence.length;i++){rod(fence[i-1],fence[i],.009,fenceMat);rod([fence[i-1][0],.08,fence[i-1][2]],[fence[i][0],.08,fence[i][2]],.009,fenceMat);}
  const path=new T.CatmullRomCurve3([[.12,-.028,.85],[.75,-.026,1.15],[1.85,-.027,2.12],[3.0,-.03,2.95],[4.1,-.04,3.7]].map(p=>new T.Vector3(...p)));
  const pathMesh=addMesh(new T.TubeGeometry(path,45,.065,4,false),standard(0xb3b39b));pathMesh.scale.y=.18;

  const waterLevel=-2.45;
  const waterUniforms={uTime:{value:0},uResolution:{value:new T.Vector2(1,1)},uArrival:{value:1},uHorizon:{value:.454},uSpot:{value:new T.Vector2(-8,0)},uSpotColor:{value:new T.Color(0xffdf9e)},uSpotStrength:{value:0},uRipple:{value:new T.Vector3(0,0,-99)}};
  const waveCode=`float wave(vec2 p){return sin(p.y*1.7+p.x*.28-uTime*.85)*.033+sin(p.y*3.2-p.x*.65-uTime*1.2)*.022+sin(p.x*4.5+p.y*6.2-uTime*1.55)*.008;}`;
  const waterGeometry=geometry(new T.PlaneGeometry(1,1,100,70));
  const waterMaterial=material(new T.ShaderMaterial({uniforms:waterUniforms,transparent:true,side:T.DoubleSide,
    vertexShader:`uniform float uTime;varying vec3 vWorld;varying vec3 vNormal;${waveCode}
      void main(){vec3 p=position;float e=.025;float w=wave(p.xz);p.y+=w*smoothstep(0.,.18,1.-uv.y);vNormal=normalize(vec3(wave(p.xz-vec2(e,0.))-wave(p.xz+vec2(e,0.)),2.*e,wave(p.xz-vec2(0.,e))-wave(p.xz+vec2(0.,e))));vWorld=(modelMatrix*vec4(p,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader:`uniform float uTime,uArrival,uHorizon,uSpotStrength;uniform vec2 uResolution,uSpot;uniform vec3 uSpotColor,uRipple;varying vec3 vWorld;varying vec3 vNormal;${waveCode}
      void main(){
        float sy=1.-gl_FragCoord.y/uResolution.y,depth=clamp((sy-uHorizon)/.55,0.,1.);
        vec3 n=normalize(vNormal),viewDir=normalize(cameraPosition-vWorld),light=normalize(vec3(-.4,1.,.6));
        vec3 base=mix(vec3(.035,.15,.18),vec3(.012,.065,.095),smoothstep(0.,1.,depth));
        float sheen=pow(max(dot(reflect(-light,n),viewDir),0.),18.);
        float stripes=smoothstep(.012,.062,wave(vWorld.xz));
        base+=vec3(.012,.035,.04)*stripes;
        float sunPath=exp(-pow((vWorld.x-1.5)*.9,2.));
        base+=vec3(.48,.28,.11)*sheen*sunPath;
        float crest=pow(max(0.,sin(vWorld.z*8.+vWorld.x*.45+sin(vWorld.x*2.)*.4-uTime*1.4)),24.)*smoothstep(.02,.055,wave(vWorld.xz));
        base+=vec3(.14,.20,.19)*crest*.25;
        vec2 pool=(vWorld.xz-uSpot)*vec2(1.,.32);
        base+=uSpotColor*exp(-dot(pool,pool)*.65)*uSpotStrength*(.72+stripes*.65);
        float age=uTime-uRipple.z,r=length((vWorld.xz-uRipple.xy)*vec2(1.,.6));
        if(age>0.&&age<2.4)base+=vec3(.11,.18,.18)*exp(-pow((r-age*1.2)*13.,2.))*(1.-age/2.4);
        base=mix(base,vec3(.14,.26,.29),exp(-depth*40.)*.4);
        gl_FragColor=vec4(base,clamp(uArrival*2.-.25,0.,1.));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  }));
  const water=new T.Mesh(waterGeometry,waterMaterial);water.name='Displaced 3D sea';water.frustumCulled=false;water.renderOrder=-50;scene.add(water);
  const foam=[];
  for(let i=0;i<3;i++){
    const points=[[-1.9,1.4],[-1.8,2.0],[-1.15,2.8],[-.5,3.3],[.0,4.2],[.9,5.0],[2.0,5.9]].map(([x,z])=>new T.Vector3(x-i*.10,waterLevel+.045,z+i*.13));
    const m=material(new T.MeshBasicMaterial({color:0xc8e0d8,transparent:true,opacity:.18,depthWrite:false}));
    const o=new T.Mesh(geometry(new T.TubeGeometry(new T.CatmullRomCurve3(points),70,.012-i*.002,3,false)),m);o.name='Shore wash';scene.add(o);foam.push(o);
  }
  const groundPlane=new T.Plane(new T.Vector3(0,1,0),-waterLevel),raycaster=new T.Raycaster(),hit=new T.Vector3();
  const referenceRay=new T.Raycaster(),sample=new T.Vector3();
  const environment=[sky,water,land,...foam];

  // Layout coordinates describe a resting camera. Anchors stay in world space
  // while the live camera moves; the DOM remains usable for pointer and keyboard.
  function surfaceAnchor(x,y){
    referenceRay.setFromCamera(new T.Vector2(x/width*2-1,1-y/height*2),referenceCamera);
    return referenceRay.ray.intersectPlane(groundPlane,new T.Vector3());
  }
  function skyAnchor(x,y,depth=120){
    const p=new T.Vector3(x/width*2-1,1-y/height*2,.5).unproject(referenceCamera).applyMatrix4(referenceCamera.matrixWorldInverse);
    p.multiplyScalar(-depth/p.z);return p.applyMatrix4(referenceCamera.matrixWorld);
  }
  function projectWorld(p){
    const ref=referenceCamera.matrixWorldInverse.elements,live=camera.matrixWorldInverse.elements;
    const refDepth=-(ref[2]*p.x+ref[6]*p.y+ref[10]*p.z+ref[14]);
    const depth=-(live[2]*p.x+live[6]*p.y+live[10]*p.z+live[14]);
    sample.copy(p).project(camera);
    return {x:(sample.x+1)*width/2,y:(1-sample.y)*height/2,scale:refDepth/depth};
  }
  function projectSurface(x,y){const p=surfaceAnchor(x,y);return p?projectWorld(p):{x,y,scale:1};}
  function towerTransform(next){
    const dx=(next.x-view.x)/view.s,dy=(next.y-view.y)/view.s;
    return new T.Matrix4().compose(new T.Vector3(dx,-dy*Math.cos(view.pitch),dy*Math.sin(view.pitch)),new T.Quaternion().setFromEuler(new T.Euler(view.pitch-next.pitch,next.yaw,0)),new T.Vector3().setScalar(next.s/view.s));
  }
  function towerProjection(next){
    const model=towerTransform(next),eye=camera.position.clone().applyMatrix4(model.clone().invert());
    const matrix=new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).multiply(model).elements;
    const point=v=>{
      const [x,y,z]=v,w=matrix[3]*x+matrix[7]*y+matrix[11]*z+matrix[15];
      return {x:((matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12])/w+1)*width/2,y:(1-(matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13])/w)*height/2,z:-w};
    };
    const facesViewer=(n,v)=>{const x=eye.x-v[0],y=eye.y-v[1],z=eye.z-v[2];return n[0]*x+n[1]*y+n[2]*z>=-.015*Math.hypot(x,y,z);};
    return {point,facesViewer};
  }
  function applyCamera(){
    const pitch=view.pitch+cameraPose.pitch,distance=80+cameraPose.dolly;
    camera.position.set(cameraPose.track+Math.sin(cameraPose.yaw)*Math.cos(pitch)*distance,Math.sin(pitch)*distance,Math.cos(cameraPose.yaw)*Math.cos(pitch)*distance);
    // Translate the eye and its target together: the shore visibly travels
    // across the frame instead of the lighthouse base remaining pinned in place.
    camera.lookAt(cameraPose.track,0,0);camera.updateMatrixWorld();
    referenceRotation.extractRotation(referenceCamera.matrixWorldInverse);
    skyRotation.extractRotation(camera.matrixWorld);
    skyProjection.copy(referenceCamera.projectionMatrix).multiply(referenceRotation).multiply(skyRotation).multiply(camera.projectionMatrixInverse);
    const left=projectSurface(0,height*.454),right=projectSurface(width,height*.454);
    const horizonAt=x=>left.y+(right.y-left.y)*(x-left.x)/(right.x-left.x);
    horizon=Math.min(horizonAt(0),horizonAt(width*.42));
    shell.style.setProperty('--coast-horizon',`${horizon.toFixed(2)}px`);
    waterUniforms.uHorizon.value=horizonAt(width*.5)/height;
  }
  function updateCamera(now,canMove=true){
    if(!active||!view)return;
    const dt=cameraLast?Math.max(0,Math.min(80,now-cameraLast)):0;cameraLast=now;
    if(motion.matches){for(const key of Object.keys(cameraPose))cameraPose[key]=0;}
    else if(canMove&&!prologue){
      cameraClock+=dt/1000;
      // Leave room around portrait targets and the title on wide, short screens.
      const amount=width<height?.3:1,angular=amount*(width/height>1.7?.5:1),blend=1-Math.exp(-dt/650);
      const goals={
        yaw:(Math.sin(cameraClock*.38)*.028+(pointer.x-.5)*.07)*angular,
        pitch:(Math.sin(cameraClock*.24)*.004+(pointer.y-.5)*.008)*angular,
        track:(Math.sin(cameraClock*.38)*.45+(pointer.x-.5)*.7)*amount,
        dolly:Math.sin(cameraClock*.27)*1.8*amount
      };
      for(const key of Object.keys(cameraPose))cameraPose[key]+=(goals[key]-cameraPose[key])*blend;
    }
    applyCamera();
  }

  function requestRender(){if(active&&!disposed&&!frame&&!document.hidden)frame=requestAnimationFrame(flush);}
  function flush(){
    if(frame){cancelAnimationFrame(frame);frame=0;}
    if(!active||disposed||!view)return;
    try {renderer.render(scene,camera);canvas.dataset.frames=String(++renderCount);resolveReady?.();resolveReady=null;}
    catch {fallback('render-failed');}
  }
  function configure(next,w,h){
    view={...next};width=w;height=h;
    const ratio=Math.min(devicePixelRatio||1,width<=640?1.4:1.5,Math.sqrt(1800000/(width*height)));
    renderer.setPixelRatio(ratio);renderer.setSize(width,height,false);
    camera.fov=T.MathUtils.radToDeg(2*Math.atan(height/(2*view.s*80)));camera.aspect=width/height;
    camera.setViewOffset(width,height,width*.5-view.x,height*.5-view.y,width,height);
    camera.position.set(0,Math.sin(view.pitch)*80,Math.cos(view.pitch)*80);camera.lookAt(0,0,0);camera.updateProjectionMatrix();camera.updateMatrixWorld();
    referenceCamera.copy(camera);referenceCamera.updateMatrixWorld();
    const p=waterGeometry.attributes.position,uv=waterGeometry.attributes.uv;
    for(let i=0;i<p.count;i++){
      const sx=(-.15+uv.getX(i)*1.3)*width,sy=(.454+(1-uv.getY(i))*.9)*height;
      const point=surfaceAnchor(sx,sy);p.setXYZ(i,point.x,point.y,point.z);
    }
    p.needsUpdate=true;waterGeometry.computeBoundingSphere();
    waterUniforms.uResolution.value.set(canvas.width,canvas.height);skyUniforms.uAspect.value=width/height;
    renderer.shadowMap.enabled=width>640;renderer.shadowMap.needsUpdate=true;
    cameraLast=0;applyCamera();
    requestRender();
  }
  function setTower(next,progress=1,now=0){
    if(!active||!view)return;
    tower.visible=true;
    const dx=(next.x-view.x)/view.s,dy=(next.y-view.y)/view.s;
    tower.position.set(dx,-dy*Math.cos(view.pitch),dy*Math.sin(view.pitch));tower.scale.setScalar(next.s/view.s);tower.rotation.set(view.pitch-next.pitch,next.yaw,0);
    sandUniforms.uAssembly.value=progress;sandUniforms.uSandTime.value=now/1000;
    const lit=clamp((progress-.86)/.14);glow.material.opacity=lit*.65;lantern.intensity=lit*3;
    towerMeshes[0].castShadow=progress>=1;
    tower.updateMatrixWorld(true);spot.position.copy(tower.localToWorld(new T.Vector3(0,4.04,0)));
    renderer.shadowMap.needsUpdate=true;requestRender();
  }
  function setEnvironment(now,a,p){
    if(!active)return;
    const wasVisible=environment.some(o=>o.visible);
    environmentTime=now/1000;arrival=a;journey=p;
    for(const object of environment)object.visible=a>.001&&p<.999;
    if(!wasVisible&&!tower.visible&&!environment.some(o=>o.visible))return;
    land.position.set((1-a)*3.2+p*2.6,-(1-a)*1.8-p*.8,0);
    land.rotation.y=0;
    water.position.y=-(1-a)*3.6-p*2.6;
    waterUniforms.uTime.value=environmentTime;waterUniforms.uArrival.value=a;
    skyUniforms.uTime.value=environmentTime;skyUniforms.uArrival.value=a;skyUniforms.uJourney.value=p;
    for(let i=0;i<foam.length;i++){foam[i].position.y=water.position.y+Math.sin(environmentTime*1.1+i)*.018;foam[i].material.opacity=(.22-i*.045)*clamp(a*2-.5)*(1+Math.sin(environmentTime*.8+i)*.25);}
    requestRender();
  }
  function waterPoint(x,y){raycaster.setFromCamera(new T.Vector2(x/width*2-1,1-y/height*2),camera);return raycaster.ray.intersectPlane(groundPlane,hit);}
  function aim(x,y,rgb,selected){
    if(!active||!view)return;
    // Pick the surface actually beneath the cursor. Intersecting only the sea
    // plane aims behind elevated cliffs and moves their light away from the mouse.
    raycaster.setFromCamera(new T.Vector2(x/width*2-1,1-y/height*2),camera);
    land.updateMatrixWorld(true);tower.updateMatrixWorld(true);
    const objects=[...(land.visible?[land]:[]),...(tower.visible?towerMeshes:[])];
    const solid=raycaster.intersectObjects(objects,true)[0];
    const point=solid?.point||raycaster.ray.intersectPlane(groundPlane,hit);if(!point)return;
    spot.target.position.copy(point);spot.color.setRGB(...rgb.map(v=>v/255),T.SRGBColorSpace);spot.intensity=selected?70:25;
    spot.userData.surface=solid?'land':'water';spot.userData.screenTarget={x,y};
    waterUniforms.uSpot.value.set(point.x,point.z);waterUniforms.uSpotColor.value.copy(spot.color);waterUniforms.uSpotStrength.value=solid?0:selected?.45:.16;
    requestRender();
  }
  function mountBoot(on){
    if(!active||prologue===on)return;
    prologue=on;canvas.classList.toggle('is-prologue',on);
    if(on){for(const key of Object.keys(cameraPose))cameraPose[key]=0;applyCamera();}
    if(on)document.body.append(canvas);else mount.insertBefore(canvas,mount.querySelector('#sea-canvas'));
    requestRender();
  }
  function captureTower(next){
    if(!active||!view)return null;
    const state={visible:tower.visible,position:tower.position.clone(),rotation:tower.quaternion.clone(),scale:tower.scale.clone(),progress:sandUniforms.uAssembly.value,time:sandUniforms.uSandTime.value,glow:glow.material.opacity,lantern:lantern.intensity,environment:environment.map(o=>o.visible)};
    setTower(next,1);environment.forEach(o=>o.visible=false);flush();
    const image=document.createElement('canvas');image.width=width;image.height=height;image.getContext('2d').drawImage(canvas,0,0,width,height);
    tower.visible=state.visible;tower.position.copy(state.position);tower.quaternion.copy(state.rotation);tower.scale.copy(state.scale);
    sandUniforms.uAssembly.value=state.progress;sandUniforms.uSandTime.value=state.time;glow.material.opacity=state.glow;lantern.intensity=state.lantern;
    environment.forEach((o,i)=>o.visible=state.environment[i]);renderer.shadowMap.needsUpdate=true;flush();return image;
  }
  function fallback(reason){
    if(!active)return;active=false;cancelAnimationFrame(frame);frame=0;
    canvas.dataset.renderer='fallback';canvas.dataset.reason=reason;canvas.classList.remove('is-prologue');mount.insertBefore(canvas,mount.querySelector('#sea-canvas'));
    document.body.classList.remove('has-three');resolveReady?.();resolveReady=null;
    shell.style.removeProperty('--coast-horizon');
    window.dispatchEvent(new Event('coast3dfallback'));
  }
  const onLoss=event=>{event.preventDefault();fallback('context-lost');};canvas.addEventListener('webglcontextlost',onLoss);
  const onVisibility=()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else requestRender();};document.addEventListener('visibilitychange',onVisibility);
  canvas.dataset.renderer='three';canvas.dataset.revision=T.REVISION;document.body.classList.add('has-three');
  return {
    get active(){return active;},ready,scene,camera,referenceCamera,renderer,configure,setTower,setEnvironment,aim,mountBoot,captureTower,flush,
    updateCamera,projectSurface,surfaceAnchor,skyAnchor,projectWorld,towerProjection,
    lamp(){const p=tower.localToWorld(new T.Vector3(0,4.04,0)).project(camera);return {x:(p.x+1)*width/2,y:(1-p.y)*height/2};},
    hideTower(){if(tower.visible){tower.visible=false;requestRender();}},
    pointer(x,y){pointer={x:clamp(x),y:clamp(y)};},
    setLight(hex){if(!active)return;glow.material.color.set(hex);lantern.color.set(hex);},
    ripple(x,y,now){if(active&&view){const p=waterPoint(x,y);if(p)waterUniforms.uRipple.value.set(p.x,p.z,now/1000);requestRender();}},
    inspect(){let meshes=0,triangles=0;scene.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;}});return {active,revision:T.REVISION,meshes,triangles,renderCount,waterVertices:waterGeometry.attributes.position.count,prologue,arrival,journey,cameraPose:{...cameraPose},cameraClock,horizon};},
    destroy(){disposed=true;active=false;cancelAnimationFrame(frame);canvas.removeEventListener('webglcontextlost',onLoss);document.removeEventListener('visibilitychange',onVisibility);for(const item of materials)item.dispose();for(const item of geometries)item.dispose();for(const item of textures)item.dispose();renderer.dispose();resolveReady?.();}
  };
};
