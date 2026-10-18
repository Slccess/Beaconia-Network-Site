/* One tower mesh is shared by Three.js, sand assembly and flag transfers.
   Software projection remains available when WebGL 2 cannot run. */
window.createCoastCinema = function () {
  const canvas=document.getElementById('cinema-canvas'),ctx=canvas.getContext('2d');
  const stage=document.getElementById('coast-stage'),shell=document.getElementById('site-shell');
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
  const mix=(a,b,t)=>a+(b-a)*t;
  const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
  const random=i=>{const x=Math.sin(i*127.1+311.7)*43758.5453;return x-Math.floor(x);};
  const rgb=hex=>hex.replace('#','').match(/../g).map(x=>parseInt(x,16));
  const color=(a,b,t)=>a.map((v,i)=>Math.round(mix(v,b[i],t)));
  let width=innerWidth,height=innerHeight,frame=0,last=0,disposed=false;
  let pointer={x:.5,y:.5},yaw=-.42,light=[255,229,163],boot=null,transfer=null;
  let arrivalFrame=0,arrivalResolve=null;
  function updateLock(){shell.inert=Boolean(boot||transfer||arrivalResolve||document.body.classList.contains('booting'));}
  const mesh=[];
  function triangle(a,b,c,base,emission=false){
    const u=b.map((v,i)=>v-a[i]),v=c.map((q,i)=>q-a[i]);
    let n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    const length=Math.hypot(...n)||1;n=n.map(q=>q/length);
    mesh.push({v:[a,b,c],n,c:rgb(base),emission,seed:random(mesh.length+3)});
  }
  function quad(a,b,c,d,base,emission=false){triangle(a,b,c,base,emission);triangle(a,c,d,base,emission);}
  function cylinder(y0,y1,r0,r1,base,segments=28,emission=false,cap=true){
    for(let i=0;i<segments;i++){
      const a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2;
      quad([Math.cos(a)*r0,y0,Math.sin(a)*r0],[Math.cos(a)*r1,y1,Math.sin(a)*r1],[Math.cos(b)*r1,y1,Math.sin(b)*r1],[Math.cos(b)*r0,y0,Math.sin(b)*r0],base,emission);
    }
    if(cap)for(let i=0;i<segments;i++){
      const a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2;
      triangle([0,y1,0],[Math.cos(b)*r1,y1,Math.sin(b)*r1],[Math.cos(a)*r1,y1,Math.sin(a)*r1],base,emission);
    }
  }
  cylinder(0,.13,.79,.79,'#82938d');cylinder(.13,.22,.79,.74,'#c9ccba');
  for(let i=0;i<16;i++){
    const y0=.22+i*3.38/16,y1=.22+(i+1)*3.38/16;
    const r0=mix(.64,.31,i/16),r1=mix(.64,.31,(i+1)/16);
    cylinder(y0,y1,r0,r1,i>=7&&i<=8?'#294b5e':i%3===0?'#e1dfc9':'#eee8d1',28,false,false);
  }
  cylinder(3.59,3.68,.46,.46,'#617b80');cylinder(3.68,3.74,.49,.49,'#d2cfaf');
  cylinder(3.75,4.27,.32,.32,'#edd69d',24,true);
  cylinder(4.28,4.34,.43,.46,'#345767');cylinder(4.34,4.78,.48,.015,'#456977');
  cylinder(4.78,4.98,.014,.014,'#b2c8bc',8);cylinder(4.98,5.015,.026,.016,'#efe6bc',8,true);
  for(let i=0;i<12;i++){
    const a=i/12*Math.PI*2,x=Math.cos(a),z=Math.sin(a);
    for(const [r,y0,y1] of [[.329,3.76,4.28],[.47,3.74,3.94]]){
      const start=mesh.length;cylinder(y0,y1,.012,.012,'#486776',5);
      const moved=new Set();for(let k=start;k<mesh.length;k++)for(const v of mesh[k].v){if(!moved.has(v)){v[0]+=x*r;v[2]+=z*r;moved.add(v);}}
    }
  }
  cylinder(3.94,3.97,.48,.48,'#698984');
  // Door and two inset windows are geometry as well, so they travel with the tower.
  const overlayStart=mesh.length;
  // Follow the wall taper with a constant clearance. The old door and frame
  // converged to a .002 gap at the top, causing intermittent dark depth stripes.
  function inset(halfWidth,y0,y1,clearance,base,emission=false){
    const z0=mix(.64,.31,(y0-.22)/3.38)+clearance,z1=mix(.64,.31,(y1-.22)/3.38)+clearance;
    quad([-halfWidth,y0,z0],[halfWidth,y0,z0],[halfWidth,y1,z1],[-halfWidth,y1,z1],base,emission);
  }
  inset(.13,.22,.83,.018,'#26434e');
  inset(.087,.24,.78,.036,'#d0ae6d',true);
  for(const y of [1.35,2.75])inset(.045,y,y+.24,.018,'#2c4e5e');
  mesh.slice(overlayStart).forEach(f=>f.overlay=true);
  const three=window.createCoast3D?.(mesh)||null;window.coast3D=three;
  function homeCamera(){
    const portrait=width/height<1,aw=portrait?500:1600,ah=1000,scale=Math.max(width/aw,height/ah);
    const dx=(width-aw*scale)*.5,dy=(height-ah*scale)*.5;
    return {
      x:dx+(portrait?(-470+1262*.7):1262)*scale,
      y:dy+(portrait?(35+651*.7):651)*scale,
      s:(portrait?472*.7:472)*scale/4.96,
      yaw:three?.active?-.42:yaw,pitch:three?.active ? .28 : .16
    };
  }
  function bootCamera(){return {x:width*.5,y:height*.65,s:Math.min(height*.45,width*.74,440)/5.03,yaw:-.42,pitch:three?.active ? .28 : .16};}
  function project(v,camera){
    const c=Math.cos(camera.yaw),s=Math.sin(camera.yaw),x=v[0]*c+v[2]*s,z=-v[0]*s+v[2]*c;
    return {x:camera.x+x*camera.s,y:camera.y+(-v[1]*Math.cos(camera.pitch)+z*Math.sin(camera.pitch))*camera.s,z:z*Math.cos(camera.pitch)+v[1]*Math.sin(camera.pitch)};
  }
  function faces(camera){
    const result=[];
    const projection=three?.active?three.towerProjection(camera):null;
    for(let i=0;i<mesh.length;i++){
      const f=mesh[i],n=f.n,z=-n[0]*Math.sin(camera.yaw)+n[2]*Math.cos(camera.yaw);
      if(projection?!projection.facesViewer(n,f.v[0]):z*Math.cos(camera.pitch)+n[1]*Math.sin(camera.pitch)<-.015)continue;
      const shade=f.emission?1:clamp(.76+(-n[0]*.42+n[1]*.62+n[2]*.4)*.24,.47,1.06);
      result.push({p:f.v.map(projection?projection.point:v=>project(v,camera)),c:f.c.map(v=>Math.round(clamp(v*shade,0,255))),seed:f.seed,id:i,overlay:f.overlay});
    }
    result.sort((a,b)=>a.overlay||b.overlay?(a.overlay?a.id+10000:0)-(b.overlay?b.id+10000:0):a.p.reduce((s,p)=>s+p.z,0)-b.p.reduce((s,p)=>s+p.z,0));return result;
  }
  function fillTriangle(points,c,alpha=1){
    if(!ctx||alpha<.003)return;ctx.globalAlpha=alpha;ctx.fillStyle=`rgb(${c.join(',')})`;ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);ctx.lineTo(points[1].x,points[1].y);ctx.lineTo(points[2].x,points[2].y);ctx.closePath();ctx.fill();
    ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=.7;ctx.stroke();ctx.globalAlpha=1;
  }
  function glow(camera,opacity=1){
    if(!ctx)return;const p=project([0,4.04,0],camera),r=camera.s*.68;
    const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r);g.addColorStop(0,`rgba(${light.join(',')},${.40*opacity})`);g.addColorStop(.25,`rgba(${light.join(',')},${.16*opacity})`);g.addColorStop(1,`rgba(${light.join(',')},0)`);ctx.fillStyle=g;ctx.fillRect(p.x-r,p.y-r,r*2,r*2);
  }
  function drawModel(camera,opacity=1){
    if(three?.active){three.setTower(camera,1,performance.now());return;}
    if(!ctx)return;const pieces=faces(camera);for(const f of pieces)fillTriangle(f.p,f.c,opacity);glow(camera,opacity);
  }
  function sand(now,p){
    if(three?.active){
      three.setTower(bootCamera(),p,now);
      canvas.dataset.pieces=String(mesh.length);canvas.dataset.assembled=String(mesh.filter(f=>smooth((p-clamp(f.v.reduce((s,v)=>s+v[1]/15,0))*.72)/.28)>.99).length);return;
    }
    const camera=bootCamera(),pieces=faces(camera),seconds=now/1000;
    ctx.save();const ground=ctx.createRadialGradient(camera.x,camera.y+12,0,camera.x,camera.y+12,camera.s*2.9);
    ground.addColorStop(0,'#e5c79940');ground.addColorStop(1,'#9cbbbd00');ctx.fillStyle=ground;ctx.translate(0,camera.y+12);ctx.scale(1,.16);ctx.translate(0,-camera.y-12);ctx.fillRect(camera.x-camera.s*3,camera.y+12-camera.s*3,camera.s*6,camera.s*6);ctx.restore();
    let assembled=0;
    pieces.forEach((f,i)=>{
      const centre=f.p.reduce((a,v)=>({x:a.x+v.x/3,y:a.y+v.y/3}),{x:0,y:0});
      const level=clamp((camera.y-centre.y)/(camera.s*5));
      const local=smooth((p-level*.72)/.28);if(local>.99)assembled++;
      const a=f.seed*Math.PI*8+seconds*(1-local)*1.6;
      const r=(1-local)*(camera.s*(.9+f.seed*2.4));
      const x=mix(camera.x+Math.cos(a)*r,centre.x,local);
      const y=mix(camera.y+Math.sin(a)*r*.17,centre.y,local)-Math.sin(local*Math.PI)*camera.s*(.4+f.seed*.8);
      const spin=(1-local)*(seconds*1.8+f.seed*8),cs=Math.cos(spin),sn=Math.sin(spin),scale=mix(.09,1,local);
      const points=f.p.map(v=>({x:x+((v.x-centre.x)*cs-(v.y-centre.y)*sn)*scale,y:y+((v.x-centre.x)*sn+(v.y-centre.y)*cs)*scale}));
      fillTriangle(points,color([206,185,139],f.c,local),.25+.75*Math.max(local,p));
    });
    canvas.dataset.assembled=String(assembled);canvas.dataset.pieces=String(pieces.length);
    if(p>.86)glow(camera,smooth((p-.86)/.14));
  }
  function localPoints(a,b,t,seed,amount=1){
    const ac=a.reduce((s,p)=>({x:s.x+p.x/3,y:s.y+p.y/3}),{x:0,y:0}),bc=b.reduce((s,p)=>({x:s.x+p.x/3,y:s.y+p.y/3}),{x:0,y:0});
    const spread=Math.sin(t*Math.PI),turn=Math.sin(t*Math.PI)*(seed-.5)*7,cs=Math.cos(turn),sn=Math.sin(turn);
    const x=mix(ac.x,bc.x,t)+Math.sin(seed*37)*spread*width*.12*amount;
    const y=mix(ac.y,bc.y,t)-spread*height*(.05+seed*.12)*amount;
    return a.map((v,i)=>{const vx=mix(v.x-ac.x,b[i].x-bc.x,t),vy=mix(v.y-ac.y,b[i].y-bc.y,t);return {x:x+vx*cs-vy*sn,y:y+vx*sn+vy*cs};});
  }
  function placeTower(t){
    const a=bootCamera(),b=homeCamera();
    // Move one intact model, including its light, from the prologue to the coast.
    const camera=Object.fromEntries(['x','y','s','yaw','pitch'].map(key=>[key,mix(a[key],b[key],t)]));
    camera.y-=Math.sin(t*Math.PI)*height*.025;
    drawModel(camera);
  }
  function snapshot(element){
    if(!element)return null;const rect=element.getBoundingClientRect();
    if(rect.width<2||rect.height<2)return null;
    return {rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},image:element.tagName==='IMG'?element:null,transparent:element.dataset.transparent==='true'};
  }
  function captureSeedSection(){
    const element=document.querySelector('.seed-invitation');if(!element)return null;
    const bounds=element.getBoundingClientRect();
    const rect={x:Math.max(0,bounds.left),y:Math.max(0,bounds.top),width:Math.min(width,bounds.right)-Math.max(0,bounds.left),height:Math.min(height,bounds.bottom)-Math.max(0,bounds.top)};
    if(rect.width<2||rect.height<40)return null;
    const image=document.createElement('canvas'),ratio=Math.min(devicePixelRatio||1,2);
    image.width=Math.ceil(rect.width*ratio);image.height=Math.ceil(rect.height*ratio);
    const paint=image.getContext('2d');if(!paint)return null;
    paint.scale(ratio,ratio);paint.translate(-rect.x,-rect.y);
    const background=getComputedStyle(element).backgroundColor;
    paint.fillStyle=background;paint.fillRect(rect.x,rect.y,rect.width,rect.height);
    // Read glyph positions from the live section, preserving the actual wraps
    // and fonts in its fragments without a remote screenshot dependency.
    for(const img of element.querySelectorAll('img')){
      if(!img.complete||!img.naturalWidth)continue;
      const r=img.getBoundingClientRect();paint.drawImage(img,r.x,r.y,r.width,r.height);
    }
    // Keep the homepage's CSS constellation in the outgoing fragments. Its
    // ellipses and small stars use the live transforms, including mobile scale.
    const orbits=element.querySelector('.seed-orbits');
    if(orbits){
      const origin=orbits.getBoundingClientRect(),opacity=Number(getComputedStyle(orbits).opacity);
      for(const orbit of orbits.querySelectorAll('i')){
        const style=getComputedStyle(orbit),w=parseFloat(style.width),h=parseFloat(style.height);
        const matrix=new DOMMatrix(style.transform),border=parseFloat(style.borderTopWidth);
        paint.save();paint.globalAlpha=opacity;
        paint.translate(origin.x+orbit.offsetLeft+w/2,origin.y+orbit.offsetTop+h/2);
        paint.transform(matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f);
        paint.strokeStyle=style.borderTopColor;paint.lineWidth=border;
        paint.beginPath();paint.ellipse(0,0,(w-border)/2,(h-border)/2,0,0,Math.PI*2);paint.stroke();
        const dot=getComputedStyle(orbit,'::after'),size=parseFloat(dot.width);
        paint.fillStyle=dot.backgroundColor;paint.shadowColor='#c3deb4';paint.shadowBlur=20;
        paint.beginPath();paint.arc(-w/2+border+parseFloat(dot.left)+size/2,-h/2+border+parseFloat(dot.top)+size/2,size/2,0,Math.PI*2);paint.fill();paint.restore();
      }
    }
    const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT),range=document.createRange();
    let node;
    while((node=walker.nextNode())){
      const style=getComputedStyle(node.parentElement);
      if(style.visibility==='hidden'||style.display==='none')continue;
      paint.font=`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      paint.fillStyle=style.color;paint.textBaseline='alphabetic';
      paint.save();
      if(node.parentElement.closest('.seed-orbits')){
        paint.globalAlpha=Number(getComputedStyle(orbits).opacity)*Number(style.opacity);
        paint.shadowColor='#e2e2b750';paint.shadowBlur=60;
      }
      const descent=paint.measureText('Mg').fontBoundingBoxDescent||0;
      for(let i=0;i<node.length;){
        const char=String.fromCodePoint(node.textContent.codePointAt(i));
        range.setStart(node,i);range.setEnd(node,i+char.length);i+=char.length;
        if(!char.trim())continue;
        const r=range.getBoundingClientRect();if(!r.width||!r.height)continue;
        paint.fillText(style.textTransform==='uppercase'?char.toUpperCase():char,r.x,r.bottom-descent);
      }
      paint.restore();
    }
    for(const link of element.querySelectorAll('.line-link')){
      const r=link.getBoundingClientRect(),style=getComputedStyle(link);
      paint.fillStyle=style.borderBottomColor;paint.fillRect(r.x,r.bottom-1,r.width,1);
    }
    return {rect,image,background,section:true};
  }
  function destination(){return snapshot(document.querySelector('#detail-content .flag-cloth img, #detail-content .partner-flag, #detail-content .seed-detail-art')||document.querySelector('#detail-content .partner-hero h1, #detail-content .community-hero h1, #detail-content .missing-page h1'));}
  function grid(rect,count){
    const columns=width<=640?12:20,rows=Math.ceil(count/(columns*2)),out=[];
    for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
      const u=x/columns,v=y/rows,du=1/columns,dv=1/rows;
      for(const uv of [[[u,v],[u,v+dv],[u+du,v]],[[u+du,v],[u,v+dv],[u+du,v+dv]]])out.push({p:uv.map(([a,b])=>({x:rect.x+a*rect.width,y:rect.y+b*rect.height})),uv});
    }return out;
  }
  function texturedTriangle(img,uv,p,opacity){
    const iw=img&&('naturalWidth' in img?img.naturalWidth:img.width),ih=img&&('naturalHeight' in img?img.naturalHeight:img.height);
    if(!img||img.complete===false||!iw||!ih||!ctx||opacity<.01)return;
    const src=uv.map(v=>({x:v[0]*iw,y:v[1]*ih}));
    const [a,b,c]=src,[d,e,f]=p,den=(b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y);
    if(Math.abs(den)<.001)return;
    const A=((e.x-d.x)*(c.y-a.y)-(f.x-d.x)*(b.y-a.y))/den;
    const B=((e.y-d.y)*(c.y-a.y)-(f.y-d.y)*(b.y-a.y))/den;
    const C=((f.x-d.x)*(b.x-a.x)-(e.x-d.x)*(c.x-a.x))/den;
    const D=((f.y-d.y)*(b.x-a.x)-(e.y-d.y)*(c.x-a.x))/den;
    const sx=Math.min(a.x,b.x,c.x),sy=Math.min(a.y,b.y,c.y),sw=Math.max(a.x,b.x,c.x)-sx,sh=Math.max(a.y,b.y,c.y)-sy;
    ctx.save();ctx.globalAlpha=opacity;ctx.beginPath();ctx.moveTo(d.x,d.y);ctx.lineTo(e.x,e.y);ctx.lineTo(f.x,f.y);ctx.closePath();ctx.clip();ctx.transform(A,B,C,D,d.x-A*a.x-C*a.y,d.y-B*a.x-D*a.y);
    // Sample only this tile: drawing the full flag hundreds of times is costly on mobile.
    ctx.drawImage(img,sx,sy,sw,sh,sx,sy,sw,sh);ctx.restore();
  }
  function drawTransfer(t,tr=transfer,camera=homeCamera()){
    const from=tr.source,to=tr.dest;
    const tower=faces(camera),count=width<=640?350:620;
    const plane=grid((tr.reverse?from:to)?.rect||{x:width*.64,y:height*.3,width:width*.25,height:height*.3},count);
    const oldPlane=from&&to?grid(from.rect,count):plane;
    for(let i=0;i<plane.length;i++){
      const f=tower[Math.floor(i/plane.length*tower.length)],a=tr.fromDetail?oldPlane[i].p:f.p,b=tr.reverse?f.p:plane[i].p;
      const local=smooth(clamp((t-random(i)*.12)/.88));
      const p=localPoints(a,b,local,random(i),.85);
      const alpha=(from?.transparent?smooth(local/.65):1)*(to?.transparent?1-smooth((local-.35)/.65):1);
      fillTriangle(p,color(tr.fromDetail?tr.color:f.c,tr.reverse?f.c:tr.color,local),alpha);
      if(tr.towerTexture)texturedTriangle(tr.towerTexture,f.p.map(v=>[v.x/width,v.y/height]),p,tr.reverse?smooth((local-.35)/.65):1-smooth(local/.65));
      if(from?.image)texturedTriangle(from.image,oldPlane[i].uv,p,1-smooth(local/.65));
      if(to?.image)texturedTriangle(to.image,plane[i].uv,p,smooth((local-.35)/.65));
    }
    canvas.dataset.fragments=String(plane.length);
  }
  function drawSwitch(t,tr){
    const split=.34,outgoing=t<split,landing=smooth(clamp((t-split)/(1-split)));
    for(let i=0;i<tr.pieces.length;i++){
      const piece=tr.pieces[i],a=piece.p,b=tr.after?.[i]?.p||a,seed=piece.seed;
      // One clock carries every piece through the page change, without stopping to restart.
      const travel=smooth(clamp((t-seed*.045)/(1-seed*.045)));
      const spread=Math.sin(travel*Math.PI),orbit=seed*Math.PI*2+travel*2.4;
      const turn=spread*(seed-.5)*5+Math.sin(travel*Math.PI*2)*.25;
      const cs=Math.cos(turn),sn=Math.sin(turn),cx=piece.centre.x,cy=piece.centre.y;
      const driftX=Math.cos(orbit)*spread*tr.spreadX;
      const driftY=Math.sin(orbit)*spread*tr.spreadY-spread*height*.035;
      const points=a.map((v,j)=>({
        x:cx+(v.x-cx)*cs-(v.y-cy)*sn+driftX+(b[j].x-v.x)*landing,
        y:cy+(v.x-cx)*sn+(v.y-cy)*cs+driftY+(b[j].y-v.y)*landing
      }));
      const alpha=(tr.source?.transparent?landing:1)*(tr.dest?.transparent?1-landing:1);
      fillTriangle(points,color(tr.sourceColor,tr.color,landing),alpha);
      if(tr.source?.image)texturedTriangle(tr.source.image,piece.uv,points,1-smooth(clamp((t-.18)/.68)));
      if(tr.dest?.image)texturedTriangle(tr.dest.image,piece.uv,points,landing);
    }
    shell.style.setProperty('--archive-exit',outgoing?String(smooth(t/split)):'0');
    canvas.dataset.fragments=String(tr.pieces.length);
    canvas.dataset.phase=tr.kind==='seed-section'?(outgoing?'seed-dissolving':'seed-rebuilding'):(outgoing?'flag-dissolving':'flag-rebuilding');
  }
  function commitSwitch(tr){
    if(!tr.commit||tr.committed)return true;
    // Finish the rail entrance before the fragment handoff, even if a slow
    // frame delays the page commit. Interruptions share the regular cleanup.
    if(tr.kind==='seed-section')shell.style.setProperty('--seed-nav-duration',`${Math.min(900,Math.max(0,tr.duration-(performance.now()-tr.start)))}ms`);
    document.body.classList.remove('is-switching-out');document.body.classList.add('is-switching-in');
    tr.committed=true;
    if(tr.commit()===false)return false;
    tr.dest=destination();tr.after=grid(tr.dest?.rect||tr.sourceRect,tr.pieces.length);return true;
  }
  function resetCanvas(){
    if(!ctx)return;
    // Flush pending textured tiles before the final clear. Otherwise stopping the
    // animation here can leave old accelerated Canvas tiles over the DOM flag.
    try {ctx.getImageData(0,0,1,1);}
    catch(error){
      if(error.name!=='SecurityError')throw error;
      // External partner flags may taint the bitmap; recreate it without reading.
      canvas.width=Math.round(width*Math.min(devicePixelRatio||1,2));
      const dpr=Math.min(devicePixelRatio||1,2);ctx.setTransform(dpr,0,0,dpr,0,0);
      // Local-file images also taint Chromium's canvas. Flush the newly clean
      // bitmap before clearing, otherwise queued tiles can survive its resize.
      ctx.getImageData(0,0,1,1);
    }
    ctx.clearRect(0,0,width,height);
  }
  function finishTransfer(restoreFocus=true){
    if(!transfer)return;const focus=transfer.focus;transfer=null;resetCanvas();canvas.dataset.phase=document.body.dataset.view==='home'?'coast':'archive';if(document.body.dataset.view==='home')drawModel(homeCamera());else three?.hideTower();three?.flush();document.body.classList.remove('is-fragmenting','is-returning','is-switching-out','is-switching-in','is-seed-departing');shell.style.removeProperty('--archive-exit');
    shell.style.removeProperty('--seed-nav-duration');
    updateLock();if(restoreFocus&&!shell.inert&&focus?.isConnected)focus.focus({preventScroll:true});
  }
  function finishBoot(){
    const done=boot.resolve;boot=null;document.body.classList.remove('is-fragmenting');resetCanvas();canvas.dataset.phase=document.body.dataset.view==='home'?'coast':'archive';if(document.body.dataset.view==='home')drawModel(homeCamera());shell.style.setProperty('--arrival','1');three?.mountBoot(false);three?.setEnvironment(0,1,+stage.dataset.progress||0);three?.flush();done();
  }
  function render(now){
    if(!ctx||disposed)return;
    ctx.clearRect(0,0,width,height);
    three?.hideTower();
    if(boot){
      if(motion.matches){
        const actual=clamp(boot.progress());sand(0,actual);canvas.dataset.phase='assembling';canvas.dataset.progress=actual.toFixed(3);document.querySelector('.boot-meter').setAttribute('aria-valuenow',String(Math.floor(actual*100)));
        if(boot.ready&&actual===1)finishBoot();
      }else if(boot.phase==='assemble'){
        const actual=clamp(boot.progress()),duration=boot.shortened?650:3300;
        const step=1-Math.exp(-(now-(boot.previous||now-16))/170);boot.previous=now;
        boot.visual=Math.min(actual,mix(boot.visual,actual,step),clamp((now-boot.start)/duration));
        if(actual===1&&now-boot.start>=duration&&1-boot.visual<.012)boot.visual=1;
        sand(now,boot.visual);document.querySelector('.boot-meter').setAttribute('aria-valuenow',String(Math.floor(boot.visual*100)));
        canvas.dataset.phase='assembling';canvas.dataset.progress=boot.visual.toFixed(3);
        if(boot.ready&&boot.visual===1){boot.phase='hold';boot.phaseStart=now;canvas.dataset.phase='assembled';}
      }else if(boot.phase==='hold'){
        drawModel(bootCamera());if(now-boot.phaseStart>380){boot.phase='arrive';boot.phaseStart=now;document.getElementById('boot').classList.add('is-arriving');if(document.body.dataset.view==='detail'){document.body.classList.add('is-fragmenting');boot.routeTransfer={source:null,dest:destination(),fromDetail:false,reverse:false,towerTexture:three?.captureTower(bootCamera()),color:rgb(document.documentElement.style.getPropertyValue('--accent')||'#9bc9fe')};}}
      }else{
        const t=clamp((now-boot.phaseStart)/1850),p=smooth(t);
        canvas.dataset.phase='landing';canvas.dataset.progress=p.toFixed(3);shell.style.setProperty('--arrival',smooth((t-.08)/.78).toFixed(4));
        document.getElementById('boot').style.setProperty('--departure',smooth(t/.72).toFixed(4));if(boot.routeTransfer)drawTransfer(p,boot.routeTransfer,bootCamera());else placeTower(p);
        if(t===1)finishBoot();
      }
    }else if(transfer){
      const tr=transfer,t=Math.max(tr.progress||0,clamp((now-tr.start)/tr.duration));tr.progress=t;
      if(tr.commit){
        if(t>=.34&&!commitSwitch(tr)){finishTransfer(false);return;}
        drawSwitch(t,tr);
      }else{drawTransfer(t);canvas.dataset.phase=tr.reverse?'return-fragments':'flag-fragments';}
      canvas.dataset.progress=t.toFixed(3);
      if(t===1)finishTransfer();
    }else if(document.body.dataset.view==='home'&&scrollY<height+200){
      yaw=mix(yaw,-.42+(pointer.x-.5)*.13,motion.matches?1:.045);
      const camera=homeCamera();if(!three?.active)camera.y-=Math.min(scrollY*.16,height+200);
      drawModel(camera);canvas.dataset.phase='coast';
    }
    three?.setEnvironment(motion.matches?0:now,Number(shell.style.getPropertyValue('--arrival')||1),+stage.dataset.progress||0);
    if(transfer&&!transfer.commit||boot?.routeTransfer)three?.flush();
  }
  function loop(now){frame=0;if(disposed||document.hidden)return;if(now-last>30||boot||transfer){render(now);last=now;}if(boot||transfer||(!motion.matches&&document.body.dataset.view==='home'&&scrollY<height+200))frame=requestAnimationFrame(loop);}
  function resume(){if(!frame&&!disposed&&!document.hidden){render(performance.now());if(boot||transfer||!motion.matches)frame=requestAnimationFrame(loop);}}
  function resize(){const bounds=stage.getBoundingClientRect();width=bounds.width;height=bounds.height;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx?.setTransform(dpr,0,0,dpr,0,0);if(three?.active)three.configure(homeCamera(),width,height);if(transfer){commitSwitch(transfer);finishTransfer();}resume();}
  function onPointer(e){if(e.pointerType!=='touch'){pointer={x:e.clientX/width,y:e.clientY/height};resume();}}
  function onMotion(){if(motion.matches){if(transfer)commitSwitch(transfer);finishTransfer();cancelAnimationFrame(arrivalFrame);const done=arrivalResolve;arrivalResolve=null;done?.();if(!boot)shell.style.setProperty('--arrival','1');updateLock();}resume();}
  window.addEventListener('resize',resize);window.addEventListener('pointermove',onPointer,{passive:true});window.addEventListener('scroll',resume,{passive:true});
  document.addEventListener('visibilitychange',resume);window.addEventListener('coast3dfallback',resize);motion.addEventListener('change',onMotion);resize();
  return {
    lamp(){if(three?.active)return three.lamp();const p=project([0,4.04,0],homeCamera());return {x:p.x,y:p.y};},
    setLight(hex){light=rgb(hex);three?.setLight(hex);},
    capture:destination,captureSeedSection,
    async assemble(progress,resources){
      finishTransfer(false);shell.style.setProperty('--arrival','0');
      three?.mountBoot(true);
      if(!ctx){await resources;shell.style.setProperty('--arrival','1');return;}
      const complete=new Promise(resolve=>{boot={phase:'assemble',visual:0,progress,resolve,start:performance.now(),ready:false,shortened:false};});
      resources.finally(()=>{if(boot)boot.ready=true;resume();});updateLock();resume();await Promise.all([complete,resources]);
    },
    shorten(){if(boot)boot.shortened=true;},
    entrance(){
      if(motion.matches){shell.style.setProperty('--arrival','1');updateLock();resume();return Promise.resolve();}
      shell.style.setProperty('--arrival','0');const start=performance.now();
      return new Promise(resolve=>{arrivalResolve=resolve;updateLock();const tick=now=>{const p=clamp((now-start)/1100);shell.style.setProperty('--arrival',smooth(p).toFixed(4));if(p<1)arrivalFrame=requestAnimationFrame(tick);else{arrivalResolve=null;updateLock();resolve();}};arrivalFrame=requestAnimationFrame(tick);resume();});
    },
    transition({source=null,reverse=false,fromDetail=false,color:hex='#9bc9fe',focus=null}){
      finishTransfer(false);if(motion.matches||!ctx){resume();return;}
      document.body.classList.add('is-fragmenting');document.body.classList.toggle('is-returning',reverse);
      const dest=reverse?null:destination();
      const towerTexture=three?.active&&(!fromDetail||reverse)?three.captureTower(homeCamera()):null;
      transfer={source,dest,fromDetail,reverse,towerTexture,color:rgb(hex),focus:focus||document.getElementById(reverse?'main':'detail-shell'),start:performance.now(),duration:fromDetail&&!reverse?1000:1450};updateLock();render(performance.now());resume();three?.flush();
    },
    switchDetail({source,color:hex,commit,section=false}){
      finishTransfer(false);
      if(motion.matches||!ctx){commit();resume();return;}
      const sourceColor=section?[23,60,64]:rgb(document.documentElement.style.getPropertyValue('--accent')||'#9bc9fe');
      const sourceRect=source?.rect||{x:width*.64,y:height*.3,width:width*.25,height:height*.3};
      const pieces=grid(sourceRect,width<=640?350:620).map((piece,i)=>({...piece,seed:random(i),centre:piece.p.reduce((s,p)=>({x:s.x+p.x/3,y:s.y+p.y/3}),{x:0,y:0})}));
      transfer={kind:section?'seed-section':'switch',source,sourceRect,pieces,after:null,spreadX:Math.min(width*(section?.10:.06),sourceRect.width*.24),spreadY:Math.min(height*(section?.15:.09),sourceRect.height*.32),dest:null,sourceColor,color:rgb(hex),commit,committed:false,focus:document.getElementById('detail-shell'),start:performance.now(),duration:section?1850:1700};
      // Hide the DOM flag and paint its replacement within the same task.
      document.body.classList.add('is-fragmenting','is-switching-out');document.body.classList.toggle('is-seed-departing',section);updateLock();render(performance.now());resume();
    },
    cancelTransition(){finishTransfer(false);},
    refresh:resume,
    destroy(){disposed=true;cancelAnimationFrame(frame);cancelAnimationFrame(arrivalFrame);finishTransfer();three?.destroy();window.removeEventListener('resize',resize);window.removeEventListener('pointermove',onPointer);window.removeEventListener('scroll',resume);window.removeEventListener('coast3dfallback',resize);document.removeEventListener('visibilitychange',resume);motion.removeEventListener('change',onMotion);}
  };
};
