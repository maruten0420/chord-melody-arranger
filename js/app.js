const $=s=>document.querySelector(s),NN=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const S={vars:[],sel:0,rs:1,playing:null,PX:60,harm:[],hsel:null,aseed:1};
let ac,master,oscs=[],raf;
$('#ks').innerHTML='<option value="-1">自動推定</option>'+NN.map((n,k)=>`<option value="${k}">${n}メジャー / ${NN[(k+9)%12]}マイナー</option>`).join('');

function parseMidi(buf){
 const d=new DataView(buf);let p=0;
 const str=n=>{let s='';for(let i=0;i<n;i++)s+=String.fromCharCode(d.getUint8(p+i));p+=n;return s};
 if(str(4)!=='MThd')throw new Error('MIDIファイルとして読めませんでした');
 const hl=d.getUint32(p);p+=4;const nt=d.getUint16(p+2),div=d.getUint16(p+4);p=8+hl;
 if(div&0x8000)throw new Error('SMPTE形式のMIDIには未対応です');
 const m={ppq:div,tempos:[],ts:[],tracks:[]};
 for(let t=0;t<nt&&p<buf.byteLength;t++){
  if(str(4)!=='MTrk')break;const len=d.getUint32(p);p+=4;const end=p+len;
  let tick=0,run=0,name='',prog=null,ch0=null;const on={},notes=[];
  while(p<end){
   let v=0,b;do{b=d.getUint8(p++);v=(v<<7)|(b&127)}while(b&128);tick+=v;
   let st=d.getUint8(p);if(st<128)st=run;else p++;
   if(st===0xFF){const ty=d.getUint8(p++);let l=0;do{b=d.getUint8(p++);l=(l<<7)|(b&127)}while(b&128);
    if(ty===0x51)m.tempos.push({tick,us:(d.getUint8(p)<<16)|(d.getUint8(p+1)<<8)|d.getUint8(p+2)});
    else if(ty===0x58)m.ts.push({tick,num:d.getUint8(p),den:2**d.getUint8(p+1)});
    else if(ty===3&&!name)name=new TextDecoder().decode(new Uint8Array(buf,p,l));
    p+=l;run=0;
   }else if(st===0xF0||st===0xF7){let l=0;do{b=d.getUint8(p++);l=(l<<7)|(b&127)}while(b&128);p+=l;run=0}
   else{run=st;const hi=st>>4,ch=st&15,d1=d.getUint8(p++);
    if(hi===0xC){if(ch!==9&&prog===null){prog=d1}}
    else if(hi===0xD){}
    else{const d2=d.getUint8(p++);
     if(hi===9&&d2>0){const k=ch*128+d1;if(on[k]&&tick>on[k].tick)notes.push({s:on[k].tick,e:tick,pitch:d1,vel:on[k].vel,ch});on[k]={tick,vel:d2}}
     else if(hi===8||(hi===9&&d2===0)){const k=ch*128+d1,n=on[k];if(n){notes.push({s:n.tick,e:Math.max(tick,n.tick+1),pitch:d1,vel:n.vel,ch});delete on[k]}}}
   }
  }
  p=end;const nn=notes.filter(n=>n.ch!==9);
  if(nn.length)m.tracks.push({name,notes:nn,prog,ch:nn[0].ch});
 }
 if(!m.tracks.length)throw new Error('音符が見つかりませんでした');
 return m;
}
function mkT2S(m){
 const tp=[...m.tempos].sort((a,b)=>a.tick-b.tick);if(!tp.length||tp[0].tick>0)tp.unshift({tick:0,us:500000});
 let acc=0;const seg=tp.map((t,i)=>{if(i)acc+=(t.tick-tp[i-1].tick)*tp[i-1].us/1e6/m.ppq;return{tick:t.tick,sec:acc,us:t.us}});
 return k=>{let i=seg.length-1;while(i>0&&seg[i].tick>k)i--;return seg[i].sec+(k-seg[i].tick)*seg[i].us/1e6/m.ppq};
}
const TPL=[['',[0,4,7],'maj'],['m',[0,3,7],'min'],['7',[0,4,7,10],'dom'],['maj7',[0,4,7,11],'maj'],['m7',[0,3,7,10],'min'],['m7b5',[0,3,6,10],'hdim'],['dim',[0,3,6],'dim'],['dim7',[0,3,6,9],'dim'],['aug',[0,4,8],'aug'],['sus4',[0,5,7],'sus'],['sus2',[0,2,7],'sus'],['7sus4',[0,5,7,10],'sus'],['6',[0,4,7,9],'maj'],['m6',[0,3,7,9],'min'],['add9',[0,2,4,7],'maj'],['madd9',[0,2,3,7],'min'],['maj9',[0,2,4,7,11],'maj'],['9',[0,2,4,7,10],'dom'],['m9',[0,2,3,7,10],'min'],['7b9',[0,1,4,7,10],'alt'],['7#9',[0,3,4,7,10],'alt'],['7#5',[0,4,8,10],'alt'],['7b5',[0,4,6,10],'alt'],['mMaj7',[0,3,7,11],'mm'],['6/9',[0,2,4,7,9],'maj'],['m11',[0,2,3,5,7,10],'min'],['13',[0,2,4,7,9,10],'dom'],['maj7#11',[0,4,6,7,11],'lyd'],['5',[0,7],'pow']];
const MODES={ion:[0,2,4,5,7,9,11],dor:[0,2,3,5,7,9,10],phr:[0,1,3,5,7,8,10],lyd:[0,2,4,6,7,9,11],mix:[0,2,4,5,7,9,10],aeo:[0,2,3,5,7,8,10],loc:[0,1,3,5,6,8,10],dim:[0,2,3,5,6,8,9,11],wt:[0,2,4,6,8,10],hw:[0,1,3,4,6,7,9,10],pd:[0,1,4,5,7,8,10],lydd:[0,2,4,6,7,9,10],mm:[0,2,3,5,7,9,11]};
const MN={ion:'イオニアン',dor:'ドリアン',phr:'フリジアン',lyd:'リディアン',mix:'ミクソリディアン',aeo:'エオリアン',loc:'ロクリアン',dim:'ディミニッシュ',wt:'ホールトーン',hw:'コンディミ',pd:'Phrygian Dom.',lydd:'Lydian Dom.',mm:'メロディックM'};
const RN=['I','bII','II','bIII','III','IV','#IV','V','bVI','VI','bVII','VII'];
function identify(w,bass){
 let best=null,bs=-9;
 for(let r=0;r<12;r++){if(w[r]<=0&&r!==bass)continue;
  for(const t of TPL){const iv=new Set(t[1]);let sc=0;
   for(let i=0;i<12;i++){const x=w[(r+i)%12];sc+=iv.has(i)?x:-1.4*x}
   for(const i of t[1])if(w[(r+i)%12]<.04)sc-=i===7?.15:(i===0?.4:.7);
   sc+=(r===bass?.25:0)-.03*t[1].length;
   if(sc>bs){bs=sc;best={r,t}}}}
 return best;
}
function applyChord(c,r,t,bass){
 c.r=r;c.t=t;c.bass=bass;c.set=new Set(t[1].map(i=>(r+i)%12));c.name=NN[r]+t[0]+(bass!==r?'/'+NN[bass]:'');
}
function parseChord(s){
 const m=/^([A-G])([#b♯♭]?)(.*?)(?:\/([A-G])([#b♯♭]?))?$/.exec(s.trim());if(!m)return null;
 const pc=(l,a)=>(({C:0,D:2,E:4,F:5,G:7,A:9,B:11})[l]+(/[#♯]/.test(a)?1:/[b♭]/.test(a)?-1:0)+12)%12;
 const sx=({M7:'maj7',maj:'',M:'',min:'m',min7:'m7',M9:'maj9','m7-5':'m7b5',ø:'m7b5','°':'dim','°7':'dim7'})[m[3]]??m[3];
 const t=TPL.find(x=>x[0]===sx);if(!t)return null;const r=pc(m[1],m[2]);
 return{r,t,bass:m[4]?pc(m[4],m[5]):r};
}
function analyzeChords(m){
 const t2s=mkT2S(m),ns=[];let mt=0;
 m.tracks.forEach(t=>t.notes.forEach(n=>{ns.push({a:t2s(n.s),b:t2s(n.e),pitch:n.pitch});mt=Math.max(mt,n.e)}));
 const h=m.ppq/2,chords=[];
 for(let k=0;k*h<mt;k++){
  const a=t2s(k*h),b=t2s((k+1)*h),w=Array(12).fill(0);let low=999;
  for(const n of ns){const o=Math.min(n.b,b)-Math.max(n.a,a);if(o>1e-4){w[n.pitch%12]+=o;if(n.pitch<low)low=n.pitch}}
  const mx=Math.max(...w),prev=chords[chords.length-1];
  if(mx<=0){if(prev)prev.b=b;continue}
  const played=[];w.forEach((x,i)=>{if(x>=.2*mx)played.push(i)});const bass=low%12,key=played.join()+'/'+bass;
  if(prev&&prev.key===key){prev.b=b;w.forEach((x,i)=>prev.w[i]+=x)}else chords.push({a,b,key,bass,w,played});
 }
 if(!chords.length)throw new Error('コードを検出できませんでした');
 chords.forEach(c=>{
  c.w=c.w.map((x,i)=>c.played.includes(i)?x:0);const tt=c.w.reduce((s,x)=>s+x,0);c.w=c.w.map(x=>x/tt);
  if(c.played.length===1){c.t=null;c.r=c.bass;c.set=new Set(c.played);c.name=NN[c.bass]}
  else{const id=identify(c.w,c.bass);applyChord(c,id.r,id.t,id.t[1].some(i=>(id.r+i)%12===c.bass)?c.bass:id.r)}
 });
 return{chords,notes:ns};
}
function estKey(ch,fixed){
 const h=Array(12).fill(0);ch.forEach(c=>{const d=c.b-c.a;c.set.forEach(x=>h[x]+=d);h[c.bass]+=d*.5});
 let best=0,bs=-1;
 for(let k=0;k<12;k++){let s=0;[0,2,4,5,7,9,11].forEach(i=>s+=h[(k+i)%12]);s+=.3*Math.max(h[k],h[(k+9)%12])+.2*h[(k+7)%12];if(s>bs){bs=s;best=k}}
 const k=fixed>=0?fixed:best;return{k,minor:h[(k+9)%12]>h[k]*1.1};
}
function chordScale(c,nx){
 const cls=c.t?c.t[2]:'maj',rel=(c.r-S.key+12)%12,dia=[...c.set].every(x=>S.scale[x]);
 const DM={0:'ion',2:'dor',4:'phr',5:'lyd',7:'mix',9:'aeo',11:'loc'};let m;
 if(cls==='dim')m='dim';else if(cls==='aug')m='wt';else if(cls==='mm')m='mm';else if(cls==='hdim')m='loc';else if(cls==='alt')m='hw';else if(cls==='lyd')m='lyd';
 else if(dia&&DM[rel])m=DM[rel];
 else if(cls==='dom'){const toMin=nx&&nx.t&&['min','hdim'].includes(nx.t[2])&&(nx.r-c.r+12)%12===5;m=toMin?'pd':rel===1?'lydd':'mix'}
 else if(cls==='min')m='dor';else if(cls==='sus')m='mix';else m='ion';
 const pcs=new Set(MODES[m].map(x=>(c.r+x)%12));c.set.forEach(x=>pcs.add(x));
 return{pcs,name:MN[m],alt:['hw','pd','dim','wt','mm','lydd'].includes(m)};
}
function chordAt(ch,a,b){
 let best=null,bo=0;for(const c of ch){const o=Math.min(b,c.b)-Math.max(a,c.a);if(o>bo){bo=o;best=c}}
 if(best)return best;
 let bd=1e9;for(const c of ch){const d=a<c.a?c.a-a:a-c.b;if(d<bd){bd=d;best=c}}return best;
}
function rng32(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

function optimize(P,seed){
 const R=rng32(seed),N=S.notes,n=N.length,sm=S.scale;
 const cand=N.map(x=>{const a=[];for(let p=x.pitch-5;p<=x.pitch+5;p++)if(p>=S.lo-3&&p<=S.hi+3&&p>=0&&p<128)a.push(p);return a});
 const node=(i,p)=>{
  const x=N[i],c=x.chord,s=x.str,pc=p%12;let k=Math.abs(p-x.pitch)*P.ws;
  if(c.set.has(pc)){if(s===2&&c.guide.size&&!c.guide.has(pc))k+=.3*P.G}
  else if(c.pcs.has(pc)){k+=c.avoid.has(pc)?[1.4,5,7][s]*P.P:[.4,2.2,3.2][s]*P.T*P.P}
  else k+=(sm[pc]?[1.8,5.5,8]:[3,8,10])[s]*P.P;
  if(s&&(pc-c.bass+12)%12===1)k+=2;
  return k+R()*P.noise;
 };
 const tr=(i,q,p)=>{
  const a=N[i],b=N[i-1],d=Math.abs(p-q),nct=!b.chord.set.has(q%12)&&b.str<2;
  let k=Math.abs((p-q)-(a.pitch-b.pitch))*P.wc+(d>7?1.5:0)+(d>9?1.5:0)+(p===q&&a.pitch!==b.pitch?.7:0);
  if(nct){if(a.chord.set.has(p%12)&&d>0&&d<=2)k-=1.1*P.P;else k+=.6*P.P}
  return k;
 };
 let prev=cand[0].map(p=>node(0,p));const back=[];
 for(let i=1;i<n;i++){
  const cur=[],bk=[];
  for(const p of cand[i]){let best=1e9,bj=0;cand[i-1].forEach((q,j)=>{const c=prev[j]+tr(i,q,p);if(c<best){best=c;bj=j}});cur.push(best+node(i,p));bk.push(bj)}
  prev=cur;back.push(bk);
 }
 let j=prev.indexOf(Math.min(...prev));const out=Array(n);
 for(let i=n-1;i>=0;i--){out[i]=cand[i][j];if(i>0)j=back[i-1][j]}
 return out;
}
function stats(pitches){
 let ch=0,st=0,stc=0,av=0,sc=0;
 S.notes.forEach((x,i)=>{const p=pitches[i],pc=p%12,c=x.chord;if(p!==x.pitch)ch++;if(c.pcs.has(pc))sc++;
  if(x.str>=1){st++;if(c.set.has(pc))stc++;else if(c.avoid.has(pc)||!c.pcs.has(pc))av++}});
 return{ch,n:S.notes.length,st,stc,av,sc};
}
const PRESETS=[
 {name:'原曲重視',desc:'変更を最小限に抑える',P:{ws:3,wc:.4,P:.8,T:1.2,G:0,noise:0}},
 {name:'バランス',desc:'変更量とコード適合の中間',P:{ws:1.5,wc:.9,P:1,T:1,G:1,noise:0}},
 {name:'コードトーン重視',desc:'弱拍もコード音へ寄せる',P:{ws:.8,wc:.9,P:1.7,T:2.2,G:1,noise:0}},
 {name:'ガイドトーン重視',desc:'強拍で3度・7度を狙う',P:{ws:1.1,wc:.9,P:1,T:1.3,G:4,noise:0}},
 {name:'テンション活用',desc:'9th・13thなどを活かす',P:{ws:1.2,wc:1,P:.9,T:.4,G:1,noise:0}},
 {name:'輪郭キープ',desc:'音程の上下の動きを保つ',P:{ws:1.2,wc:2.6,P:1,T:1,G:1,noise:0}},
];
function addRandom(k){
 let tries=0,added=0;
 while(added<k&&tries<20){
  tries++;const seed=S.rs++,R=rng32(seed*7+1);
  const P={ws:.9+R()*1.4,wc:.5+R()*1.2,P:.7+R()*1.1,T:.4+R()*1.8,G:R()*3,noise:1.5+R()*2};
  const pitches=optimize(P,seed);
  if(S.vars.some(v=>v.pitches.join()===pitches.join()))continue;
  S.vars.push({name:'ランダム案 '+(S.vars.filter(v=>v.rnd).length+1),desc:'ばらつきを加えた案',pitches,rnd:1});added++;
 }
}
function prep(){
 const tn=S.minor?(S.key+9)%12:S.key;
 S.chords.forEach((c,i)=>{
  const sc=c.sc=chordScale(c,S.chords[i+1]);c.pcs=sc.pcs;c.avoid=new Set();
  if(!sc.alt)sc.pcs.forEach(p=>{if(!c.set.has(p)&&[...c.set].some(t=>(p-t+12)%12===1))c.avoid.add(p)});
  c.guide=new Set(c.t?c.t[1].filter(i=>[3,4,10,11].includes(i)).map(i=>(c.r+i)%12):[]);
  let n=RN[(c.r-tn+12)%12];if(c.t&&['min','hdim','dim','mm'].includes(c.t[2]))n=n.toLowerCase();
  c.rn=n+(c.t?c.t[0].replace(/^m(?!aj|M)/,''):'');
 });
}
function regen(){
 stop();prep();
 const m=S.melM,ppq=m.ppq,t2s=S.t2s=mkT2S(m),ts=m.ts[0]||{num:4,den:4},bar=ppq*4*ts.num/ts.den,tol=ppq/8;
 const arr=[...S.tr.notes].sort((a,b)=>a.s-b.s||a.pitch-b.pitch);
 S.notes=arr.map((n,i)=>{
  const x={...n,a:t2s(n.s),b:t2s(n.e)};x.chord=chordAt(S.chords,x.a,x.b);
  const pos=n.s%bar,bp=n.s%ppq,nx=arr[i+1];
  let s=(pos<tol||bar-pos<tol)?2:((bp<tol||ppq-bp<tol||n.e-n.s>=ppq*.9)?1:0);
  if(!nx)s=2;else if(nx.s-n.e>=ppq*.75)s=Math.max(s,1);
  x.str=s;return x});
 S.lo=Math.min(...S.notes.map(x=>x.pitch));S.hi=Math.max(...S.notes.map(x=>x.pitch));
 S.dur=Math.max(S.notes[S.notes.length-1].b,S.chords[S.chords.length-1].b,...S.notes.map(x=>x.b));
 S.vars=[{name:'原曲',desc:'改変なしの元メロディー',pitches:S.notes.map(x=>x.pitch),orig:1}];
 PRESETS.forEach((p,i)=>{const pitches=optimize(p.P,i+1);if(!S.vars.some(v=>v.pitches.join()===pitches.join()))S.vars.push({name:p.name,desc:p.desc,pitches})});
 S.rs=100;addRandom(3);S.harm=[];S.hsel=null;rebuildArr();S.sel=Math.min(S.sel,S.vars.length-1);
 $('#msg').className='';
 $('#msg').textContent=`コード ${S.chords.length}区間 ・ キー ${S.minor?NN[(S.key+9)%12]+'マイナー':NN[S.key]+'メジャー'} ・ メロディー ${S.notes.length}音 ・ ${shiftTxt()} ・ ${S.vars.length-1}案を生成（同一の案は除外）`;
 $('#more').disabled=false;render();
}
function renderChords(){
 $('#cl').innerHTML=S.chords.map((c,i)=>`<div class="ch"><span>${i+1}・${c.rn||''}</span><input data-i="${i}" value="${c.name}"><span>${c.sc?c.sc.name:''}</span></div>`).join('');
}
function run(){
 const msg=$('#msg');msg.className='';stop();
 if(!S.chordM||!S.melM)return;
 try{
  S.tr=S.melM.tracks[+$('#ts').value];
  const ca=analyzeChords(S.chordM);S.chords=ca.chords;S.cn=ca.notes;S.shift=pickShift();if(S.shift)S.chords.forEach(c=>shiftChord(c,S.shift));
  const ki=estKey(S.chords,+$('#ks').value);S.key=ki.k;S.minor=ki.minor;
  S.scale=Array(12).fill(false);[0,2,4,5,7,9,11].forEach(i=>S.scale[(S.key+i)%12]=true);
  regen();renderChords();$('#csv').disabled=!S.shift;
 }catch(e){msg.className='err';msg.textContent=e.message;console.error(e)}
}
function shiftChord(c,s){
 if(c.t)applyChord(c,(c.r+s+12)%12,c.t,(c.bass+s+12)%12);
 else{c.r=(c.r+s+12)%12;c.bass=(c.bass+s+12)%12;c.set=new Set([...c.set].map(x=>(x+s+12)%12));c.name=NN[c.bass]}
}
function pickShift(){
 const v=$('#sh').value;S.fit=null;if(v!=='auto')return +v;
 const t2s=mkT2S(S.melM),k0=estKey(S.chords,-1).k,sc0=[0,2,4,5,7,9,11].map(i=>(k0+i)%12);
 const ns=S.tr.notes.map(n=>({d:t2s(n.e)-t2s(n.s),pc:n.pitch%12,c:chordAt(S.chords,t2s(n.s),t2s(n.e))}));
 const tot=ns.reduce((s,n)=>s+n.d,0)||1;
 const score=s=>ns.reduce((a,n)=>{const p=(n.pc-s+12)%12;return a+n.d*(n.c.set.has(p)?1:sc0.includes(p)?.35:0)},0)/tot;
 const s0=score(0);let best=0,bs=s0;
 for(const s of [1,-1,2,-2,3,-3,4,-4,5,-5,6]){const x=score(s);if(x>bs+1e-6){bs=x;best=s}}
 if(bs-s0<.03){best=0;bs=s0}
 S.fit=[s0,bs];return best;
}
function shiftTxt(){
 if(!S.shift)return 'コード移調なし';
 return `コードを${S.shift>0?'+':''}${S.shift}半音移調`+(S.fit?`（自動・メロディー合致率 ${Math.round(S.fit[0]*100)}%→${Math.round(S.fit[1]*100)}%）`:'');
}
// 保存: claude.ai上ではダウンロード機能、通常のブラウザ(GitHub Pages等)ではBlobダウンロード
async function dlSave(filename,data){
 const msg=$('#msg');
 try{
  const dl=window.claude&&window.claude.use?await window.claude.use('downloads'):null;
  if(dl)await dl.save({filename,data});
  else{
   const u=URL.createObjectURL(new Blob([data],{type:'audio/midi'})),a=document.createElement('a');
   a.href=u;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),3000);
  }
  msg.className='';msg.textContent=`${filename} を書き出しました`;
 }catch(e){if(e&&e.code==='declined')return;msg.className='err';msg.textContent='保存できませんでした: '+(e.message||e.code)}
}
function saveChords(){
 const m=S.chordM,sh=S.shift||0,t0=[];
 (m.tempos.length?m.tempos:[{tick:0,us:500000}]).forEach(t=>t0.push({tick:t.tick,b:[0xFF,0x51,3,(t.us>>16)&255,(t.us>>8)&255,t.us&255]}));
 m.ts.forEach(t=>t0.push({tick:t.tick,b:[0xFF,0x58,4,t.num,Math.log2(t.den),24,8]}));t0.sort((a,b)=>a.tick-b.tick);
 const out=[0x4D,0x54,0x68,0x64,0,0,0,6,0,1,0,m.tracks.length+1,(m.ppq>>8)&255,m.ppq&255];cat(out,chunk(t0));
 m.tracks.forEach(tr=>{
  const ev=[];if(tr.prog!==null)ev.push({tick:0,o:-1,b:[0xC0|tr.ch,tr.prog]});
  tr.notes.forEach(x=>{const p=Math.max(0,Math.min(127,x.pitch+sh));ev.push({tick:x.s,o:1,b:[0x90|x.ch,p,x.vel]});ev.push({tick:x.e,o:0,b:[0x80|x.ch,p,0]})});
  ev.sort((a,b)=>a.tick-b.tick||(a.o??2)-(b.o??2));cat(out,chunk(ev));
 });
 const base=(S.chordName||'chords').replace(/\.midi?$/i,'');
 dlSave(`${base}_transposed${sh>0?'+':''}${sh}.mid`,new Uint8Array(out));
}
function statsText(v){
 const s=stats(v.pitches),pc=(a,b)=>b?Math.round(a/b*100)+'%':'-';
 return `変更 ${s.ch}/${s.n}音 (${pc(s.ch,s.n)})<br>強拍のコード音率 ${pc(s.stc,s.st)}<br>強拍のアヴォイド/外れ音 ${s.av}個<br>コードスケール内 ${pc(s.sc,s.n)}`+(v.an?`<br>アレンジ後 ${v.an.length}音（追加${v.an.filter(x=>x.add).length}音）`:'');
}
function render(){
 $('#cards').innerHTML=S.vars.map((v,i)=>`<div class="card${i===S.sel?' sel':''}" data-i="${i}"><b>${v.name}</b>${v.orig?'<span class="tag">原曲</span>':''}<p class="d">${v.desc}</p><p class="s">${statsText(v)}</p><div class="bt"><button data-a="play">${S.playing===i?'■ 停止':'▶ 試聴'}</button>${v.orig?'':'<button data-a="save">⬇ MIDI出力</button>'}</div></div>`).join('');
 draw();renderH();
}
function draw(){
 const v=S.vars[S.sel];if(!v)return;
 const cs=getComputedStyle(document.documentElement),C=n=>cs.getPropertyValue(n).trim(),sc=$('#sc'),cv=$('#cv');
 const dur=S.dur+.5,PX=S.PX=Math.max(46,Math.min(110,(sc.clientWidth-8)/dur));
 const hp=S.harm[S.hsel],lo=Math.min(S.lo,...(hp?hp.pitches:[999]))-3,hi=Math.max(S.hi,...(hp?hp.pitches:[-1]))+3,RH=Math.max(7,Math.min(14,260/(hi-lo+1))),rows=(hi-lo+1)*RH,W=Math.ceil(dur*PX),H=rows+34,dpr=window.devicePixelRatio||1;
 cv.width=W*dpr;cv.height=H*dpr;cv.style.width=W+'px';cv.style.height=H+'px';
 const g=cv.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,W,H);
 g.fillStyle=C('--stripe');
 S.chords.forEach(c=>{for(let p=lo;p<=hi;p++)if(c.set.has(p%12))g.fillRect(c.a*PX,(hi-p)*RH,(c.b-c.a)*PX,RH)});
 g.font='11px system-ui,sans-serif';g.textBaseline='middle';
 S.chords.forEach(c=>{g.fillStyle=C('--bd');g.fillRect(c.a*PX,0,1,H);g.fillStyle=C('--fg');g.fillText(c.name,c.a*PX+4,rows+11);g.fillStyle=C('--mut');g.fillText(c.rn||'',c.a*PX+4,rows+26)});
 vn(v).forEach(x=>{
  const o=S.notes[x.k],p=x.pitch,w=Math.max(2,(x.b-x.a)*PX-1);
  if(p!==o.pitch){g.strokeStyle=C('--mut');g.lineWidth=1;g.strokeRect(o.a*PX+.5,(hi-o.pitch)*RH+1.5,Math.max(2,(o.b-o.a)*PX-1),RH-3)}
  g.fillStyle=C(x.add||p!==o.pitch?'--ac':'--ac2');g.fillRect(x.a*PX,(hi-p)*RH+1,w,RH-2);
 });
 if(hp){g.fillStyle=C('--ac3');hp.pitches.forEach((p,i)=>{const x=S.notes[i];g.fillRect(x.a*PX,(hi-p)*RH+1,Math.max(2,(x.b-x.a)*PX-1),RH-2)})}
}
function stop(){
 cancelAnimationFrame(raf);oscs.forEach(o=>{try{o.stop()}catch(e){}});oscs=[];
 if(master){try{master.disconnect()}catch(e){}}
 const was=S.playing!==null;S.playing=null;$('#ph').style.left='-9px';if(was&&S.vars.length)render();
}
function play(i,hv){
 const id=hv?'h'+hv.id:i,was=S.playing===id;stop();if(was)return;
 const v=S.vars[hv?S.hsrc:i];ac=ac||new(window.AudioContext||window.webkitAudioContext)();ac.resume();
 master=ac.createGain();master.connect(ac.destination);
 const t0=ac.currentTime+.12;
 const note=(a,b,p,gn,type)=>{
  const o=ac.createOscillator(),e=ac.createGain(),s=t0+a,en=t0+Math.max(b,a+.06);
  o.type=type;o.frequency.value=440*2**((p-69)/12);
  e.gain.setValueAtTime(0,s);e.gain.linearRampToValueAtTime(gn,s+.01);e.gain.setValueAtTime(gn,en-.04);e.gain.linearRampToValueAtTime(0,en);
  o.connect(e);e.connect(master);o.start(s);o.stop(en+.05);oscs.push(o);
 };
 (hv?baseNotes(v):vn(v)).forEach(x=>note(x.a,x.b,x.pitch,.04+.18*x.vel/127,'triangle'));
 if(hv){const k=+$('#hv').value/100;S.notes.forEach((x,q)=>note(x.a,x.b,hv.pitches[q],.02+.08*x.vel/127*k,'sawtooth'))}
 if($('#cp').checked)S.cn.forEach(x=>note(x.a,x.b,x.pitch+(S.shift||0),.045,'sine'));
 if(!hv)S.sel=i;S.playing=id;render();
 const sc=$('#sc'),ph=$('#ph');sc.scrollLeft=0;
 const loop=()=>{const t=ac.currentTime-t0,x=Math.max(0,t)*S.PX;ph.style.left=x+'px';
  if(x>sc.scrollLeft+sc.clientWidth-40)sc.scrollLeft=x-40;
  if(t>S.dur+.4){stop();return}raf=requestAnimationFrame(loop)};
 loop();
}
const vlq=n=>{const b=[n&127];while(n>>=7)b.unshift((n&127)|128);return b};
const cat=(o,a)=>{for(const x of a)o.push(x)};
function chunk(evs){
 const body=[];let last=0;
 evs.forEach(e=>{cat(body,vlq(e.tick-last));cat(body,e.b);last=e.tick});
 cat(body,[0,0xFF,0x2F,0]);
 const o=[0x4D,0x54,0x72,0x6B,(body.length>>>24)&255,(body.length>>>16)&255,(body.length>>>8)&255,body.length&255];cat(o,body);return o;
}
function toMidi(v){
 const m=S.melM,tr=S.tr,t0=[];
 (m.tempos.length?m.tempos:[{tick:0,us:500000}]).forEach(t=>t0.push({tick:t.tick,b:[0xFF,0x51,3,(t.us>>16)&255,(t.us>>8)&255,t.us&255]}));
 m.ts.forEach(t=>t0.push({tick:t.tick,b:[0xFF,0x58,4,t.num,Math.log2(t.den),24,8]}));
 t0.sort((a,b)=>a.tick-b.tick);
 const nm=[...new TextEncoder().encode((tr.name||'Melody')+' ('+v.name+')')],ev=[{tick:0,o:-1,b:[0xFF,0x03,nm.length,...nm]}];
 if(tr.prog!==null)ev.push({tick:0,o:-1,b:[0xC0|tr.ch,tr.prog]});
 vn(v).forEach(x=>{ev.push({tick:x.s,o:1,b:[0x90|x.ch,x.pitch,x.vel]});ev.push({tick:x.e,o:0,b:[0x80|x.ch,x.pitch,0]})});
 ev.sort((a,b)=>a.tick-b.tick||(a.o??2)-(b.o??2));
 const out=[0x4D,0x54,0x68,0x64,0,0,0,6,0,1,0,2,(m.ppq>>8)&255,m.ppq&255];
 cat(out,chunk(t0));cat(out,chunk(ev));return new Uint8Array(out);
}
function save(i){const v=S.vars[i],base=(S.melName||'melody').replace(/\.midi?$/i,'');dlSave(`${base}_arr${i}.mid`,toMidi(v))}
async function load(kind,f){
 if(!f)return;const msg=$('#msg');
 try{
  const m=parseMidi(await f.arrayBuffer());
  if(kind==='c'){S.chordM=m;S.chordName=f.name;$('#cn').textContent=f.name;$('#dc').classList.add('ok')}
  else{
   S.melM=m;S.melName=f.name;$('#mn').textContent=f.name;$('#dm').classList.add('ok');
   $('#ts').innerHTML=m.tracks.map((t,i)=>`<option value="${i}">${(t.name||'Track '+(i+1)).replace(/</g,'&lt;')} (${t.notes.length}音)</option>`).join('');
   $('#ts').value=m.tracks.reduce((b,t,i)=>t.notes.length>m.tracks[b].notes.length?i:b,0);
  }
  S.sel=0;run();
 }catch(e){msg.className='err';msg.textContent=f.name+': '+e.message}
}
[['c','#dc','#fc'],['m','#dm','#fm']].forEach(([k,box,inp])=>{
 $(inp).onchange=e=>load(k,e.target.files[0]);
 const b=$(box);
 b.ondragover=e=>{e.preventDefault();b.classList.add('over')};
 b.ondragleave=()=>b.classList.remove('over');
 b.ondrop=e=>{e.preventDefault();b.classList.remove('over');load(k,e.dataTransfer.files[0])};
});
$('#cl').onchange=e=>{const i=+e.target.dataset.i,p=parseChord(e.target.value);if(!p){e.target.classList.add('bad');return}applyChord(S.chords[i],p.r,p.t,p.bass);try{regen();renderChords()}catch(x){console.error(x)}};
$('#sh').innerHTML='<option value="auto">自動（メロディーに合わせる）</option><option value="0">移調しない</option>'+[-6,-5,-4,-3,-2,-1,1,2,3,4,5,6].map(n=>`<option value="${n}">${n>0?'+':''}${n}半音</option>`).join('');
$('#sh').onchange=run;$('#csv').onclick=saveChords;
$('#ts').onchange=()=>{S.sel=0;run()};$('#ks').onchange=run;
$('#more').onclick=()=>{addRandom(3);rebuildArr();render()};
$('#cards').onclick=e=>{
 const c=e.target.closest('.card');if(!c)return;const i=+c.dataset.i,a=e.target.dataset.a;
 if(a==='play')play(i);else if(a==='save')save(i);else{S.sel=i;render()}
};
const IV3=[99,7,6,0,0,1.6,4,1,.8,.8,4,5,2.2,7,6],IV6=[99,7,6,.8,.8,1.2,4,1,0,0,4,5,2.2,7,6],IVM=[99,7,6,0,0,1.2,4,1,.2,.2,4,5,2.2,7,6];
const HP=[
 {name:'3度上',desc:'メロディーの3度上（ダイアトニック）',P:{side:1,iv:IV3,ct:1,sm:1}},
 {name:'3度下',desc:'メロディーの3度下',P:{side:-1,iv:IV3,ct:1,sm:1}},
 {name:'6度下',desc:'厚みのある定番の6度下',P:{side:-1,iv:IV6,ct:1,sm:1}},
 {name:'6度上',desc:'明るく開いた6度上',P:{side:1,iv:IV6,ct:1,sm:1}},
 {name:'自動（滑らか）',desc:'上下を切替えて動きを小さく',P:{side:0,iv:IVM,ct:1,sm:2}},
 {name:'コードトーン重視',desc:'コード音を最優先で選ぶ',P:{side:0,iv:IVM,ct:2.6,sm:1}},
];
const nName=p=>NN[p%12]+(Math.floor(p/12)-1);
function genHarm(P){
 const N=S.notes,n=N.length,src=S.vars[S.hsrc].pitches,sm=S.scale;
 const cand=src.map(m=>{const a=[];for(let d=1;d<=14;d++){if(P.side>=0&&m+d<=S.hi+14)a.push(m+d);if(P.side<=0&&m-d>=Math.max(21,S.lo-14))a.push(m-d)}return a});
 const node=(i,h)=>{
  const x=N[i],c=x.chord,s=x.str,pc=h%12;let k=P.iv[Math.abs(h-src[i])];
  if(!c.set.has(pc))k+=c.pcs.has(pc)?(c.avoid.has(pc)?[1,3,4][s]:[.3,.9,1.5][s])*P.ct:(sm[pc]?[1.8,4.5,6]:[2.5,6,8])[s]*P.ct;
  return k;
 };
 const tr=(i,q,p)=>{
  if(N[i].a-N[i-1].b>.5)return 0;
  const dm=src[i]-src[i-1],dh=p-q,cl=Math.abs(p-src[i])%12,pl=Math.abs(q-src[i-1])%12;
  let k=Math.abs(dh)*.12*P.sm+Math.abs(dh-dm)*.12+(Math.abs(dh)>5?1.2:0);
  if((cl===0||cl===7)&&dm!==0){if(cl===pl)k+=5;else if(dh*dm>0)k+=1.5}
  if(P.side===0&&(p>src[i])!==(q>src[i-1]))k+=1.5;
  return k;
 };
 let prev=cand[0].map(h=>node(0,h));const back=[];
 for(let i=1;i<n;i++){
  const cur=[],bk=[];
  for(const p of cand[i]){let best=1e9,bj=0;cand[i-1].forEach((q,j)=>{const c=prev[j]+tr(i,q,p);if(c<best){best=c;bj=j}});cur.push(best+node(i,p));bk.push(bj)}
  prev=cur;back.push(bk);
 }
 let j=prev.indexOf(Math.min(...prev));const out=Array(n);
 for(let i=n-1;i>=0;i--){out[i]=cand[i][j];if(i>0)j=back[i-1][j]}
 return out;
}
function genAllH(){
 if(!S.notes)return;S.hsrc=+$('#hs').value;S.harm=[];
 HP.forEach(p=>{const pitches=genHarm(p.P);if(!S.harm.some(h=>h.pitches.join()===pitches.join()))S.harm.push({id:S.harm.length,name:p.name,desc:p.desc,pitches})});
 S.hsel=0;render();
}
function hstatsText(h){
 const src=S.vars[S.hsrc].pitches,n=S.notes.length;let t=0,ds=0,st=0,stc=0,lo=999,hi=0;
 S.notes.forEach((x,i)=>{const p=h.pitches[i],d=Math.abs(p-src[i])%12;if([3,4,8,9].includes(d))t++;else if([1,2,6,10,11].includes(d))ds++;
  if(x.str>=1){st++;if(x.chord.set.has(p%12))stc++}lo=Math.min(lo,p);hi=Math.max(hi,p)});
 const pc=(a,b)=>b?Math.round(a/b*100)+'%':'-';
 return `3度・6度の音程 ${pc(t,n)}<br>不協和な音程 ${ds}個<br>強拍のコード音率 ${pc(stc,st)}<br>音域 ${nName(lo)}〜${nName(hi)}`;
}
function renderH(){
 const sel=$('#hs'),cur=sel.value;
 sel.innerHTML=S.vars.map((v,i)=>`<option value="${i}">${v.name}</option>`).join('');
 sel.value=cur!==''&&+cur<S.vars.length?cur:S.sel;$('#hg').disabled=!S.vars.length;
 $('#hcards').innerHTML=S.harm.length?S.harm.map((h,j)=>`<div class="card${j===S.hsel?' sel':''}" data-j="${j}"><b>${h.name}</b><p class="d">${h.desc}</p><p class="s">${hstatsText(h)}</p><div class="bt"><button data-a="play">${S.playing==='h'+h.id?'■ 停止':'▶ 試聴'}</button><button data-a="save">⬇ MIDI出力</button></div></div>`).join(''):'<p class="d" style="color:var(--mut);font-size:13px">ベースにするメロディー案を選んで「ハモリを生成」を押してください。</p>';
}
function toMidiH(h,both){
 const m=S.melM,tr=S.tr,src=S.vars[S.hsrc],t0=[],k=+$('#hv').value/100;
 (m.tempos.length?m.tempos:[{tick:0,us:500000}]).forEach(t=>t0.push({tick:t.tick,b:[0xFF,0x51,3,(t.us>>16)&255,(t.us>>8)&255,t.us&255]}));
 m.ts.forEach(t=>t0.push({tick:t.tick,b:[0xFF,0x58,4,t.num,Math.log2(t.den),24,8]}));t0.sort((a,b)=>a.tick-b.tick);
 const mk=(name,pitches,ch,vs)=>{
  const nm=[...new TextEncoder().encode(name)],ev=[{tick:0,o:-1,b:[0xFF,0x03,nm.length,...nm]}];
  if(tr.prog!==null)ev.push({tick:0,o:-1,b:[0xC0|ch,tr.prog]});
  S.notes.forEach((x,i)=>{const v=Math.max(1,Math.min(127,Math.round(x.vel*vs)));ev.push({tick:x.s,o:1,b:[0x90|ch,pitches[i],v]});ev.push({tick:x.e,o:0,b:[0x80|ch,pitches[i],0]})});
  return ev.sort((a,b)=>a.tick-b.tick||(a.o??2)-(b.o??2));
 };
 const trs=[];if(both)trs.push(mk('Melody',src.pitches,tr.ch,1));
 trs.push(mk('Harmony ('+h.name+')',h.pitches,both?(tr.ch===0?1:0):tr.ch,k));
 const out=[0x4D,0x54,0x68,0x64,0,0,0,6,0,1,0,trs.length+1,(m.ppq>>8)&255,m.ppq&255];
 cat(out,chunk(t0));trs.forEach(e=>cat(out,chunk(e)));return new Uint8Array(out);
}
$('#hg').onclick=genAllH;
$('#hcards').onclick=e=>{
 const c=e.target.closest('.card');if(!c)return;const j=+c.dataset.j,h=S.harm[j],a=e.target.dataset.a;
 if(a==='play'){S.hsel=j;play(0,h)}
 else if(a==='save'){const both=$('#ho').value==='b',base=(S.melName||'melody').replace(/\.midi?$/i,'');dlSave(`${base}_harmony${j+1}${both?'_with_melody':''}.mid`,toMidiH(h,both))}
 else{S.hsel=j;render()}
};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const baseNotes=v=>S.notes.map((x,i)=>({...x,pitch:v.pitches[i],k:i}));
const vn=v=>v.an||baseNotes(v);
function readAO(){
 const g=id=>$('#o_'+id).checked;
 return{deg:+document.querySelector('input[name=deg]:checked').value,stac:g('stac'),early:g('early'),late:g('late'),split:g('split'),fill:g('fill'),grace:g('grace'),swing:g('swing'),accent:g('accent')};
}
function arrange(base,seed,O){
 const R=rng32(seed),ppq=S.melM.ppq,d=O.deg,pr=[0,.15,.35,.6][d],q=ppq/4,sh=d===3?ppq/2:q,tol=ppq/16,L=d===1?ppq/2:q,out=[];
 const off8=t=>Math.abs(((t%ppq)+ppq)%ppq-ppq/2)<=tol,ch=p=>R()<p;
 const mk=(b,s,e,pitch,vel,add)=>({...b,s,e,pitch,vel:clamp(Math.round(vel),1,127),add:!!add});
 base.forEach((b,i)=>{
  const nx=base[i+1],c=b.chord,P=b.pitch;let s=b.s,e=b.e;
  const vel=b.vel+(O.accent?(b.str===2?14:b.str===1?6:-6)*[0,.5,.9,1.3][d]:0)+(d>1?R()*6-3:0);
  if(O.swing&&off8(s)){const w=ppq*[0,.06,.1,.16][d];s+=w;if(off8(b.e))e+=w}
  if(O.early&&i>0&&b.str>=1&&ch(pr)){s-=sh;e-=sh}
  else if(O.late&&b.str===0&&ch(pr)){s+=sh;e+=sh;if(nx)e=Math.min(e,nx.s)}
  s=Math.max(0,s);e=Math.max(e,s+q/2);
  const prev=out[out.length-1];
  if(prev&&prev.e>s)prev.e=Math.max(prev.s+q/2,s);
  if(O.grace&&prev&&b.str>=1&&prev.e-prev.s>=ppq/2&&ch(pr*.7)){
   const dir=P>=prev.pitch?-1:1;let gp=null;
   for(const k of[1,2])if(c.pcs.has(((P+dir*k)%12+12)%12)){gp=P+dir*k;break}
   if(gp!==null&&gp!==prev.pitch){const gl=Math.min(q,(prev.e-prev.s)/2);prev.e=Math.max(prev.s+1,Math.min(prev.e,s-gl));out.push(mk(b,s-gl,s,gp,vel*.75,1))}
  }
  const dur=e-s;
  if(O.split&&dur>=ppq*.75&&ch(pr)){
   const k=d===3&&dur>=ppq*1.5?4:2,l=dur/k;
   for(let j=0;j<k;j++)out.push(mk(b,s+j*l,s+(j+1)*l-(j<k-1?l*.12:0),P,vel*(j?.85:1)));
   return;
  }
  let tones=[];
  if(O.fill&&nx&&dur>=ppq*.9&&nx.s-e<q&&ch(Math.min(1,pr*1.3))){
   const lo=Math.min(P,nx.pitch),hi=Math.max(P,nx.pitch),sz=hi-lo;
   if(sz>=3&&sz<=9){
    for(let p=lo+1;p<hi;p++)if(c.pcs.has(p%12)&&!c.avoid.has(p%12))tones.push(p);
    if(nx.pitch<P)tones.reverse();
    tones=tones.slice(0,Math.min(d,Math.floor(dur/2/L)));
   }
  }
  const n=tones.length;
  if(!n&&O.stac&&e-s>=ppq/2&&ch(Math.min(1,pr*1.8)))e=s+Math.max(q,(e-s)*[1,.8,.6,.45][d]);
  out.push(mk(b,s,e-n*L,P,vel));
  tones.forEach((p,j)=>out.push(mk(b,e-(n-j)*L,e-(n-j-1)*L,p,vel*.8,1)));
 });
 out.sort((x,y)=>x.s-y.s||x.pitch-y.pitch);
 out.forEach(x=>{x.s=Math.round(x.s);x.e=Math.max(x.s+1,Math.round(x.e));x.a=S.t2s(x.s);x.b=S.t2s(x.e)});
 return out;
}
function rebuildArr(){
 const O=S.ao=readAO();
 S.vars.forEach((v,i)=>{v.an=(O.deg&&!v.orig)?arrange(baseNotes(v),S.aseed*1009+i*37+11,O):null});
}
function arrChanged(){if(!S.vars.length)return;stop();rebuildArr();render()}
$('#arrsec').onchange=arrChanged;$('#rr').onclick=()=>{S.aseed++;arrChanged()};
window.addEventListener('resize',()=>{if(S.vars.length)draw()});
