# Essence Network Phase 6 — Live Broadcast Engine

## What this adds
- FFmpeg-based server-side playout foundation
- HLS output (`index.m3u8`) per channel
- Start/stop/status broadcast API
- HLS static hosting from the station API

## Requirements on the broadcast server
- Node.js 18+
- FFmpeg installed and available as `ffmpeg` in PATH
- A server/VPS with enough CPU, memory, storage and network bandwidth
- Proper rights/licences for all content being broadcast

## Run
```bash
cd server
npm install
npm start
```

The API defaults to port 8787.

## Broadcast API
- POST `/api/channels/:id/broadcast/start`
- POST `/api/channels/:id/broadcast/stop`
- GET `/api/channels/:id/broadcast/status`

A live channel's HLS manifest is returned by the start endpoint, e.g.
`/hls/<channel-id>/index.m3u8`

## Important
The current engine expects playlist items to contain playable `url` values. Browser-local `blob:` URLs and files that exist only on a user's phone cannot be used by a remote FFmpeg server. Phase 7 should add authenticated media upload/storage and a real scheduler/EPG.
