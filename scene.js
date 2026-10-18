/* One persistent scene: the same two tide curves morph into the server rail.
   Rendering pauses off screen, in background tabs and under reduced motion. */
window.createCoastScene = function () {
  const stage = document.getElementById('coast-stage');
  const svg = document.getElementById('tide-lines');
  const canvas = document.getElementById('sea-canvas');
  const ctx = canvas.getContext('2d');
  let ocean = null;
  function fallbackOcean(){if(!ocean){ocean=window.createOcean(document.getElementById('ocean-canvas'),{forceCanvas:window.coast3D?.active===false});ocean.resize(width,height);}return ocean;}
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let width = innerWidth, height = innerHeight, frame = 0, disposed = false;
  let progress = 0, target = 0, transition = null, last = 0, scroll = 0;
  let nodes = {}, geometry = {}, ripples = [], lastRipple = 0;
  let pointer = { x: width * .35, y: height * .65, active: false };
  let beamAngle = Math.PI, beamLength = width * .9, beamSpread = height * .1;
  let beamTarget = null;
  let hoverNode = null, beamColor = [248, 222, 169];
  let previousProgress = -1, lastLightFrame = 0;
  let birds=[];
  const groups = Object.fromEntries(['inner', 'outer'].map(name => [name, {
    water: svg.querySelector(`[data-wave="${name}"] .wave-water`),
    foam: svg.querySelector(`[data-wave="${name}"] .wave-foam`),
    halo: svg.querySelector(`[data-wave="${name}"] .wave-halo`),
    line: svg.querySelector(`[data-wave="${name}"] .wave-line`),
    companion: svg.querySelector(`[data-wave="${name}"] .wave-companion`),
    glint: svg.querySelector(`[data-wave="${name}"] .wave-glint`)
  }]));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2;
  const bezier = (p, t) => {
    const u = 1-t;
    return [0, 1].map(axis => u*u*u*p[0][axis] + 3*u*u*t*p[1][axis] + 3*u*t*t*p[2][axis] + t*t*t*p[3][axis]);
  };
  function configure() {
    const mobile = innerWidth <= 640, portrait=width/height<1, compact = innerWidth <= 1000;
    const home = portrait ? {
      // The water turns back before the lighthouse rock instead of climbing onto it.
      inner: [[-.13*width,.84*height],[.08*width,.53*height],[.61*width,.58*height],[.86*width,.76*height]],
      outer: [[-.18*width,1.02*height],[.12*width,.74*height],[.64*width,.76*height],[.90*width,.96*height]]
    } : {
      inner: [[-.10*width,.83*height],[.07*width,.49*height],[.48*width,.47*height],[.68*width,.70*height]],
      outer: [[-.10*width,1.03*height],[.09*width,.70*height],[.48*width,.70*height],[.72*width,.93*height]]
    };
    const outerStart = mobile ? -5 : compact ? 8 : 12;
    const outerBend = mobile ? 20 : compact ? 65 : 86;
    const innerStart = mobile ? 43 : compact ? 111 : 135;
    const innerBend = mobile ? 75 : compact ? 161 : 203;
    const detail = {
      outer: [[outerStart,-.1*height],[outerBend,.21*height],[outerBend,.79*height],[outerStart,1.1*height]],
      inner: [[innerStart,-.1*height],[innerBend,.21*height],[innerBend,.79*height],[innerStart,1.1*height]]
    };
    geometry = { home, detail };
    birds=[...document.querySelectorAll('.goose')].map((element,index)=>({element,index,x:element.offsetLeft+element.offsetWidth/2,y:element.offsetTop+element.offsetHeight/2,depth:105+index*17}));
  }
  function point(name, t, seconds, companion = false, offset = 0) {
    const a = bezier(geometry.home[name], t), b = bezier(geometry.detail[name], t);
    const phase = name === 'inner' ? 0 : 2;
    const wave = motion.matches ? 0 : Math.sin(t*17 - seconds*1.05 + phase)*6.5 + Math.sin(t*39 - seconds*1.4 + phase)*2.8 + Math.sin(t*91-seconds*.8)*.9;
    const homeY=a[1]+wave+offset+(companion?Math.sin(t*21-seconds*.95)*5+10:0);
    const projected=window.coast3D?.active?window.coast3D.projectSurface(a[0],homeY):{x:a[0],y:homeY,scale:1};
    const detailX=b[0]+(companion?Math.sin(t*22+seconds*.5)*4+5:0);
    return [lerp(projected.x,detailX,progress),lerp(projected.y,b[1],progress),lerp(projected.scale,1,progress)];
  }
  function drawTides(seconds) {
    ['outer','inner'].forEach(name => {
      let line = '', companion = '', foam = '', water = '';
      const trough=[];
      for (let i=0; i<=80; i++) {
        const p = point(name,i/80,seconds), q = point(name,i/80,seconds,true);
        line += `${i ? 'L':'M'}${p[0].toFixed(2)},${p[1].toFixed(2)}`;
        companion += `${i ? 'L':'M'}${q[0].toFixed(2)},${q[1].toFixed(2)}`;
        const froth=(Math.sin(i*9.7+seconds*.9)*1.7+Math.sin(i*2.3-seconds)*1.2)*(1-progress);
        const f=point(name,i/80,seconds,false,froth+2);
        foam+=`${i ? 'L':'M'}${f[0].toFixed(2)},${f[1].toFixed(2)}`;
        trough.push(point(name,i/80,seconds,false,24+Math.sin(i*.3-seconds*1.2)*8));
      }
      water=line;
      for(let i=trough.length-1;i>=0;i--){const p=trough[i];water+=`L${p[0].toFixed(2)},${p[1].toFixed(2)}`;}
      water+='Z';
      const group = groups[name];
      group.water.setAttribute('d',water);group.water.style.opacity=String(1-progress);
      group.foam.setAttribute('d',foam);group.foam.style.opacity=String((1-progress)*.64);
      group.foam.style.strokeDashoffset=String(-seconds*(name==='inner'?22:17));
      group.line.setAttribute('d',line); group.halo.setAttribute('d',line);
      group.glint.setAttribute('d',line); group.companion.setAttribute('d',companion);
      group.glint.style.strokeDashoffset = String(-seconds * (name === 'inner' ? 18 : 12));
      const list = nodes[name] || [];
      list.forEach((node,index) => {
        // Leave room for the first touch target when the portrait camera tracks.
        const homeStart=width<height?.30:.27;
        const homeT = list.length === 1 ? .52 : homeStart + index * (.78-homeStart) / (list.length-1);
        const firstT = height < 760 ? .28 : .22;
        const detailT = list.length === 1 ? .5 : firstT + index * (1-2*firstT) / (list.length-1);
        const t = lerp(homeT,detailT,progress);
        const p = point(name,t,seconds);
        node.style.transform = `translate3d(${(p[0]-22).toFixed(2)}px,${(p[1]-22).toFixed(2)}px,0) scale(${p[2].toFixed(5)})`;
      });
    });
  }
  function drawBirds(seconds){
    const three=window.coast3D;
    for(const bird of birds){
      if(!three?.active){bird.element.style.removeProperty('transform');continue;}
      const phase=seconds*Math.PI*2/13+bird.index*.9;
      const drift=motion.matches?0:Math.sin(phase);
      const anchor=three.skyAnchor(bird.x+drift*6.5,bird.y-drift*4,bird.depth),p=three.projectWorld(anchor);
      bird.element.style.transform=`translate3d(${(p.x-bird.x).toFixed(3)}px,${(p.y-bird.y).toFixed(3)}px,0) scale(${p.scale.toFixed(5)}) rotate(${(drift*3).toFixed(3)}deg)`;
    }
  }
  function drawSea(now) {
    if (!ctx) return;
    ctx.clearRect(0,0,width,height);
    if (progress >= .999) return;
    const seconds = motion.matches ? 0 : now / 1000;
    const lamp=window.coastCinema.lamp(),lightX=lamp.x,lightY=lamp.y;
    const nodeRect = hoverNode?.getBoundingClientRect(),stageRect=stage.getBoundingClientRect();
    const selected = Boolean(nodeRect);
    const overSea = pointer.active && pointer.y > height*.46;
    const aim = nodeRect ? {x:nodeRect.left+nodeRect.width/2-stageRect.left,y:nodeRect.top+nodeRect.height/2-stageRect.top} : overSea ? pointer : null;
    const sweep=Math.PI+.06+Math.sin(seconds*.22)*.12;
    const desired=aim||{x:lightX+Math.cos(sweep)*width*.8,y:lightY+Math.sin(sweep)*width*.8};
    // Follow elapsed time so the theme light settles equally on slower GPUs.
    const elapsed = lastLightFrame ? Math.min(250,now-lastLightFrame) : 33;
    lastLightFrame = now;
    const blend = motion.matches ? 1 : 1-Math.exp(-elapsed/190);
    if(!beamTarget)beamTarget={...desired};
    beamTarget.x=lerp(beamTarget.x,desired.x,blend);beamTarget.y=lerp(beamTarget.y,desired.y,blend);
    beamAngle=Math.atan2(beamTarget.y-lightY,beamTarget.x-lightX);
    const hex = hoverNode?.dataset.lightColor || '#f8dea9';
    let rgb = hex.match(/[a-f\d]{2}/gi).map(c=>parseInt(c,16));
    if(selected){const mean=rgb.reduce((a,b)=>a+b,0)/3;rgb=rgb.map(v=>Math.max(0,Math.min(255,mean+(v-mean)*2.25)));}
    beamColor = beamColor.map((c,i)=>lerp(c,rgb[i],blend));
    window.coastCinema.setLight(hex);
    window.coast3D?.aim(beamTarget.x,beamTarget.y,beamColor,selected);
    beamLength = Math.hypot(beamTarget.x-lightX,beamTarget.y-lightY)+125;
    beamSpread = lerp(beamSpread,selected?82:aim?145:height*.1,blend);
    const tint = beamColor.map(Math.round).join(',');
    stage.dataset.lightTarget = hoverNode?.dataset.nodeId || '';
    stage.dataset.lightColor = hex;
    stage.dataset.lightMode = selected ? 'node' : aim ? 'sea' : 'sweep';
    stage.dataset.lightX=beamTarget.x.toFixed(2);stage.dataset.lightY=beamTarget.y.toFixed(2);
    ctx.save();ctx.translate(lightX,lightY);ctx.rotate(beamAngle);
    const beam = ctx.createLinearGradient(0,0,beamLength,0);
    beam.addColorStop(0,`rgba(${tint},${selected ? .65 : .27})`);
    beam.addColorStop(.60,`rgba(${tint},${selected ? .37 : aim ? .14 : .055})`);
    beam.addColorStop(.85,`rgba(${tint},${selected ? .32 : aim ? .12 : .025})`);
    beam.addColorStop(1,`rgba(${tint},0)`);
    ctx.fillStyle=beam;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(beamLength,-beamSpread);ctx.lineTo(beamLength,beamSpread);ctx.closePath();ctx.fill();
    if(aim){ctx.strokeStyle=`rgba(${tint},.13)`;ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(beamLength*.94,0);ctx.stroke();}
    ctx.restore();
    if(aim&&!window.coast3D?.active){
      const poolRadius=selected?150:195;
      const pool=ctx.createRadialGradient(beamTarget.x,beamTarget.y,0,beamTarget.x,beamTarget.y,poolRadius);
      pool.addColorStop(0,`rgba(${tint},${selected ? .65 : .29})`);pool.addColorStop(.35,`rgba(${tint},${selected ? .35 : .16})`);pool.addColorStop(1,`rgba(${tint},0)`);
      ctx.save();ctx.translate(beamTarget.x,beamTarget.y);ctx.scale(1,selected?.44:.38);ctx.translate(-beamTarget.x,-beamTarget.y);
      ctx.fillStyle=pool;ctx.fillRect(beamTarget.x-poolRadius,beamTarget.y-poolRadius,poolRadius*2,poolRadius*2);ctx.restore();
    }
    const glow = ctx.createRadialGradient(lightX,lightY,0,lightX,lightY,42);
    glow.addColorStop(0,`rgba(${tint},.4)`);glow.addColorStop(1,`rgba(${tint},0)`);
    ctx.fillStyle=glow;ctx.fillRect(lightX-42,lightY-42,84,84);
    // Three.js renders highlights and ripples on the actual surface. The screen
    // painting below is only needed by the flat fallback ocean.
    if(window.coast3D?.active)return;
    // Low, horizontal water highlights; deterministic phases avoid noisy flicker.
    ctx.save();ctx.beginPath();ctx.rect(0,height*.48,width*(width<=640?.70:.69),height*.52);ctx.clip();
    for(let row=0;row<27;row++) {
      const depth=row/27,y=height*(.465+depth*depth*.54);
      for(let col=0;col<5;col++){
        const x=(col/5+Math.sin(row*9.3)*.06)*width*.76;
        const length=width*(.04+depth*.065), amplitude=.3+depth*3.5;
        ctx.strokeStyle=`rgba(161,203,211,${(.035+depth*.025)*(1+Math.sin(seconds*.55+row+col)*.45)})`;
        ctx.lineWidth=.5+depth*.65;ctx.beginPath();
        for(let j=0;j<=12;j++){const px=x+j/12*length,py=y+Math.sin(j*.45+row+seconds*.5)*amplitude;j?ctx.lineTo(px,py):ctx.moveTo(px,py);}
        ctx.stroke();
      }
    }
    ripples = ripples.filter(r => now-r.start < 2400);
    ripples.forEach(r => {
      const t=(now-r.start)/2400, radius=9+t*(r.strong?100:54), alpha=(1-t)*.32;
      ctx.strokeStyle=`rgba(187,222,227,${alpha})`;ctx.lineWidth=1-t*.7;
      ctx.beginPath();ctx.ellipse(r.x,r.y,radius,radius*.28,0,0,Math.PI*2);ctx.stroke();
      if(r.strong){ctx.strokeStyle=`rgba(187,222,227,${alpha*.5})`;ctx.beginPath();ctx.ellipse(r.x,r.y,radius*.65,radius*.18,0,0,Math.PI*2);ctx.stroke();}
    });
    if(pointer.active && pointer.y > height*.48){
      const halo=ctx.createRadialGradient(pointer.x,pointer.y,0,pointer.x,pointer.y,100);
      halo.addColorStop(0,'rgba(151,214,224,.075)');halo.addColorStop(1,'rgba(151,214,224,0)');
      ctx.fillStyle=halo;ctx.fillRect(pointer.x-100,pointer.y-100,200,200);
    }
    ctx.restore();
  }
  function draw(now) {
    if(transition){
      const t=Math.max(0,Math.min(1,(now-transition.start)/transition.duration));
      progress=lerp(transition.from,transition.to,ease(t));
      if(t===1)transition=null;
    }
    stage.dataset.progress=progress.toFixed(3);
    if(progress!==previousProgress){stage.parentElement.style.setProperty('--journey',progress.toFixed(5));previousProgress=progress;}
    const three=window.coast3D,arrival=Number(stage.parentElement.style.getPropertyValue('--arrival')||1);
    if(three?.active){
      const canMove=target===0&&progress===0&&arrival>=1&&!document.querySelector('#site-shell').inert&&!document.body.classList.contains('is-fragmenting');
      three.updateCamera(now,canMove);
      three.setEnvironment(motion.matches?0:now,arrival,progress);
    }
    drawTides(motion.matches?0:now/1000);
    drawBirds(motion.matches?0:now/1000);
    if(!three?.active&&progress<1)fallbackOcean().draw(motion.matches?0:now/1000);
    drawSea(now);
    if(three?.active&&progress<1)three.flush();
  }
  function active(){return !disposed && !document.hidden && (target===1 || scroll<height+400);}
  function loop(now){
    frame=0;
    if(!active())return;
    if(transition || now-last>32){draw(now);last=now;}
    if(transition || !motion.matches)frame=requestAnimationFrame(loop);
  }
  function resume(){if(active()&&!frame){draw(performance.now());if(transition||!motion.matches)frame=requestAnimationFrame(loop);}}
  function resize(){
    const bounds=stage.getBoundingClientRect();width=bounds.width;height=bounds.height;
    const dpr=Math.min(devicePixelRatio||1,2);
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
    if(ctx)ctx.setTransform(dpr,0,0,dpr,0,0);
    svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
    if(!window.coast3D?.active)fallbackOcean().resize(width,height);
    configure();draw(performance.now());resume();
  }
  function onScroll(){scroll=window.scrollY;stage.style.transform=`translate3d(0,${target===1?0:-Math.min(scroll*.16,height+1)}px,0)`;stage.parentElement.style.setProperty('--coast-scroll',String(Math.min(1,scroll/height)));stage.classList.toggle('is-offscreen',target===0&&scroll>=height+400);resume();}
  function ripple(x,y,strong=false){if(motion.matches||target===1||scroll>height*.1)return;const now=performance.now();ripples.push({x,y,start:now,strong});window.coast3D?.ripple(x,y,now);if(ripples.length>18)ripples.shift();resume();}
  function nearestNode(x,y){
    const range=width<=640?56:width<=1000?64:72;
    let nearest=null, distance=Infinity;
    const candidates=[...(nodes.inner||[]),...(nodes.outer||[])];
    candidates.forEach(node=>{
      const rect=node.getBoundingClientRect();
      if(!rect.width||!rect.height)return;
      const currentDistance=Math.hypot(x-(rect.left+rect.width/2),y-(rect.top+rect.height/2));
      // Keep the current target a little longer so the light does not chatter at the edge.
      const limit=node===hoverNode?range+16:range;
      if(currentDistance<=limit&&currentDistance<distance){nearest=node;distance=currentDistance;}
    });
    return nearest;
  }
  function highlight(node){if(node===hoverNode)return;hoverNode?.classList.remove('is-lit');hoverNode=node;hoverNode?.classList.add('is-lit');}
  function onPointer(event){
    if(target===1||scroll>height*.1||document.body.classList.contains('booting'))return;
    const bounds=stage.getBoundingClientRect();
    pointer={x:event.clientX-bounds.left,y:event.clientY-bounds.top,active:true};
    if(event.pointerType!=='touch')window.coast3D?.pointer(pointer.x/width,pointer.y/height);
    highlight(event.target.closest('button,a')&&!event.target.closest('.sea-node')?null:event.target.closest('.sea-node')||nearestNode(event.clientX,event.clientY));
    if(event.clientY>height*.48&&performance.now()-lastRipple>130){ripple(event.clientX,event.clientY);lastRipple=performance.now();}
    resume();
  }
  function onPress(event){if(!event.target.closest('a,button')&&event.clientY>height*.48)ripple(event.clientX,event.clientY,true);}
  function onLeave(){pointer.active=false;window.coast3D?.pointer(.5,.5);highlight(null);resume();}
  function onFocus(event){if(target===0){highlight(event.target.closest('.sea-node'));resume();}}
  function onBlur(event){if(event.target.closest('.sea-node')){highlight(null);resume();}}
  function onMotion(){if(motion.matches){progress=target;transition=null;ripples=[];}draw(performance.now());resume();}
  function refreshNodes(){nodes={inner:[...document.querySelectorAll('#inner-nodes .sea-node:not([hidden])')],outer:[...document.querySelectorAll('#outer-nodes .sea-node:not([hidden])')]};draw(performance.now());}
  window.addEventListener('resize',resize);
  window.addEventListener('scroll',onScroll,{passive:true});
  window.addEventListener('pointermove',onPointer,{passive:true});
  window.addEventListener('pointerdown',onPress,{passive:true});
  document.addEventListener('pointerleave',onLeave);
  document.addEventListener('focusin',onFocus);
  document.addEventListener('focusout',onBlur);
  document.addEventListener('visibilitychange',resume);
  window.addEventListener('coast3dfallback',resize);
  motion.addEventListener('change',onMotion);
  configure();refreshNodes();resize();
  return {
    setMode(detail,instant=false){
      target=detail?1:0;pointer.active=false;highlight(null);
      if(instant||motion.matches){progress=target;transition=null;}
      else transition={from:progress,to:target,start:performance.now(),duration:1250};
      stage.dataset.lightTarget='';
      onScroll();draw(performance.now());resume();
    },
    refreshNodes,
    destroy(){disposed=true;ocean?.destroy();cancelAnimationFrame(frame);window.removeEventListener('resize',resize);window.removeEventListener('scroll',onScroll);window.removeEventListener('pointermove',onPointer);window.removeEventListener('pointerdown',onPress);window.removeEventListener('coast3dfallback',resize);document.removeEventListener('pointerleave',onLeave);document.removeEventListener('focusin',onFocus);document.removeEventListener('focusout',onBlur);document.removeEventListener('visibilitychange',resume);motion.removeEventListener('change',onMotion);}
  };
};
