require("dotenv").config();
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "development-only-change-me";

app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json({ limit: "2mb" }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300 }));

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false })
  : null;

const roles = {
  super_admin: ["*"],
  managing_editor: ["articles:*", "programmes:*", "schedule:*", "media:read", "dashboard:read"],
  news_editor: ["articles:*", "dashboard:read"],
  producer: ["programmes:*", "schedule:*", "dashboard:read"],
  journalist: ["articles:create", "articles:read", "articles:update_own", "dashboard:read"],
  video_editor: ["media:*", "dashboard:read"],
  web_administrator: ["website:*", "dashboard:read"],
  advertising_manager: ["advertising:*", "dashboard:read"]
};

function slugify(s) {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 300);
}
function sign(user) {
  return jwt.sign({ sub: user.id, role: user.role, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: "8h" });
}
async function audit(userId, action, entityType, entityId, details = {}) {
  if (!pool) return;
  await pool.query("INSERT INTO audit_logs(user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5)", [userId, action, entityType, entityId, details]);
}
function auth(req, res, next) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) return res.status(401).json({ error: "Authentication required" });
  try { req.user = jwt.verify(h.slice(7), JWT_SECRET); next(); }
  catch { return res.status(401).json({ error: "Invalid or expired token" }); }
}
function can(permission) {
  return (req, res, next) => {
    const p = roles[req.user.role] || [];
    if (p.includes("*") || p.includes(permission) || p.some(x => x.endsWith(":*") && permission.startsWith(x.slice(0, -1)))) return next();
    return res.status(403).json({ error: "Insufficient permissions" });
  };
}
function dbRequired(req, res, next) {
  if (!pool) return res.status(503).json({ error: "Database is not configured. Copy .env.example to .env and set DATABASE_URL." });
  next();
}

app.get("/api/health", async (req, res) => {
  let database = "not-configured";
  if (pool) { try { await pool.query("SELECT 1"); database = "ok"; } catch { database = "error"; } }
  res.json({ service: "Essence Network CMS", status: "ok", database });
});

app.post("/api/auth/login", dbRequired, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Email and password are required" });
  const { rows } = await pool.query("SELECT * FROM users WHERE email=$1 AND active=true", [email.toLowerCase()]);
  if (!rows[0] || !(await bcrypt.compare(password, rows[0].password_hash))) return res.status(401).json({ error: "Invalid credentials" });
  const u = rows[0]; await audit(u.id, "login", "user", u.id);
  res.json({ token: sign(u), user: { id:u.id, name:u.name, email:u.email, role:u.role } });
});

app.get("/api/me", auth, (req, res) => res.json({ user: req.user }));

app.get("/api/dashboard", auth, can("dashboard:read"), dbRequired, async (req, res) => {
  const a = await pool.query("SELECT COUNT(*)::int count FROM articles");
  const drafts = await pool.query("SELECT COUNT(*)::int count FROM articles WHERE status='draft'");
  const published = await pool.query("SELECT COUNT(*)::int count FROM articles WHERE status='published'");
  const programmes = await pool.query("SELECT COUNT(*)::int count FROM programmes");
  res.json({ articles:a.rows[0].count, drafts:drafts.rows[0].count, published:published.rows[0].count, programmes:programmes.rows[0].count });
});

app.get("/api/articles", auth, can("articles:read"), dbRequired, async (req,res)=>{
  const { status } = req.query;
  const q = status ? ["SELECT * FROM articles WHERE status=$1 ORDER BY updated_at DESC", [status]] : ["SELECT * FROM articles ORDER BY updated_at DESC"];
  const r = await pool.query(q[0], q[1]); res.json(r.rows);
});
app.post("/api/articles", auth, can("articles:create"), dbRequired, async (req,res)=>{
  const { title, excerpt="", body, category="General", status="draft", featured=false } = req.body || {};
  if (!title || !body) return res.status(400).json({error:"Title and body are required"});
  const slug = slugify(title) + "-" + Date.now().toString().slice(-6);
  const r = await pool.query(`INSERT INTO articles(title,slug,excerpt,body,category,status,featured,author_id,published_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [title,slug,excerpt,body,category,status,featured,req.user.sub,status==="published"?new Date():null]);
  await audit(req.user.sub,"create","article",r.rows[0].id,{title});
  res.status(201).json(r.rows[0]);
});
app.patch("/api/articles/:id", auth, can("articles:update_own"), dbRequired, async (req,res)=>{
  const { title, excerpt, body, category, status, featured } = req.body || {};
  const r = await pool.query(`UPDATE articles SET title=COALESCE($1,title),excerpt=COALESCE($2,excerpt),body=COALESCE($3,body),
    category=COALESCE($4,category),status=COALESCE($5,status),featured=COALESCE($6,featured),
    published_at=CASE WHEN $5='published' THEN COALESCE(published_at,NOW()) ELSE published_at END,updated_at=NOW()
    WHERE id=$7 AND (author_id=$8 OR $9=true) RETURNING *`,
    [title,excerpt,body,category,status,featured,req.params.id,req.user.sub,roles[req.user.role]?.includes("*") || roles[req.user.role]?.includes("articles:*")]);
  if (!r.rows[0]) return res.status(404).json({error:"Article not found or not editable"});
  await audit(req.user.sub,"update","article",req.params.id,req.body); res.json(r.rows[0]);
});

app.get("/api/programmes", auth, can("programmes:read"), dbRequired, async (req,res)=>{
  const r=await pool.query("SELECT * FROM programmes ORDER BY title"); res.json(r.rows);
});
app.post("/api/programmes", auth, can("programmes:create"), dbRequired, async (req,res)=>{
  const {title,description="",category="",presenter="",artwork_url=""}=req.body||{};
  if(!title) return res.status(400).json({error:"Programme title is required"});
  const r=await pool.query(`INSERT INTO programmes(title,description,category,presenter,artwork_url) VALUES($1,$2,$3,$4,$5) RETURNING *`,
    [title,description,category,presenter,artwork_url]);
  await audit(req.user.sub,"create","programme",r.rows[0].id,{title}); res.status(201).json(r.rows[0]);
});

app.get("/api/schedule", auth, can("schedule:read"), dbRequired, async (req,res)=>{
  const r=await pool.query(`SELECT s.*,p.title FROM schedule s JOIN programmes p ON p.id=s.programme_id ORDER BY starts_at`); res.json(r.rows);
});
app.post("/api/schedule", auth, can("schedule:create"), dbRequired, async (req,res)=>{
  const {programme_id,starts_at,ends_at,status="scheduled"}=req.body||{};
  if(!programme_id||!starts_at||!ends_at) return res.status(400).json({error:"Programme and start/end times are required"});
  const r=await pool.query(`INSERT INTO schedule(programme_id,starts_at,ends_at,status) VALUES($1,$2,$3,$4) RETURNING *`,
    [programme_id,starts_at,ends_at,status]); await audit(req.user.sub,"create","schedule",r.rows[0].id,req.body); res.status(201).json(r.rows[0]);
});

app.get("/api/audit", auth, can("dashboard:read"), dbRequired, async (req,res)=>{
  const r=await pool.query(`SELECT a.*,u.name,u.email FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 100`);
  res.json(r.rows);
});


// Public read-only endpoints used by the Essence Network multi-page website.
app.get("/api/public/articles", async (req,res)=>{
  if (!pool) return res.status(503).json({error:"Database not configured"});
  const params=["published"]; let sql="SELECT id,title,excerpt,body,category,featured,published_at FROM articles WHERE status=$1";
  if(req.query.featured==="true"){sql+=" AND featured=true"}
  sql+=" ORDER BY published_at DESC LIMIT 50";
  const r=await pool.query(sql,params);res.json(r.rows);
});
app.get("/api/public/programmes", async (req,res)=>{
  if (!pool) return res.status(503).json({error:"Database not configured"});
  const r=await pool.query("SELECT id,title,description,category,presenter,artwork_url FROM programmes ORDER BY title");res.json(r.rows);
});
app.get("/api/public/schedule", async (req,res)=>{
  if (!pool) return res.status(503).json({error:"Database not configured"});
  const r=await pool.query("SELECT s.id,s.starts_at,s.ends_at,s.status,p.title,p.category,p.presenter FROM schedule s JOIN programmes p ON p.id=s.programme_id ORDER BY s.starts_at LIMIT 100");res.json(r.rows);
});
app.get("/api/public/now-next", async (req,res)=>{
  if (!pool) return res.status(503).json({error:"Database not configured"});
  const now=await pool.query("SELECT s.*,p.title FROM schedule s JOIN programmes p ON p.id=s.programme_id WHERE s.starts_at<=NOW() AND s.ends_at>NOW() ORDER BY s.starts_at DESC LIMIT 1");
  const next=await pool.query("SELECT s.*,p.title FROM schedule s JOIN programmes p ON p.id=s.programme_id WHERE s.starts_at>NOW() ORDER BY s.starts_at LIMIT 1");
  res.json({now:now.rows[0]||null,next:next.rows[0]||null});
});

app.use(express.static("public"));
app.listen(PORT, ()=>console.log(`Essence Network CMS API running on http://localhost:${PORT}`));