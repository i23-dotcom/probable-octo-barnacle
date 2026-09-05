# Essence Network — Integrated CMS + Public Website

This package connects the multi-page public website to the CMS through read-only public API endpoints.

## Structure
- `site/` — Home, Live TV, TV Guide, Programmes, News, Watch, About, Advertise, Contact
- `server/server.js` — public API additions for articles, programmes, schedule and Now/Next
- `admin/` — reserved for the protected CMS admin UI

## API
- GET `/api/public/articles`
- GET `/api/public/programmes`
- GET `/api/public/schedule`
- GET `/api/public/now-next`

The public website remains multi-page. The backend remains the editorial source of truth.

## Important
The generated public pages are front-end integration files. Real deployment still requires PostgreSQL, HTTPS, the authenticated CMS backend, media storage/CDN, and a real HLS/DASH stream URL.
