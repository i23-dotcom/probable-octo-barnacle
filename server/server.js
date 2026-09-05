const express=require("express");
const cors=require("cors");
const fs=require("fs");
const path=require("path");
const multer=require("multer");
const {spawn}=require("child_process");
const app=express();
const PORT=process.env.PORT||8787;
const DB=path.join(__dirname,"station.json");
const MEDIA=path.join(__dirname,"media");
const HLS=path.join(__dirname,"hls");
fs.mkdirSync(MEDIA,{recursive:true}); fs.mkdirSync(HLS,{recursive:true});

const load=()=>{try{return JSON.parse(fs.readFileSync(DB))}catch(e){const x={channels:[],media:[],playout:{},schedules:[]};fs.writeFileSync(DB,JSON.stringify(x,null,2));return x}};
const save=x=>fs.writeFileSync(DB,JSON.stringify(x,null,2));
const id=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const safe=x=>String(x).replace(/[^a-zA-Z0-9_-]/g,"");
const jobs=new Map();

app.use(cors()); app.use(express.json({limit:"2mb"}));
app.use("/media",express.static(MEDIA));
app.use("/hls",express.static(HLS));
app.get("/api/health",(q,r)=>r.json({ok:true,service:"essence-station-api"}));
app.get("/api/station",(q,r)=>r.json(load()));

const upload=multer({
 storage:multer.diskStorage({
  destination:(req,file,cb)=>cb(null,MEDIA),
  filename:(req,file,cb)=>{
   const ext=path.extname(file.originalname).toLowerCase();
   cb(null,Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,7)+ext);
  }
 }),
 limits:{fileSize:2*1024*1024*1024}
});

app.post("/api/upload",upload.single("file"),(q,r)=>{
 if(!q.file)return r.status(400).json({error:"No file uploaded"});
 const s=load();
 const m={id:id(),title:q.body.title||path.parse(q.file.originalname).name,type:"video",
   filename:q.file.filename,url:"/media/"+encodeURIComponent(q.file.filename),
   size:q.file.size,originalName:q.file.originalname};
 s.media.push(m); save(s); r.status(201).json(m);
});

app.post("/api/channels",(q,r)=>{
 const s=load(),b=q.body||{};
 if(!b.name)return r.status(400).json({error:"name required"});
 const c={id:id(),name:b.name,number:b.number||s.channels.length+1,logo:b.logo||"",category:b.category||"General",enabled:true};
 s.channels.push(c); save(s); r.status(201).json(c);
});
app.delete("/api/channels/:id",(q,r)=>{
 const s=load(); s.channels=s.channels.filter(x=>x.id!==q.params.id);
 delete s.playout[q.params.id]; s.schedules=s.schedules.filter(x=>x.channelId!==q.params.id); save(s);
 r.json({ok:true});
});

app.post("/api/media",(q,r)=>{
 const s=load(),b=q.body||{};
 if(!b.title)return r.status(400).json({error:"title required"});
 const m={id:id(),title:b.title,type:b.type||"video",url:b.url||""};
 s.media.push(m);save(s);r.status(201).json(m);
});
app.delete("/api/media/:id",(q,r)=>{
 const s=load(); const m=s.media.find(x=>x.id===q.params.id);
 if(m?.filename)try{fs.unlinkSync(path.join(MEDIA,m.filename))}catch(e){}
 s.media=s.media.filter(x=>x.id!==q.params.id); save(s); r.json({ok:true});
});

app.get("/api/channels/:id/playlist",(q,r)=>r.json(load().playout[q.params.id]||[]));
app.put("/api/channels/:id/playlist",(q,r)=>{
 const s=load(); if(!s.channels.some(x=>x.id===q.params.id))return r.status(404).json({error:"Channel not found"});
 s.playout[q.params.id]=Array.isArray(q.body?.items)?q.body.items:[];save(s);r.json(s.playout[q.params.id]);
});

app.get("/api/schedules",(q,r)=>r.json(load().schedules));
app.post("/api/schedules",(q,r)=>{
 const s=load(),b=q.body||{};
 if(!b.channelId||!b.mediaId||!b.start)return r.status(400).json({error:"channelId, mediaId and start are required"});
 if(!s.channels.some(c=>c.id===b.channelId)||!s.media.some(m=>m.id===b.mediaId))return r.status(404).json({error:"Channel or media not found"});
 const item={id:id(),channelId:b.channelId,mediaId:b.mediaId,start:b.start,end:b.end||"",repeat:b.repeat||"once",title:b.title||""};
 s.schedules.push(item);save(s);r.status(201).json(item);
});
app.delete("/api/schedules/:id",(q,r)=>{let s=load();s.schedules=s.schedules.filter(x=>x.id!==q.params.id);save(s);r.json({ok:true})});

function stop(id0){const j=jobs.get(id0);if(j){j.kill("SIGTERM");jobs.delete(id0);}}
function start(channelId,items){
 const cid=safe(channelId); stop(cid); const dir=path.join(HLS,cid); fs.mkdirSync(dir,{recursive:true});
 const sources=items.map(x=>x.url).filter(Boolean);
 if(!sources.length)throw Error("No playable media URLs");
 const list=path.join(dir,"playlist.txt");
 fs.writeFileSync(list,sources.map(u=>"file '"+String(u).replace(/'/g,"'\\''")+"'").join("\n"));
 const args=["-hide_banner","-loglevel","warning","-re","-stream_loop","-1","-f","concat","-safe","0","-i",list,
 "-map","0:v:0?","-map","0:a:0?","-c:v","libx264","-preset","veryfast","-tune","zerolatency",
 "-c:a","aac","-b:a","128k","-f","hls","-hls_time","4","-hls_list_size","6",
 "-hls_flags","delete_segments+append_list",path.join(dir,"index.m3u8")];
 const p=spawn("ffmpeg",args,{stdio:["ignore","ignore","pipe"]}); jobs.set(cid,p);
 p.on("exit",()=>jobs.delete(cid));
 return "/hls/"+cid+"/index.m3u8";
}
app.post("/api/channels/:id/broadcast/start",(q,r)=>{
 const s=load(),c=s.channels.find(x=>x.id===q.params.id);if(!c)return r.status(404).json({error:"Channel not found"});
 const ids=(s.playout[c.id]||[]).filter(x=>x&&x.url);
 try{const manifest=start(c.id,ids);s.playout[c.id]=s.playout[c.id]||[];s.playout[c.id].onAir=true;s.playout[c.id].manifest=manifest;save(s);r.json({ok:true,manifest})}
 catch(e){r.status(500).json({error:e.message})}
});
app.post("/api/channels/:id/broadcast/stop",(q,r)=>{const s=load();stop(safe(q.params.id));s.playout[q.params.id]=s.playout[q.params.id]||[];s.playout[q.params.id].onAir=false;save(s);r.json({ok:true})});
app.get("/api/channels/:id/broadcast/status",(q,r)=>r.json({onAir:jobs.has(safe(q.params.id)),manifest:jobs.has(safe(q.params.id))?"/hls/"+safe(q.params.id)+"/index.m3u8":null}));
app.get("/api/channels/:id/guide",(q,r)=>{
 const s=load(), now=Date.now();
 const rows=s.schedules.filter(x=>x.channelId===q.params.id).map(x=>({...x,startMs:Date.parse(x.start),endMs:x.end?Date.parse(x.end):Infinity}))
   .filter(x=>Number.isFinite(x.startMs)).sort((a,b)=>a.startMs-b.startMs);
 const current=rows.find(x=>x.startMs<=now&&x.endMs>now);
 const next=rows.find(x=>x.startMs>now);
 const media=x=>x?s.media.find(m=>m.id===x.mediaId)||null:null;
 r.json({current:current?{schedule:current,media:media(current)}:null,next:next?{schedule:next,media:media(next)}:null});
});


app.listen(PORT,()=>console.log("Essence Station API on "+PORT));
