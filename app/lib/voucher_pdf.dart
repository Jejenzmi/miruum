import 'dart:typed_data';
import 'package:barcode/barcode.dart';
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

  pw.Widget sec(String t) => pw.Padding(
        padding: const pw.EdgeInsets.only(top: 16, bottom: 4),
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

  doc.addPage(pw.Page(
    pageFormat: PdfPageFormat.a4,
    margin: const pw.EdgeInsets.all(28),
    build: (ctx) => pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.stretch, children: [
      pw.Container(
        padding: const pw.EdgeInsets.all(20),
        decoration: pw.BoxDecoration(color: orange, borderRadius: pw.BorderRadius.circular(12)),
        child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
          pw.Text('MIRUUM', style: pw.TextStyle(color: PdfColors.white, fontSize: 20, fontWeight: pw.FontWeight.bold)),
          pw.SizedBox(height: 6),
          pw.Text('E-VOUCHER HOTEL', style: pw.TextStyle(color: PdfColors.white, fontSize: 10, letterSpacing: 1.5)),
          pw.SizedBox(height: 12),
          pw.Text(b.hotel?.name ?? '', style: pw.TextStyle(color: PdfColors.white, fontSize: 18, fontWeight: pw.FontWeight.bold)),
          pw.Text(b.hotel?.city ?? '', style: const pw.TextStyle(color: PdfColors.white, fontSize: 12)),
        ]),
      ),
      pw.SizedBox(height: 18),
      pw.Container(
        padding: const pw.EdgeInsets.all(14),
        decoration: pw.BoxDecoration(color: PdfColor.fromInt(0xFFFAF7F2), borderRadius: pw.BorderRadius.circular(12), border: pw.Border.all(color: PdfColor.fromInt(0xFFF0E9DF))),
        child: pw.Row(crossAxisAlignment: pw.CrossAxisAlignment.center, children: [
          pw.BarcodeWidget(barcode: Barcode.qrCode(), data: b.code, width: 96, height: 96, drawText: false),
          pw.SizedBox(width: 16),
          pw.Expanded(child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
            pw.Text('No. Pesanan', style: const pw.TextStyle(fontSize: 10, color: PdfColors.grey600)),
            pw.Text(b.code, style: pw.TextStyle(fontSize: 22, fontWeight: pw.FontWeight.bold)),
            pw.SizedBox(height: 6),
            pw.Text('Tunjukkan / pindai kode ini di resepsionis saat check-in.', style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey600)),
          ])),
        ]),
      ),
      sec('Detail Menginap'),
      kv('Tamu', '${b.bookerName} · ${b.guests} tamu'),
      kv('Kamar', '${b.rooms}× ${b.room?.name ?? '-'}'),
      if (ci != null) kv('Check-in', df.format(ci)),
      if (co != null) kv('Check-out', df.format(co)),
      kv('Durasi', '${b.nights} malam'),
      if ((b.hotel?.address ?? '').isNotEmpty) kv('Alamat', b.hotel!.address),
      if ((b.hotel?.checkInInfo ?? '').isNotEmpty) ...[
        sec('Informasi Check-in'),
        pw.Text(b.hotel!.checkInInfo!, style: const pw.TextStyle(fontSize: 10, color: PdfColors.grey700, lineSpacing: 2)),
      ],
      pw.Spacer(),
      pw.Divider(color: PdfColors.grey300),
      pw.Text('E-voucher resmi Miruum — bukti pemesanan menginap. Voucher ini tidak memuat nominal harga.',
          style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey500)),
      pw.Text('Butuh bantuan? Live Chat CS di aplikasi Miruum · ota.gokar.id',
          style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey500)),
    ]),
  ));
  return doc.save();
}
