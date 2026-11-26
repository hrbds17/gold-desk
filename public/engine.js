"use strict";
/* ============ Indicateurs et moteur de signal (fonctions pures) ============ */
function ema(v,n){const k=2/(n+1),out=[];let e=null;for(let i=0;i<v.length;i++){if(i<n-1){out.push(null);continue}if(e===null){let s=0;for(let j=i-n+1;j<=i;j++)s+=v[j];e=s/n}else e=v[i]*k+e*(1-k);out.push(e)}return out}
function rsi(v,n){n=n||14;const out=Array(v.length).fill(null);if(v.length<=n)return out;let g=0,l=0;for(let i=1;i<=n;i++){const d=v[i]-v[i-1];if(d>0)g+=d;else l-=d}g/=n;l/=n;out[n]=l===0?100:100-100/(1+g/l);for(let i=n+1;i<v.length;i++){const d=v[i]-v[i-1];g=(g*(n-1)+Math.max(d,0))/n;l=(l*(n-1)+Math.max(-d,0))/n;out[i]=l===0?100:100-100/(1+g/l)}return out}
function atr(c,n){n=n||14;const out=Array(c.length).fill(null);if(c.length<n)return out;const tr=c.map((x,i)=>i?Math.max(x.h-x.l,Math.abs(x.h-c[i-1].c),Math.abs(x.l-c[i-1].c)):x.h-x.l);let a=0;for(let i=0;i<n;i++)a+=tr[i];a/=n;out[n-1]=a;for(let i=n;i<c.length;i++){a=(a*(n-1)+tr[i])/n;out[i]=a}return out}
function macd(v){const f=ema(v,12),s=ema(v,26);const line=v.map((_,i)=>f[i]!=null&&s[i]!=null?f[i]-s[i]:null);const st=line.findIndex(x=>x!=null);const sig=Array(v.length).fill(null);if(st>=0)ema(line.slice(st),9).forEach((x,i)=>{sig[st+i]=x});return{line,sig,hist:line.map((x,i)=>x!=null&&sig[i]!=null?x-sig[i]:null)}}
function swings(c,n){n=n||3;const hi=[],lo=[];for(let i=n;i<c.length-n;i++){let H=true,L=true;for(let j=1;j<=n;j++){if(c[i].h<=c[i-j].h||c[i].h<c[i+j].h)H=false;if(c[i].l>=c[i-j].l||c[i].l>c[i+j].l)L=false}if(H)hi.push({i,p:c[i].h,t:c[i].t});if(L)lo.push({i,p:c[i].l,t:c[i].t})}return{hi,lo}}
function structure(sw){const h=sw.hi.slice(-2),l=sw.lo.slice(-2);if(h.length<2||l.length<2)return 0;const up=h[1].p>h[0].p&&l[1].p>l[0].p,dn=h[1].p<h[0].p&&l[1].p<l[0].p;return up?1:dn?-1:0}
function findSweep(c,sw,look){look=look||10;const n=c.length;let best=null;
  for(let k=Math.max(4,n-look);k<n;k++){
    for(const s of sw.lo.slice(-6)){if(s.i+3>=k)continue;let intact=true;for(let m=s.i+1;m<k;m++)if(c[m].l<s.p){intact=false;break}
      if(intact&&c[k].l<s.p&&c[k].c>s.p&&(!best||k>=best.i))best={dir:1,i:k,t:c[k].t,level:s.p,ext:c[k].l}}
    for(const s of sw.hi.slice(-6)){if(s.i+3>=k)continue;let intact=true;for(let m=s.i+1;m<k;m++)if(c[m].h>s.p){intact=false;break}
      if(intact&&c[k].h>s.p&&c[k].c<s.p&&(!best||k>=best.i))best={dir:-1,i:k,t:c[k].t,level:s.p,ext:c[k].h}}
  }return best}
function findFvgs(c,A,from){const out=[];for(let i=Math.max(2,from);i<c.length;i++){const a=A[i]||0;
    if(c[i].l>c[i-2].h&&c[i].l-c[i-2].h>=0.2*a)out.push({kind:"FVG",dir:1,lo:c[i-2].h,hi:c[i].l,i,t:c[i-1].t});
    if(c[i].h<c[i-2].l&&c[i-2].l-c[i].h>=0.2*a)out.push({kind:"FVG",dir:-1,lo:c[i].h,hi:c[i-2].l,i,t:c[i-1].t})}
  return out.filter(z=>{for(let k=z.i+1;k<c.length;k++){if(z.dir===1&&c[k].l<=z.lo)return false;if(z.dir===-1&&c[k].h>=z.hi)return false}return true})}
function findObs(c,A,from){const out=[];for(let i=Math.max(1,from);i<c.length-3;i++){const a=A[i];if(!a)continue;
    const mx=Math.max(c[i+1].c,c[i+2].c,c[i+3].c),mn=Math.min(c[i+1].c,c[i+2].c,c[i+3].c);
    if(c[i].c<c[i].o&&c[i+1].c>c[i+1].o&&mx-c[i].h>=1.2*a)out.push({kind:"OB",dir:1,lo:c[i].l,hi:c[i].h,i,t:c[i].t});
    if(c[i].c>c[i].o&&c[i+1].c<c[i+1].o&&c[i].l-mn>=1.2*a)out.push({kind:"OB",dir:-1,lo:c[i].l,hi:c[i].h,i,t:c[i].t})}
  return out.filter(z=>{for(let k=z.i+4;k<c.length;k++){if(z.dir===1&&c[k].c<z.lo)return false;if(z.dir===-1&&c[k].c>z.hi)return false}return true})}
function nyHour(ms){try{const p=new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",hour:"numeric",minute:"numeric",hourCycle:"h23"}).formatToParts(new Date(ms));const h=+p.find(x=>x.type==="hour").value,m=+p.find(x=>x.type==="minute").value;return h+m/60}catch(e){return (new Date(ms).getUTCHours()+19)%24}}
function sessionAt(ms){const h=nyHour(ms);if(h>=2&&h<5)return{kz:true,name:"Kill zone Londres"};if(h>=7&&h<10)return{kz:true,name:"Kill zone New York"};if(h>=20||h<0.01)return{kz:false,name:"Session Asie"};if(h>=5&&h<7)return{kz:false,name:"Session Londres"};if(h>=10&&h<17)return{kz:false,name:"Session New York"};return{kz:false,name:"Hors session"}}

function analyze(ltf,htf,now,events,labels){
  if(ltf.length<60)return null;
  const cl=ltf.map(x=>x.c),n=ltf.length,p=cl[n-1];
  const e20=ema(cl,20),e50=ema(cl,50),R=rsi(cl,14),M=macd(cl),A=atr(ltf,14),a=A[n-1]||p*0.002;
  const sw=swings(ltf,3),st=structure(sw),sweep=findSweep(ltf,sw,10);
  const from=Math.max(0,n-140);
  const zonesAll=findObs(ltf,A,from).concat(findFvgs(ltf,A,from));
  const near=z=>p<=z.hi+0.3*a&&p>=z.lo-0.3*a;
  const inDemand=zonesAll.filter(z=>z.dir===1&&near(z)).pop()||null;
  const inSupply=zonesAll.filter(z=>z.dir===-1&&near(z)).pop()||null;
  const demand=zonesAll.filter(z=>z.dir===1&&z.lo<=p).sort((x,y)=>y.hi-x.hi).slice(0,2);
  const supply=zonesAll.filter(z=>z.dir===-1&&z.hi>=p).sort((x,y)=>x.lo-y.lo).slice(0,2);
  // fond
  let bias=0,biasTxt="Pas assez d'historique";
  if(htf.length>=60){const hc=htf.map(x=>x.c),h50=ema(hc,50),h200=ema(hc,200),m=hc.length-1,hp=hc[m];
    if(h200[m]!=null){bias=h50[m]>h200[m]&&hp>h50[m]?1:h50[m]<h200[m]&&hp<h50[m]?-1:0;biasTxt="EMA 50 "+(h50[m]>h200[m]?"au-dessus":"sous")+" EMA 200, prix "+(hp>h50[m]?"au-dessus":"sous")+" l'EMA 50"}
    else{const pr=h50[m-10];bias=pr!=null&&h50[m]>pr&&hp>h50[m]?1:pr!=null&&h50[m]<pr&&hp<h50[m]?-1:0;biasTxt="EMA 50 "+(pr!=null&&h50[m]>pr?"montante":"descendante")}}
  // premium / discount sur le range de fond
  let pd=0,pdTxt="—";
  if(htf.length>=20){const r=htf.slice(-60),hi=Math.max.apply(null,r.map(x=>x.h)),lo=Math.min.apply(null,r.map(x=>x.l));if(hi>lo){const pos=(p-lo)/(hi-lo);pd=pos<0.45?1:pos>0.55?-1:0;pdTxt=Math.round(pos*100)+" % du range "+labels.htf+" ("+lo.toFixed(0)+" – "+hi.toFixed(0)+")"}}
  const ses=sessionAt(now);
  const r=R[n-1],h=M.hist[n-1],hPrev=M.hist[n-2];
  const sweepRecent=sweep&&n-1-sweep.i<=8?sweep:null;
  const F=[
    {label:"Tendance de fond "+labels.htf,w:2,d:bias,detail:biasTxt},
    {label:"Structure "+labels.ltf,w:1.5,d:st,detail:st===1?"Sommets et creux ascendants":st===-1?"Sommets et creux descendants":"Pas de structure nette"},
    {label:"Prise de liquidité",w:2,d:sweepRecent?sweepRecent.dir:0,detail:sweepRecent?(sweepRecent.dir===1?"Creux ":"Sommet ")+sweepRecent.level.toFixed(2)+" balayé puis réintégré":"Aucun balayage sur les 8 dernières bougies"},
    {label:"Zone d'intérêt (OB / FVG)",w:2,d:inDemand&&!inSupply?1:inSupply&&!inDemand?-1:0,detail:inDemand&&!inSupply?"Prix dans une "+inDemand.kind+" acheteuse "+inDemand.lo.toFixed(2)+" – "+inDemand.hi.toFixed(2):inSupply&&!inDemand?"Prix dans une "+inSupply.kind+" vendeuse "+inSupply.lo.toFixed(2)+" – "+inSupply.hi.toFixed(2):inDemand&&inSupply?"Prix coincé entre deux zones opposées":"Prix hors zone"},
    {label:"Premium / discount",w:1,d:pd,detail:pdTxt},
    {label:"EMA 20 / 50",w:1,d:e50[n-1]==null?0:e20[n-1]>e50[n-1]&&p>e20[n-1]?1:e20[n-1]<e50[n-1]&&p<e20[n-1]?-1:0,detail:e50[n-1]==null?"—":"EMA 20 à "+e20[n-1].toFixed(2)+", EMA 50 à "+e50[n-1].toFixed(2)},
    {label:"RSI 14",w:1,d:r==null?0:r>52&&r<72?1:r<48&&r>28?-1:r<=28?1:r>=72?-1:0,detail:r==null?"—":r.toFixed(1)+(r<=28?" (survente)":r>=72?" (surachat)":"")},
    {label:"MACD",w:1,d:h==null||hPrev==null?0:h>0&&h>=hPrev?1:h<0&&h<=hPrev?-1:0,detail:h==null?"—":"Histogramme "+(h>0?"positif":"négatif")+(hPrev!=null?(Math.abs(h)>=Math.abs(hPrev)?", en expansion":", en contraction"):"")},
    {label:"Kill zone",w:1,d:0,both:ses.kz,detail:ses.name}
  ];
  let L=0,S=0,max=0;F.forEach(f=>{max+=f.w;if(f.both){L+=f.w;S+=f.w}else if(f.d===1)L+=f.w;else if(f.d===-1)S+=f.w});
  const best=Math.max(L,S),other=Math.min(L,S),dir=L>S?1:S>L?-1:0;
  let verdict="wait",strong=false,note="Pas assez de confluence, ou signaux contradictoires.";
  if(dir!==0&&best/max>=0.55&&best-other>=2.5){verdict=dir===1?"buy":"sell";strong=best/max>=0.72;note=strong?"Confluence forte.":"Confluence suffisante."}
  // garde-fou annonces
  let guard=null;(events||[]).forEach(ev=>{if(ev.impact!=="high")return;const t=Date.parse(ev.t);if(!isFinite(t))return;const d=(t-now)/60000;if(d<=30&&d>=-15&&!guard)guard=ev});
  if(guard&&verdict!=="wait"){verdict="wait";note="Annonce à fort impact toute proche : "+guard.title+"."}
  // plan
  let plan=null;const pdir=verdict==="buy"?1:verdict==="sell"?-1:0;
  if(pdir!==0){
    const cands=[];if(sweepRecent&&sweepRecent.dir===pdir)cands.push(sweepRecent.ext);
    const z=pdir===1?inDemand:inSupply;if(z)cands.push(pdir===1?z.lo:z.hi);
    const lastSw=(pdir===1?sw.lo:sw.hi).slice(-1)[0];if(lastSw)cands.push(lastSw.p);
    const ok=cands.filter(x=>pdir===1?(x<p&&p-x<=3*a):(x>p&&x-p<=3*a));
    let sl=ok.length?(pdir===1?Math.min.apply(null,ok)-0.25*a:Math.max.apply(null,ok)+0.25*a):p-pdir*1.5*a;
    let dist=Math.abs(p-sl);if(dist<a){dist=a;sl=p-pdir*dist}if(dist>3.5*a){dist=3.5*a;sl=p-pdir*dist}
    const tp1=p+pdir*1.5*dist;
    const liq=(pdir===1?sw.hi.filter(s=>s.p>=p+2*dist).sort((x,y)=>x.p-y.p):sw.lo.filter(s=>s.p<=p-2*dist).sort((x,y)=>y.p-x.p))[0];
    const tp2=liq?liq.p:p+pdir*3*dist;
    plan={dir:pdir,entry:p,sl,tp1,tp2,dist,rr1:1.5,rr2:Math.abs(tp2-p)/dist,tp2Liq:!!liq};
  }
  return{price:p,atr:a,e20,e50,rsi:r,factors:F,L,S,max,verdict,strong,note,plan,demand,supply,sweep:sweepRecent,session:ses,guard};
}
if(typeof module!=="undefined"){module.exports={analyze,ema,rsi,atr,macd,swings};}
