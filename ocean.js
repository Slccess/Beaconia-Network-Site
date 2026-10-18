/* A projected water surface. No textures, imports or network dependencies. */
window.createOcean = function (canvas, {forceCanvas=false} = {}) {
  let gl=null, context=null, lost=false, width=1, height=1;
  const original=canvas;
  function fallback(){
    const replacement=document.createElement('canvas');replacement.id=canvas.id;replacement.className=canvas.className;replacement.dataset.renderer='canvas';
    canvas.replaceWith(replacement);canvas=replacement;context=canvas.getContext('2d');lost=true;gl=null;resize(width,height);
  }
  try { if(!forceCanvas)gl=canvas.getContext('webgl',{alpha:true,antialias:false,powerPreference:'low-power',premultipliedAlpha:false}); } catch {}
  const vertex='attribute vec2 position;varying vec2 uv;void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}';
  const fragment=`precision mediump float;
    varying vec2 uv;uniform float time;uniform float aspect;
    float water(vec2 p){return sin(p.x*1.7+p.y*.7-time*.85)*.19+sin(p.y*2.7-p.x*.6-time*1.2)*.10+sin(p.x*4.1+p.y*3.2-time*1.5)*.038;}
    void main(){
      float sy=1.-uv.y, h=.454;
      if(sy<h){gl_FragColor=vec4(0.);return;}
      float d=sy-h, z=1./(d+.09);
      vec2 p=vec2((uv.x-.5)*aspect*z*2.,z*1.8);
      float w=water(p), e=.045;
      vec3 n=normalize(vec3((water(p-vec2(e,0.))-water(p+vec2(e,0.)))/e,1.8,(water(p-vec2(0.,e))-water(p+vec2(0.,e)))/e));
      vec3 base=mix(vec3(.24,.44,.49),vec3(.055,.25,.32),smoothstep(0.,.52,d));
      float sheen=pow(max(0.,dot(n,normalize(vec3(-.25,1.,.4)))),9.);
      float ribbons=smoothstep(.09,.3,w)*(.4+.6*sheen);
      base+=vec3(.07,.17,.18)*ribbons;
      float spec=pow(max(0.,dot(n,normalize(vec3(.3,1.,.25)))),28.);
      float path=exp(-pow((uv.x-.73)/(d*.32+.03),2.));
      base+=vec3(.42,.25,.12)*spec*path*(.32+.4*(1.-d));
      float lace=smoothstep(.253,.30,w)*smoothstep(.2,.5,d)*.20;
      base+=vec3(.35,.48,.44)*lace;
      base=mix(base,vec3(.53,.65,.65),exp(-d*50.)*.55);
      gl_FragColor=vec4(base,1.);
    }`;
  let program, clock, ratio;
  function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
  if(gl){
    try{
      program=gl.createProgram();const vs=shader(gl.VERTEX_SHADER,vertex),fs=shader(gl.FRAGMENT_SHADER,fragment);
      gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Water shader link failed');
      gl.useProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);
      const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
      const pos=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
      clock=gl.getUniformLocation(program,'time');ratio=gl.getUniformLocation(program,'aspect');
      canvas.dataset.renderer='webgl';
    }catch{fallback();}
  }else{context=canvas.getContext('2d');canvas.dataset.renderer='canvas';}
  const onLoss=event=>{event.preventDefault();fallback();};
  original.addEventListener('webglcontextlost',onLoss);
  function resize(w,h){width=w;height=h;const dpr=Math.min(devicePixelRatio||1,1.5,1024/w,900/h);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);if(gl)gl.viewport(0,0,canvas.width,canvas.height);else context?.setTransform(dpr,0,0,dpr,0,0);}
  function draw(seconds){
    if(gl&&!lost){gl.uniform1f(clock,seconds);gl.uniform1f(ratio,width/height);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);return;}
    if(!context)return;
    const ctx=context, horizon=height*.454;ctx.clearRect(0,0,width,height);
    const sea=ctx.createLinearGradient(0,horizon,0,height);sea.addColorStop(0,'#608a91');sea.addColorStop(.3,'#306e7a');sea.addColorStop(1,'#143f50');ctx.fillStyle=sea;ctx.fillRect(0,horizon,width,height-horizon);
    for(let row=0;row<38;row++){const depth=row/38,y=horizon+depth*depth*(height-horizon);ctx.beginPath();for(let x=0;x<=width;x+=14){const py=y+Math.sin(x*.018+row-seconds*1.3)*depth*6;(x?ctx.lineTo(x,py):ctx.moveTo(x,py));}ctx.strokeStyle=`rgba(175,217,214,${.08+depth*.1})`;ctx.lineWidth=.5+depth;ctx.stroke();}
  }
  return {resize,draw,destroy(){original.removeEventListener('webglcontextlost',onLoss);if(gl&&program)gl.deleteProgram(program);}};
};
