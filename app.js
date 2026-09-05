const API=(window.ESSENCE_API||"http://localhost:4000/api");
async function get(path){const r=await fetch(API+path);if(!r.ok)throw Error("API unavailable");return r.json()}
function card(a){return `<article class="card"><div class="muted">${a.category||"Essence Network"}</div><h3>${esc(a.title)}</h3><p>${esc(a.excerpt||a.description||"")}</p></article>`}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
async function load(){
 try{
  const featured=document.querySelector("#featured"); if(featured){const a=await get("/public/articles?status=published&featured=true");featured.innerHTML=a.length?a.map(card).join(""):"<div class='empty'>No featured stories published yet.</div>"}
  const news=document.querySelector("#news"); if(news){const a=await get("/public/articles?status=published");news.innerHTML=a.length?a.map(card).join(""):"<div class='empty'>No published stories yet.</div>"}
  const p=document.querySelector("#programmes"); const hp=document.querySelector("#homePrograms"); if(p||hp){const a=await get("/public/programmes");const html=a.length?a.map(card).join(""):"<div class='empty'>No programmes published yet.</div>";if(p)p.innerHTML=html;if(hp)hp.innerHTML=html}
  const s=document.querySelector("#schedule");if(s){const a=await get("/public/schedule");s.innerHTML=a.length?a.map(x=>`<div class='guide-row'><b>${new Date(x.starts_at).toLocaleString()}</b><h3>${esc(x.title)}</h3><span class='muted'>${new Date(x.ends_at).toLocaleTimeString()}</span></div>`).join(""):"<div class='empty'>No EPG schedule published yet.</div>"}
  const now=document.querySelector("#nowTitle");if(now){const d=await get("/public/now-next");now.textContent=d.now?.title||"Off Air";document.querySelector("#nextTitle").textContent=d.next?.title||"—";document.querySelector("#liveProgramme").textContent=d.now?.title||"Essence Network Live"}
 }catch(e){document.querySelectorAll("#featured,#news,#programmes,#homePrograms,#schedule").forEach(x=>x.innerHTML="<div class='empty'>Connect the CMS API to load live content.</div>")}
}
load();