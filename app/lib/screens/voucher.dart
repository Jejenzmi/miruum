import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:printing/printing.dart';
import '../l10n.dart';
import '../models.dart';
import '../theme.dart';
import '../voucher_pdf.dart';
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
                    _row(tr('Tanggal Transaksi', 'Transaction Date'), date),
                    _row(tr('Metode Pembayaran', 'Payment Method'), bankName),
                    _row(tr('Total Harga', 'Total Price'), rupiah(booking.totalPrice), highlight: true),
                  ])),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
              child: Column(children: [
                Row(children: [
                  Expanded(child: OutlineButtonX(tr('Lihat E-Voucher', 'View E-Voucher'), icon: Icons.picture_as_pdf_rounded,
                      onPressed: () async {
                    try {
                      final bytes = await buildGuestVoucherPdf(booking);
                      await Printing.layoutPdf(onLayout: (_) async => bytes, name: 'Voucher-${booking.code}.pdf');
                    } catch (_) {
                      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(tr('Gagal membuka voucher PDF', 'Failed to open PDF voucher'))));
                    }
                  })),
                  const SizedBox(width: 10),
                  Expanded(child: OutlineButtonX(tr('Bagikan PDF', 'Share PDF'), icon: Icons.ios_share_rounded,
                      onPressed: () async {
                    try {
                      final bytes = await buildGuestVoucherPdf(booking);
                      await Printing.sharePdf(bytes: bytes, filename: 'Voucher-${booking.code}.pdf');
                    } catch (_) {
                      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(tr('Gagal membagikan voucher', 'Failed to share voucher'))));
                    }
                  })),
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
        child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text(k, style: TextStyle(color: MC.inkMuted, fontSize: 13)),
          Text(v, style: TextStyle(fontWeight: FontWeight.w700, fontSize: highlight ? 15 : 13, color: highlight ? MC.primaryDark : MC.ink)),
        ]),
      );
}
