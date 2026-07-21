import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../api.dart';
import '../feedback.dart';
import '../l10n.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets.dart';
import 'voucher.dart';

/// Shows payment instructions (VA number / QRIS / e-wallet link) and confirms
/// settlement. For MOCK payments the button simulates success; for real
/// providers it polls the payment status until PAID.
class PaymentInstructionScreen extends StatefulWidget {
  final Payment payment;
  final String bookingId;
  const PaymentInstructionScreen({super.key, required this.payment, required this.bookingId});
  @override
  State<PaymentInstructionScreen> createState() => _PaymentInstructionScreenState();
}

class _PaymentInstructionScreenState extends State<PaymentInstructionScreen> {
  bool _busy = false;
  Timer? _ticker;
  Duration _left = Duration.zero;

  @override
  void initState() {
    super.initState();
    _computeLeft();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) => _computeLeft());
  }

  void _computeLeft() {
    final exp = DateTime.tryParse(widget.payment.expiresAt ?? '');
    if (exp == null) return;
    final left = exp.difference(DateTime.now());
    setState(() => _left = left.isNegative ? Duration.zero : left);
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  Future<void> _confirm() async {
    setState(() => _busy = true);
    final api = context.read<Api>();
    try {
      Booking? booking;
      if (widget.payment.isMock) {
        booking = await api.settlePayment(widget.payment.id);
      } else {
        final p = await api.paymentStatus(widget.payment.id);
        if (p.isPaid) booking = await api.booking(widget.bookingId);
      }
      if (!mounted) return;
      if (booking != null && booking.status == 'PAID') {
        Navigator.pushReplacement(context,
            MaterialPageRoute(builder: (_) => VoucherScreen(booking: booking!, bankName: widget.payment.methodLabel)));
      } else {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(tr('Pembayaran belum diterima. Coba lagi setelah transfer.', 'Payment not received yet. Try again after transferring.')), backgroundColor: MC.accent));
      }
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message), backgroundColor: MC.danger));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.payment;
    final mm = _left.inMinutes.remainder(60).toString().padLeft(2, '0');
    final ss = _left.inSeconds.remainder(60).toString().padLeft(2, '0');
    return Scaffold(
      appBar: AppBar(title: Text(tr('Pembayaran', 'Payment'))),
      body: SafeArea(
        child: Column(children: [
          Expanded(
            child: ListView(padding: const EdgeInsets.all(20), children: [
              const BookingStepper(3),
              const SizedBox(height: 20),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(color: MC.accentSoft, borderRadius: BorderRadius.circular(14)),
                child: Row(children: [
                  const Icon(Icons.timer_outlined, color: MC.accent, size: 20),
                  const SizedBox(width: 10),
                  Expanded(child: Text(tr('Selesaikan pembayaran sebelum', 'Complete payment before'), style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600))),
                  Text('$mm:$ss', style: const TextStyle(color: MC.accent, fontWeight: FontWeight.w800, fontSize: 16)),
                ]),
              ),
              const SizedBox(height: 16),
              cardBox(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(p.methodLabel, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                const SizedBox(height: 4),
                Text(tr('Total: ${rupiah(p.amount)}', 'Total: ${rupiah(p.amount)}'), style: const TextStyle(color: MC.primaryDark, fontWeight: FontWeight.w800, fontSize: 18)),
                Divider(height: 24, color: MC.line),
                if (p.vaNumber != null) _vaBlock(p.vaNumber!),
                if (p.qrString != null) _qrBlock(p.qrString!),
                if (p.payUrl != null && p.vaNumber == null && p.qrString == null) _ewalletBlock(p.payUrl!),
              ])),
              const SizedBox(height: 12),
              if (p.isMock)
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: MC.blueSoft, borderRadius: BorderRadius.circular(12)),
                  child: Row(children: [
                    const Icon(Icons.info_outline_rounded, size: 18, color: MC.blue),
                    const SizedBox(width: 8),
                    Expanded(child: Text(tr('Mode demo: tekan tombol di bawah untuk mensimulasikan pembayaran berhasil.', 'Demo mode: tap the button below to simulate a successful payment.'),
                        style: const TextStyle(fontSize: 11.5, color: MC.blue))),
                  ]),
                ),
            ]),
          ),
          Container(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
            decoration: BoxDecoration(color: MC.surface, boxShadow: [
              BoxShadow(color: Colors.black.withOpacity(0.08), blurRadius: 16, offset: const Offset(0, -4)),
            ]),
            child: SafeArea(
              top: false,
              child: PrimaryButton(p.isMock ? tr('Saya Sudah Bayar (Simulasi)', 'I Have Paid (Simulate)') : tr('Cek Status Pembayaran', 'Check Payment Status'),
                  loading: _busy, icon: Icons.check_circle_outline_rounded, onPressed: _confirm),
            ),
          ),
        ]),
      ),
    );
  }

  Widget _vaBlock(String va) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(tr('Nomor Virtual Account', 'Virtual Account Number'), style: TextStyle(fontSize: 12, color: MC.inkMuted)),
        const SizedBox(height: 6),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(color: MC.field, borderRadius: BorderRadius.circular(12)),
          child: Row(children: [
            Expanded(child: SelectableText(va, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18, letterSpacing: 1))),
            IconButton(
              icon: const Icon(Icons.copy_rounded, color: MC.primary, size: 20),
              onPressed: () {
                Clipboard.setData(ClipboardData(text: va));
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(tr('Nomor VA disalin', 'VA number copied')), backgroundColor: MC.primary));
              },
            ),
          ]),
        ),
        const SizedBox(height: 8),
        Text(tr('Transfer tepat sesuai nominal total ke nomor VA di atas melalui m-banking / ATM.', 'Transfer the exact total amount to the VA number above via m-banking / ATM.'),
            style: TextStyle(fontSize: 11.5, color: MC.inkMuted)),
      ]);

  Widget _qrBlock(String qr) => Column(children: [
        Text(tr('Scan QRIS', 'Scan QRIS'), style: TextStyle(fontSize: 12, color: MC.inkMuted)),
        const SizedBox(height: 10),
        Center(
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), boxShadow: [softShadow]),
            child: QrImageView(data: qr, size: 200, version: QrVersions.auto),
          ),
        ),
        const SizedBox(height: 10),
        Text(tr('Scan dengan aplikasi e-wallet / m-banking apa pun yang mendukung QRIS.', 'Scan with any e-wallet / m-banking app that supports QRIS.'),
            style: TextStyle(fontSize: 11.5, color: MC.inkMuted), textAlign: TextAlign.center),
      ]);

  Widget _ewalletBlock(String url) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(tr('Lanjutkan di aplikasi e-wallet', 'Continue in the e-wallet app'), style: TextStyle(fontSize: 12, color: MC.inkMuted)),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: MC.field, borderRadius: BorderRadius.circular(12)),
          child: SelectableText(url, style: const TextStyle(fontSize: 12.5, color: MC.blue)),
        ),
        const SizedBox(height: 8),
        Text(tr('Buka tautan pembayaran untuk menyelesaikan transaksi.', 'Open the payment link to complete the transaction.'),
            style: TextStyle(fontSize: 11.5, color: MC.inkMuted)),
      ]);
}
