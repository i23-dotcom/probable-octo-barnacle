/*
 Essence Network — Phase 8 Scheduler Worker
 Checks the station schedule periodically and starts the correct channel playout.
 Start with: node scheduler.js
*/
const fs=require("fs"),path=require("path"),{spawn}=require("child_process");
const DB=path.join(__dirname,"station.json"),MEDIA=path.join(__dirname,"media"),HLS=path.join(__dirname,"hls");
const jobs=new Map(), POLL=5000;
const load=()=>{try{return JSON.parse(fs.readFileSync(DB))}catch{return {channels:[],media:[],playout:{},schedules:[]}}};
const save=x=>fs.writeFileSync(DB,JSON.stringify(x,null,2));
const clean=x=>String(x).replace(/[^a-zA-Z0-9_-]/g,"");
function mediaUrl(m){ if(!m)return ""; if(m.filename)return path.join(MEDIA,m.filename); return m.url||""; }
function stop(cid){const p=jobs.get(cid);if(p){p.kill("SIGTERM");jobs.delete(cid)}}
function start(cid,item,next){
  stop(cid); const dir=path.join(HLS,clean(cid));fs.mkdirSync(dir,{recursive:true});
  const src=mediaUrl(item); if(!src)return;
  const args=["-hide_banner","-loglevel","warning","-re","-stream_loop","-1","-i",src,
    "-map","0:v:0?","-map","0:a:0?","-c:v","libx264","-preset","veryfast","-tune","zerolatency",
    "-c:a","aac","-b:a","128k","-f","hls","-hls_time","4","-hls_list_size","6",
    "-hls_flags","delete_segments+append_list",path.join(dir,"index.m3u8")];
  const p=spawn("ffmpeg",args,{stdio:["ignore","ignore","pipe"]});
  jobs.set(cid,p);
  p.on("exit",()=>jobs.delete(cid));
  return "/hls/"+clean(cid)+"/index.m3u8";
}
function tick(){
  const s=load(), now=Date.now();
  for(const c of s.channels){
    const entries=s.schedules.filter(x=>x.channelId===c.id).map(x=>({...x,startMs:Date.parse(x.start),endMs:x.end?Date.parse(x.end):Infinity}))
      .filter(x=>Number.isFinite(x.startMs)&&x.startMs<=now&&x.endMs>now)
      .sort((a,b)=>b.startMs-a.startMs);
    const current=entries[0];
    if(!current){
      // Leave an explicitly running channel alone; scheduler only controls scheduled output.
      continue;
    }
    const m=s.media.find(x=>x.id===current.mediaId); if(!m)continue;
    const p=s.playout[c.id]||[];
    if(p.scheduleId!==current.id){
      const manifest=start(c.id,m);
      s.playout[c.id]={...p,onAir:true,scheduleId:current.id,nowPlaying:m.title,manifest};
      save(s);
    }
  }
}
console.log("Essence scheduler running; polling every "+POLL+"ms");
tick();setInterval(tick,POLL);
