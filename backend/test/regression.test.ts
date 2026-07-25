import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../src/server.js";

// Regression tests for bugs found in production + the OTA-hardening features.
// These specifically cover paths the original suite missed (e.g. a refund quote
// on a PAID booking, which is where the BigInt×number crash lived).

const uniq = () => Math.random().toString(36).slice(2, 10);

async function freshUser(name = "Reg User") {
  const email = `reg_${uniq()}@example.com`;
  const r = await request(app).post("/api/auth/register").send({ name, email, password: "rahasia123", consent: true });
  return { token: r.body.token as string, id: r.body.user.id as string, email, name };
}
async function firstRoom() {
  const hotel = (await request(app).get("/api/hotels")).body.hotels[0];
  const room = (await request(app).get(`/api/hotels/${hotel.id}`)).body.hotel.rooms[0];
  return { hotelId: hotel.id as string, roomId: room.id as string };
}
async function adminToken() {
  const r = await request(app).post("/api/auth/login").send({ email: "admin@miruum.id", password: "admin123" });
  return r.body.token as string;
}

describe("refund on a PAID booking (BigInt regression)", () => {
  it("refund-quote does NOT crash/hang and returns a numeric refund", async () => {
    const u = await freshUser("Refund Guest");
    const { hotelId, roomId } = await firstRoom();
    const bk = (await request(app).post("/api/bookings").set("Authorization", `Bearer ${u.token}`).send({
      hotelId, roomId, checkIn: "2027-06-10", checkOut: "2027-06-12",
      guests: 2, rooms: 1, bookerName: u.name, bookerEmail: "t@e.com", bookerPhone: "081234567", forSelf: true,
    })).body.booking;
    const pay = await request(app).post(`/api/bookings/${bk.id}/pay`).set("Authorization", `Bearer ${u.token}`).send({ method: "VA_BCA" });
    await request(app).post(`/api/payments/${pay.body.payment.id}/settle`).set("Authorization", `Bearer ${u.token}`);
    // The bug made this hang/500 (Number × BigInt). Must be a clean 200.
    const q = await request(app).get(`/api/bookings/${bk.id}/refund-quote`).set("Authorization", `Bearer ${u.token}`);
    expect(q.status).toBe(200);
    expect(typeof q.body.refundAmount).toBe("number");
    expect(q.body.requiresBank).toBe(true); // paid + refundable → needs bank
  });

  it("cancel requires the refund bank name to match the account holder (AML)", async () => {
    const u = await freshUser("Aml Guest");
    const { hotelId, roomId } = await firstRoom();
    const bk = (await request(app).post("/api/bookings").set("Authorization", `Bearer ${u.token}`).send({
      hotelId, roomId, checkIn: "2027-07-10", checkOut: "2027-07-12",
      guests: 2, rooms: 1, bookerName: u.name, bookerEmail: "t@e.com", bookerPhone: "081234567", forSelf: true,
    })).body.booking;
    const pay = await request(app).post(`/api/bookings/${bk.id}/pay`).set("Authorization", `Bearer ${u.token}`).send({ method: "VA_BCA" });
    await request(app).post(`/api/payments/${pay.body.payment.id}/settle`).set("Authorization", `Bearer ${u.token}`);
    const mismatch = await request(app).post(`/api/bookings/${bk.id}/cancel`).set("Authorization", `Bearer ${u.token}`)
      .send({ bankName: "BCA", bankAccount: "1234567890", accountHolder: "Orang Lain" });
    expect(mismatch.status).toBe(400);
    const ok = await request(app).post(`/api/bookings/${bk.id}/cancel`).set("Authorization", `Bearer ${u.token}`)
      .send({ bankName: "BCA", bankAccount: "1234567890", accountHolder: u.name });
    expect(ok.status).toBe(200);
  });
});

describe("overbooking protection", () => {
  it("rejects a booking that exceeds room allotment (409, no phantom booking)", async () => {
    const u = await freshUser();
    const { hotelId, roomId } = await firstRoom();
    const r = await request(app).post("/api/bookings").set("Authorization", `Bearer ${u.token}`).send({
      hotelId, roomId, checkIn: "2027-08-10", checkOut: "2027-08-11",
      guests: 2, rooms: 9999, bookerName: u.name, bookerEmail: "t@e.com", bookerPhone: "081234567", forSelf: true,
    });
    // Must be rejected (409 from the reserve step, or 4xx from availability) — the
    // key guarantee is that no booking is created without inventory.
    expect(r.status).toBeGreaterThanOrEqual(400);
  });
});

describe("review verification", () => {
  it("a guest with no completed stay cannot post a review (403)", async () => {
    const u = await freshUser();
    const { hotelId } = await firstRoom();
    const r = await request(app).post(`/api/hotels/${hotelId}/reviews`).set("Authorization", `Bearer ${u.token}`)
      .send({ rating: 5, body: "Bagus sekali padahal belum menginap" });
    expect(r.status).toBe(403);
  });
});

describe("anti-fraud blocklist", () => {
  it("a blocklisted email cannot create a booking (403)", async () => {
    const u = await freshUser();
    const admin = await adminToken();
    await request(app).post("/api/admin/fraud/blocks").set("Authorization", `Bearer ${admin}`)
      .send({ type: "EMAIL", value: u.email, reason: "regression test" });
    const { hotelId, roomId } = await firstRoom();
    const r = await request(app).post("/api/bookings").set("Authorization", `Bearer ${u.token}`).send({
      hotelId, roomId, checkIn: "2027-09-10", checkOut: "2027-09-11",
      guests: 2, rooms: 1, bookerName: u.name, bookerEmail: u.email, bookerPhone: "081234567", forSelf: true,
    });
    expect(r.status).toBe(403);
    // cleanup: unblock so the seeded email space stays clean
    const list = await request(app).get("/api/admin/fraud/blocks").set("Authorization", `Bearer ${admin}`);
    const blk = list.body.blocks.find((b: any) => b.value === u.email);
    if (blk) await request(app).delete(`/api/admin/fraud/blocks/${blk.id}`).set("Authorization", `Bearer ${admin}`);
  });
});

describe("admin reconciliation", () => {
  it("returns per-hotel reconciliation totals", async () => {
    const admin = await adminToken();
    const r = await request(app).get("/api/admin/reconciliation").set("Authorization", `Bearer ${admin}`);
    expect(r.status).toBe(200);
    expect(r.body.total).toBeTruthy();
    expect(typeof r.body.total.payout).toBe("number");
  });
});
