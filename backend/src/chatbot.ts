// Rule-based CS chatbot. Answers common questions; escalates to a live agent
// when asked. Swap for an LLM later by replacing botReply().
export interface BotReply {
  body: string;
  escalate: boolean;
}

export function botReply(msg: string): BotReply {
  const m = msg.toLowerCase();
  const has = (...k: string[]) => k.some((x) => m.includes(x));

  if (has("agen", "agent", "cs", "manusia", "operator", "admin", "customer service"))
    return { body: "Baik, saya hubungkan ke agen kami. Mohon tunggu sebentar ya, agen akan segera membalas. 🙌", escalate: true };
  if (has("refund", "batal", "cancel", "pembatalan"))
    return { body: "Kebijakan pembatalan: kamar free-cancellation & >24 jam sebelum check-in → refund 100%; refundable >24 jam → 50%; non-refundable → tanpa refund. Batalkan lewat menu Pesanan → Batalkan Pesanan.", escalate: false };
  if (has("bayar", "payment", " va", "virtual account", "qris", "ewallet", "e-wallet", "gopay", "ovo", "dana"))
    return { body: "Metode pembayaran: Virtual Account (BCA/BNI/Mandiri/BRI/Permata), e-wallet (GoPay/OVO/DANA/ShopeePay), dan QRIS. Setelah booking, pilih metode di layar pembayaran.", escalate: false };
  if (has("promo", "kode", "diskon", "kupon"))
    return { body: "Masukkan kode promo di halaman Rincian Pesanan (kolom Kode Promo) lalu tekan Terapkan untuk potongan harga otomatis.", escalate: false };
  if (has("voucher", "e-voucher"))
    return { body: "E-voucher terbit otomatis setelah pembayaran berhasil. Lihat/unduh di layar sukses atau menu Pesanan → E-Voucher.", escalate: false };
  if (has("booking", "pesan", "reservasi", "order", "cara"))
    return { body: "Cara memesan: pilih hotel → Pilih Kamar → isi Rincian → Bayar → E-Voucher terbit. Pilih tanggal lewat kalender harga agar lihat rate & ketersediaan per tanggal.", escalate: false };
  if (has("paket", "package", "staycation"))
    return { body: "Miruum punya Hotel Package (bundel menginap + sarapan/antar-jemput/spa) dengan harga hemat. Buka menu Hotel Package di beranda.", escalate: false };
  if (has("halo", "hai", "hello", "pagi", "siang", "sore", "malam", "help", "bantuan", "tanya"))
    return { body: "Halo! 👋 Saya asisten Miruum. Saya bisa bantu soal: cara booking, pembayaran, promo, e-voucher, dan pembatalan/refund. Ketik topikmu, atau ketik 'agen' untuk bicara dengan agen kami.", escalate: false };

  return { body: "Maaf, saya belum paham 😅. Coba tanya soal: booking, pembayaran, promo, e-voucher, atau refund. Atau ketik 'agen' untuk terhubung dengan agen kami.", escalate: false };
}
