// The desk is rendered, not drawn: a small path of rays through real geometry,
// lit by one source, in WebGL2. Each frame jitters the camera and the light a
// little and blends into the last, so edges and shadows settle the way a
// progressive renderer's do, then it stops and costs nothing while you write.
// Sheets of paper are DOM elements; they're passed in as rectangles so they cast
// shadows here, and a second, low-resolution pass multiplies the same light over
// them, so the lamp falls on the page and the desk alike.

export type LightId = "lamp" | "morning" | "dusk"

export interface Rect {
  x: number
  y: number
  w: number
  h: number
  // Height above the desk, in px. Paper is 1, a card stack 6, a tray 30.
  z: number
}

export interface SceneState {
  light: LightId
  // The sheet and anything else lying on the desk.
  rects: Rect[]
  blotter: { x: number; y: number; w: number; h: number } | null
  // Where the objects sit; null leaves them out.
  pen: { x: number; y: number; a: number } | null
  ink: { x: number; y: number } | null
  cup: { x: number; y: number } | null
  specs: { x: number; y: number; a: number } | null
  ruler: { x: number; y: number; a: number } | null
  leather: [number, number, number]
}

const VERT = `#version 300 es
in vec2 pos;
void main(){ gl_Position = vec4(pos,0.,1.); }`

const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 uRes;
uniform float uDpr;
uniform vec2 uJit;
uniform float uSeed;
uniform int uMode;       // 0 beauty, 1 light only
uniform int uLight;      // 0 lamp, 1 morning, 2 dusk
uniform vec4 uRect[10];
uniform float uRectZ[10];
uniform int uRects;
uniform vec4 uBlot;
uniform vec3 uLeather;
uniform vec3 uPen;   // x,y,angle; x<-1e4 means absent
uniform vec2 uInk;
uniform vec2 uCup;
uniform vec3 uSpecs;
uniform vec3 uRuler;

#define PI 3.14159265

float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
vec2 hash2(vec2 p){ float n=hash(p); return vec2(n,hash(p+n+7.1)); }
float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
float fbm(vec2 p){ float a=.5,s=0.; for(int i=0;i<5;i++){ s+=a*noise(p); p=p*2.03+vec2(17.,9.); a*=.5; } return s; }
float cell(vec2 p){ vec2 i=floor(p),f=fract(p); float d=9.,e=9.;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){ vec2 g=vec2(x,y); vec2 o=hash2(i+g); float r=length(g+o-f);
    if(r<d){e=d;d=r;} else if(r<e) e=r; }
  return e-d; }
mat2 rot(float a){ float c=cos(a),s=sin(a); return mat2(c,-s,s,c); }

float rbox2(vec2 p,vec2 b,float r){ vec2 q=abs(p)-b+r; return length(max(q,0.))+min(max(q.x,q.y),0.)-r; }
float rbox(vec3 p,vec3 b,float r){ vec3 q=abs(p)-b+r; return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.)-r; }
float capsule(vec3 p,vec3 a,vec3 b,float r){ vec3 pa=p-a,ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.); return length(pa-ba*h)-r; }
float cyl(vec3 p,float r,float h){ vec2 d=abs(vec2(length(p.xy),p.z))-vec2(r,h); return min(max(d.x,d.y),0.)+length(max(d,0.)); }
float torus(vec3 p,float R,float r){ vec2 q=vec2(length(p.xy)-R,p.z); return length(q)-r; }
float smin(float a,float b,float k){ float h=clamp(.5+.5*(b-a)/k,0.,1.); return mix(b,a,h)-k*h*(1.-h); }

// Materials: 1 lacquer, 2 gold, 3 brass, 4 glass-ink, 5 ceramic, 6 coffee, 7 steel, 8 horn, 9 nib
vec2 opU(vec2 a,vec2 b){ return a.x<b.x?a:b; }

vec2 pen(vec3 p){
  if(uPen.x<-9000.) return vec2(1e5,0.);
  vec3 q=p-vec3(uPen.xy,9.); q.xy=rot(uPen.z)*q.xy;
  float L=150.;
  // Barrel tapers a little toward both ends.
  float t=clamp(q.x/L,-1.,1.);
  float R=8.5-1.6*t*t*t*t;
  vec3 b=q; float body=max(length(b.yz)-R,abs(b.x)-L);
  body=smin(body,capsule(q,vec3(L,0,0),vec3(L+6.,0,0),5.),4.);
  vec2 d=vec2(body,1.);
  float band=max(length(q.yz)-(R+.6),abs(abs(q.x+36.)-5.)-1.6);
  d=opU(d,vec2(band,2.));
  // Clip.
  float clip=rbox(q-vec3(92.,0.,R+1.4),vec3(36.,1.6,.8),.7);
  d=opU(d,vec2(clip,2.));
  // Section and nib.
  float section=capsule(q,vec3(-L,0,0),vec3(-L-26.,0,0),5.4);
  d=opU(d,vec2(section,1.));
  vec3 n=q-vec3(-L-42.,0,0);
  float w=mix(.8,5.2,clamp((n.x+20.)/32.,0.,1.));
  float nib=max(abs(n.z-1.)-.7,max(abs(n.y)-w,abs(n.x)-20.));
  d=opU(d,vec2(nib*.8,9.));
  return d;
}

vec2 ink(vec3 p){
  if(uInk.x<-9000.) return vec2(1e5,0.);
  vec3 q=p-vec3(uInk,0.);
  float body=rbox(q-vec3(0,0,30.),vec3(50.,50.,30.),14.);
  body=max(body,-(rbox(q-vec3(0,0,34.),vec3(44.,44.,29.),10.)));
  vec2 d=vec2(body,4.);
  float liquid=rbox(q-vec3(0,0,20.),vec3(44.5,44.5,16.),10.);
  d=opU(d,vec2(liquid,10.));
  float neck=cyl(q-vec3(0,0,66.),18.,8.);
  d=opU(d,vec2(neck,4.));
  float cap=cyl(q-vec3(0,0,78.),21.,9.)-1.5;
  float knurl=.4*sin(atan(q.y,q.x)*64.)*step(length(q.xy),23.);
  d=opU(d,vec2(cap-knurl*.25,3.));
  return d;
}

vec2 cup(vec3 p){
  if(uCup.x<-9000.) return vec2(1e5,0.);
  vec3 q=p-vec3(uCup,0.);
  float saucer=max(length(q.xy)-104.,abs(q.z-4.-.0006*dot(q.xy,q.xy))-3.)-1.;
  vec2 d=vec2(saucer*.7,5.);
  float wall=abs(length(q.xy)-60.)-3.2;
  float shell=max(wall,abs(q.z-34.)-30.)-.8;
  d=opU(d,vec2(shell,5.));
  float base=cyl(q-vec3(0,0,10.),60.,4.);
  d=opU(d,vec2(base,5.));
  float coffee=cyl(q-vec3(0,0,42.),58.,12.);
  d=opU(d,vec2(coffee,6.));
  vec3 h=q-vec3(82.,18.,38.); h.xy=rot(.3)*h.xy;
  float handle=max(torus(h.xzy,20.,5.),-(length(q.xy)-60.));
  d=opU(d,vec2(handle,5.));
  return d;
}

vec2 specs(vec3 p){
  if(uSpecs.x<-9000.) return vec2(1e5,0.);
  vec3 q=p-vec3(uSpecs.xy,7.); q.xy=rot(uSpecs.z)*q.xy;
  vec3 a=q-vec3(-54.,0.,0.),b=q-vec3(54.,0.,0.);
  float rim=min(torus(a,40.,2.4),torus(b,40.,2.4));
  vec2 d=vec2(rim,3.);
  float bridge=capsule(q,vec3(-15.,-6.,2.),vec3(15.,-6.,2.),2.);
  d=opU(d,vec2(bridge,3.));
  float t1=capsule(q,vec3(-94.,-4.,0.),vec3(-112.,110.,-2.),1.8);
  float t2=capsule(q,vec3(94.,-4.,0.),vec3(112.,110.,-2.),1.8);
  d=opU(d,vec2(min(t1,t2),3.));
  float lens=min(max(length(a.xy)-39.,abs(a.z)-.7),max(length(b.xy)-39.,abs(b.z)-.7));
  d=opU(d,vec2(lens,11.));
  return d;
}

vec2 ruler(vec3 p){
  if(uRuler.x<-9000.) return vec2(1e5,0.);
  vec3 q=p-vec3(uRuler.xy,3.); q.xy=rot(uRuler.z)*q.xy;
  float r=rbox(q,vec3(230.,20.,2.6),2.);
  return vec2(r,7.);
}

float objMax=0.;
vec2 map(vec3 p){
  vec2 d=vec2(1e5,0.);
  d=opU(d,pen(p));
  d=opU(d,ink(p));
  d=opU(d,cup(p));
  d=opU(d,specs(p));
  d=opU(d,ruler(p));
  return d;
}

vec3 normalAt(vec3 p){
  vec2 e=vec2(.25,0.);
  return normalize(vec3(map(p+e.xyy).x-map(p-e.xyy).x,map(p+e.yxy).x-map(p-e.yxy).x,map(p+e.yyx).x-map(p-e.yyx).x));
}

// World is CSS px, y down, z toward the viewer.
vec2 gRes;
struct Light { vec3 pos; vec3 color; float amb; vec3 ambC; bool sun; };

Light lightNow(){
  Light l;
  if(uLight==1){ l.pos=normalize(vec3(-.62,-.46,.64)); l.color=vec3(1.45,1.32,1.12)*2.1; l.amb=.36; l.ambC=vec3(.8,.8,.82); l.sun=true; }
  else if(uLight==2){ l.pos=normalize(vec3(.8,-.22,.42)); l.color=vec3(1.5,.7,.36)*2.2; l.amb=.26; l.ambC=vec3(.46,.44,.66); l.sun=true; }
  else { l.pos=vec3(gRes.x*.28,-gRes.y*.12,760.); l.color=vec3(1.2,.88,.56)*3.1; l.amb=.06; l.ambC=vec3(.46,.44,.5); l.sun=false; }
  return l;
}

vec3 toLight(Light l,vec3 p){ return l.sun?l.pos:normalize(l.pos-p); }

float falloff(Light l,vec3 p){
  if(l.sun) return 1.;
  vec2 c=vec2(gRes.x*.46,gRes.y*.4);
  float d=length((p.xy-c)/vec2(max(gRes.x,900.),max(gRes.y,700.)));
  // A shade: bright pool, soft edge, real falloff beyond it.
  return smoothstep(.74,.06,d)*.9+.07;
}

// Light through the window: mullions and a tree outside, soft from the distance.
float gobo(vec2 p){
  if(uLight==0) return 1.;
  vec2 q=rot(.21)*(p/max(gRes.x,1000.));
  q+=.012*vec2(fbm(p*.002),fbm(p*.0023+9.));
  vec2 g=abs(fract(q*vec2(3.3,2.7)+.08)-.5);
  float bars=smoothstep(.455,.44,g.x)*smoothstep(.46,.445,g.y);
  float frame=smoothstep(-.1,.02,q.x+.42)*smoothstep(1.2,.92,q.x)*smoothstep(-.3,-.1,q.y+.1);
  float leaves=smoothstep(.3,.62,fbm(q*7.+vec2(3.,1.)))*.72;
  return max(.2,bars*frame*(1.-leaves));
}

float rectShadow(vec3 p,vec3 L){
  float s=1.;
  for(int i=0;i<uRects;i++){
    vec4 r=uRect[i]; float z=uRectZ[i];
    if(p.z>=z) continue;
    float t=(z-p.z)/max(L.z,.08);
    vec2 h=p.xy+L.xy*t;
    vec2 c=r.xy+r.zw*.5;
    float d=rbox2(h-c,r.zw*.5,2.);
    float pen=1.+t*.2;
    s=min(s,smoothstep(-pen,pen,d));
    // Ambient contact: even overhead light darkens the desk beside a sheet.
    float a=rbox2(p.xy-c,r.zw*.5,2.);
    s=min(s,mix(.76,1.,smoothstep(0.,3.+z*.9,a)));
  }
  return s;
}

float softShadow(vec3 ro,vec3 rd){
  float res=1.,t=1.5;
  for(int i=0;i<34;i++){
    float h=map(ro+rd*t).x;
    if(h<.05) return 0.;
    res=min(res,9.*h/t);
    t+=clamp(h,1.,28.);
    if(t>460.) break;
  }
  return clamp(res,0.,1.);
}

float ao(vec3 p,vec3 n){
  float o=0.,w=1.;
  for(int i=1;i<=5;i++){ float s=float(i)*7.; o+=w*(s-map(p+n*s).x)/s; w*=.6; }
  return clamp(1.-o*.62,0.,1.);
}

vec3 env(vec3 r,Light l){
  // A room: a dark ceiling, a window or a lampshade reflected in it.
  float y=r.z*.5+.5;
  vec3 c=mix(vec3(.02,.016,.012),l.ambC*.6,y*y);
  vec3 L=l.sun?l.pos:normalize(vec3(-.4,-.35,.85));
  float s=dot(r,L);
  c+=l.color*(.34*pow(max(s,0.),18.)+.8*smoothstep(.975,.992,s));
  if(uLight==1){ vec2 w=r.xy/max(r.z,.15)+vec2(.8,.6); c+=vec3(1.2,1.3,1.4)*.8*smoothstep(.12,.06,abs(fract(w.x*2.4)-.5)-.26)*smoothstep(.1,.05,abs(w.y)-.3)*step(0.,r.z); }
  return c;
}

float ggx(vec3 n,vec3 v,vec3 l,float r){
  vec3 h=normalize(v+l); float a=r*r,a2=a*a,nh=max(dot(n,h),0.);
  float d=nh*nh*(a2-1.)+1.;
  return a2/(PI*d*d)*.25/max(dot(l,h)*dot(l,h),.1);
}

vec3 shade(vec3 p,vec3 n,vec3 v,vec3 albedo,float rough,float metal,float f0,Light l,float vis){
  vec3 L=toLight(l,p);
  float ndl=max(dot(n,L),0.);
  float fall=falloff(l,p);
  vec3 F0=mix(vec3(f0),albedo,metal);
  float fres=pow(1.-max(dot(n,v),0.),5.);
  vec3 F=F0+(1.-F0)*fres;
  vec3 diff=albedo*(1.-metal)*ndl/PI;
  vec3 spec=F*ggx(n,v,L,rough)*ndl;
  vec3 col=(diff*3.1+spec)*l.color*fall*vis;
  float roomLight=l.sun?1.:(.32+.68*fall);
  col+=albedo*(1.-metal)*l.ambC*l.amb*3.*roomLight;
  col+=env(reflect(-v,n),l)*F*(1.-rough*.72)*roomLight;
  return col;
}

float woodHeight(vec2 p){
  float seam=step(.5,fract(floor(p.y/360.)*.5));
  vec2 q=p+vec2(seam*700.,floor(p.y/360.)*53.);
  float warp=fbm(q*vec2(.0016,.011));
  float rings=sin((q.y*.021+warp*9.+.5*fbm(q*vec2(.004,.05)))*2.2);
  float pores=noise(q*vec2(.16,2.6));
  return rings*.2+pores*.6;
}

vec3 woodAlbedo(vec2 p){
  float row=floor(p.y/360.);
  vec2 q=p+vec2(step(.5,fract(row*.5))*700.,row*53.);
  float warp=fbm(q*vec2(.0016,.011));
  float g=.5+.5*sin((q.y*.021+warp*9.+.5*fbm(q*vec2(.004,.05)))*2.2);
  g=mix(g,fbm(q*vec2(.012,.16)),.45);
  float fine=fbm(q*vec2(.03,1.1));
  float pores=smoothstep(.7,.92,noise(q*vec2(.09,2.9)));
  vec3 a=mix(vec3(.15,.074,.04),vec3(.062,.029,.016),g*.72+fine*.3);
  a*=.86+.34*hash(vec2(row,3.));
  a*=1.-pores*.42;
  a+=vec3(.05,.02,.006)*smoothstep(.55,.8,fbm(q*vec2(.005,.09)));
  return a;
}

void main(){
  vec2 frag=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y)+uJit;
  vec2 px=frag/uDpr;
  vec2 res=uRes/uDpr;
  gRes=res;
  Light l=lightNow();
  // Move the lamp a little per sample: an area light.
  vec3 jitL=vec3(hash(uJit+uSeed)-.5,hash(uJit*3.+uSeed)-.5,0.)*(l.sun?.03:46.);
  l.pos+=jitL;
  if(l.sun) l.pos=normalize(l.pos);
  vec3 v=vec3(0,0,1);

  if(uMode==1){
    // The light on a white sheet lying on the desk.
    vec3 p=vec3(px,1.5);
    vec3 L=toLight(l,p);
    // Paper scatters, and its ink must stay readable: the shadows are lifted
    // here well above what the desk gets.
    float g=mix(.66,1.,gobo(px));
    float f=falloff(l,p);
    vec3 warm=normalize(l.color)*1.73;
    vec3 sh=l.sun?mix(vec3(.74,.73,.76),vec3(1.),g):vec3(1.);
    float bright=l.sun?1.:mix(.56,1.,smoothstep(.2,.8,f));
    vec3 c=mix(vec3(1.),warm*vec3(.94,1.,1.14),uLight==1?.1:(uLight==2?.06:.16))*sh*bright;
    outColor=vec4(clamp(c,0.,1.),1.);
    return;
  }

  // March straight down; the camera is high and long.
  vec3 ro=vec3(px,130.),rd=vec3(0,0,-1);
  float t=0.; float hit=-1.; vec2 r=vec2(0.);
  bool any=false;
  // Quick reject so bare desk pays nothing for the objects.
  if(map(vec3(px,40.)).x<150.){
    for(int i=0;i<90;i++){
      r=map(ro+rd*t);
      if(r.x<.03){ hit=r.y; any=true; break; }
      t+=r.x*.9;
      if(t>131.) break;
    }
  }
  vec3 col;
  vec3 N=vec3(0,0,1);
  if(any){
    vec3 p=ro+rd*t;
    N=normalAt(p);
    vec3 L=toLight(l,p);
    float vis=softShadow(p+N*.6,L)*rectShadow(p,L)*gobo(px);
    float occ=ao(p,N);
    vec3 alb=vec3(.02); float rg=.2,mt=0.,f0=.04;
    if(hit<1.5){ alb=vec3(.008,.01,.016); rg=.1; f0=.06; }
    else if(hit<2.5){ alb=vec3(1.,.74,.36); rg=.2; mt=1.; }
    else if(hit<3.5){ alb=vec3(.9,.62,.3); rg=.28+.14*noise(px*.3); mt=1.; }
    else if(hit<4.5){ alb=vec3(.02,.024,.03); rg=.05; f0=.08; }
    else if(hit<5.5){ alb=vec3(.93,.91,.86); rg=.16; f0=.05; }
    else if(hit<6.5){ alb=vec3(.045,.018,.007); rg=.06; f0=.05; }
    else if(hit<7.5){ alb=vec3(.74,.73,.71); rg=.3; mt=1.;
      vec2 q=p.xy-uRuler.xy; q=rot(uRuler.z)*q;
      float tick=step(.5,fract((q.x+230.)/9.45))*0.+smoothstep(.75,.0,abs(mod(q.x+230.,9.45)-4.7)-.0);
      float len=mod(floor((q.x+230.)/9.45),10.)<.5?20.:(mod(floor((q.x+230.)/9.45),5.)<.5?14.:9.);
      float mark=tick*step(20.-len,q.y+0.)*step(q.y,20.);
      alb=mix(alb,vec3(.03),mark); }
    else if(hit<9.5){ alb=vec3(1.,.8,.45); rg=.16; mt=1.; }
    else if(hit<10.5){ alb=vec3(.008,.012,.05); rg=.03; f0=.05; }
    else { alb=vec3(.015,.016,.02); rg=.03; f0=.07; }
    col=shade(p,N,v,alb,rg,mt,f0,l,vis)*(.3+.7*occ);
    if(hit>10.5){
      // A lens: mostly the desk seen through it.
      vec3 pp=vec3(px,0.);
      vec3 w=woodAlbedo(px+vec2(5.,3.))*(l.color*falloff(l,pp)*gobo(px)*.62+l.ambC*l.amb*2.);
      col=w*.92+env(reflect(-v,N),l)*.16;
    }
  } else {
    vec3 p=vec3(px,0.);
    vec3 alb; float rg,f0=.04,mt=0.; float bump=0.;
    vec2 q=px;
    bool leather=false,brass=false;
    float e=1.1;
    float d=1e5;
    vec2 c=vec2(0.),hb=vec2(0.);
    if(uBlot.z>0.){ c=uBlot.xy+uBlot.zw*.5; hb=uBlot.zw*.5; d=rbox2(px-c,hb,8.); }
    vec3 n=vec3(0,0,1);
    if(d<0.){
      leather=true;
      // A fine, smooth pebble: nearly nothing up close, a glow at a distance.
      float big=cell(q*.2+.5*vec2(fbm(q*.02),fbm(q*.021+4.)));
      float hAt=smoothstep(0.,.42,big);
      vec2 g=vec2(dFdx(hAt),dFdy(hAt))*uDpr;
      n=normalize(vec3(-g*.9,1.));
      alb=uLeather*(.96+.06*hAt)*(.7+.46*fbm(q*.005));
      rg=.56; f0=.03;
      // Worn pale where wrists have rested.
      alb=mix(alb,alb*1.5,.3*smoothstep(.6,.2,length((px-c-vec2(0.,hb.y*.84))/hb)));
      // Stitching and the edge roll.
      float edge=-d;
      float st=smoothstep(1.9,.9,abs(edge-15.));
      float dash;
      float along=abs(px.x-c.x)>hb.x-20.?px.y:px.x;
      dash=smoothstep(.2,.32,abs(fract(along*.09)-.5));
      alb=mix(alb,vec3(.62,.5,.32),st*dash);
      n=normalize(n+vec3(0,0,0)+vec3(sign(px-c)*.7*smoothstep(6.,0.,edge),0.));
      float groove=smoothstep(3.2,0.,abs(edge-15.))*(1.-dash);
      alb*=1.-.45*groove;
      // Brass corners.
      vec2 k=hb-abs(px-c);
      if(k.x+k.y<92.){
        brass=true;
        float rim=smoothstep(0.,3.,92.-(k.x+k.y));
        alb=vec3(.82,.56,.26)*(.84+.3*fbm(q*.06));
        rg=.32; mt=1.;
        n=normalize(vec3(sign(px-c)*.24*(1.-rim),1.)+vec3((noise(q*.7)-.5)*.05));
      }
    } else {
      alb=woodAlbedo(q);
      float h=woodHeight(q);
      vec2 g=vec2(dFdx(h),dFdy(h))*uDpr;
      n=normalize(vec3(-g*.36,1.));
      float seam=abs(mod(q.y,360.)-1.);
      alb*=mix(.28,1.,smoothstep(0.,2.4,seam));
      rg=.3+.22*fbm(q*.012);
      f0=.05;
      // Ghosts of an old cup and a sleeve's polish.
      vec2 ring=px-vec2(uCup.x-130.,uCup.y+96.);
      float stain=smoothstep(2.6,.8,abs(length(ring)-58.+2.*noise(ring*.05)))*.4*smoothstep(.2,.7,noise(ring*.02+3.));
      if(uCup.x>-9000.) alb*=1.-stain*.7;
      if(uBlot.z>0.&&d<14.) alb*=mix(.46,1.,smoothstep(0.,14.,d));
    }
    vec3 L=toLight(l,p);
    float vis=rectShadow(p,L)*gobo(px);
    if(map(vec3(px,40.)).x<210.){
      vis*=softShadow(p+vec3(0,0,.6),L);
      vis*=.36+.64*ao(p,vec3(0,0,1));
    }
    col=shade(p,n,v,alb,rg,mt,f0,l,vis);
  }
  // Filmic tone curve, grain to break up banding, a soft lens falloff.
  col*=1.05;
  col=(col*(2.51*col+.03))/(col*(2.43*col+.59)+.14);
  col=pow(clamp(col,0.,1.),vec3(1./2.2));
  vec2 uv=frag/uRes-.5;
  col*=1.-dot(uv,uv)*.52;
  col+=(hash(frag+uSeed)-.5)/110.;
  outColor=vec4(col,1.);
}`

type Handle = {
  render(state: SceneState): void
  destroy(): void
}

const FAR = -99999

function compile(gl: WebGL2RenderingContext) {
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(s) ?? "shader")
    return s
  }
  const program = gl.createProgram()!
  gl.attachShader(program, shader(gl.VERTEX_SHADER, VERT))
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAG))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(program) ?? "link")
  return program
}

// Halton points: spread evenly, whatever the sample count.
const halton = (i: number, b: number) => {
  let f = 1
  let r = 0
  while (i > 0) {
    f /= b
    r += f * (i % b)
    i = Math.floor(i / b)
  }
  return r
}

function pass(
  canvas: HTMLCanvasElement,
  mode: 0 | 1,
  scale: number,
  samples: number
): Handle | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: "low-power",
  })
  if (!gl) return null
  const program = compile(gl)
  gl.useProgram(program)
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW
  )
  const pos = gl.getAttribLocation(program, "pos")
  gl.enableVertexAttribArray(pos)
  gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0)
  const u = (n: string) => gl.getUniformLocation(program, n)
  const uniforms = {
    res: u("uRes"),
    dpr: u("uDpr"),
    jit: u("uJit"),
    seed: u("uSeed"),
    mode: u("uMode"),
    light: u("uLight"),
    rect: u("uRect"),
    rectZ: u("uRectZ"),
    rects: u("uRects"),
    blot: u("uBlot"),
    leather: u("uLeather"),
    pen: u("uPen"),
    ink: u("uInk"),
    cup: u("uCup"),
    specs: u("uSpecs"),
    ruler: u("uRuler"),
  }
  let frame = 0
  let sample = 0
  let current: SceneState | null = null
  const LIGHTS = { lamp: 0, morning: 1, dusk: 2 }

  const draw = () => {
    if (!current) return
    const start = performance.now()
    gl.uniform2f(
      uniforms.jit,
      halton(sample + 1, 2) - 0.5,
      halton(sample + 1, 3) - 0.5
    )
    gl.uniform1f(uniforms.seed, (sample * 0.137) % 1)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA)
    gl.blendColor(0, 0, 0, 1 / (sample + 1))
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.flush()
    sample++
    const slow = performance.now() - start > 180
    if (sample < samples && !slow) frame = requestAnimationFrame(draw)
    else canvas.dataset.settled = "true"
  }

  return {
    render(state) {
      cancelAnimationFrame(frame)
      current = state
      canvas.dataset.settled = "false"
      const dpr = Math.min(window.devicePixelRatio || 1, 2) * scale
      const w = Math.round(canvas.clientWidth * dpr)
      const h = Math.round(canvas.clientHeight * dpr)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      gl.viewport(0, 0, w, h)
      gl.uniform2f(uniforms.res, w, h)
      gl.uniform1f(uniforms.dpr, dpr)
      gl.uniform1i(uniforms.mode, mode)
      gl.uniform1i(uniforms.light, LIGHTS[state.light])
      const rects = state.rects.slice(0, 10)
      const flat = new Float32Array(40)
      const zs = new Float32Array(10)
      rects.forEach((r, i) => {
        flat.set([r.x, r.y, r.w, r.h], i * 4)
        zs[i] = r.z
      })
      gl.uniform4fv(uniforms.rect, flat)
      gl.uniform1fv(uniforms.rectZ, zs)
      gl.uniform1i(uniforms.rects, rects.length)
      const b = state.blotter
      gl.uniform4f(uniforms.blot, b?.x ?? 0, b?.y ?? 0, b?.w ?? 0, b?.h ?? 0)
      gl.uniform3fv(uniforms.leather, state.leather)
      gl.uniform3f(
        uniforms.pen,
        state.pen?.x ?? FAR,
        state.pen?.y ?? 0,
        state.pen?.a ?? 0
      )
      gl.uniform2f(uniforms.ink, state.ink?.x ?? FAR, state.ink?.y ?? 0)
      gl.uniform2f(uniforms.cup, state.cup?.x ?? FAR, state.cup?.y ?? 0)
      gl.uniform3f(
        uniforms.specs,
        state.specs?.x ?? FAR,
        state.specs?.y ?? 0,
        state.specs?.a ?? 0
      )
      gl.uniform3f(
        uniforms.ruler,
        state.ruler?.x ?? FAR,
        state.ruler?.y ?? 0,
        state.ruler?.a ?? 0
      )
      sample = 0
      frame = requestAnimationFrame(draw)
    },
    destroy() {
      // Not losing the context on purpose: React's double mount in development
      // would hand the next pass a dead one. The canvas takes it along when it goes.
      cancelAnimationFrame(frame)
    },
  }
}

export function createScene(
  beauty: HTMLCanvasElement,
  light: HTMLCanvasElement | null,
  samples = 24
): Handle | null {
  try {
    const a = pass(beauty, 0, 1, samples)
    if (!a) return null
    const b = light ? pass(light, 1, 0.25, 4) : null
    return {
      render(s) {
        a.render(s)
        b?.render(s)
      },
      destroy() {
        a.destroy()
        b?.destroy()
      },
    }
  } catch (e) {
    console.warn("Desk scene unavailable", e)
    return null
  }
}
