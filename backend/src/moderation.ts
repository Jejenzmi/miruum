// Chat moderation for guest ↔ hotel messaging.
//
// Miruum keeps every booking + payment inside the platform. Sharing personal
// contact details (phone / WhatsApp / email / messaging handles) or steering the
// other party to transact off-platform is a policy violation: the offending
// message is hidden and a violation notice is shown to both parties.
//
// screenChat(text) returns { flagged, reason? } — reason is Indonesian, shown in-chat.

const NUM_WORDS = "(nol|kosong|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan)";

export function screenChat(raw: string): { flagged: boolean; reason?: string } {
  const text = String(raw || "");
  const low = text.toLowerCase();

  // 1) Email address.
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text))
    return { flagged: true, reason: "Berbagi alamat email / kontak pribadi" };

  // 2) Links / handles to outside messaging apps.
  if (/\b(wa\.?me|whatsapp|whatsap|watsap|wasap|t\.?me|telegram|wechat|zalo|signal\s*app)\b/i.test(low) ||
      /(wa\.me|t\.me|instagram\.com|fb\.com|m\.me)\//i.test(low))
    return { flagged: true, reason: "Mengarahkan ke aplikasi pesan di luar Miruum" };

  // 3) Phone / WhatsApp number (with or without separators).
  const digits = text.replace(/[\s().+\-‐-―_/]/g, "");
  const idMobile = /(?:\+?62|0)8[1-9]\d{6,12}/;   // 08xx / +628xx / 628xx
  const longRun = /\d{11,}/;                        // very long bare digit run
  const midRun = /\d{7,}/;                          // 7+ digits, needs contact intent
  const contactWord = /\b(wa|w\.a|whatsapp|telp|telfon|telepon|telpon|hp|handphone|nomor|nomer|no\.? ?hp|no\.? ?wa|kontak|hubungi|call|sms|dm|chat di|inbox)\b/i.test(low);
  if (idMobile.test(digits) || longRun.test(digits) || (contactWord && midRun.test(digits)))
    return { flagged: true, reason: "Berbagi nomor telepon / WhatsApp" };

  // Spelled-out phone number ("kosong delapan satu ...", 6+ number words in a row).
  if (new RegExp(`\\b${NUM_WORDS}\\b(?:[\\s.,-]+\\b${NUM_WORDS}\\b){5,}`, "i").test(low))
    return { flagged: true, reason: "Berbagi nomor telepon (dieja)" };

  // 4) Off-system transaction intent.
  if (/(di ?luar|diluar)\s*(aplikasi|sistem|miruum|platform)|tanpa\s*(aplikasi|lewat aplikasi|miruum|booking)|transfer\s*(langsung|ke rekening|ke no|ke rek)|bayar\s*(langsung|cash|tunai)\s*ke|rekening\s*(pribadi|bca|mandiri|bri|bni|dana|ovo|gopay|shopeepay)|no\.?\s?rek(ening)?|nomor rekening|booking langsung ke|pesan langsung ke|hubungi\s*(saya|kami|aku)\s*(di|lewat|via)|nego di luar|jangan\s*(lewat|pakai|pake)\s*aplikasi|off\s*the\s*app/i.test(low))
    return { flagged: true, reason: "Indikasi transaksi di luar sistem Miruum" };

  return { flagged: false };
}

// Notice stored as the (hidden) message body so any client shows something sensible.
export function violationNotice(reason: string): string {
  return `⚠️ Pesan disembunyikan — ${reason}. Demi keamanan transaksi, dilarang berbagi nomor telepon/WhatsApp, email, atau bertransaksi di luar aplikasi Miruum.`;
}
