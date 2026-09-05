/*
 Essence Network — Phase 6 Broadcast Engine
 ------------------------------------------
 Generates an HLS-compatible live output from a local playlist using FFmpeg.
 This is a production-oriented foundation: run it on a server with FFmpeg installed.
 The browser Studio remains the control plane.
*/

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = __dirname;
const OUTPUT = path.join(ROOT, "hls");
const jobs = new Map();

fs.mkdirSync(OUTPUT, { recursive: true });

function safeId(id) {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, "");
}

function startChannel(channelId, items, options = {}) {
  const id = safeId(channelId);
  if (!id) throw new Error("Invalid channel id");
  stopChannel(id);

  const dir = path.join(OUTPUT, id);
  fs.mkdirSync(dir, { recursive: true });

  const sources = (items || []).map(x => x && x.url).filter(Boolean);
  if (!sources.length) throw new Error("Channel playlist has no playable source URLs.");

  /*
   FFmpeg concat demuxer is intentionally fed through a temporary file.
   Only trusted/admin-controlled URLs should be placed into a station playlist.
  */
  const listFile = path.join(dir, "playlist.txt");
  const lines = sources.map(u => `file '${String(u).replace(/'/g, "'\\''")}'`);
  fs.writeFileSync(listFile, lines.join("\n"));

  const args = [
    "-hide_banner","-loglevel","warning",
    "-re",
    "-stream_loop","-1",
    "-f","concat","-safe","0",
    "-i",listFile,
    "-map","0:v:0?","-map","0:a:0?",
    "-c:v","libx264","-preset","veryfast","-tune","zerolatency",
    "-c:a","aac","-b:a","128k",
    "-f","hls",
    "-hls_time","4",
    "-hls_list_size","6",
    "-hls_flags","delete_segments+append_list",
    path.join(dir,"index.m3u8")
  ];

  const ff = spawn(options.ffmpegPath || "ffmpeg", args, { stdio:["ignore","ignore","pipe"] });
  let lastError="";
  ff.stderr.on("data", b => { lastError = b.toString().slice(-4000); });
  ff.on("exit", (code, signal) => {
    jobs.delete(id);
    if (options.onExit) options.onExit({code, signal, lastError});
  });
  jobs.set(id, {process:ff, dir, startedAt:new Date().toISOString()});
  return {id, manifest:`/hls/${id}/index.m3u8`};
}

function stopChannel(channelId) {
  const id=safeId(channelId);
  const job=jobs.get(id);
  if(!job) return false;
  job.process.kill("SIGTERM");
  jobs.delete(id);
  return true;
}

function status(channelId) {
  const id=safeId(channelId);
  const j=jobs.get(id);
  return j ? {onAir:true,startedAt:j.startedAt,manifest:`/hls/${id}/index.m3u8`} : {onAir:false};
}

module.exports={startChannel,stopChannel,status};
