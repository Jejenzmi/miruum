const path = require("path");
const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024 } });

const app = express();
const PORT = Number(process.env.PORT || 4101);
const API = process.env.API_URL || "http://backend:5013/api";
const APK_URL = process.env.APK_URL || "";

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "views"));
// Security headers. CSP disabled — portals use inline styles/handlers; the other
// helmet protections (frameguard/clickjacking, HSTS, noSniff, referrer) stay on.
// referrerPolicy=same-origin keeps the Referer header on same-origin requests,
// which the CSRF middleware below falls back on when Origin is absent.
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false, referrerPolicy: { policy: "same-origin" } }));
app.use(express.urlencoded({ extended: true }));
app.use("/static", express.static(path.join(__dirname, "..", "public")));
app.set("trust proxy", 1); // behind nginx TLS terminator

// CSRF protection: every state-changing request must carry an Origin/Referer
// whose host matches this portal. Combined with the SameSite=lax session cookie,
// this blocks cross-site forged POST/PUT/DELETE. Same-origin forms are unaffected.
app.use((req, res, next) => {
  if (!["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) return next();
  const host = req.get("host");
  const src = req.get("origin") || req.get("referer") || "";
  let ok = false;
  try { ok = !!src && new URL(src).host === host; } catch { ok = false; }
  if (!ok) return res.status(403).send("Permintaan ditolak (proteksi CSRF: asal tidak cocok).");
  next();
});
app.use(session({
  name: "miruum.sid",
  secret: process.env.SESSION_SECRET || "miruum-web-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 12,
    httpOnly: true,                                  // not readable by JS (XSS-safe)
    sameSite: "lax",                                 // block cross-site cookie sending (CSRF)
    secure: process.env.NODE_ENV === "production",   // HTTPS-only in prod
  },
}));

// ── Portal detection by hostname: admin / cm / extranet ──
// Same app + data, but each subdomain renders its own focused sidebar menu.
app.use((req, res, next) => {
  const h = (req.hostname || "").toLowerCase();
  // Channel Manager answers to both "cm." and "chanel." (miruum.id) prefixes.
  res.locals.portal = (h.startsWith("cm.") || h.startsWith("chanel.")) ? "cm" : h.startsWith("pms.") ? "pms" : h.startsWith("corporate.") ? "corporate" : h.startsWith("admin.") ? "admin" : h.startsWith("extranet.") ? "extranet" : null;
  next();
});

// ── API helper (server-side calls to the core backend) ──
async function api(pathname, { method = "GET", token, body } = {}) {
  const res = await fetch(API + pathname, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

// Upload a multer file to MinIO via the backend; returns the public URL.
async function uploadFile(token, file, folder) {
  const dataUrl = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
  const { url } = await api("/uploads", { method: "POST", token, body: { dataUrl, folder } });
  return url;
}

// Larger limit + public endpoint for corporate legality documents (PDF/JPG/PNG).
const docUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
async function uploadDocPublic(file) {
  const dataUrl = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
  const { url } = await api("/corporate/upload-doc", { method: "POST", body: { dataUrl } });
  return url;
}
const CORP_ENTITY_FALLBACK = {
  entityTypes: ["SWASTA", "BUMN", "BUMD", "PEMERINTAH"],
  labels: { SWASTA: "Perusahaan Swasta", BUMN: "BUMN", BUMD: "BUMD", PEMERINTAH: "Pemerintahan" },
  catalog: {},
};
async function corporateDocConfig() {
  try { return await api("/corporate/doc-requirements"); } catch (_) { return CORP_ENTITY_FALLBACK; }
}

const rupiah = (v) => "Rp " + (v || 0).toLocaleString("id-ID");
app.locals.rupiah = rupiah;
app.locals.APK_URL = APK_URL;

// ── Auth guards ──
function guard(role, loginPath) {
  return (req, res, next) => {
    const s = req.session[role];
    if (!s || !s.token) return res.redirect(loginPath);
    res.locals.me = s.user;
    res.locals.token = s.token;
    if (role === "partner") res.locals.ent = s.ent || { extranet: true, channelManager: false, pms: false };
    next();
  };
}
const adminGuard = guard("admin", "/admin/login");
const partnerGuard = guard("partner", "/extranet/login");
const corporateGuard = guard("corporate", "/corporate/login");

// Fetch the corporate overview once per page so the sidebar can show the
// approver queue badge and gate the Persetujuan / Pengguna menus by role.
async function corpNav(req, res, next) {
  try {
    const ov = await api("/corporate/overview", { token: res.locals.token });
    res.locals.corpOverview = ov;
    res.locals.corpRole = ov.myRole || "MAKER";
    res.locals.corpCanApprove = !!ov.canApprove;
    res.locals.corpPending = ov.pendingApprovals || 0;
  } catch (_) {
    res.locals.corpOverview = null; res.locals.corpRole = "MAKER";
    res.locals.corpCanApprove = false; res.locals.corpPending = 0;
  }
  next();
}

// Brute-force protection for portal logins, per real client IP (trust proxy set).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  handler: (req, res) => res.status(429).send("Terlalu banyak percobaan masuk. Coba lagi dalam beberapa menit."),
});

// Gate a paid module (Channel Manager / PMS) behind the partner's contract.
// Runs after partnerGuard, so the session & entitlements are loaded.
function productGuard(product, label) {
  return (req, res, next) => {
    const ent = req.session.partner?.ent;
    if (ent && ent[product]) return next();
    res.status(403).render("extranet/locked", { module: label, active: product === "channelManager" ? "cm" : "pms" });
  };
}

// ═══════════════════════ LANDING ═══════════════════════
app.get("/", (_req, res) => res.render("landing"));
app.get("/health", (_req, res) => res.json({ ok: true, service: "miruum-web" }));

// ═══════════════════════ BACK OFFICE (ADMIN) ═══════════════════════
app.get("/admin/login", (req, res) => res.render("admin/login", { error: null, base: "/admin" }));
app.post("/admin/login", loginLimiter, async (req, res) => {
  try {
    const { token, user } = await api("/auth/login", { method: "POST", body: { email: req.body.email, password: req.body.password } });
    if (user.role !== "ADMIN") throw new Error("Akun ini bukan admin");
    req.session.admin = { token, user };
    res.redirect("/admin");
  } catch (e) {
    res.render("admin/login", { error: e.message, base: "/admin" });
  }
});
app.get("/admin/logout", (req, res) => { delete req.session.admin; res.redirect("/admin/login"); });

app.get("/admin", adminGuard, async (req, res) => {
  const stats = await api("/admin/stats", { token: res.locals.token });
  const { bookings } = await api("/admin/bookings", { token: res.locals.token });
  res.render("admin/dashboard", { stats, bookings: bookings.slice(0, 8), active: "dashboard" });
});

app.get("/admin/hotels", adminGuard, async (req, res) => {
  const { hotels } = await api("/admin/hotels", { token: res.locals.token });
  res.render("admin/hotels", { hotels, active: "hotels" });
});

app.get("/admin/hotels/new", adminGuard, async (req, res) => {
  const { users } = await api("/admin/users", { token: res.locals.token });
  res.render("admin/hotel_form", { hotel: null, users: users.filter((u) => u.role === "PARTNER"), active: "hotels", err: req.query.err });
});

app.post("/admin/hotels", adminGuard, async (req, res) => {
  // Wilayah (regionId) wajib — surface the API message back on the form.
  try {
    const { hotel } = await api("/admin/hotels", { method: "POST", token: res.locals.token, body: req.body });
    // Land on the edit page so the admin can immediately complete the property
    // (rooms, photos via Extranet, etc.) instead of a half-set-up listing.
    res.redirect(`/admin/hotels/${hotel.id}/edit?added=1`);
  } catch (e) { res.redirect("/admin/hotels/new?err=" + encodeURIComponent(e.message)); }
});

app.get("/admin/hotels/:id/edit", adminGuard, async (req, res) => {
  const [{ hotels }, { users }, detail] = await Promise.all([
    api("/admin/hotels", { token: res.locals.token }),
    api("/admin/users", { token: res.locals.token }),
    // Admin passes ownsHotel, so the partner endpoint returns full rooms for any hotel.
    api(`/partner/hotels/${req.params.id}`, { token: res.locals.token }).catch(() => null),
  ]);
  const hotel = hotels.find((h) => h.id === req.params.id);
  const rooms = (detail && detail.hotel && detail.hotel.rooms) || [];
  res.render("admin/hotel_form", { hotel, rooms, users: users.filter((u) => u.role === "PARTNER"), active: "hotels", err: req.query.err, saved: req.query.saved, added: req.query.added });
});

// Admin helps a partner set up inventory: add / edit / delete rooms on any hotel
// (proxies to the partner endpoints with the admin token; backend allows ADMIN).
app.post("/admin/hotels/:id/rooms", adminGuard, async (req, res) => {
  try {
    await api(`/partner/hotels/${req.params.id}/rooms`, { method: "POST", token: res.locals.token, body: {
      name: req.body.name, bedInfo: req.body.bedInfo, price: req.body.price, stock: req.body.stock, capacity: req.body.capacity,
      breakfast: req.body.breakfast === "on", refundable: req.body.refundable === "on", freeCancellation: req.body.freeCancellation === "on",
    } });
    res.redirect(`/admin/hotels/${req.params.id}/edit?saved=kamar#kamar`);
  } catch (e) { res.redirect(`/admin/hotels/${req.params.id}/edit?err=` + encodeURIComponent(e.message) + `#kamar`); }
});
app.post("/admin/rooms/:id", adminGuard, async (req, res) => {
  try {
    await api(`/partner/rooms/${req.params.id}`, { method: "PUT", token: res.locals.token, body: {
      price: req.body.price, stock: req.body.stock, capacity: req.body.capacity, bedInfo: req.body.bedInfo,
    refundable: req.body.refundable === "on", freeCancellation: req.body.freeCancellation === "on", breakfast: req.body.breakfast === "on",
    } });
  } catch (_) {}
  res.redirect(`/admin/hotels/${req.body.hotelId}/edit?saved=kamar#kamar`);
});
app.post("/admin/rooms/:id/delete", adminGuard, async (req, res) => {
  try { await api(`/partner/rooms/${req.params.id}`, { method: "DELETE", token: res.locals.token });
    res.redirect(`/admin/hotels/${req.body.hotelId}/edit?saved=kamar#kamar`);
  } catch (e) { res.redirect(`/admin/hotels/${req.body.hotelId}/edit?err=` + encodeURIComponent(e.message) + `#kamar`); }
});

app.post("/admin/hotels/:id", adminGuard, async (req, res) => {
  // Wilayah (regionId) wajib — surface the API message back on the form.
  try {
    await api(`/admin/hotels/${req.params.id}`, { method: "PUT", token: res.locals.token, body: req.body });
    res.redirect("/admin/hotels?saved=1");
  } catch (e) { res.redirect(`/admin/hotels/${req.params.id}/edit?err=` + encodeURIComponent(e.message)); }
});

app.post("/admin/hotels/:id/delete", adminGuard, async (req, res) => {
  await api(`/admin/hotels/${req.params.id}`, { method: "DELETE", token: res.locals.token });
  res.redirect("/admin/hotels");
});

app.get("/admin/channels", adminGuard, async (req, res) => {
  const [cm, { channels }] = await Promise.all([
    api("/admin/channel-manager", { token: res.locals.token }),
    api("/admin/channels", { token: res.locals.token }),
  ]);
  res.render("admin/channel_manager", { hotels: cm.hotels, overview: cm.overview, channels, active: "channels", synced: req.query.synced, testResult: null });
});

app.post("/admin/channels/sync", adminGuard, async (req, res) => {
  const r = await api("/admin/offers/sync", { method: "POST", token: res.locals.token });
  res.redirect(`/admin/channels?synced=${r.offers || 0}`);
});

app.get("/admin/rate-intelligence", adminGuard, async (req, res) => {
  const { rows, otaChannels, ai } = await api("/admin/rate-intelligence", { token: res.locals.token });
  res.render("admin/rate_intelligence", { rows, otaChannels, ai: ai || {}, active: "rate-intel", saved: req.query.saved });
});
// Kick off the AI rate shopper (auto-find OTA prices).
app.post("/admin/rate-intelligence/search", adminGuard, async (req, res) => {
  try { await api("/admin/rate-intelligence/search", { method: "POST", token: res.locals.token, body: {} }); res.redirect("/admin/rate-intelligence?saved=search"); }
  catch (e) { res.redirect("/admin/rate-intelligence?saved=aierr"); }
});
// Save observed OTA prices for one hotel (body = { <channelId>: "<price>", ... }).
app.post("/admin/rate-intelligence/:hotelId", adminGuard, async (req, res) => {
  const observations = Object.entries(req.body)
    .filter(([k]) => k.startsWith("ch_"))
    .map(([k, v]) => ({ channelId: k.slice(3), price: Number(v) || 0 }));
  try {
    await api("/admin/rate-observations", { method: "PUT", token: res.locals.token, body: { hotelId: req.params.hotelId, observations } });
    res.redirect("/admin/rate-intelligence?saved=1");
  } catch (e) { res.redirect("/admin/rate-intelligence?saved=err"); }
});

// Rate parity monitor
app.get("/admin/parity", adminGuard, async (req, res) => {
  const data = await api("/admin/parity", { token: res.locals.token });
  res.render("admin/parity", { ...data, active: "parity", saved: req.query.saved });
});
app.post("/admin/parity/alert", adminGuard, async (req, res) => {
  try { await api("/admin/parity/alert", { method: "POST", token: res.locals.token, body: {} }); } catch (_) {}
  res.redirect("/admin/parity?saved=alert");
});

// Metasearch & GDS
app.get("/admin/meta-channels", adminGuard, async (req, res) => {
  const data = await api("/admin/meta-channels", { token: res.locals.token });
  res.render("admin/meta_channels", { ...data, active: "meta", saved: req.query.saved });
});
app.post("/admin/meta-channels/:id", adminGuard, async (req, res) => {
  await api(`/admin/meta-channels/${req.params.id}`, { method: "PUT", token: res.locals.token, body: { connected: req.body.connected === "on" } });
  res.redirect("/admin/meta-channels");
});
app.post("/admin/meta-channels/push", adminGuard, async (req, res) => {
  await api("/admin/meta-channels/push", { method: "POST", token: res.locals.token, body: {} });
  res.redirect("/admin/meta-channels?saved=push");
});

// Revenue management & forecast
app.get("/admin/revenue-management", adminGuard, async (req, res) => {
  const data = await api("/admin/revenue-management", { token: res.locals.token });
  res.render("admin/revenue_management", { ...data, active: "rm" });
});

app.get("/admin/audit", adminGuard, async (req, res) => {
  const q = req.query.action ? `?action=${encodeURIComponent(req.query.action)}` : "";
  const { logs, actions } = await api(`/admin/audit${q}`, { token: res.locals.token });
  res.render("admin/audit", { logs, actions, filter: req.query.action || "", active: "audit" });
});

async function renderChannels(res, extra = {}) {
  const [cm, { channels }] = await Promise.all([
    api("/admin/channel-manager", { token: res.locals.token }),
    api("/admin/channels", { token: res.locals.token }),
  ]);
  res.render("admin/channel_manager", { hotels: cm.hotels, overview: cm.overview, channels, active: "channels", synced: null, testResult: null, ...extra });
}

app.post("/admin/channels/:id/config", adminGuard, async (req, res) => {
  try {
    await api(`/admin/channels/${req.params.id}`, {
      method: "PUT", token: res.locals.token,
      body: {
        connectorType: req.body.connectorType, config: req.body.config,
        commissionPct: req.body.commissionPct,
        feeIncluded: req.body.feeIncluded === "on",
        markupType: req.body.markupType || "PCT",
        markupNominal: req.body.markupNominal || 0,
      },
    });
    await renderChannels(res, { testResult: { id: req.params.id, ok: true, saved: true } });
  } catch (e) {
    await renderChannels(res, { testResult: { id: req.params.id, ok: false, error: e.message } });
  }
});

app.post("/admin/channels/:id/test", adminGuard, async (req, res) => {
  const r = await api(`/admin/channels/${req.params.id}/test`, { method: "POST", token: res.locals.token, body: {} });
  await renderChannels(res, { testResult: { id: req.params.id, ...r } });
});

app.get("/admin/bookings", adminGuard, async (req, res) => {
  const { bookings } = await api("/admin/bookings", { token: res.locals.token });
  res.render("admin/bookings", { bookings, active: "bookings" });
});

app.get("/admin/finance", adminGuard, async (req, res) => {
  const [finance, { settlements }, { claims }] = await Promise.all([
    api("/admin/finance", { token: res.locals.token }),
    api("/admin/settlements", { token: res.locals.token }),
    api("/admin/claims", { token: res.locals.token }),
  ]);
  res.render("admin/finance", { finance, settlements, claims, active: "finance", paid: req.query.paid, claimDone: req.query.claim });
});
// ── Rekonsiliasi & settlement otomatis ──
app.get("/admin/reconciliation", adminGuard, async (req, res) => {
  const recon = await api("/admin/reconciliation", { token: res.locals.token });
  res.render("admin/reconciliation", { recon, active: "reconciliation", saved: req.query.saved, msg: req.query.msg });
});
app.get("/admin/reconciliation.csv", adminGuard, async (req, res) => {
  try {
    const r = await fetch(API + "/admin/reconciliation?format=csv", { headers: { Authorization: `Bearer ${res.locals.token}` } });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="rekonsiliasi-miruum.csv"');
    res.send(await r.text());
  } catch (e) { res.redirect("/admin/reconciliation?saved=err"); }
});
app.post("/admin/reconciliation/auto-settle", adminGuard, async (req, res) => {
  try { const r = await api("/admin/settlements/auto", { method: "POST", token: res.locals.token, body: {} }); res.redirect(`/admin/reconciliation?saved=settle&msg=` + encodeURIComponent(`${r.count} hotel, total ${r.total}`)); }
  catch (e) { res.redirect("/admin/reconciliation?saved=err"); }
});
app.post("/admin/claims/:id/pay", adminGuard, async (req, res) => {
  try { await api("/admin/claims/" + req.params.id + "/pay", { method: "POST", token: res.locals.token, body: {} }); } catch (_) {}
  res.redirect("/admin/finance?claim=paid");
});
app.post("/admin/claims/:id/reject", adminGuard, async (req, res) => {
  try { await api("/admin/claims/" + req.params.id + "/reject", { method: "POST", token: res.locals.token, body: {} }); } catch (_) {}
  res.redirect("/admin/finance?claim=rejected");
});

app.post("/admin/settlements/pay", adminGuard, async (req, res) => {
  await api("/admin/settlements", {
    method: "POST", token: res.locals.token,
    body: { hotelId: req.body.hotelId, amount: req.body.amount, bookingsCount: req.body.bookingsCount, note: req.body.note },
  });
  res.redirect("/admin/finance?paid=1");
});

app.get("/admin/users", adminGuard, async (req, res) => {
  const { users } = await api("/admin/users", { token: res.locals.token });
  res.render("admin/users", { users, active: "users" });
});

// ── Akun Korporat (tarif B2B negosiasi per akun) ──
app.get("/admin/corporates", adminGuard, async (req, res) => {
  const { corporates, defaultDiscountPct } = await api("/admin/corporates", { token: res.locals.token });
  res.render("admin/corporates", {
    corporates: corporates || [],
    defaultDiscountPct: Number(defaultDiscountPct || 0),
    active: "corporates", saved: req.query.saved,
  });
});
app.post("/admin/corporates/:id", adminGuard, async (req, res) => {
  try {
    await api("/admin/corporates/" + req.params.id, {
      method: "PUT", token: res.locals.token, body: { discountPct: req.body.discountPct },
    });
    res.redirect("/admin/corporates?saved=1");
  } catch (e) { res.redirect("/admin/corporates?saved=err"); }
});

// ── Back Office: kelola Maker/Approver tiap akun korporat ──
app.get("/admin/corporates/:id/users", adminGuard, async (req, res) => {
  const data = await api("/admin/corporates/" + req.params.id + "/users", { token: res.locals.token });
  res.render("admin/corporate_users", {
    corporate: data.corporate, users: data.users || [],
    active: "corporates", done: req.query.done, err: req.query.err, cred: req.query.cred,
  });
});
app.post("/admin/corporates/:id/users", adminGuard, async (req, res) => {
  try {
    const r = await api("/admin/corporates/" + req.params.id + "/users", { method: "POST", token: res.locals.token, body: req.body });
    const c = r.credentials ? `&cred=${encodeURIComponent(r.credentials.email + " | " + r.credentials.password)}` : "";
    res.redirect(`/admin/corporates/${req.params.id}/users?done=add${c}`);
  } catch (e) { res.redirect(`/admin/corporates/${req.params.id}/users?err=` + encodeURIComponent(e.message)); }
});
app.post("/admin/corporates/:id/users/:uid", adminGuard, async (req, res) => {
  try { await api(`/admin/corporates/${req.params.id}/users/${req.params.uid}`, { method: "PUT", token: res.locals.token, body: { corporateRole: req.body.corporateRole } }); res.redirect(`/admin/corporates/${req.params.id}/users?done=role`); }
  catch (e) { res.redirect(`/admin/corporates/${req.params.id}/users?err=` + encodeURIComponent(e.message)); }
});
app.post("/admin/corporates/:id/users/:uid/delete", adminGuard, async (req, res) => {
  try { await api(`/admin/corporates/${req.params.id}/users/${req.params.uid}`, { method: "DELETE", token: res.locals.token }); res.redirect(`/admin/corporates/${req.params.id}/users?done=del`); }
  catch (e) { res.redirect(`/admin/corporates/${req.params.id}/users?err=` + encodeURIComponent(e.message)); }
});

// ── Penagihan Korporat (Miruum → tagihan ke corporate) ──
app.get("/admin/corporate-billing", adminGuard, async (req, res) => {
  const { corporates } = await api("/admin/corporate-billing", { token: res.locals.token });
  res.render("admin/corporate_billing", { corporates, active: "billing", done: req.query.done, err: req.query.err });
});
app.post("/admin/corporate-invoices", adminGuard, async (req, res) => {
  try { const r = await api("/admin/corporate-invoices", { method: "POST", token: res.locals.token, body: req.body }); res.redirect("/admin/corporate-billing?done=" + r.invoice.number); }
  catch (e) { res.redirect("/admin/corporate-billing?err=" + encodeURIComponent(e.message)); }
});
app.post("/admin/corporate-invoices/:id/paid", adminGuard, async (req, res) => {
  try { await api("/admin/corporate-invoices/" + req.params.id + "/paid", { method: "POST", token: res.locals.token, body: {} }); } catch (_) {}
  res.redirect("/admin/corporate-billing");
});
app.post("/admin/corporate-invoices/:id/cancel", adminGuard, async (req, res) => {
  try { await api("/admin/corporate-invoices/" + req.params.id + "/cancel", { method: "POST", token: res.locals.token, body: {} }); } catch (_) {}
  res.redirect("/admin/corporate-billing");
});

// ── Master Data Wilayah (Provinsi → Kab/Kota → Kecamatan → Desa) ──
app.get("/admin/regions", adminGuard, async (req, res) => {
  const t = res.locals.token;
  const { regions: provinces } = await api("/admin/regions?level=PROVINCE", { token: t });
  let cities = [], dists = [], vills = [];
  if (req.query.prov) cities = (await api("/admin/regions?parentId=" + req.query.prov, { token: t })).regions;
  if (req.query.city) dists = (await api("/admin/regions?parentId=" + req.query.city, { token: t })).regions;
  if (req.query.dist) vills = (await api("/admin/regions?parentId=" + req.query.dist, { token: t })).regions;
  res.render("admin/regions", { provinces, cities, dists, vills, sel: { prov: req.query.prov, city: req.query.city, dist: req.query.dist }, active: "regions", added: req.query.added });
});
app.post("/admin/regions/add", adminGuard, async (req, res) => {
  try { await api("/admin/regions", { method: "POST", token: res.locals.token, body: { name: req.body.name, level: req.body.level, parentId: req.body.parentId || undefined } }); } catch (_) {}
  const q = new URLSearchParams();
  ["prov", "city", "dist"].forEach((k) => { if (req.body[k]) q.set(k, req.body[k]); });
  q.set("added", "1");
  res.redirect("/admin/regions?" + q.toString());
});
app.post("/admin/regions/:id/delete", adminGuard, async (req, res) => {
  try { await api("/admin/regions/" + req.params.id, { method: "DELETE", token: res.locals.token }); } catch (_) {}
  res.redirect(req.get("referer") || "/admin/regions");
});

// ── Pengajuan Akun Korporat ──
app.get("/admin/corporate", adminGuard, async (req, res) => {
  const { applications } = await api("/admin/corporate-applications", { token: res.locals.token });
  res.render("admin/corporate", { applications, active: "corporate",
    creds: req.query.email ? { email: req.query.email, password: req.query.pass } : null, err: req.query.err });
});
app.post("/admin/corporate/:id/approve", adminGuard, async (req, res) => {
  try {
    const r = await api("/admin/corporate-applications/" + req.params.id + "/approve", { method: "POST", token: res.locals.token, body: {} });
    res.redirect("/admin/corporate?email=" + encodeURIComponent(r.credentials.email) + "&pass=" + encodeURIComponent(r.credentials.password));
  } catch (e) { res.redirect("/admin/corporate?err=" + encodeURIComponent(e.message)); }
});
app.post("/admin/corporate/:id/reject", adminGuard, async (req, res) => {
  try { await api("/admin/corporate-applications/" + req.params.id + "/reject", { method: "POST", token: res.locals.token, body: {} }); } catch (_) {}
  res.redirect("/admin/corporate");
});

// ── Program Promo & Campaign ──
app.get("/admin/programs", adminGuard, async (req, res) => {
  const { programs } = await api("/admin/programs", { token: res.locals.token });
  res.render("admin/programs", { programs, active: "programs", created: req.query.created });
});
app.post("/admin/programs", adminGuard, async (req, res) => {
  try {
    const r = await api("/admin/programs", { method: "POST", token: res.locals.token, body: req.body });
    res.redirect("/admin/programs?created=" + (r.invited || 0));
  } catch (e) { res.redirect("/admin/programs?created=err"); }
});
app.post("/admin/programs/:id/delete", adminGuard, async (req, res) => {
  try { await api("/admin/programs/" + req.params.id, { method: "DELETE", token: res.locals.token }); } catch (_) {}
  res.redirect("/admin/programs");
});

// ── Campaign Hotel (approval of partner-registered campaigns) ──
app.get("/admin/campaigns", adminGuard, async (req, res) => {
  const { campaigns } = await api("/admin/campaigns", { token: res.locals.token });
  res.render("admin/campaigns", { campaigns, active: "campaigns", done: req.query.done });
});
app.post("/admin/campaigns/:id/:action", adminGuard, async (req, res) => {
  const act = req.params.action === "approve" ? "approve" : "reject";
  try { await api(`/admin/campaigns/${req.params.id}/${act}`, { method: "POST", token: res.locals.token, body: {} }); } catch (_) {}
  res.redirect("/admin/campaigns?done=" + act);
});

// ── Advance Deposit (top-up confirmation) ──
app.get("/admin/deposits", adminGuard, async (req, res) => {
  const { pending, hotels } = await api("/admin/deposits", { token: res.locals.token });
  res.render("admin/deposits", { pending, hotels, active: "deposits", done: req.query.done });
});
app.post("/admin/deposits/:id/:action", adminGuard, async (req, res) => {
  const act = req.params.action === "confirm" ? "confirm" : "reject";
  try { await api(`/admin/deposits/${req.params.id}/${act}`, { method: "POST", token: res.locals.token, body: {} }); } catch (_) {}
  res.redirect("/admin/deposits?done=" + act);
});

// ── Invoice Bulanan (generate + list) ──
app.get("/admin/invoices", adminGuard, async (req, res) => {
  const period = req.query.period || "";
  const { invoices } = await api("/admin/invoices" + (period ? "?period=" + encodeURIComponent(period) : ""), { token: res.locals.token });
  res.render("admin/invoices", { invoices, period, active: "invoices", gen: req.query.gen });
});
app.post("/admin/invoices/generate", adminGuard, async (req, res) => {
  try { const r = await api("/admin/invoices/generate", { method: "POST", token: res.locals.token, body: { period: req.body.period } }); res.redirect("/admin/invoices?gen=" + (r.hotels || 0) + (req.body.period ? "&period=" + req.body.period : "")); }
  catch (e) { res.redirect("/admin/invoices?gen=err"); }
});

// ── Artikel / Blog ──
app.get("/admin/articles", adminGuard, async (req, res) => {
  const { articles } = await api("/admin/articles", { token: res.locals.token });
  const edit = req.query.edit ? articles.find((a) => a.id === req.query.edit) : null;
  res.render("admin/articles", { articles, edit, active: "articles", saved: req.query.saved });
});
app.post("/admin/articles", adminGuard, upload.single("cover"), async (req, res) => {
  let coverImage = req.body.coverImage;
  try { if (req.file) coverImage = await uploadFile(res.locals.token, req.file, "articles"); } catch (_) {}
  const body = { ...req.body, coverImage, published: req.body.published === "on" };
  try {
    if (req.body.id) await api(`/admin/articles/${req.body.id}`, { method: "PUT", token: res.locals.token, body });
    else await api("/admin/articles", { method: "POST", token: res.locals.token, body });
    res.redirect("/admin/articles?saved=1");
  } catch (e) { res.redirect("/admin/articles?saved=err"); }
});
app.post("/admin/articles/:id/delete", adminGuard, async (req, res) => {
  try { await api(`/admin/articles/${req.params.id}`, { method: "DELETE", token: res.locals.token }); } catch (_) {}
  res.redirect("/admin/articles");
});

// ── Konten Web (customer-web marketing copy) ──
app.get("/admin/site-content", adminGuard, async (req, res) => {
  const { content } = await api("/admin/site-content", { token: res.locals.token });
  res.render("admin/site_content", { content, active: "site-content", saved: req.query.saved });
});
// Text keys are bilingual: the form posts `key[id]` / `key[en]`, which
// express.urlencoded({ extended:true }) parses into { id, en }. Legacy plain
// strings are still accepted and passed through unchanged.
const SITE_TEXT_KEYS = [
  "homeHeadline", "homeSub", "ctaPropertyTitle", "ctaPropertyText", "ctaCorpTitle", "ctaCorpText",
  "mitraHeadline", "mitraSub",
  "trustStrip", "trustSecure", "trustInstant", "trustSupport", "paymentMethodsTitle",
  "paySecureNote", "payInstantNote", "destinationsTitle", "socialTitle", "socialSub", 'appStoreLabel', 'appStoreUrl'];
app.post("/admin/site-content", adminGuard, async (req, res) => {
  const body = {};
  SITE_TEXT_KEYS.forEach((k) => {
    const v = req.body[k];
    if (v == null) return;
    if (typeof v === "object") {
      const id = (v.id || "").trim(), en = (v.en || "").trim();
      body[k] = { id, en }; // keep the nested shape intact for the API
    } else body[k] = v;
  });
  // List sections now come from repeatable-row form fields (no raw JSON).
  // qs parses `stats[0][label]` into arrays/objects; normalize + drop empty rows.
  const toArray = (raw) => !raw ? [] : (Array.isArray(raw) ? raw : Object.keys(raw).sort((a, b) => Number(a) - Number(b)).map((k) => raw[k]));
  const objRows = (key, fields) => toArray(req.body[key]).map((o) => {
    const row = {}; let has = false;
    fields.forEach((f) => { const v = String((o && o[f]) || "").trim(); row[f] = v; if (v) has = true; });
    return has ? row : null;
  }).filter(Boolean);
  const strRows = (key) => toArray(req.body[key]).map((s) => String(s || "").trim()).filter(Boolean);
  body.features = objRows("features", ["t", "d"]);
  body.benefits = objRows("benefits", ["t", "d"]);
  body.steps = objRows("steps", ["t", "d"]);
  body.stats = objRows("stats", ["value", "label"]);
  body.testimonials = objRows("testimonials", ["name", "role", "quote"]);
  body.faqs = objRows("faqs", ["q", "a"]);
  body.commission = strRows("commission");
  try { await api("/admin/site-content", { method: "PUT", token: res.locals.token, body }); res.redirect("/admin/site-content?saved=1"); }
  catch (e) { res.redirect("/admin/site-content?saved=err"); }
});

// ── Pengajuan Mitra (property registration) ──
app.get("/admin/partner-applications", adminGuard, async (req, res) => {
  const { applications } = await api("/admin/partner-applications", { token: res.locals.token });
  res.render("admin/partner_applications", { applications, active: "partner-apps",
    creds: req.query.email ? { email: req.query.email, password: req.query.pass } : null, err: req.query.err });
});
app.post("/admin/partner-applications/:id/approve", adminGuard, async (req, res) => {
  try {
    const r = await api(`/admin/partner-applications/${req.params.id}/approve`, { method: "POST", token: res.locals.token, body: {} });
    res.redirect("/admin/partner-applications?email=" + encodeURIComponent(r.credentials.email) + "&pass=" + encodeURIComponent(r.credentials.password));
  } catch (e) { res.redirect("/admin/partner-applications?err=" + encodeURIComponent(e.message)); }
});
app.post("/admin/partner-applications/:id/reject", adminGuard, async (req, res) => {
  try { await api(`/admin/partner-applications/${req.params.id}/reject`, { method: "POST", token: res.locals.token, body: {} }); } catch (_) {}
  res.redirect("/admin/partner-applications");
});

// ── Moderasi Ulasan ──
app.get("/admin/reviews", adminGuard, async (req, res) => {
  const { reviews, stats } = await api("/admin/reviews", { token: res.locals.token });
  res.render("admin/reviews", { reviews, stats, active: "reviews", deleted: req.query.deleted });
});
app.post("/admin/reviews/:id/delete", adminGuard, async (req, res) => {
  try { await api("/admin/reviews/" + req.params.id, { method: "DELETE", token: res.locals.token }); } catch (_) {}
  res.redirect("/admin/reviews?deleted=1");
});

// ── Anti-Fraud (blocklist + pesanan berisiko) ──
app.get("/admin/fraud", adminGuard, async (req, res) => {
  const [{ blocks }, { bookings }] = await Promise.all([
    api("/admin/fraud/blocks", { token: res.locals.token }),
    api("/admin/fraud/flagged", { token: res.locals.token }),
  ]);
  res.render("admin/fraud", { blocks: blocks || [], flagged: bookings || [], active: "fraud", saved: req.query.saved });
});
app.post("/admin/fraud/block", adminGuard, async (req, res) => {
  try { await api("/admin/fraud/blocks", { method: "POST", token: res.locals.token, body: req.body }); res.redirect("/admin/fraud?saved=block"); }
  catch (e) { res.redirect("/admin/fraud?saved=err"); }
});
app.post("/admin/fraud/block/:id/delete", adminGuard, async (req, res) => {
  try { await api("/admin/fraud/blocks/" + req.params.id, { method: "DELETE", token: res.locals.token }); } catch (_) {}
  res.redirect("/admin/fraud?saved=unblock");
});
app.post("/admin/fraud/flagged/:id/clear", adminGuard, async (req, res) => {
  try { await api("/admin/bookings/" + req.params.id + "/clear-flag", { method: "POST", token: res.locals.token, body: {} }); } catch (_) {}
  res.redirect("/admin/fraud?saved=cleared");
});

// ── Konten Statis (T&C / Privasi / Tentang) ──
app.get("/admin/content", adminGuard, async (req, res) => {
  const { content } = await api("/admin/content", { token: res.locals.token });
  res.render("admin/content", { content, active: "content", saved: req.query.saved });
});
app.post("/admin/content/:slug", adminGuard, async (req, res) => {
  await api("/admin/content/" + req.params.slug, { method: "PUT", token: res.locals.token,
    body: { title: req.body.title, body: req.body.body } });
  res.redirect("/admin/content?saved=" + req.params.slug);
});

// ── Moderasi Fasilitas Hotel ──
app.get("/admin/facilities", adminGuard, async (req, res) => {
  const { facilities, hotels } = await api("/admin/facilities", { token: res.locals.token });
  res.render("admin/facilities", { facilities, hotels, active: "facilities",
    saved: req.query.saved, added: req.query.added, err: req.query.err });
});
app.post("/admin/facilities", adminGuard, async (req, res) => {
  try {
    await api("/admin/facilities", { method: "POST", token: res.locals.token,
      body: { name: req.body.name, icon: req.body.icon } });
    res.redirect("/admin/facilities?added=1");
  } catch (e) { res.redirect("/admin/facilities?err=1"); }
});
app.post("/admin/facilities/:id/delete", adminGuard, async (req, res) => {
  try { await api("/admin/facilities/" + req.params.id, { method: "DELETE", token: res.locals.token }); } catch (_) {}
  res.redirect("/admin/facilities");
});
app.post("/admin/hotels/:id/facilities", adminGuard, async (req, res) => {
  let ids = req.body.facilityIds;
  ids = Array.isArray(ids) ? ids : (ids ? [ids] : []);
  await api("/admin/hotels/" + req.params.id + "/facilities", { method: "PUT", token: res.locals.token, body: { facilityIds: ids } });
  res.redirect("/admin/facilities?saved=1");
});

// ── Laporan Keuangan ──
app.get("/admin/report", adminGuard, async (req, res) => {
  const q = [];
  if (req.query.from) q.push("from=" + req.query.from);
  if (req.query.to) q.push("to=" + req.query.to);
  const report = await api("/admin/finance/report" + (q.length ? "?" + q.join("&") : ""), { token: res.locals.token });
  res.render("admin/report", { report, from: req.query.from || "", to: req.query.to || "", active: "report" });
});

app.get("/admin/finance/report/download", adminGuard, async (req, res) => {
  const q = ["format=csv"];
  if (req.query.from) q.push("from=" + req.query.from);
  if (req.query.to) q.push("to=" + req.query.to);
  const r = await fetch(API + "/admin/finance/report?" + q.join("&"), { headers: { Authorization: `Bearer ${res.locals.token}` } });
  const csv = await r.text();
  res.set("Content-Type", "text/csv").set("Content-Disposition", 'attachment; filename="miruum-finance.csv"').send(csv);
});

// ── Live Chat CS (agent console) ──
app.get("/admin/chats", adminGuard, async (req, res) => {
  const { chats } = await api("/admin/chats", { token: res.locals.token });
  let conversation = null;
  if (req.query.id) conversation = (await api("/admin/chats/" + req.query.id, { token: res.locals.token })).conversation;
  res.render("admin/chats", { chats, conversation, active: "chats" });
});
app.post("/admin/chats/:id/reply", adminGuard, async (req, res) => {
  await api("/admin/chats/" + req.params.id + "/reply", { method: "POST", token: res.locals.token, body: { body: req.body.body } });
  res.redirect("/admin/chats?id=" + req.params.id);
});

// ── Promo ──
app.get("/admin/promos", adminGuard, async (req, res) => {
  const { promos } = await api("/admin/promos", { token: res.locals.token });
  res.render("admin/promos", { promos, active: "promos", saved: req.query.saved });
});
app.post("/admin/promos", adminGuard, async (req, res) => {
  try { await api("/admin/promos", { method: "POST", token: res.locals.token, body: req.body }); res.redirect("/admin/promos?saved=1"); }
  catch (e) { res.redirect("/admin/promos?saved=err"); }
});
app.post("/admin/promos/:id/delete", adminGuard, async (req, res) => {
  await api(`/admin/promos/${req.params.id}`, { method: "DELETE", token: res.locals.token }); res.redirect("/admin/promos");
});

// ── Tour module ──
app.get("/admin/tours", adminGuard, async (req, res) => {
  const { tours } = await api("/admin/tours", { token: res.locals.token });
  res.render("admin/tours", { tours, edit: null, active: "tours", saved: req.query.saved });
});
app.get("/admin/tours/:id/edit", adminGuard, async (req, res) => {
  const { tours } = await api("/admin/tours", { token: res.locals.token });
  const edit = tours.find((t) => t.id === req.params.id) || null;
  res.render("admin/tours", { tours, edit, active: "tours", saved: req.query.saved });
});
app.post("/admin/tours", adminGuard, async (req, res) => {
  try { await api("/admin/tours", { method: "POST", token: res.locals.token, body: req.body }); res.redirect("/admin/tours?saved=1"); }
  catch (e) { res.redirect("/admin/tours?saved=err"); }
});
app.post("/admin/tours/:id", adminGuard, async (req, res) => {
  try { await api(`/admin/tours/${req.params.id}`, { method: "PUT", token: res.locals.token, body: req.body }); res.redirect("/admin/tours?saved=1"); }
  catch (e) { res.redirect("/admin/tours?saved=err"); }
});
app.post("/admin/tours/:id/delete", adminGuard, async (req, res) => {
  await api(`/admin/tours/${req.params.id}`, { method: "DELETE", token: res.locals.token }); res.redirect("/admin/tours");
});

// ── Shuttle module ──
app.get("/admin/shuttle", adminGuard, async (req, res) => {
  const [{ vehicleTypes }, { rides }] = await Promise.all([
    api("/admin/shuttle/vehicle-types", { token: res.locals.token }),
    api("/admin/shuttle/rides", { token: res.locals.token }),
  ]);
  res.render("admin/shuttle", { vehicleTypes, rides, active: "shuttle", saved: req.query.saved });
});
app.post("/admin/shuttle/vehicle-types", adminGuard, async (req, res) => {
  try { await api("/admin/shuttle/vehicle-types", { method: "POST", token: res.locals.token, body: req.body }); res.redirect("/admin/shuttle?saved=1"); }
  catch (e) { res.redirect("/admin/shuttle?saved=err"); }
});
app.post("/admin/shuttle/vehicle-types/:id", adminGuard, async (req, res) => {
  try { await api(`/admin/shuttle/vehicle-types/${req.params.id}`, { method: "PUT", token: res.locals.token, body: req.body }); res.redirect("/admin/shuttle?saved=1"); }
  catch (e) { res.redirect("/admin/shuttle?saved=err"); }
});
app.post("/admin/shuttle/vehicle-types/:id/delete", adminGuard, async (req, res) => {
  await api(`/admin/shuttle/vehicle-types/${req.params.id}`, { method: "DELETE", token: res.locals.token }); res.redirect("/admin/shuttle");
});

// ── Banner ──
app.get("/admin/banners", adminGuard, async (req, res) => {
  const { banners } = await api("/admin/banners", { token: res.locals.token });
  res.render("admin/banners", { banners, active: "banners", saved: req.query.saved });
});
app.post("/admin/banners", adminGuard, upload.single("image"), async (req, res) => {
  let imageUrl = req.body.imageUrl;
  try { if (req.file) imageUrl = await uploadFile(res.locals.token, req.file, "banners"); } catch (_) {}
  await api("/admin/banners", { method: "POST", token: res.locals.token, body: { ...req.body, imageUrl } });
  res.redirect("/admin/banners?saved=1");
});
app.post("/admin/banners/:id/delete", adminGuard, async (req, res) => {
  await api(`/admin/banners/${req.params.id}`, { method: "DELETE", token: res.locals.token }); res.redirect("/admin/banners");
});

// ── Paket ──
app.get("/admin/packages", adminGuard, async (req, res) => {
  const [{ packages }, { hotels }] = await Promise.all([
    api("/admin/packages", { token: res.locals.token }),
    api("/admin/hotels", { token: res.locals.token }),
  ]);
  res.render("admin/packages", { packages, hotels, active: "packages", saved: req.query.saved });
});
app.post("/admin/packages", adminGuard, async (req, res) => {
  try { await api("/admin/packages", { method: "POST", token: res.locals.token, body: req.body }); res.redirect("/admin/packages?saved=1"); }
  catch { res.redirect("/admin/packages?saved=err"); }
});
app.post("/admin/packages/:id/delete", adminGuard, async (req, res) => {
  await api(`/admin/packages/${req.params.id}`, { method: "DELETE", token: res.locals.token }); res.redirect("/admin/packages");
});

// ── Pengaturan ──
app.get("/admin/settings", adminGuard, async (req, res) => {
  const [{ settings, defaults }, pm] = await Promise.all([
    api("/admin/settings", { token: res.locals.token }),
    api("/admin/payment-methods", { token: res.locals.token }).catch(() => ({ all: [], enabled: [] })),
  ]);
  res.render("admin/settings", {
    settings, defaults, active: "settings", saved: req.query.saved,
    payAll: pm.all || [], payEnabled: pm.enabled || [],
  });
});
app.post("/admin/settings", adminGuard, async (req, res) => {
  // Checkbox: present → "1", absent → "0" (unchecked boxes aren't submitted).
  req.body.foreign_market_enabled = req.body.foreign_market_enabled ? "1" : "0";
  await api("/admin/settings", { method: "PUT", token: res.locals.token, body: req.body }); res.redirect("/admin/settings?saved=1");
});
// Metode pembayaran yang ditawarkan — disimpan lewat endpoint settings
// sebagai daftar kode dipisah koma. Kosong = tawarkan semua metode.
app.post("/admin/payment-methods", adminGuard, async (req, res) => {
  const raw = req.body.codes;
  const codes = (Array.isArray(raw) ? raw : raw ? [raw] : []).map((c) => String(c).trim()).filter(Boolean);
  try {
    await api("/admin/settings", { method: "PUT", token: res.locals.token, body: { payment_methods_enabled: codes.join(",") } });
    res.redirect("/admin/settings?saved=1");
  } catch (e) { res.redirect("/admin/settings?saved=err"); }
});

// ── Pop-up & Update aplikasi ──
app.get("/admin/app-popup", adminGuard, async (req, res) => {
  const [{ popup }, { settings }] = await Promise.all([
    api("/admin/app-popup", { token: res.locals.token }),
    api("/admin/settings", { token: res.locals.token }),
  ]);
  res.render("admin/app_popup", { popup, settings, active: "app-popup", saved: req.query.saved, err: req.query.err });
});
app.post("/admin/app-popup", adminGuard, async (req, res) => {
  try { await api("/admin/app-popup", { method: "PUT", token: res.locals.token, body: req.body }); res.redirect("/admin/app-popup?saved=popup"); }
  catch (e) { res.redirect("/admin/app-popup?err=" + encodeURIComponent(e.message)); }
});
app.post("/admin/app-update", adminGuard, async (req, res) => {
  await api("/admin/settings", { method: "PUT", token: res.locals.token, body: req.body }); res.redirect("/admin/app-popup?saved=update");
});

// ── Integrasi (Email/FCM/WhatsApp) ──
app.get("/admin/integrations", adminGuard, async (req, res) => {
  const { integrations } = await api("/admin/integrations", { token: res.locals.token });
  res.render("admin/integrations", { integrations, active: "integrations", saved: req.query.saved, msg: req.query.msg });
});
app.post("/admin/integrations", adminGuard, async (req, res) => {
  const body = { ...req.body };
  ["mail_enabled", "smtp_secure", "fcm_enabled", "wa_enabled", "ai_enabled", "ai_auto", "channex_enabled", "hotelbeds_enabled"].forEach((k) => { body[k] = req.body[k] === "on" ? "1" : "0"; });
  await api("/admin/integrations", { method: "PUT", token: res.locals.token, body });
  res.redirect("/admin/integrations?saved=1");
});
// Live connectivity check for external supply / channel-manager providers.
app.get("/admin/integrations/supply-status", adminGuard, async (req, res) => {
  try { res.json(await api("/admin/supply/status", { token: res.locals.token })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
// Pull Channex properties (ARI) into the catalog.
app.post("/admin/integrations/channex-sync", adminGuard, async (req, res) => {
  try { const r = await api("/admin/supply/channex/sync", { method: "POST", token: res.locals.token, body: {} }); res.redirect("/admin/integrations?saved=cxsync&msg=" + encodeURIComponent(`${r.hotels} hotel, ${r.rooms} kamar`)); }
  catch (e) { res.redirect("/admin/integrations?saved=cxsyncerr&msg=" + encodeURIComponent(e.message)); }
});
app.post("/admin/integrations/test-email", adminGuard, async (req, res) => {
  try { await api("/admin/integrations/test-email", { method: "POST", token: res.locals.token, body: { to: req.body.to } }); res.redirect("/admin/integrations?saved=testmail"); }
  catch (e) { res.redirect("/admin/integrations?saved=testmailerr&msg=" + encodeURIComponent(e.message)); }
});
app.post("/admin/integrations/test-fcm", adminGuard, async (req, res) => {
  try { await api("/admin/integrations/test-fcm", { method: "POST", token: res.locals.token, body: {} }); res.redirect("/admin/integrations?saved=testfcm"); }
  catch (e) { res.redirect("/admin/integrations?saved=testfcmerr&msg=" + encodeURIComponent(e.message)); }
});

// ── Broadcast ──
app.get("/admin/broadcast", adminGuard, (req, res) => res.render("admin/broadcast", { active: "broadcast", sent: req.query.sent }));
app.post("/admin/broadcast", adminGuard, async (req, res) => {
  await api("/admin/notifications", { method: "POST", token: res.locals.token, body: req.body }); res.redirect("/admin/broadcast?sent=1");
});

// ── Distribution (room-type mapping + outbound push) ──
app.get("/admin/distribution", adminGuard, async (req, res) => {
  const { hotels, otaChannels } = await api("/admin/distribution", { token: res.locals.token });
  res.render("admin/distribution", { hotels, otaChannels, active: "distribution", pushed: req.query.pushed, saved: req.query.saved });
});
app.post("/admin/rooms/:roomId/map/:channelId", adminGuard, async (req, res) => {
  try { await api(`/admin/rooms/${req.params.roomId}/channel-maps/${req.params.channelId}`, { method: "PUT", token: res.locals.token, body: { externalRoomId: req.body.externalRoomId, enabled: req.body.enabled === "on" } }); }
  catch (_) {}
  res.redirect("/admin/distribution?saved=1");
});
app.post("/admin/distribution/push", adminGuard, async (req, res) => {
  const r = await api("/admin/distribution/push", { method: "POST", token: res.locals.token });
  res.redirect(`/admin/distribution?pushed=${r.pushed || 0}`);
});

// ── Rate Manager (central Channel Manager) ──
app.get("/admin/rates", adminGuard, async (req, res) => {
  const { hotels } = await api("/admin/rate-manager", { token: res.locals.token });
  res.render("admin/rates", { hotels, active: "rates", saved: req.query.saved });
});
app.post("/admin/rates/:roomId", adminGuard, async (req, res) => {
  await api(`/partner/rooms/${req.params.roomId}/availability`, { method: "PUT", token: res.locals.token,
    body: { from: req.body.from, to: req.body.to, price: req.body.price || undefined, allotment: req.body.allotment || undefined,
      closed: req.body.closed === "on", minStay: req.body.minStay || undefined, cta: req.body.cta === "on", ctd: req.body.ctd === "on" } });
  res.redirect("/admin/rates?saved=1");
});

// ═══════════════════════ EXTRANET (PARTNER) ═══════════════════════
app.get("/extranet/login", (req, res) => res.render("extranet/login", { error: null }));
app.post("/extranet/login", loginLimiter, async (req, res) => {
  try {
    const { token, user } = await api("/auth/login", { method: "POST", body: { email: req.body.email, password: req.body.password } });
    if (user.role !== "PARTNER" && user.role !== "ADMIN") throw new Error("Akun ini bukan mitra hotel");
    let ent = { extranet: true, channelManager: false, pms: false };
    try { ent = await api("/partner/entitlements", { token }); } catch { /* default: extranet only */ }
    req.session.partner = { token, user, ent };
    const home = res.locals.portal === "cm" ? "/extranet/channel-manager" : res.locals.portal === "pms" ? "/pms" : "/extranet";
    res.redirect(home);
  } catch (e) {
    res.render("extranet/login", { error: e.message });
  }
});
app.get("/extranet/logout", (req, res) => { delete req.session.partner; res.redirect("/extranet/login"); });

// Public: register/list your property to become a Miruum partner.
app.get("/extranet/register", (req, res) => res.render("extranet/register", { done: req.query.done, error: null }));
app.post("/extranet/register", async (req, res) => {
  try { await api("/partner-apply", { method: "POST", body: req.body }); res.redirect("/extranet/register?done=1"); }
  catch (e) { res.render("extranet/register", { done: null, error: e.message }); }
});

app.get("/extranet", partnerGuard, async (req, res) => {
  const overview = await api("/partner/overview", { token: res.locals.token });
  res.render("extranet/dashboard", { overview, active: "dashboard" });
});

app.get("/extranet/hotels/:id", partnerGuard, async (req, res) => {
  const monthQ = req.query.month ? `?month=${encodeURIComponent(req.query.month)}` : "";
  const [{ hotel }, { facilities }, cal] = await Promise.all([
    api(`/partner/hotels/${req.params.id}`, { token: res.locals.token }),
    api(`/facilities`),
    api(`/partner/hotels/${req.params.id}/calendar${monthQ}`, { token: res.locals.token }).catch(() => null),
  ]);
  res.render("extranet/hotel", { hotel, facilities, cal, hotelId: req.params.id, active: "dashboard", saved: req.query.saved, err: req.query.err });
});

// Dedicated, restricted Legalitas & Rekening page (separate from operational).
app.get("/extranet/hotels/:id/legal", partnerGuard, async (req, res) => {
  const { hotel } = await api(`/partner/hotels/${req.params.id}`, { token: res.locals.token });
  res.render("extranet/legal", { hotel, hotelId: req.params.id, active: "dashboard", saved: req.query.saved, err: req.query.err });
});

// Allotment calendar (Traveloka Tera style): month grid per room.
app.get("/extranet/hotels/:id/calendar", partnerGuard, async (req, res) => {
  const q = req.query.month ? `?month=${encodeURIComponent(req.query.month)}` : "";
  const cal = await api(`/partner/hotels/${req.params.id}/calendar${q}`, { token: res.locals.token });
  res.render("extranet/calendar", { cal, hotelId: req.params.id, active: "dashboard", saved: req.query.saved });
});

// ── Channel Manager (partner-facing, chanel.miruum.id) ──
app.get("/extranet/channel-manager", partnerGuard, productGuard("channelManager", "Channel Manager"), async (req, res) => {
  const cm = await api("/partner/channel-manager", { token: res.locals.token });
  res.render("extranet/channel_manager", { ...cm, active: "cm", pushed: req.query.pushed, saved: req.query.saved });
});
app.post("/extranet/rooms/:roomId/map/:channelId", partnerGuard, productGuard("channelManager", "Channel Manager"), async (req, res) => {
  try {
    if ((req.body.externalRoomId || "").trim()) {
      await api(`/partner/rooms/${req.params.roomId}/channel-maps/${req.params.channelId}`, {
        method: "PUT", token: res.locals.token, body: { externalRoomId: req.body.externalRoomId, enabled: req.body.enabled === "on" || req.body.enabled === undefined },
      });
    } else {
      await api(`/partner/rooms/${req.params.roomId}/channel-maps/${req.params.channelId}`, { method: "DELETE", token: res.locals.token });
    }
    res.redirect("/extranet/channel-manager?saved=1");
  } catch (e) { res.redirect("/extranet/channel-manager?saved=err"); }
});
app.post("/extranet/distribution/push", partnerGuard, productGuard("channelManager", "Channel Manager"), async (req, res) => {
  const r = await api("/partner/distribution/push", { method: "POST", token: res.locals.token, body: {} });
  res.redirect(`/extranet/channel-manager?pushed=${r.pushed || 0}`);
});

// ═══════════════════ CORPORATE & GOVERNMENT (corporate.miruum.id) ═══════════════════
app.get("/corporate/login", (req, res) => res.render("corporate/login", { error: null }));
app.post("/corporate/login", loginLimiter, async (req, res) => {
  try {
    const { token, user } = await api("/auth/login", { method: "POST", body: { email: req.body.email, password: req.body.password } });
    if (user.role !== "CORPORATE") throw new Error("Akun ini bukan akun corporate");
    req.session.corporate = { token, user };
    res.redirect("/corporate");
  } catch (e) { res.render("corporate/login", { error: e.message }); }
});
app.get("/corporate/logout", (req, res) => { delete req.session.corporate; res.redirect("/corporate/login"); });

// Public: apply for a corporate account (pengajuan layanan).
app.get("/corporate/register", async (req, res) => {
  const cfg = await corporateDocConfig();
  res.render("corporate/register", { done: req.query.done, error: null, cfg });
});
app.post("/corporate/register", docUpload.any(), async (req, res) => {
  const cfg = await corporateDocConfig();
  try {
    const entityType = req.body.entityType || "SWASTA";
    const docsSpec = (cfg.catalog && cfg.catalog[entityType]) || [];
    // Upload each attached document that belongs to the chosen entity type.
    const documents = [];
    for (const f of (req.files || [])) {
      const key = f.fieldname.replace(/^doc_/, "");
      const spec = docsSpec.find((d) => d.key === key);
      if (!spec) continue;
      const url = await uploadDocPublic(f);
      documents.push({ key, label: spec.label, url });
    }
    // Enforce required documents before submitting.
    const missing = docsSpec.filter((d) => d.required && !documents.some((x) => x.key === d.key));
    if (missing.length) throw new Error("Dokumen wajib belum lengkap: " + missing.map((d) => d.label).join(", "));
    const { documents: _omit, ...fields } = req.body;
    await api("/corporate/apply", { method: "POST", body: { ...fields, entityType, documents } });
    res.redirect("/corporate/register?done=1");
  } catch (e) {
    res.render("corporate/register", { done: null, error: e.message, cfg });
  }
});

app.get("/corporate", corporateGuard, corpNav, async (req, res) => {
  const data = res.locals.corpOverview || await api("/corporate/overview", { token: res.locals.token });
  // discountPct = tarif B2B efektif (negosiasi akun, atau default global).
  res.render("corporate/dashboard", { ...data, discountPct: Number(data.discountPct || 0), active: "dashboard" });
});
app.get("/corporate/book", corporateGuard, corpNav, async (req, res) => {
  // Tiap kamar membawa `price` (tarif B2B yang dibayar) + `publicPrice` (harga publik).
  const { hotels, discountPct } = await api("/corporate/rooms", { token: res.locals.token });
  res.render("corporate/book", {
    hotels, discountPct: Number(discountPct || 0),
    active: "book", pending: req.query.pending, noapprover: req.query.noapprover, err: req.query.err,
  });
});
app.post("/corporate/book", corporateGuard, async (req, res) => {
  try {
    // Semua pesanan korporat kini masuk antrean persetujuan (Maker → Approver).
    const r = await api("/corporate/bookings", { method: "POST", token: res.locals.token, body: req.body });
    const code = r.booking?.code || "";
    res.redirect("/corporate/book?pending=" + code + (r.noApprover ? "&noapprover=1" : ""));
  } catch (e) { res.redirect("/corporate/book?err=1"); }
});
app.get("/corporate/bookings", corporateGuard, corpNav, async (req, res) => {
  const { bookings } = await api("/corporate/bookings", { token: res.locals.token });
  res.render("corporate/bookings", { bookings, active: "bookings" });
});
app.get("/corporate/invoices", corporateGuard, corpNav, async (req, res) => {
  const { invoices } = await api("/corporate/invoices", { token: res.locals.token });
  res.render("corporate/invoices", { invoices, active: "invoices" });
});

// ── Persetujuan (Maker → Approver) ──
app.get("/corporate/approvals", corporateGuard, corpNav, async (req, res) => {
  const data = await api("/corporate/approvals", { token: res.locals.token });
  res.render("corporate/approvals", {
    approvals: data.approvals || [], canApprove: !!data.canApprove, myRole: data.myRole,
    active: "approvals", done: req.query.done, err: req.query.err,
  });
});
app.post("/corporate/approvals/:id/approve", corporateGuard, async (req, res) => {
  try { await api(`/corporate/bookings/${req.params.id}/approve`, { method: "POST", token: res.locals.token, body: {} }); res.redirect("/corporate/approvals?done=approve"); }
  catch (e) { res.redirect("/corporate/approvals?err=" + encodeURIComponent(e.message)); }
});
app.post("/corporate/approvals/:id/reject", corporateGuard, async (req, res) => {
  try { await api(`/corporate/bookings/${req.params.id}/reject`, { method: "POST", token: res.locals.token, body: { reason: req.body.reason } }); res.redirect("/corporate/approvals?done=reject"); }
  catch (e) { res.redirect("/corporate/approvals?err=" + encodeURIComponent(e.message)); }
});

// ── Pengguna & Peran (ADMIN korporat) ──
app.get("/corporate/users", corporateGuard, corpNav, async (req, res) => {
  const data = await api("/corporate/users", { token: res.locals.token });
  res.render("corporate/users", {
    users: data.users || [], canManage: !!data.canManage, meId: data.me?.id,
    active: "users", done: req.query.done, err: req.query.err,
  });
});
app.post("/corporate/users", corporateGuard, async (req, res) => {
  try { await api("/corporate/users", { method: "POST", token: res.locals.token, body: req.body }); res.redirect("/corporate/users?done=add"); }
  catch (e) { res.redirect("/corporate/users?err=" + encodeURIComponent(e.message)); }
});
app.post("/corporate/users/:id", corporateGuard, async (req, res) => {
  try { await api("/corporate/users/" + req.params.id, { method: "PUT", token: res.locals.token, body: { corporateRole: req.body.corporateRole } }); res.redirect("/corporate/users?done=role"); }
  catch (e) { res.redirect("/corporate/users?err=" + encodeURIComponent(e.message)); }
});
app.post("/corporate/users/:id/delete", corporateGuard, async (req, res) => {
  try { await api("/corporate/users/" + req.params.id, { method: "DELETE", token: res.locals.token }); res.redirect("/corporate/users?done=del"); }
  catch (e) { res.redirect("/corporate/users?err=" + encodeURIComponent(e.message)); }
});

// ── Program Promo & Campaign (partner opt-in) ──
app.get("/extranet/programs", partnerGuard, async (req, res) => {
  const { participations } = await api("/partner/programs", { token: res.locals.token });
  res.render("extranet/programs", { participations, active: "programs", done: req.query.done });
});
app.post("/extranet/programs/:id/join", partnerGuard, async (req, res) => {
  try { await api(`/partner/programs/${req.params.id}/join`, { method: "POST", token: res.locals.token, body: { offerPct: req.body.offerPct, note: req.body.note } }); res.redirect("/extranet/programs?done=join"); }
  catch (e) { res.redirect("/extranet/programs?done=err"); }
});
app.post("/extranet/programs/:id/decline", partnerGuard, async (req, res) => {
  try { await api(`/partner/programs/${req.params.id}/decline`, { method: "POST", token: res.locals.token, body: {} }); res.redirect("/extranet/programs?done=decline"); }
  catch (e) { res.redirect("/extranet/programs?done=err"); }
});

// ── Pencairan / Klaim (partner earnings & payout claims) ──
app.get("/extranet/payouts", partnerGuard, async (req, res) => {
  const [earnings, { claims }] = await Promise.all([
    api("/partner/earnings", { token: res.locals.token }),
    api("/partner/claims", { token: res.locals.token }),
  ]);
  res.render("extranet/payouts", { earnings, claims, active: "payouts", done: req.query.done, err: req.query.err });
});
app.post("/extranet/payouts/claim", partnerGuard, async (req, res) => {
  try { await api("/partner/claims", { method: "POST", token: res.locals.token, body: req.body }); res.redirect("/extranet/payouts?done=1"); }
  catch (e) { res.redirect("/extranet/payouts?err=" + encodeURIComponent(e.message)); }
});

// ── Promo & Campaign self-registration (partner registers its own campaign) ──
app.get("/extranet/campaigns", partnerGuard, async (req, res) => {
  const { campaigns, hotels } = await api("/partner/campaigns", { token: res.locals.token });
  res.render("extranet/campaigns", { campaigns, hotels, active: "campaigns", done: req.query.done, err: req.query.err });
});
app.post("/extranet/campaigns", partnerGuard, async (req, res) => {
  try { await api("/partner/campaigns", { method: "POST", token: res.locals.token, body: req.body }); res.redirect("/extranet/campaigns?done=1"); }
  catch (e) { res.redirect("/extranet/campaigns?err=" + encodeURIComponent(e.message)); }
});
app.post("/extranet/campaigns/:id/cancel", partnerGuard, async (req, res) => {
  try { await api(`/partner/campaigns/${req.params.id}/cancel`, { method: "POST", token: res.locals.token, body: {} }); } catch (_) {}
  res.redirect("/extranet/campaigns");
});

// ── Advance Deposit Program ──
app.get("/extranet/deposit", partnerGuard, async (req, res) => {
  const data = await api("/partner/deposit", { token: res.locals.token });
  res.render("extranet/deposit", { ...data, active: "deposit", done: req.query.done, err: req.query.err });
});
app.post("/extranet/deposit/topup", partnerGuard, async (req, res) => {
  try { await api("/partner/deposit/topup", { method: "POST", token: res.locals.token, body: req.body }); res.redirect("/extranet/deposit?done=1"); }
  catch (e) { res.redirect("/extranet/deposit?err=" + encodeURIComponent(e.message)); }
});

// ── Invoice Bulanan ──
app.get("/extranet/invoices", partnerGuard, async (req, res) => {
  const { invoices, hotels } = await api("/partner/invoices", { token: res.locals.token });
  res.render("extranet/invoices", { invoices, hotels, active: "invoices" });
});
app.get("/extranet/invoices/:id/download", partnerGuard, async (req, res) => {
  const r = await fetch(API + `/partner/invoices/${req.params.id}/detail`, { headers: { Authorization: `Bearer ${res.locals.token}` } });
  const csv = await r.text();
  res.set("Content-Type", "text/csv").set("Content-Disposition", 'attachment; filename="miruum-invoice.csv"').send(csv);
});

// ── Analytics (Dasbor Analitik) ──
app.get("/extranet/analytics", partnerGuard, async (req, res) => {
  const a = await api("/partner/analytics", { token: res.locals.token });
  res.render("extranet/analytics", { a, active: "analytics" });
});

// ── PMS — Property Management System (pms.miruum.id) ──
app.get("/pms", partnerGuard, productGuard("pms", "PMS"), async (req, res) => {
  const pms = await api("/partner/pms", { token: res.locals.token });
  res.render("pms/dashboard", { ...pms, active: "pms", done: req.query.done });
});
app.post("/pms/checkin/:id", partnerGuard, productGuard("pms", "PMS"), async (req, res) => {
  try { await api(`/partner/bookings/${req.params.id}/checkin`, { method: "POST", token: res.locals.token, body: {} }); res.redirect("/pms?done=checkin"); }
  catch (e) { res.redirect("/pms?done=err"); }
});
app.post("/pms/checkout/:id", partnerGuard, productGuard("pms", "PMS"), async (req, res) => {
  try { await api(`/partner/bookings/${req.params.id}/checkout`, { method: "POST", token: res.locals.token, body: {} }); res.redirect("/pms?done=checkout"); }
  catch (e) { res.redirect("/pms?done=err"); }
});
app.post("/pms/housekeeping/:id", partnerGuard, productGuard("pms", "PMS"), async (req, res) => {
  try { await api(`/partner/rooms/${req.params.id}/housekeeping`, { method: "POST", token: res.locals.token, body: { status: req.body.status } }); res.redirect("/pms?done=hk"); }
  catch (e) { res.redirect("/pms?done=err"); }
});

// Reservation detail: folio + room assignment.
const pmsG = [partnerGuard, productGuard("pms", "PMS")];
app.get("/pms/booking/:id", ...pmsG, async (req, res) => {
  try {
    const [folio, units] = await Promise.all([
      api(`/partner/bookings/${req.params.id}/folio`, { token: res.locals.token }),
      api(`/partner/bookings/${req.params.id}/room-units`, { token: res.locals.token }),
    ]);
    res.render("pms/booking", { id: req.params.id, ...folio, units: units.units, active: "pms", saved: req.query.saved });
  } catch (e) { res.redirect("/pms"); }
});
app.post("/pms/booking/:id/checkin", ...pmsG, async (req, res) => {
  try { await api(`/partner/bookings/${req.params.id}/checkin`, { method: "POST", token: res.locals.token, body: { roomUnitId: req.body.roomUnitId } }); } catch (_) {}
  res.redirect(`/pms/booking/${req.params.id}?saved=checkin`);
});
app.post("/pms/booking/:id/folio", ...pmsG, async (req, res) => {
  try { await api(`/partner/bookings/${req.params.id}/folio`, { method: "POST", token: res.locals.token, body: req.body }); } catch (_) {}
  res.redirect(`/pms/booking/${req.params.id}?saved=charge`);
});
app.post("/pms/folio/:cid/delete/:bid", ...pmsG, async (req, res) => {
  try { await api(`/partner/folio/${req.params.cid}`, { method: "DELETE", token: res.locals.token }); } catch (_) {}
  res.redirect(`/pms/booking/${req.params.bid}`);
});
app.post("/pms/night-audit", ...pmsG, async (req, res) => {
  try { await api("/partner/pms/night-audit", { method: "POST", token: res.locals.token, body: {} }); } catch (_) {}
  res.redirect("/pms/reports?done=audit");
});
app.get("/pms/reports", ...pmsG, async (req, res) => {
  const { reports } = await api("/partner/pms/reports", { token: res.locals.token });
  res.render("pms/reports", { reports, active: "reports", done: req.query.done });
});

// POS terminal
app.get("/pms/pos", ...pmsG, async (req, res) => {
  const data = await api("/partner/pos/rooms", { token: res.locals.token });
  res.render("pms/pos", { ...data, active: "pos", saved: req.query.saved });
});
app.post("/pms/pos/charge", ...pmsG, async (req, res) => {
  try { await api("/partner/pos/charge", { method: "POST", token: res.locals.token, body: req.body }); res.redirect("/pms/pos?saved=1"); }
  catch (e) { res.redirect("/pms/pos?saved=err"); }
});

// Maintenance / work orders
app.get("/pms/maintenance", ...pmsG, async (req, res) => {
  const data = await api("/partner/work-orders", { token: res.locals.token });
  res.render("pms/maintenance", { ...data, active: "maintenance", saved: req.query.saved });
});
app.post("/pms/maintenance", ...pmsG, async (req, res) => {
  try { await api("/partner/work-orders", { method: "POST", token: res.locals.token, body: req.body }); } catch (_) {}
  res.redirect("/pms/maintenance?saved=1");
});
app.post("/pms/maintenance/:id/status", ...pmsG, async (req, res) => {
  try { await api(`/partner/work-orders/${req.params.id}`, { method: "PUT", token: res.locals.token, body: { status: req.body.status } }); } catch (_) {}
  res.redirect("/pms/maintenance");
});
app.get("/pms/guests", ...pmsG, async (req, res) => {
  const { guests } = await api("/partner/guests", { token: res.locals.token });
  let detail = null;
  if (req.query.e) { try { detail = await api(`/partner/guests/${encodeURIComponent(req.query.e)}`, { token: res.locals.token }); } catch (_) {} }
  res.render("pms/guests", { guests, detail, active: "guests" });
});
app.post("/pms/guests/:email/note", ...pmsG, async (req, res) => {
  try { await api(`/partner/guests/${encodeURIComponent(req.params.email)}/note`, { method: "PUT", token: res.locals.token, body: { note: req.body.note, preferences: req.body.preferences } }); } catch (_) {}
  res.redirect(`/pms/guests?e=${encodeURIComponent(req.params.email)}`);
});

// Add a new room type — makes a freshly-onboarded hotel go live in the app.
app.post("/extranet/hotels/:id/rooms", partnerGuard, async (req, res) => {
  try {
    await api(`/partner/hotels/${req.params.id}/rooms`, { method: "POST", token: res.locals.token, body: {
      name: req.body.name, bedInfo: req.body.bedInfo, price: req.body.price, stock: req.body.stock, capacity: req.body.capacity,
      breakfast: req.body.breakfast === "on", refundable: req.body.refundable === "on", freeCancellation: req.body.freeCancellation === "on",
    } });
    res.redirect(`/extranet/hotels/${req.params.id}?saved=kamar#kamar`);
  } catch (e) { res.redirect(`/extranet/hotels/${req.params.id}?err=` + encodeURIComponent(e.message) + `#kamar`); }
});
app.post("/extranet/rooms/:id/delete", partnerGuard, async (req, res) => {
  try {
    await api(`/partner/rooms/${req.params.id}`, { method: "DELETE", token: res.locals.token });
    res.redirect((req.body.hotelId ? `/extranet/hotels/${req.body.hotelId}?saved=kamar#kamar` : (req.get("referer") || "/extranet")));
  } catch (e) { res.redirect(`/extranet/hotels/${req.body.hotelId || ""}?err=` + encodeURIComponent(e.message) + `#kamar`); }
});

app.post("/extranet/rooms/:id", partnerGuard, async (req, res) => {
  await api(`/partner/rooms/${req.params.id}`, { method: "PUT", token: res.locals.token, body: {
    price: req.body.price, stock: req.body.stock, capacity: req.body.capacity, bedInfo: req.body.bedInfo,
    refundable: req.body.refundable === "on", freeCancellation: req.body.freeCancellation === "on", breakfast: req.body.breakfast === "on",
  } });
  res.redirect(req.get("referer") || "/extranet");
});

// Partner deal (buat promo sendiri) — % off a room.
app.post("/extranet/rooms/:id/deal", partnerGuard, async (req, res) => {
  await api(`/partner/rooms/${req.params.id}/deal`, { method: "PUT", token: res.locals.token, body: { dealPct: req.body.dealPct } });
  res.redirect(req.get("referer") || "/extranet");
});

// Rate plans per room (multi rate-plan).
app.post("/extranet/rooms/:roomId/rate-plans", partnerGuard, async (req, res) => {
  try { await api(`/partner/rooms/${req.params.roomId}/rate-plans`, { method: "POST", token: res.locals.token, body: req.body }); } catch (_) {}
  res.redirect(req.get("referer") || "/extranet");
});
app.post("/extranet/rate-plans/:id/delete", partnerGuard, async (req, res) => {
  try { await api(`/partner/rate-plans/${req.params.id}`, { method: "DELETE", token: res.locals.token }); } catch (_) {}
  res.redirect(req.get("referer") || "/extranet");
});
// "What's nearby" per hotel.
app.post("/extranet/hotels/:id/nearby", partnerGuard, async (req, res) => {
  try { await api(`/partner/hotels/${req.params.id}/nearby`, { method: "POST", token: res.locals.token, body: req.body }); } catch (_) {}
  res.redirect(`/extranet/hotels/${req.params.id}?saved=sekitar`);
});
app.post("/extranet/nearby/:id/delete", partnerGuard, async (req, res) => {
  try { await api(`/partner/nearby/${req.params.id}`, { method: "DELETE", token: res.locals.token }); } catch (_) {}
  res.redirect(req.get("referer") || "/extranet");
});
// Property type.
app.post("/extranet/hotels/:id/property-type", partnerGuard, async (req, res) => {
  try { await api(`/partner/hotels/${req.params.id}/property-type`, { method: "PUT", token: res.locals.token, body: { propertyType: req.body.propertyType } }); } catch (_) {}
  res.redirect(`/extranet/hotels/${req.params.id}?saved=tipe`);
});

// Lokasi & wilayah properti (wilayah wajib — dipakai pencarian area).
app.post("/extranet/hotels/:id/location", partnerGuard, async (req, res) => {
  try {
    await api(`/partner/hotels/${req.params.id}/location`, { method: "PUT", token: res.locals.token, body: {
      regionId: req.body.regionId, address: req.body.address, city: req.body.city } });
    res.redirect(`/extranet/hotels/${req.params.id}?saved=lokasi`);
  } catch (e) { res.redirect(`/extranet/hotels/${req.params.id}?err=` + encodeURIComponent(e.message)); }
});

// Edit property content + facilities.
app.post("/extranet/hotels/:id/content", partnerGuard, async (req, res) => {
  await api(`/partner/hotels/${req.params.id}/content`, { method: "PUT", token: res.locals.token, body: {
    description: req.body.description, checkInInfo: req.body.checkInInfo, checkOutInfo: req.body.checkOutInfo } });
  res.redirect(`/extranet/hotels/${req.params.id}?saved=konten`);
});
app.post("/extranet/hotels/:id/legal", partnerGuard, async (req, res) => {
  try { await api(`/partner/hotels/${req.params.id}/legal`, { method: "PUT", token: res.locals.token, body: req.body });
    res.redirect(`/extranet/hotels/${req.params.id}/legal?saved=legal`);
  } catch (e) { res.redirect(`/extranet/hotels/${req.params.id}/legal?err=` + encodeURIComponent(e.message)); }
});
app.post("/extranet/hotels/:id/facilities", partnerGuard, async (req, res) => {
  const ids = Array.isArray(req.body.facilityIds) ? req.body.facilityIds : (req.body.facilityIds ? [req.body.facilityIds] : []);
  await api(`/partner/hotels/${req.params.id}/facilities`, { method: "PUT", token: res.locals.token, body: { facilityIds: ids } });
  res.redirect(`/extranet/hotels/${req.params.id}?saved=fasilitas`);
});

// Guest reviews + reply.
app.get("/extranet/reviews", partnerGuard, async (req, res) => {
  const { reviews } = await api("/partner/reviews", { token: res.locals.token });
  res.render("extranet/reviews", { reviews, active: "reviews", saved: req.query.saved });
});
app.post("/extranet/reviews/:id/reply", partnerGuard, async (req, res) => {
  try { await api(`/partner/reviews/${req.params.id}/reply`, { method: "POST", token: res.locals.token, body: { reply: req.body.reply } }); } catch (_) {}
  res.redirect("/extranet/reviews?saved=1");
});

// Miruum Intelligent — per-hotel OTA rate comparison + auto-check schedule.
app.get("/extranet/miruum-intelligent", partnerGuard, async (req, res) => {
  const data = await api("/partner/rate-intelligence", { token: res.locals.token });
  res.render("extranet/miruum_intelligent", { ...data, active: "miruum-intelligent", saved: req.query.saved });
});
app.post("/extranet/hotels/:id/rate-shop", partnerGuard, async (req, res) => {
  try { await api(`/partner/hotels/${req.params.id}/rate-shop`, { method: "PUT", token: res.locals.token, body: { freq: req.body.freq } }); res.redirect("/extranet/miruum-intelligent?saved=1"); }
  catch (e) { res.redirect("/extranet/miruum-intelligent?saved=err"); }
});

// Property Q&A — partner answers guest questions.
app.get("/extranet/questions", partnerGuard, async (req, res) => {
  const { questions } = await api("/partner/questions", { token: res.locals.token });
  res.render("extranet/questions", { questions, active: "questions", saved: req.query.saved });
});
app.post("/extranet/questions/:id/answer", partnerGuard, async (req, res) => {
  try { await api(`/partner/questions/${req.params.id}/answer`, { method: "POST", token: res.locals.token, body: { answer: req.body.answer } }); } catch (_) {}
  res.redirect("/extranet/questions?saved=1");
});

// Guest messages inbox + thread + reply.
app.get("/extranet/messages", partnerGuard, async (req, res) => {
  const { threads } = await api("/partner/messages", { token: res.locals.token });
  let thread = null, messages = [];
  if (req.query.t) {
    try { const d = await api(`/partner/messages/${req.query.t}`, { token: res.locals.token }); thread = d.thread; messages = d.messages; } catch (_) {}
  }
  res.render("extranet/messages", { threads, thread, messages, active: "messages" });
});
app.post("/extranet/messages/:id/reply", partnerGuard, async (req, res) => {
  try { await api(`/partner/messages/${req.params.id}`, { method: "POST", token: res.locals.token, body: { reply: req.body.reply } }); } catch (_) {}
  res.redirect(`/extranet/messages?t=${req.params.id}`);
});

// Performance report.
app.get("/extranet/report", partnerGuard, async (req, res) => {
  const report = await api("/partner/report", { token: res.locals.token });
  res.render("extranet/report", { report, active: "report" });
});

// Bulk-set rate / allotment / closed over a date range (Channel Manager calendar).
app.post("/extranet/rooms/:id/availability", partnerGuard, async (req, res) => {
  // Tri-state: "" = jangan ubah, "1"/"on"/"true" = ya, "0"/"false" = tidak.
  const tri = (v) => (v === undefined || v === "" ? undefined : v === "1" || v === "on" || v === "true");
  const num = (v) => (v === undefined || v === "" ? undefined : v);
  await api(`/partner/rooms/${req.params.id}/availability`, {
    method: "PUT", token: res.locals.token,
    body: { from: req.body.from, to: req.body.to,
      price: num(req.body.price), allotment: num(req.body.allotment), minStay: num(req.body.minStay),
      closed: tri(req.body.closed), cta: tri(req.body.cta), ctd: tri(req.body.ctd) },
  });
  res.redirect(req.body.redirect || "back");
});

// Bulk photo upload — many files at once, tagged by category, optionally per-room.
app.post("/extranet/hotels/:id/photos", partnerGuard, upload.array("photos", 20), async (req, res) => {
  try {
    const files = req.files || [];
    if (files.length) {
      const urls = [];
      for (const f of files) {
        try { urls.push(await uploadFile(res.locals.token, f, "hotels")); } catch (_) {}
      }
      if (urls.length) {
        await api(`/partner/hotels/${req.params.id}/photos`, {
          method: "POST", token: res.locals.token,
          body: { urls, category: req.body.category || "OTHER", roomId: req.body.roomId || undefined },
        });
      }
    }
  } catch (_) {}
  res.redirect(`/extranet/hotels/${req.params.id}?saved=foto#foto`);
});
// Change hotel cover / profile photo.
app.post("/extranet/hotels/:id/cover", partnerGuard, upload.single("cover"), async (req, res) => {
  try {
    if (req.file) {
      const url = await uploadFile(res.locals.token, req.file, "hotels");
      await api(`/partner/hotels/${req.params.id}/cover`, { method: "PUT", token: res.locals.token, body: { url } });
    }
  } catch (e) { return res.redirect(`/extranet/hotels/${req.params.id}?err=` + encodeURIComponent(e.message)); }
  res.redirect(`/extranet/hotels/${req.params.id}?saved=cover`);
});
app.post("/extranet/photos/:photoId/delete", partnerGuard, async (req, res) => {
  try { await api(`/partner/photos/${req.params.photoId}`, { method: "DELETE", token: res.locals.token }); } catch (_) {}
  res.redirect(req.get("referer") || "/extranet");
});
app.post("/extranet/hotels/:id/promo", partnerGuard, async (req, res) => {
  await api(`/partner/hotels/${req.params.id}/promo`, { method: "PUT", token: res.locals.token, body: { isPromo: req.body.isPromo, promoLabel: req.body.promoLabel } });
  res.redirect(`/extranet/hotels/${req.params.id}`);
});

app.get("/extranet/bookings", partnerGuard, async (req, res) => {
  const { bookings } = await api("/partner/bookings", { token: res.locals.token });
  res.render("extranet/bookings", { bookings, active: "bookings" });
});

app.post("/extranet/bookings/:id/status", partnerGuard, async (req, res) => {
  try {
    await api(`/partner/bookings/${req.params.id}/status`, { method: "PUT", token: res.locals.token, body: { status: req.body.status } });
  } catch (_) {}
  res.redirect("/extranet/bookings");
});

// ── error fallback ──
app.use((err, _req, res, _next) => {
  console.error("[web] error:", err.message);
  res.status(500).render("error", { message: err.message });
});

app.listen(PORT, () => console.log(`[miruum-web] listening on :${PORT} → API ${API}`));
