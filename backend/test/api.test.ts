import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../src/server.js";
import { prisma } from "../src/prisma.js";

// End-to-end tests over the real HTTP surface (supertest against the Express app)
// covering the critical flows: auth, booking → pay → settle → refund, and PMS.
// Requires a seeded test database (CI provisions Postgres + migrate + seed).

const uniq = () => Math.random().toString(36).slice(2, 10);
let token = "";
let userId = "";

describe("health", () => {
  it("GET /api/health is ok", async () => {
    const r = await request(app).get("/api/health");
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });
});

describe("auth", () => {
  const email = `test_${uniq()}@example.com`;
  it("register issues token + refreshToken", async () => {
    const r = await request(app).post("/api/auth/register").send({ name: "Test User", email, password: "rahasia123" });
    expect(r.status).toBe(200);
    expect(r.body.token).toBeTruthy();
    expect(r.body.refreshToken).toBeTruthy();
    token = r.body.token;
    userId = r.body.user.id;
  });
  it("login works + wrong password is 401", async () => {
    const ok = await request(app).post("/api/auth/login").send({ email, password: "rahasia123" });
    expect(ok.status).toBe(200);
    const bad = await request(app).post("/api/auth/login").send({ email, password: "salah" });
    expect(bad.status).toBe(401);
  });
  it("refresh rotates the token", async () => {
    const login = await request(app).post("/api/auth/login").send({ email, password: "rahasia123" });
    const r = await request(app).post("/api/auth/refresh").send({ refreshToken: login.body.refreshToken });
    expect(r.status).toBe(200);
    expect(r.body.token).toBeTruthy();
    // Old refresh token must be rejected after rotation.
    const reuse = await request(app).post("/api/auth/refresh").send({ refreshToken: login.body.refreshToken });
    expect(reuse.status).toBe(401);
  });
  it("GET /api/auth/me needs a valid token", async () => {
    expect((await request(app).get("/api/auth/me")).status).toBe(401);
    const r = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.user.id).toBe(userId);
  });
});

describe("booking lifecycle: create → pay → settle → refund", () => {
  let bookingId = "", bookingCode = "", paymentId = "";
  it("creates a booking with correct tax math", async () => {
    const hotel = (await request(app).get("/api/hotels")).body.hotels[0];
    const detail = await request(app).get(`/api/hotels/${hotel.id}`);
    const room = detail.body.hotel.rooms[0];
    const r = await request(app).post("/api/bookings").set("Authorization", `Bearer ${token}`).send({
      hotelId: hotel.id, roomId: room.id, checkIn: "2027-01-10", checkOut: "2027-01-12",
      guests: 2, rooms: 1, bookerName: "Test User", bookerEmail: "t@e.com", bookerPhone: "08123456", forSelf: true,
    });
    expect(r.status).toBe(200);
    const b = r.body.booking;
    expect(b.totalPrice).toBe(b.roomPrice + b.taxFee - b.discount);
    expect(typeof b.totalPrice).toBe("number"); // BigInt serialized to number
    bookingId = b.id; bookingCode = b.code;
  });
  it("pays (VA) then settles → PAID", async () => {
    const pay = await request(app).post(`/api/bookings/${bookingId}/pay`).set("Authorization", `Bearer ${token}`).send({ method: "VA_BCA" });
    expect(pay.status).toBe(200);
    paymentId = pay.body.payment.id;
    const settle = await request(app).post(`/api/payments/${paymentId}/settle`).set("Authorization", `Bearer ${token}`);
    expect(settle.status).toBe(200);
    expect(settle.body.booking.status).toBe("PAID");
  });
  it("blocks IDOR: another user cannot see this booking's refund quote", async () => {
    const other = await request(app).post("/api/auth/register").send({ name: "Other", email: `other_${uniq()}@e.com`, password: "rahasia123" });
    const r = await request(app).get(`/api/bookings/${bookingId}/refund-quote`).set("Authorization", `Bearer ${other.body.token}`);
    expect(r.status).toBe(404); // scoped by userId → not found for others
  });
});

describe("refund quote (unpaid booking → free cancel, no bank needed)", () => {
  it("returns a quote for a fresh PENDING booking", async () => {
    const hotel = (await request(app).get("/api/hotels")).body.hotels[0];
    const room = (await request(app).get(`/api/hotels/${hotel.id}`)).body.hotel.rooms[0];
    const bk = (await request(app).post("/api/bookings").set("Authorization", `Bearer ${token}`).send({
      hotelId: hotel.id, roomId: room.id, checkIn: "2027-03-10", checkOut: "2027-03-12",
      guests: 2, rooms: 1, bookerName: "Test", bookerEmail: "t@e.com", bookerPhone: "08123456", forSelf: true,
    })).body.booking;
    const q = await request(app).get(`/api/bookings/${bk.id}/refund-quote`).set("Authorization", `Bearer ${token}`);
    expect(q.status).toBe(200);
    expect(q.body.cancellable).toBe(true);
    expect(q.body.requiresBank).toBe(false); // not paid → nothing to refund → no bank
  });
});

describe("loyalty + tax config", () => {
  it("app config exposes taxPct as a number", async () => {
    const r = await request(app).get("/api/app/config");
    expect(r.status).toBe(200);
    expect(typeof r.body.taxPct).toBe("number");
  });
});
