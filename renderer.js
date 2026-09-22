/* WILDLANDS — original, dependency-free WebGL 2 voxel renderer. */
(function () {
  'use strict';
  const V = window.Voxel = window.Voxel || {};
  const CS = 16, H = 96;
  const faces = [
    {n:[1,0,0],v:[[1,0,0],[1,1,0],[1,1,1],[1,0,1]]},
    {n:[-1,0,0],v:[[0,0,1],[0,1,1],[0,1,0],[0,0,0]]},
    {n:[0,1,0],v:[[0,1,1],[1,1,1],[1,1,0],[0,1,0]]},
    {n:[0,-1,0],v:[[0,0,0],[1,0,0],[1,0,1],[0,0,1]]},
    {n:[0,0,1],v:[[1,0,1],[1,1,1],[0,1,1],[0,0,1]]},
    {n:[0,0,-1],v:[[0,0,0],[0,1,0],[1,1,0],[1,0,0]]}
  ];
  const norm = a => {const d = Math.hypot(...a)||1; return a.map(x=>x/d);};
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  function multiply(a,b) {const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o;}
  function perspective(fov,aspect,near,far) {const f=1/Math.tan(fov/2),a=new Float32Array(16);a[0]=f/aspect;a[5]=f;a[10]=(far+near)/(near-far);a[11]=-1;a[14]=2*far*near/(near-far);return a;}
  function lookAt(eye,target,up) {const z=norm(eye.map((e,i)=>e-target[i])),x=norm(cross(up,z)),y=cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);}
  function ortho(l,r,b,t,n,f) {return new Float32Array([2/(r-l),0,0,0,0,2/(t-b),0,0,0,0,-2/(f-n),0,-(r+l)/(r-l),-(t+b)/(t-b),-(f+n)/(f-n),1]);}
  const vertex = `#version 300 es
  precision highp float;
  layout(location=0) in vec3 aPos;
  layout(location=1) in vec3 aNormal;
  layout(location=2) in vec2 aUV;
  layout(location=3) in float aAO;
  layout(location=4) in float aType;
  uniform mat4 uVP; uniform mat4 uLight; uniform float uTime;
  out vec3 vPos; out vec3 vNormal; out vec2 vUV; out float vAO; flat out int vType; out vec4 vShadow;
  void main(){vec3 p=aPos;
    if(aType==18.0||aType==15.0) p.x+=sin(uTime*1.7+p.x*.52+p.z*.39)*.065*fract(p.y);
    vPos=p;vNormal=aNormal;vUV=aUV;vAO=aAO;vType=int(aType);vShadow=uLight*vec4(p,1.);gl_Position=uVP*vec4(p,1.);
  }`;
  const fragment = `#version 300 es
  precision highp float;
  in vec3 vPos; in vec3 vNormal; in vec2 vUV; in float vAO; flat in int vType; in vec4 vShadow;
  uniform sampler2D uAtlas; uniform sampler2D uShadow;
  uniform vec3 uEye; uniform vec3 uSun; uniform float uDay; uniform float uTime; uniform float uFog; uniform bool uShadows; uniform float uShadowSize;
  out vec4 frag;
  vec3 horizon(){return mix(vec3(.035,.055,.095),vec3(.69,.80,.82),uDay);}
  float shadow(){if(!uShadows)return 1.;vec3 p=vShadow.xyz/vShadow.w*.5+.5;
    if(p.x<.002||p.x>.998||p.y<.002||p.y>.998||p.z>1.)return 1.;
    float bias=max(.00018,.0007*(1.-dot(vNormal,uSun))),s=0.;
    for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)s+=(p.z-bias>texture(uShadow,p.xy+vec2(x,y)/uShadowSize).r)?0.:1.;
    return mix(1.,s/9.,1.-smoothstep(.36,.49,max(abs(p.x-.5),abs(p.y-.5))));
  }
  void main(){vec4 tex=texture(uAtlas,vUV);if(tex.a<.3)discard;
    vec3 n=normalize(vNormal);float direct=max(0.,dot(n,uSun));float sh=shadow();
    float hemi=.66+.34*n.y;vec3 ambient=mix(vec3(.14,.19,.3),vec3(.55,.64,.68),uDay)*hemi;
    vec3 sunlight=vec3(1.04,.96,.76)*direct*sh*uDay*.79;
    vec3 color=tex.rgb*(ambient+sunlight)*(.52+.48*vAO);
    float alpha=1.;
    if(vType==11){
      vec3 view=normalize(uEye-vPos);vec3 wn=normalize(n+vec3(sin(vPos.x*1.1+uTime*1.4)*.075,0.,cos(vPos.z*.9+uTime*1.1)*.075));
      float fres=pow(1.-max(dot(view,wn),0.),3.);float sparkle=pow(max(dot(reflect(-uSun,wn),view),0.),100.);
      float wave=sin(vPos.x*2.6+vPos.z*1.5+uTime*1.4)*sin(vPos.z*2.8-uTime*.7);
      color=mix(vec3(.10,.40,.46)*(ambient+sunlight*.4),horizon(),fres*.76)+sparkle*vec3(1.,.9,.64)*sh*.75+wave*.022;
      alpha=.68+fres*.22;
    }else if(vType==9){color=mix(color,horizon(),.3);alpha=.28+tex.r*.3;}
    else if(vType==17){color=max(color,tex.rgb*vec3(1.5,1.2,.6));}
    float dist=length(vPos-uEye);float fog=smoothstep(uFog*.42,uFog*1.10,dist);fog*=fog;
    color=mix(color,horizon(),clamp(fog,0.,1.));
    // Gentle filmic contrast, retaining the intentionally crisp pixel textures.
    color=pow(max(color,vec3(0.)),vec3(.94));frag=vec4(color,alpha);
  }`;
  const shadowVertex = `#version 300 es
  precision highp float;layout(location=0)in vec3 aPos;layout(location=2)in vec2 aUV;
  uniform mat4 uVP;out vec2 vUV;void main(){vUV=aUV;gl_Position=uVP*vec4(aPos,1.);}`;
  const shadowFragment = `#version 300 es
  precision highp float;in vec2 vUV;uniform sampler2D uAtlas;void main(){if(texture(uAtlas,vUV).a<.3)discard;}`;
  const skyVertex = `#version 300 es
  precision highp float;out vec2 vScreen;void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);vScreen=p*2.-1.;gl_Position=vec4(vScreen,1.,1.);}`;
  const skyFragment = `#version 300 es
  precision highp float;in vec2 vScreen;out vec4 frag;
  uniform vec3 uForward;uniform vec3 uRight;uniform vec3 uUp;uniform vec3 uEye;uniform vec3 uSun;
  uniform float uAspect;uniform float uTan;uniform float uDay;uniform float uTime;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
  void main(){vec3 d=normalize(uForward+vScreen.x*uRight*uAspect*uTan+vScreen.y*uUp*uTan);
    vec3 hor=mix(vec3(.035,.055,.095),vec3(.69,.80,.82),uDay),zen=mix(vec3(.008,.018,.046),vec3(.27,.54,.76),uDay);
    vec3 col=mix(hor,zen,pow(max(d.y,0.),.6));float s=max(dot(d,uSun),0.);
    col+=vec3(1.,.67,.30)*pow(s,10.)*.19*uDay;
    vec3 sunRight=normalize(cross(uSun,vec3(0,1,0))),sunUp=cross(sunRight,uSun);
    float sunBox=max(abs(dot(d,sunRight)),abs(dot(d,sunUp)));
    if(dot(d,uSun)>.99&&sunBox<.033)col=mix(vec3(.65,.7,.8),vec3(1.,.98,.78),uDay);
    col+=vec3(1.,.8,.48)*pow(s,300.)*.5*uDay;
    if(d.y>0.){
      vec2 starCell=floor(d.xz/(d.y+.2)*420.);float star=step(.9983,hash(starCell));col+=star*pow(1.-uDay,4.)*.65;
      vec2 p=(uEye.xz+d.xz*(115.-uEye.y)/max(d.y,.001)+vec2(uTime*.7,0.))/34.;
      vec2 q=floor(p*5.)/5.;float cloud=noise(q*.68)+noise(q*1.7)*.33;
      float amount=step(.69,cloud);float fade=smoothstep(.015,.14,d.y)*(1.-smoothstep(3.,15.,length(p)*.025));
      vec3 c=mix(vec3(.12,.15,.22),vec3(.95,.94,.84),uDay);c*=.88+.12*step(.73,cloud);
      col=mix(col,c,amount*fade*.94);
    }
    frag=vec4(col,1.);
  }`;
  const lineVertex=`#version 300 es
  precision highp float;layout(location=0)in vec3 aPos;uniform mat4 uVP;void main(){gl_Position=uVP*vec4(aPos,1.);}`;
  const lineFragment=`#version 300 es
  precision highp float;uniform vec4 uColor;out vec4 frag;void main(){frag=uColor;}`;
  function program(gl,vs,fs) {const p=gl.createProgram();for(const [type,src]of [[gl.VERTEX_SHADER,vs],[gl.FRAGMENT_SHADER,fs]]){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));gl.attachShader(p,s);gl.deleteShader(s);}gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;}
  function atlas(gl) {
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=64;
    const ctx=canvas.getContext('2d'),data=ctx.createImageData(128,64);
    const rgb=['#6b973e','#796044','#846344','#858c8a','#d5c493','#725333','#b08c57','#507f34','#af8750','#818885','#bbdedb','#ae7154','#378c9c','#8b918e','#96918a','#ebeee5','#b6bda7','#464b51','#efb84a','#da845c','#6e913d','#d89586','#252a26','#c89e70'];
    const colors=rgb.map(c=>[parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)]);
    const rnd=(x,y,s)=>{let n=Math.imul(x+31,374761393)^Math.imul(y+19,668265263)^Math.imul(s+1,1274126177);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
    for(let t=0;t<rgb.length;t++)for(let y=0;y<16;y++)for(let x=0;x<16;x++){
      let col=colors[t].slice(),v=(rnd(x,y,t)-.5)*.19+(rnd(x>>1,y>>1,t)-.5)*.12,a=255;
      if(t===0){v+=(rnd(x>>2,y>>1,2)-.5)*.09;}
      if(t===1&&y<3+Math.floor(rnd(x>>1,0,8)*3)){col=colors[0].slice();v-=.03;}
      if(t===5){v+=(x%4===0?-.17:0)+(rnd(x,1,4)-.5)*.2;}
      if(t===6){const d=Math.max(Math.abs(x-7.5),Math.abs(y-7.5));v+=Math.sin(d*2.8)*.12;}
      if(t===7){v+=(rnd(x>>1,y>>1,8)-.5)*.33;if(rnd(x>>1,y>>1,11)>.86)a=0;}
      if(t===8){if(y%4===0)v-=.20;if((x+(y>>2)*7)%16===0)v-=.18;v+=(rnd(x>>2,y,9)-.5)*.12;}
      if(t===9){if(y%5===0||(x+Math.floor(y/5)*4)%7===0)v-=.2;else if(y%5===1)v+=.08;}
      if(t===10){v=0;if(x===0||y===0||x===15||y===15)v=-.25;else if(Math.abs(x-y-3)<1)v=.13;else v=-.04;}
      if(t===11){if(y%4===0||(x+(y>>2)*4)%8===0){col=[170,151,125];v=-.08;}}
      if(t===12){v=(rnd(x>>2,y>>1,t)-.5)*.08;}
      if(t===13||t===14){if(rnd(x>>1,y>>1,t)>.68){col=t===13?[44,49,47]:[176,131,90];v-=.1;}}
      if(t===16&&y<5){col=colors[15].slice();}
      if(t===18){if(y<6){col=y<3?[255,224,122]:[234,160,41];}else{col=[136,98,57];}}
      if(t===19){a=0;if(x>=7&&x<=8&&y>5){col=[58,112,47];a=255;}if(y>8&&((x>=4&&x<=6&&y<12)||(x>=9&&x<=11&&y>11))){col=[88,142,51];a=255;}if((Math.abs(x-7.5)+Math.abs(y-4))<4){col=(Math.abs(x-7.5)+Math.abs(y-4))<1.5?[248,207,102]:[241,222,177];a=255;}}
      if(t===20){a=0;const yy=15-y;if((Math.abs(x-7+yy*.20)<1&&yy<13)||(Math.abs(x-11+yy*.39)<1&&yy<9)||(Math.abs(x-3-yy*.31)<1&&yy<7))a=255;}
      const idx=((t%8)*16+x+((Math.floor(t/8)*16+y)*128))*4;
      for(let i=0;i<3;i++)data.data[idx+i]=Math.max(0,Math.min(255,col[i]*(1+v)));data.data[idx+3]=a;
    }
    ctx.putImageData(data,0,0);const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return tex;
  }
  function tile(id,face){if(id===1)return face===2?0:face===3?2:1;if(id===5)return face===2||face===3?6:5;if(id===14)return face===2?15:face===3?2:16;return ({2:2,3:3,4:4,6:7,7:8,8:9,9:10,10:11,11:12,12:13,13:14,15:19,16:17,17:18,18:20})[id]??3;}
  function uvFor(t,i){const uv=[[0,1],[0,0],[1,0],[1,1]][i];return [((t%8)*16+.03+uv[0]*15.94)/128,(Math.floor(t/8)*16+.03+uv[1]*15.94)/64];}
  class Renderer {
    constructor(canvas,world){
      this.canvas=canvas;const gl=this.gl=canvas.getContext('webgl2',{antialias:true,alpha:false,powerPreference:'high-performance',preserveDrawingBuffer:true});
      if(!gl)throw Error('WebGL 2 is needed to explore this world. Please enable hardware acceleration in your browser.');
      this.settings={quality:'high',renderDistance:7};this.meshes=new Map();this.stats={fps:0,chunks:0,triangles:0};this.frame=0;this.lastShadow=-100;this.shadowDirty=true;this.world=world;this.heldBlock=1;this.fauna=V.Fauna?new V.Fauna(world):null;this.faunaRevision=-1;
      this.main=program(gl,vertex,fragment);this.depth=program(gl,shadowVertex,shadowFragment);this.sky=program(gl,skyVertex,skyFragment);this.line=program(gl,lineVertex,lineFragment);
      this.uniforms=new Map();this.texture=atlas(gl);this.emptyVAO=gl.createVertexArray();this.lineVAO=gl.createVertexArray();this.lineBuffer=gl.createBuffer();gl.bindVertexArray(this.lineVAO);gl.bindBuffer(gl.ARRAY_BUFFER,this.lineBuffer);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,12,0);gl.bindVertexArray(null);
      this.initShadow(1536);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.clearColor(.69,.8,.82,1);
      this.resize();window.addEventListener('resize',()=>this.resize());
      canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();window.UI?.toast('Graphics were interrupted. Reload to restore your saved world.');});
    }
    uniform(p,name){const k=p===this.main?'main':p===this.depth?'depth':p===this.sky?'sky':'line';const key=k+name;if(!this.uniforms.has(key))this.uniforms.set(key,this.gl.getUniformLocation(p,name));return this.uniforms.get(key);}
    setWorld(world){for(const m of this.meshes.values())this.deleteMesh(m);this.meshes.clear();this.world=world;this.fauna?.setWorld(world);this.faunaRevision=-1;this.shadowDirty=true;}
    setSettings(settings){Object.assign(this.settings,settings);this.settings.renderDistance=Math.max(3,Math.min(10,Number(this.settings.renderDistance)||7));this.resize();this.shadowDirty=true;}
    resize(){let quality=this.settings.quality;const scale=quality==='low'?.75:quality==='medium'?1:Math.min(window.devicePixelRatio||1,1.5);this.canvas.width=Math.round(window.innerWidth*scale);this.canvas.height=Math.round(window.innerHeight*scale);}
    initShadow(size){const gl=this.gl;this.shadowSize=size;this.shadowTex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.shadowTex);gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,size,size,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);this.shadowFBO=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,this.shadowFBO);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,this.shadowTex,0);gl.drawBuffers([gl.NONE]);gl.readBuffer(gl.NONE);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Could not initialize lighting.');gl.bindFramebuffer(gl.FRAMEBUFFER,null);}
    deleteMesh(mesh){const gl=this.gl;for(const m of[mesh.opaque,mesh.water])if(m){gl.deleteVertexArray(m.vao);gl.deleteBuffer(m.buffer);}}
    upload(array){if(!array.length)return null;const gl=this.gl,vao=gl.createVertexArray(),buffer=gl.createBuffer();gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(array),gl.STATIC_DRAW);let offset=0;for(const[i,size]of [3,3,2,1,1].entries()){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,size,gl.FLOAT,false,40,offset*4);offset+=size;}gl.bindVertexArray(null);return{vao,buffer,count:array.length/10};}
    updateDynamic(array,mesh){if(!mesh)return this.upload(array);const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);gl.bufferData(gl.ARRAY_BUFFER,array instanceof Float32Array?array:new Float32Array(array),gl.DYNAMIC_DRAW);mesh.count=array.length/10;return mesh;}
    buildChunk(cx,cz){
      const world=this.world,near=[];for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)near[(dx+1)+(dz+1)*3]=world.ensureChunk(cx+dx,cz+dz);
      const chunk=world.ensureChunk(cx,cz),baseX=cx*CS,baseZ=cz*CS,opaque=[],water=[];
      const sample=(x,y,z)=>{if(y<0)return 16;if(y>=H)return 0;const c=near[(Math.floor((x-baseX)/CS)+1)+(Math.floor((z-baseZ)/CS)+1)*3];return c?c.data[(x&15)+CS*((z&15)+CS*y)]:0;};
      const occludes=id=>id!==0&&id!==11&&id!==9&&id!==15&&id!==17;
      const emit=(arr,corners,n,t,type,ao=[1,1,1,1])=>{for(const j of[0,1,2,0,2,3]){const uv=uvFor(t,j);arr.push(...corners[j],...n,...uv,ao[j],type);}};
      for(let y=0;y<H;y++)for(let z=0;z<CS;z++)for(let x=0;x<CS;x++){
        const id=chunk.data[x+CS*(z+CS*y)];if(!id)continue;const wx=baseX+x,wz=baseZ+z;
        if(id===15){const t=19;for(let axis=0;axis<2;axis++){const c=axis?[[wx+.1,y,wz+.9],[wx+.1,y+.8,wz+.9],[wx+.9,y+.8,wz+.1],[wx+.9,y,wz+.1]]:[[wx+.1,y,wz+.1],[wx+.1,y+.8,wz+.1],[wx+.9,y+.8,wz+.9],[wx+.9,y,wz+.9]];emit(opaque,c,[0,1,0],t,id);emit(opaque,[...c].reverse(),[0,1,0],t,id);}continue;}
        for(let f=0;f<6;f++){
          const face=faces[f],n=face.n,neighbor=sample(wx+n[0],y+n[1],wz+n[2]);
          if(id===11){if(neighbor===11||occludes(neighbor))continue;}else if(id===9){if(neighbor===9||occludes(neighbor))continue;}else if(occludes(neighbor))continue;
          const corners=[],ao=[],axis=n.findIndex(v=>v!==0),tangent=[0,1,2].filter(i=>i!==axis);
          for(let j=0;j<4;j++){
            const c=face.v[j],p=[wx+c[0],y+c[1],wz+c[2]];
            if(id===11&&c[1]===1&&sample(wx,y+1,wz)!==11)p[1]-=.12;
            if(id===17){p[0]=wx+.41+c[0]*.18;p[2]=wz+.41+c[2]*.18;p[1]=y+c[1]*.72;}
            corners.push(p);
            const q=[wx+n[0],y+n[1],wz+n[2]],a=q.slice(),b=q.slice(),ab=q.slice();
            const sa=c[tangent[0]]?1:-1,sb=c[tangent[1]]?1:-1;a[tangent[0]]+=sa;b[tangent[1]]+=sb;ab[tangent[0]]+=sa;ab[tangent[1]]+=sb;
            const s1=occludes(sample(...a))?1:0,s2=occludes(sample(...b))?1:0,co=occludes(sample(...ab))?1:0;
            ao.push((3-(s1&&s2?3:s1+s2+co))/3);
          }
          emit(id===11||id===9?water:opaque,corners,n,tile(id,f),id,ao);
        }
        if(id===1&&!sample(wx,y+1,wz)){
          const h=(Math.imul(wx,73856093)^Math.imul(wz,19349663))>>>0;
          if(h%19===0){const yy=y+1.001,hh=.38+(h%5)*.06;for(let axis=0;axis<2;axis++){
            const c=axis?[[wx+.15,yy,wz+.85],[wx+.15,yy+hh,wz+.85],[wx+.85,yy+hh,wz+.15],[wx+.85,yy,wz+.15]]:[[wx+.15,yy,wz+.15],[wx+.15,yy+hh,wz+.15],[wx+.85,yy+hh,wz+.85],[wx+.85,yy,wz+.85]];emit(opaque,c,[0,1,0],20,18);emit(opaque,[...c].reverse(),[0,1,0],20,18);
          }}
        }
      }
      const key=`${cx},${cz}`;if(this.meshes.has(key))this.deleteMesh(this.meshes.get(key));
      this.meshes.set(key,{cx,cz,opaque:this.upload(opaque),water:this.upload(water)});world.dirty.delete(key);this.shadowDirty=true;
    }
    stream(position,forward){
      const cx=Math.floor(position[0]/16),cz=Math.floor(position[2]/16),r=this.settings.renderDistance,queue=[];
      for(let z=-r;z<=r;z++)for(let x=-r;x<=r;x++){const dist=Math.hypot(x,z);if(dist>r+.2)continue;const key=`${cx+x},${cz+z}`;if(!this.meshes.has(key)||this.world.dirty.has(key))queue.push({cx:cx+x,cz:cz+z,score:dist-(x*forward[0]+z*forward[2])*.32});}
      queue.sort((a,b)=>a.score-b.score);const begin=performance.now();let count=0;
      while(queue.length&&(count<1||performance.now()-begin<7)){const q=queue.shift();this.buildChunk(q.cx,q.cz);count++;}
      for(const[key,mesh]of this.meshes){if(Math.hypot(mesh.cx-cx,mesh.cz-cz)>r+2){this.deleteMesh(mesh);this.meshes.delete(key);}}
      // Generated chunks can be rebuilt from their seed and persistent edits.
      if(this.world.chunks.size>900)for(const[key,c]of this.world.chunks)if(Math.hypot(c.cx-cx,c.cz-cz)>r+4)this.world.chunks.delete(key);
      this.loading=1-queue.length/Math.max(1,Math.PI*r*r);return queue.length;
    }
    render(options){
      const gl=this.gl,p=options.position||[0,40,18],yaw=options.yaw||0,pitch=options.pitch||0,time=options.time||0,day=options.daylight??1;
      const forward=[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)],right=[Math.cos(yaw),0,Math.sin(yaw)],up=cross(right,forward);
      const pending=this.stream(p,forward),distance=this.settings.renderDistance*16;
      if(this.fauna){this.fauna.update(options.delta||1/60,p,time);const geo=this.fauna.geometry();if(this.faunaRevision!==this.fauna.revision){this.faunaMesh=this.updateDynamic(geo,this.faunaMesh);this.faunaRevision=this.fauna.revision;}}
      this.frame++;this.stats.chunks=this.meshes.size;this.stats.pending=pending;
      const aspect=this.canvas.width/this.canvas.height,fov=(options.fov||72)*Math.PI/180;
      const view=lookAt(p,p.map((a,i)=>a+forward[i]),[0,1,0]);const vp=multiply(perspective(fov,aspect,.06,distance*2.4),view);
      const sun=norm([-.48,.72,-.36]);
      const center=[Math.round((p[0]+forward[0]*16)/4)*4,25,Math.round((p[2]+forward[2]*16)/4)*4];
      const light=multiply(ortho(-65,65,-65,65,1,250),lookAt(center.map((a,i)=>a+sun[i]*130),center,[0,1,0]));
      const shadows=this.settings.quality!=='low';
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);
      if(shadows&&(this.shadowDirty||time-this.lastShadow>.12)){
        gl.bindFramebuffer(gl.FRAMEBUFFER,this.shadowFBO);gl.viewport(0,0,this.shadowSize,this.shadowSize);gl.clear(gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.disable(gl.BLEND);gl.useProgram(this.depth);gl.uniformMatrix4fv(this.uniform(this.depth,'uVP'),false,light);gl.uniform1i(this.uniform(this.depth,'uAtlas'),0);
        gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(1.5,2);
        for(const m of this.meshes.values()){if(!m.opaque||Math.hypot(m.cx*16+8-center[0],m.cz*16+8-center[2])>100)continue;gl.bindVertexArray(m.opaque.vao);gl.drawArrays(gl.TRIANGLES,0,m.opaque.count);}
        if(this.faunaMesh){gl.bindVertexArray(this.faunaMesh.vao);gl.drawArrays(gl.TRIANGLES,0,this.faunaMesh.count);}
        gl.disable(gl.POLYGON_OFFSET_FILL);this.shadowDirty=false;this.lastShadow=time;this.lastLight=light;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.useProgram(this.sky);gl.bindVertexArray(this.emptyVAO);
      for(const[name,value]of Object.entries({uForward:forward,uRight:right,uUp:up,uEye:p,uSun:sun}))gl.uniform3fv(this.uniform(this.sky,name),value);
      for(const[name,value]of Object.entries({uAspect:aspect,uTan:Math.tan(fov/2),uDay:day,uTime:time}))gl.uniform1f(this.uniform(this.sky,name),value);
      gl.drawArrays(gl.TRIANGLES,0,3);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);
      gl.useProgram(this.main);gl.uniformMatrix4fv(this.uniform(this.main,'uVP'),false,vp);gl.uniformMatrix4fv(this.uniform(this.main,'uLight'),false,this.lastLight||light);
      gl.uniform3fv(this.uniform(this.main,'uEye'),p);gl.uniform3fv(this.uniform(this.main,'uSun'),sun);gl.uniform1f(this.uniform(this.main,'uDay'),day);gl.uniform1f(this.uniform(this.main,'uTime'),time);gl.uniform1f(this.uniform(this.main,'uFog'),distance);gl.uniform1i(this.uniform(this.main,'uAtlas'),0);gl.uniform1i(this.uniform(this.main,'uShadow'),1);gl.uniform1i(this.uniform(this.main,'uShadows'),shadows);gl.uniform1f(this.uniform(this.main,'uShadowSize'),this.shadowSize);
      gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.shadowTex);gl.activeTexture(gl.TEXTURE0);
      const visible=[];this.stats.triangles=0;
      if(this.faunaMesh){gl.bindVertexArray(this.faunaMesh.vao);gl.drawArrays(gl.TRIANGLES,0,this.faunaMesh.count);this.stats.triangles+=this.faunaMesh.count/3;}
      for(const m of this.meshes.values()){
        const dx=m.cx*16+8-p[0],dz=m.cz*16+8-p[2],dist=Math.hypot(dx,dz);if(dist>38&&(dx*forward[0]+dz*forward[2])< -dist*.35)continue;
        visible.push(m);if(m.opaque){gl.bindVertexArray(m.opaque.vao);gl.drawArrays(gl.TRIANGLES,0,m.opaque.count);this.stats.triangles+=m.opaque.count/3;}
      }
      visible.sort((a,b)=>Math.hypot(b.cx*16-p[0],b.cz*16-p[2])-Math.hypot(a.cx*16-p[0],a.cz*16-p[2]));gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);gl.disable(gl.CULL_FACE);
      for(const m of visible)if(m.water){gl.bindVertexArray(m.water.vao);gl.drawArrays(gl.TRIANGLES,0,m.water.count);this.stats.triangles+=m.water.count/3;}
      gl.depthMask(true);if(options.target&&!options.photo)this.drawTarget(options.target,vp,options.mineProgress||0);
      if(!options.photo)this.drawHeld(options.heldBlock||this.heldBlock,p,forward,right,up,vp,options.mineProgress||0,time);
      gl.disable(gl.BLEND);gl.bindVertexArray(null);
      if(options.delta)this.stats.fps=this.stats.fps*.96+(1/options.delta)*.04;
      this.stats.glError=gl.getError();
    }
    drawHeld(id,eye,forward,right,up,vp,progress,time){
      const gl=this.gl,vertices=[],size=.28,swing=Math.sin(progress*Math.PI)*.12;
      const center=eye.map((p,i)=>p+forward[i]*(.88-swing)+right[i]*.46-up[i]*(.36+swing)+up[i]*Math.sin(time*1.5)*.008);
      const ca=Math.cos(.38),sa=Math.sin(.38),bx=right.map((v,i)=>v*ca-forward[i]*sa),bz=right.map((v,i)=>-v*sa-forward[i]*ca);
      for(let f=0;f<6;f++){const face=faces[f],n=face.n.map((_,i)=>bx[i]*face.n[0]+up[i]*face.n[1]+bz[i]*face.n[2]);
        for(const j of[0,1,2,0,2,3]){const c=face.v[j],pos=center.map((v,i)=>v+size*(bx[i]*(c[0]-.5)+up[i]*(c[1]-.5)+bz[i]*(c[2]-.5)));vertices.push(...pos,...n,...uvFor(tile(id,f),j),1,id);}}
      this.heldMesh=this.updateDynamic(vertices,this.heldMesh);gl.clear(gl.DEPTH_BUFFER_BIT);gl.disable(gl.BLEND);gl.enable(gl.CULL_FACE);gl.useProgram(this.main);gl.uniformMatrix4fv(this.uniform(this.main,'uVP'),false,vp);gl.uniform1i(this.uniform(this.main,'uShadows'),false);gl.bindVertexArray(this.heldMesh.vao);gl.drawArrays(gl.TRIANGLES,0,this.heldMesh.count);
    }
    drawTarget(t,vp,progress){const gl=this.gl,x=t.x,y=t.y,z=t.z,a=.003,b=1.003,corners=[[x-a,y-a,z-a],[x+b,y-a,z-a],[x+b,y+b,z-a],[x-a,y+b,z-a],[x-a,y-a,z+b],[x+b,y-a,z+b],[x+b,y+b,z+b],[x-a,y+b,z+b]],lines=[];for(const[i,j]of [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]])lines.push(...corners[i],...corners[j]);
      if(progress>0){const n=t.normal||[0,1,0],axis=n.findIndex(v=>v!==0),axes=[0,1,2].filter(i=>i!==axis),c=[x+.5,y+.5,z+.5];c[axis]+=(n[axis]||1)*.505;for(let i=0;i<Math.ceil(progress*9);i++){let start=c.slice(),end=c.slice();const angle=i*2.399;end[axes[0]]+=Math.cos(angle)*(.2+progress*.3);end[axes[1]]+=Math.sin(angle)*(.2+progress*.3);lines.push(...start,...end);}}
      gl.useProgram(this.line);gl.uniformMatrix4fv(this.uniform(this.line,'uVP'),false,vp);gl.uniform4f(this.uniform(this.line,'uColor'),.12,.17,.12,.75);gl.bindVertexArray(this.lineVAO);gl.bindBuffer(gl.ARRAY_BUFFER,this.lineBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(lines),gl.DYNAMIC_DRAW);gl.drawArrays(gl.LINES,0,lines.length/3);
    }
  }
  V.Renderer=Renderer;
})();
