import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import '../api.dart';
import '../l10n.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets.dart';
import 'shell.dart';

class VoucherScreen extends StatelessWidget {
  final Booking booking;
  final String bankName;
  const VoucherScreen({super.key, required this.booking, required this.bankName});

  @override
  Widget build(BuildContext context) {
    final date = DateFormat('EEEE, d MMM yyyy', 'id_ID').format(DateTime.now());
    return Scaffold(
      appBar: AppBar(title: Text(tr('Voucher', 'Voucher')), automaticallyImplyLeading: false),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(20),
                children: [
                  const BookingStepper(4),
                  const SizedBox(height: 28),
                  Center(child: Container(
                    width: 96, height: 96,
                    decoration: const BoxDecoration(color: MC.primarySoft, shape: BoxShape.circle),
                    child: const Icon(Icons.check_circle_rounded, color: MC.primary, size: 60),
                  )),
                  const SizedBox(height: 18),
                  Center(child: Text(tr('Pembayaran Berhasil', 'Payment Successful'), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800))),
                  const SizedBox(height: 6),
                  Center(child: Text(tr('E-Voucher akan dikirim ke email kamu', 'The e-voucher will be sent to your email'),
                      textAlign: TextAlign.center, style: TextStyle(color: MC.inkMuted, fontSize: 13))),
                  const SizedBox(height: 24),
                  cardBox(child: Column(children: [
                    Text('${booking.hotel?.name ?? ''}, ${booking.room?.name ?? ''}',
                        textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                    Divider(height: 24, color: MC.line),
                    _row(tr('No. Pesanan', 'Order No.'), booking.code),
                    if (booking.ratePlanName != null && booking.ratePlanName!.isNotEmpty) _row(tr('Rate Plan', 'Rate Plan'), booking.ratePlanName!),
                    _row(tr('Tanggal Transaksi', 'Transaction Date'), date),
                    if (_fmt(booking.checkIn) != null) _row(tr('Check-in', 'Check-in'), _fmt(booking.checkIn)!),
                    if (_fmt(booking.checkOut) != null) _row(tr('Check-out', 'Check-out'), _fmt(booking.checkOut)!),
                    _row(tr('Tamu & Kamar', 'Guests & Rooms'), '${booking.guests} ${tr('tamu', 'guests')} · ${booking.rooms}× ${booking.room?.name ?? tr('Kamar', 'Room')}'),
                    _row(tr('Durasi', 'Duration'), '${booking.nights} ${tr('malam', 'nights')}'),
                    _row(tr('Metode Pembayaran', 'Payment Method'), bankName),
                    _row(tr('Total Harga', 'Total Price'), rupiah(booking.totalPrice), highlight: true),
                  ])),
                  if ((booking.specialRequest ?? '').trim().isNotEmpty) ...[
                    const SizedBox(height: 14),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFFF6EC),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: const Color(0xFFF3D8B4)),
                      ),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(children: [
                          const Icon(Icons.star_rounded, size: 16, color: MC.primary),
                          const SizedBox(width: 6),
                          Text(tr('Permintaan Khusus', 'Special Request'), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                        ]),
                        const SizedBox(height: 6),
                        Text(booking.specialRequest!.trim(), style: const TextStyle(fontSize: 13, height: 1.5, color: Color(0xFF6B4A1E))),
                      ]),
                    ),
                  ],
                  const SizedBox(height: 14),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF6FAF7),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: const Color(0xFFD8ECE0)),
                    ),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        const Icon(Icons.checklist_rounded, size: 16, color: MC.primaryDark),
                        const SizedBox(width: 6),
                        Text(tr('Panduan Check-in', 'Check-in Guide'), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                      ]),
                      const SizedBox(height: 10),
                      _step(1, tr('Datang ke resepsionis sesuai jam check-in.', 'Go to the reception at the check-in time.')),
                      _step(2, tr('Tunjukkan voucher ini + KTP/identitas pemesan.', 'Show this voucher + the booker\'s ID.')),
                      _step(3, tr('Resepsionis memindai QR & memberi kunci kamar.', 'Reception scans the QR & hands over the key.')),
                    ]),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
              child: Column(children: [
                Row(children: [
                  Expanded(child: OutlineButtonX(tr('Lihat E-Voucher', 'View E-Voucher'), icon: Icons.picture_as_pdf_rounded,
                      onPressed: () async {
                    final url = Uri.parse('${Api.base}/vouchers/${booking.code}');
                    final ok = await launchUrl(url, mode: LaunchMode.externalApplication);
                    if (!ok && context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(tr('Gagal membuka voucher', 'Failed to open voucher'))));
                    }
                  })),
                  const SizedBox(width: 10),
                  Expanded(child: OutlineButtonX(tr('Bagikan', 'Share'), icon: Icons.ios_share_rounded,
                      onPressed: () => Share.share(
                          '${tr('E-Voucher Miruum', 'Miruum E-Voucher')} — ${booking.hotel?.name ?? ''}\n${Api.base}/vouchers/${booking.code}'))),
                ]),
                const SizedBox(height: 10),
                PrimaryButton(tr('Selesai', 'Done'), onPressed: () => goToTab(context, 1)), // → Pesanan tab
              ]),
            ),
          ],
        ),
      ),
    );
  }

  Widget _row(String k, String v, {bool highlight = false}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(k, style: TextStyle(color: MC.inkMuted, fontSize: 13)),
          const SizedBox(width: 12),
          Flexible(child: Text(v, textAlign: TextAlign.right, style: TextStyle(fontWeight: FontWeight.w700, fontSize: highlight ? 15 : 13, color: highlight ? MC.primaryDark : MC.ink))),
        ]),
      );

  static String? _fmt(String iso) {
    final d = DateTime.tryParse(iso);
    return d == null ? null : DateFormat('EEE, d MMM yyyy', 'id_ID').format(d);
  }

  Widget _step(int n, String t) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(width: 20, height: 20, alignment: Alignment.center,
              decoration: const BoxDecoration(color: MC.primary, shape: BoxShape.circle),
              child: Text('$n', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800))),
          const SizedBox(width: 10),
          Expanded(child: Text(t, style: const TextStyle(fontSize: 12.5, height: 1.45))),
        ]),
      );
}
