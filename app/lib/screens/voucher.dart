import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import '../api.dart';
import '../models.dart';
import '../theme.dart';
import '../ui_kit.dart';
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
      appBar: AppBar(title: const Text('Voucher'), automaticallyImplyLeading: false),
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
                  const Center(child: Text('Pembayaran Berhasil', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800))),
                  const SizedBox(height: 6),
                  Center(child: Text('E-Voucher akan dikirim ke email kamu',
                      textAlign: TextAlign.center, style: TextStyle(color: MC.inkMuted, fontSize: 13))),
                  const SizedBox(height: 24),
                  cardBox(child: Column(children: [
                    Text('${booking.hotel?.name ?? ''}, ${booking.room?.name ?? ''}',
                        textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                    Divider(height: 24, color: MC.line),
                    _row('No. Pesanan', booking.code),
                    _row('Tanggal Transaksi', date),
                    _row('Metode Pembayaran', bankName),
                    _row('Total Harga', rupiah(booking.totalPrice), highlight: true),
                  ])),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
              child: Column(children: [
                OutlineButtonX('Lihat / Unduh E-Voucher', icon: Icons.receipt_long_rounded,
                    onPressed: () async {
                  final ok = await openUrl(context.read<Api>().voucherUrl(booking.code));
                  if (!ok && context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Tidak dapat membuka e-voucher')));
                  }
                }),
                const SizedBox(height: 10),
                PrimaryButton('Selesai', onPressed: () => goToTab(context, 1)), // → Pesanan tab
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
