import request from "supertest";
import { app } from "./src/server.js";
const email=`r${Date.now()}@e.com`;
const reg=(await request(app).post("/api/auth/register").send({name:"R",email,password:"rahasia123"})).body;
const T=reg.token;
const hotel=(await request(app).get("/api/hotels")).body.hotels[0];
const room=(await request(app).get("/api/hotels/"+hotel.id)).body.hotel.rooms[0];
const bk=(await request(app).post("/api/bookings").set("Authorization","Bearer "+T).send({hotelId:hotel.id,roomId:room.id,checkIn:"2027-01-10",checkOut:"2027-01-12",guests:2,rooms:1,bookerName:"R",bookerEmail:"r@e.com",bookerPhone:"08123456",forSelf:true})).body.booking;
const pay=(await request(app).post("/api/bookings/"+bk.id+"/pay").set("Authorization","Bearer "+T).send({method:"VA_BCA"})).body.payment;
await request(app).post("/api/payments/"+pay.id+"/settle").set("Authorization","Bearer "+T);
console.error("PAID. calling refund-quote...");
const t=Date.now();
try { const q=await request(app).get("/api/bookings/"+bk.id+"/refund-quote").set("Authorization","Bearer "+T).timeout(8000);
  console.error("OK in",Date.now()-t,"ms:",q.status,JSON.stringify(q.body).slice(0,140)); }
catch(e){ console.error("HANG/ERR after",Date.now()-t,"ms:",e.message); }
process.exit(0);
