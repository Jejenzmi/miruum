import 'dart:typed_data';
import 'package:barcode/barcode.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:intl/intl.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'models.dart';

/// Builds the GUEST e-voucher PDF — a proof-of-stay document.
/// Deliberately contains NO price (guests get a price-free voucher; the
/// priced receipt goes only to the hotel).
Future<Uint8List> buildGuestVoucherPdf(Booking b) async {
  final doc = pw.Document(title: 'E-Voucher ${b.code}');
  final df = DateFormat('EEEE, d MMM yyyy', 'id_ID');
  final ci = DateTime.tryParse(b.checkIn);
  final co = DateTime.tryParse(b.checkOut);
  final orange = PdfColor.fromInt(0xFFE58324);
  final ink = PdfColor.fromInt(0xFF1F262E);

  // Brand logo on a white plate (falls back to a text wordmark if the asset is missing).
  pw.MemoryImage? logo;
  try {
    logo = pw.MemoryImage((await rootBundle.load('assets/logo.png')).buffer.asUint8List());
  } catch (_) {}

  pw.Widget sec(String t) => pw.Padding(
        padding: const pw.EdgeInsets.only(top: 16, bottom: 5),
        child: pw.Text(t.toUpperCase(),
            style: pw.TextStyle(fontSize: 9, letterSpacing: 0.8, fontWeight: pw.FontWeight.bold, color: PdfColors.grey500)),
      );
  pw.Widget kv(String k, String v) => pw.Padding(
        padding: const pw.EdgeInsets.symmetric(vertical: 4),
        child: pw.Row(mainAxisAlignment: pw.MainAxisAlignment.spaceBetween, crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
          pw.Text(k, style: const pw.TextStyle(fontSize: 11, color: PdfColors.grey700)),
          pw.SizedBox(width: 16),
          pw.Expanded(child: pw.Text(v, textAlign: pw.TextAlign.right, style: pw.TextStyle(fontSize: 11, fontWeight: pw.FontWeight.bold))),
        ]),
      );
  pw.Widget chip(String t) => pw.Container(
        padding: const pw.EdgeInsets.symmetric(horizontal: 9, vertical: 4),
        decoration: pw.BoxDecoration(color: PdfColor.fromInt(0xFFEEF1F5), borderRadius: pw.BorderRadius.circular(20)),
        child: pw.Text(t, style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold, color: PdfColor.fromInt(0xFF3A424C))),
      );
  pw.Widget step(int n, String t) => pw.Padding(
        padding: const pw.EdgeInsets.only(bottom: 5),
        child: pw.Row(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
          pw.Container(width: 16, height: 16, alignment: pw.Alignment.center,
              decoration: pw.BoxDecoration(color: orange, shape: pw.BoxShape.circle),
              child: pw.Text('$n', style: pw.TextStyle(color: PdfColors.white, fontSize: 9, fontWeight: pw.FontWeight.bold))),
          pw.SizedBox(width: 8),
          pw.Expanded(child: pw.Text(t, style: const pw.TextStyle(fontSize: 10.5, color: PdfColors.grey800, lineSpacing: 1.5))),
        ]),
      );

  doc.addPage(pw.Page(
    pageFormat: PdfPageFormat.a4,
    margin: const pw.EdgeInsets.all(28),
    build: (ctx) => pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.stretch, children: [
      // ── Header ──
      pw.Container(
        padding: const pw.EdgeInsets.all(20),
        decoration: pw.BoxDecoration(
          gradient: pw.LinearGradient(colors: [orange, PdfColor.fromInt(0xFFC96A12)], begin: pw.Alignment.topLeft, end: pw.Alignment.bottomRight),
          borderRadius: pw.BorderRadius.circular(14),
        ),
        child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
          pw.Row(mainAxisAlignment: pw.MainAxisAlignment.spaceBetween, crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
            // logo on a white plate
            pw.Container(
              padding: const pw.EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: pw.BoxDecoration(color: PdfColors.white, borderRadius: pw.BorderRadius.circular(9)),
              child: logo != null
                  ? pw.Image(logo, height: 22)
                  : pw.Text('miruum', style: pw.TextStyle(color: orange, fontSize: 17, fontWeight: pw.FontWeight.bold)),
            ),
            pw.Container(
              padding: const pw.EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: pw.BoxDecoration(color: PdfColor.fromInt(0x33FFFFFF), borderRadius: pw.BorderRadius.circular(20)),
              child: pw.Text('E-VOUCHER HOTEL', style: pw.TextStyle(color: PdfColors.white, fontSize: 8.5, letterSpacing: 1.2, fontWeight: pw.FontWeight.bold)),
            ),
          ]),
          pw.SizedBox(height: 16),
          pw.Text(b.hotel?.name ?? '', style: pw.TextStyle(color: PdfColors.white, fontSize: 19, fontWeight: pw.FontWeight.bold)),
          pw.Text(b.hotel?.city ?? '', style: const pw.TextStyle(color: PdfColors.white, fontSize: 12)),
        ]),
      ),
      pw.SizedBox(height: 16),
      // ── QR + code ──
      pw.Container(
        padding: const pw.EdgeInsets.all(14),
        decoration: pw.BoxDecoration(color: PdfColor.fromInt(0xFFFAF7F2), borderRadius: pw.BorderRadius.circular(12), border: pw.Border.all(color: PdfColor.fromInt(0xFFF0E9DF))),
        child: pw.Row(crossAxisAlignment: pw.CrossAxisAlignment.center, children: [
          pw.Container(
            padding: const pw.EdgeInsets.all(6),
            decoration: pw.BoxDecoration(color: PdfColors.white, borderRadius: pw.BorderRadius.circular(8)),
            child: pw.BarcodeWidget(barcode: Barcode.qrCode(), data: b.code, width: 92, height: 92, drawText: false),
          ),
          pw.SizedBox(width: 16),
          pw.Expanded(child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
            pw.Text('No. Pesanan', style: const pw.TextStyle(fontSize: 10, color: PdfColors.grey600)),
            pw.Text(b.code, style: pw.TextStyle(fontSize: 22, fontWeight: pw.FontWeight.bold, color: ink)),
            pw.SizedBox(height: 6),
            pw.Text('Tunjukkan / pindai kode ini di resepsionis saat check-in.', style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey600)),
          ])),
        ]),
      ),
      // ── Detail ──
      sec('Detail Menginap'),
      kv('Tamu', '${b.bookerName} · ${b.guests} tamu'),
      kv('Kamar', '${b.rooms}× ${b.room?.name ?? '-'}'),
      if (ci != null) kv('Check-in', df.format(ci)),
      if (co != null) kv('Check-out', df.format(co)),
      kv('Durasi', '${b.nights} malam'),
      if ((b.hotel?.address ?? '').isNotEmpty) kv('Alamat', b.hotel!.address),
      // ── Special request ──
      if ((b.specialRequest ?? '').trim().isNotEmpty) ...[
        sec('Permintaan Khusus'),
        pw.Container(
          width: double.infinity,
          padding: const pw.EdgeInsets.all(11),
          decoration: pw.BoxDecoration(color: PdfColor.fromInt(0xFFFFF6EC), borderRadius: pw.BorderRadius.circular(10), border: pw.Border.all(color: PdfColor.fromInt(0xFFF3D8B4))),
          child: pw.Text(b.specialRequest!.trim(), style: const pw.TextStyle(fontSize: 10.5, color: PdfColor.fromInt(0xFF6B4A1E), lineSpacing: 2)),
        ),
      ],
      // ── Check-in info ──
      if ((b.hotel?.checkInInfo ?? '').isNotEmpty) ...[
        sec('Informasi Check-in'),
        pw.Text(b.hotel!.checkInInfo!, style: const pw.TextStyle(fontSize: 10, color: PdfColors.grey700, lineSpacing: 2)),
      ],
      // ── Panduan check-in (fills the page) ──
      sec('Panduan Check-in'),
      pw.Container(
        padding: const pw.EdgeInsets.all(13),
        decoration: pw.BoxDecoration(color: PdfColor.fromInt(0xFFF6FAF7), borderRadius: pw.BorderRadius.circular(12), border: pw.Border.all(color: PdfColor.fromInt(0xFFD8ECE0))),
        child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
          step(1, 'Datang ke resepsionis sesuai jam check-in di atas.'),
          step(2, 'Tunjukkan voucher ini (kode ${b.code}) beserta KTP/identitas pemesan.'),
          step(3, 'Resepsionis memindai QR untuk verifikasi & menyerahkan kunci kamar.'),
          pw.SizedBox(height: 8),
          pw.Wrap(spacing: 7, runSpacing: 7, children: [
            chip('Bawa: KTP/Paspor'), chip('Bawa: Voucher ini'),
            chip('${b.rooms}× ${b.room?.name ?? 'Kamar'}'), chip('${b.nights} malam'),
          ]),
        ]),
      ),
      pw.SizedBox(height: 12),
      // ── Help ──
      pw.Container(
        padding: const pw.EdgeInsets.all(13),
        decoration: pw.BoxDecoration(color: ink, borderRadius: pw.BorderRadius.circular(12)),
        child: pw.Row(children: [
          pw.Expanded(child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
            pw.Text('Butuh bantuan?', style: pw.TextStyle(color: PdfColors.white, fontSize: 12, fontWeight: pw.FontWeight.bold)),
            pw.SizedBox(height: 3),
            pw.Text('Live Chat CS 24/7 di aplikasi Miruum · miruum.id', style: const pw.TextStyle(color: PdfColor.fromInt(0xFFC9CED6), fontSize: 10)),
          ])),
        ]),
      ),
      pw.Spacer(),
      pw.Divider(color: PdfColors.grey300),
      pw.Text('E-voucher resmi Miruum — bukti pemesanan menginap. Voucher ini tidak memuat nominal harga.',
          style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey500)),
    ]),
  ));
  return doc.save();
}
