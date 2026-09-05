# Phase 7 — Media Upload & Scheduling

## Added
- Upload endpoint for station media
- Server-side media storage
- Media URLs usable by FFmpeg
- Schedule CRUD API
- Playlist persistence
- HLS broadcast controls retained

## Run
cd server
npm install
npm start

## Upload
POST /api/upload as multipart/form-data:
- `file`: video file
- `title`: optional title

## Schedule
POST /api/schedules
JSON:
{
  "channelId":"...",
  "mediaId":"...",
  "start":"2026-09-05T18:00:00+03:00",
  "end":"2026-09-05T18:30:00+03:00",
  "repeat":"once"
}

## Production note
This phase provides the storage and schedule data layer. A persistent scheduler/worker should execute due schedule entries and hand the correct media sequence to FFmpeg. Authentication, storage quotas, HTTPS, and access control should be added before public deployment.
