# Phase 8 — Automatic Scheduler / Playout Worker

## Added
- Persistent schedule worker (`server/scheduler.js`)
- Polls schedules every 5 seconds
- Finds the currently active programme per channel
- Starts FFmpeg for the scheduled media
- Stores ON AIR, schedule ID, now-playing title and HLS manifest
- Public guide endpoint for current and next programme

## Run
Terminal 1:
```bash
cd server
npm install
npm start
```

Terminal 2:
```bash
cd server
node scheduler.js
```

For a real deployment, run both as supervised services (systemd, Docker Compose, PM2, etc.) so they restart after a crash/reboot.

## Guide API
`GET /api/channels/:id/guide`

Returns:
- `current`
- `next`

## Important
This worker is a foundation for scheduled server playout. For a production station, add a proper media queue/playlist engine, timezone-aware recurring schedules, overlap validation, failover/slate content, authentication, HTTPS, monitoring and resource limits.
