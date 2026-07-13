const path = require("path");
const express = require("express");
const session = require("express-session");

const app = express();
const PORT = Number(process.env.PORT || 4101);
const API = process.env.API_URL || "http://backend:5013/api";
const APK_URL = process.env.APK_URL || "";

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "views"));
app.use(express.urlencoded({ extended: true }));
app.use("/static", express.static(path.join(__dirname, "..", "public")));
app.use(session({
  secret: process.env.SESSION_SECRET || "miruum-web-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 12 },
}));

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
    next();
  };
}
const adminGuard = guard("admin", "/admin/login");
const partnerGuard = guard("partner", "/extranet/login");

// ═══════════════════════ LANDING ═══════════════════════
app.get("/", (_req, res) => res.render("landing"));
app.get("/health", (_req, res) => res.json({ ok: true, service: "miruum-web" }));

// ═══════════════════════ BACK OFFICE (ADMIN) ═══════════════════════
app.get("/admin/login", (req, res) => res.render("admin/login", { error: null, base: "/admin" }));
app.post("/admin/login", async (req, res) => {
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
  res.render("admin/hotel_form", { hotel: null, users: users.filter((u) => u.role === "PARTNER"), active: "hotels" });
});

app.post("/admin/hotels", adminGuard, async (req, res) => {
  await api("/admin/hotels", { method: "POST", token: res.locals.token, body: req.body });
  res.redirect("/admin/hotels");
});

app.get("/admin/hotels/:id/edit", adminGuard, async (req, res) => {
  const [{ hotels }, { users }] = await Promise.all([
    api("/admin/hotels", { token: res.locals.token }),
    api("/admin/users", { token: res.locals.token }),
  ]);
  const hotel = hotels.find((h) => h.id === req.params.id);
  res.render("admin/hotel_form", { hotel, users: users.filter((u) => u.role === "PARTNER"), active: "hotels" });
});

app.post("/admin/hotels/:id", adminGuard, async (req, res) => {
  await api(`/admin/hotels/${req.params.id}`, { method: "PUT", token: res.locals.token, body: req.body });
  res.redirect("/admin/hotels");
});

app.post("/admin/hotels/:id/delete", adminGuard, async (req, res) => {
  await api(`/admin/hotels/${req.params.id}`, { method: "DELETE", token: res.locals.token });
  res.redirect("/admin/hotels");
});

app.get("/admin/channels", adminGuard, async (req, res) => {
  const { hotels, channels } = await api("/admin/channel-manager", { token: res.locals.token });
  res.render("admin/channel_manager", { hotels, channels, active: "channels", synced: req.query.synced });
});

app.post("/admin/channels/sync", adminGuard, async (req, res) => {
  const r = await api("/admin/offers/sync", { method: "POST", token: res.locals.token });
  res.redirect(`/admin/channels?synced=${r.offers || 0}`);
});

app.get("/admin/bookings", adminGuard, async (req, res) => {
  const { bookings } = await api("/admin/bookings", { token: res.locals.token });
  res.render("admin/bookings", { bookings, active: "bookings" });
});

app.get("/admin/users", adminGuard, async (req, res) => {
  const { users } = await api("/admin/users", { token: res.locals.token });
  res.render("admin/users", { users, active: "users" });
});

// ═══════════════════════ EXTRANET (PARTNER) ═══════════════════════
app.get("/extranet/login", (req, res) => res.render("extranet/login", { error: null }));
app.post("/extranet/login", async (req, res) => {
  try {
    const { token, user } = await api("/auth/login", { method: "POST", body: { email: req.body.email, password: req.body.password } });
    if (user.role !== "PARTNER" && user.role !== "ADMIN") throw new Error("Akun ini bukan mitra hotel");
    req.session.partner = { token, user };
    res.redirect("/extranet");
  } catch (e) {
    res.render("extranet/login", { error: e.message });
  }
});
app.get("/extranet/logout", (req, res) => { delete req.session.partner; res.redirect("/extranet/login"); });

app.get("/extranet", partnerGuard, async (req, res) => {
  const overview = await api("/partner/overview", { token: res.locals.token });
  res.render("extranet/dashboard", { overview, active: "dashboard" });
});

app.get("/extranet/hotels/:id", partnerGuard, async (req, res) => {
  const { hotel } = await api(`/partner/hotels/${req.params.id}`, { token: res.locals.token });
  res.render("extranet/hotel", { hotel, active: "dashboard" });
});

app.post("/extranet/rooms/:id", partnerGuard, async (req, res) => {
  await api(`/partner/rooms/${req.params.id}`, { method: "PUT", token: res.locals.token, body: { price: req.body.price, stock: req.body.stock } });
  res.redirect("back");
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
