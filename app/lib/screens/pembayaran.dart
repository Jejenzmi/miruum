import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api.dart';
import '../models.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';
import 'voucher.dart';

class PembayaranScreen extends StatefulWidget {
  final String bookingId;
  const PembayaranScreen({super.key, required this.bookingId});
  @override
  State<PembayaranScreen> createState() => _PembayaranScreenState();
}

class _PembayaranScreenState extends State<PembayaranScreen> {
  late Future<Booking> _future;
  String? _method, _bank, _bankName;
  bool _paying = false;

  @override
  void initState() {
    super.initState();
    _future = context.read<Session>().api.booking(widget.bookingId);
  }

  Future<void> _pickMethod() async {
    final methods = await context.read<Session>().api.paymentMethods();
    if (!mounted) return;
    showModalBottomSheet(
      context: context,
      backgroundColor: MC.surface,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (_) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.6, maxChildSize: 0.9,
        builder: (context, controller) => Column(
          children: [
            const Padding(padding: EdgeInsets.all(16),
                child: Text('Pilih Metode Pembayaran', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16))),
            Expanded(
              child: ListView(
                controller: controller,
                padding: const EdgeInsets.symmetric(horizontal: 20),
                children: [
                  for (final group in methods) ...[
                    Padding(padding: const EdgeInsets.symmetric(vertical: 8),
                        child: Text(group['group'], style: const TextStyle(fontWeight: FontWeight.w700, color: MC.inkMuted, fontSize: 13))),
                    for (final bank in group['banks'])
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: Container(
                          width: 42, height: 42,
                          decoration: BoxDecoration(color: MC.field, borderRadius: BorderRadius.circular(10)),
                          child: const Icon(Icons.account_balance_rounded, color: MC.primaryDark, size: 20),
                        ),
                        title: Text('${group['group']} ${bank['name']}', style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600)),
                        trailing: const Icon(Icons.radio_button_off_rounded, color: MC.inkFaint),
                        onTap: () {
                          setState(() {
                            _method = '${group['group']} ${bank['name']}';
                            _bank = bank['code'];
                            _bankName = 'Bank ${bank['name']}';
                          });
                          Navigator.pop(context);
                        },
                      ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _pay(Booking b) async {
    if (_method == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Pilih metode pembayaran dulu'), backgroundColor: MC.danger));
      return;
    }
    setState(() => _paying = true);
    try {
      final paid = await context.read<Session>().api.pay(b.id, _method!, bank: _bank);
      if (!mounted) return;
      Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => VoucherScreen(booking: paid, bankName: _bankName ?? _method!)));
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message), backgroundColor: MC.danger));
    } finally {
      if (mounted) setState(() => _paying = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Review Pesanan')),
      body: SafeArea(
        child: FutureBuilder<Booking>(
          future: _future,
          builder: (context, snap) {
            if (snap.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator(color: MC.primary));
            }
            final b = snap.data!;
            return Column(children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.all(20),
                  children: [
                    const BookingStepper(3),
                    const SizedBox(height: 20),
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(color: MC.accentSoft, borderRadius: BorderRadius.circular(14)),
                      child: Row(children: const [
                        Icon(Icons.timer_outlined, color: MC.accent, size: 20),
                        SizedBox(width: 10),
                        Expanded(child: Text('Selesaikan pembayaran sebelum batas waktu', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600))),
                        Text('15:00', style: TextStyle(color: MC.accent, fontWeight: FontWeight.w800, fontSize: 16)),
                      ]),
                    ),
                    const SizedBox(height: 16),
                    cardBox(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('No. Pesanan : ${b.code}', style: const TextStyle(fontWeight: FontWeight.w700)),
                      const Divider(height: 20, color: MC.line),
                      Row(children: [
                        ClipRRect(borderRadius: BorderRadius.circular(12), child: NetImage(b.hotel?.imageUrl ?? '', width: 56, height: 56)),
                        const SizedBox(width: 12),
                        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(b.hotel?.name ?? '', style: const TextStyle(fontWeight: FontWeight.w700)),
                          Text('${b.rooms} x ${b.room?.name ?? ''}', style: const TextStyle(color: MC.inkMuted, fontSize: 12)),
                        ])),
                        Text(rupiah(b.roomPrice), style: const TextStyle(fontWeight: FontWeight.w700)),
                      ]),
                    ])),
                    const SizedBox(height: 16),
                    GestureDetector(
                      onTap: _pickMethod,
                      child: cardBox(child: Row(children: [
                        const Icon(Icons.account_balance_wallet_rounded, color: MC.primary),
                        const SizedBox(width: 12),
                        Expanded(child: Text(_method ?? 'Metode Pembayaran',
                            style: TextStyle(fontWeight: FontWeight.w600, color: _method == null ? MC.inkMuted : MC.ink))),
                        const Icon(Icons.chevron_right_rounded, color: MC.inkFaint),
                      ])),
                    ),
                    const SizedBox(height: 16),
                    cardBox(child: Column(children: [
                      _line('Harga Kamar', rupiah(b.roomPrice)),
                      _line('Pajak & Biaya Layanan', rupiah(b.taxFee)),
                      const Divider(height: 20, color: MC.line),
                      _line('Harga Total', rupiah(b.totalPrice), bold: true),
                    ])),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
                decoration: BoxDecoration(color: MC.surface, boxShadow: [
                  BoxShadow(color: Colors.black.withOpacity(0.08), blurRadius: 16, offset: const Offset(0, -4)),
                ]),
                child: SafeArea(
                  top: false,
                  child: Row(children: [
                    Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Text('Harga Total', style: TextStyle(fontSize: 11, color: MC.inkFaint)),
                      Text(rupiah(b.totalPrice), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: MC.primaryDark)),
                    ]),
                    const SizedBox(width: 16),
                    Expanded(child: PrimaryButton('Bayar', loading: _paying, onPressed: () => _pay(b))),
                  ]),
                ),
              ),
            ]);
          },
        ),
      ),
    );
  }

  Widget _line(String k, String v, {bool bold = false}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text(k, style: TextStyle(color: bold ? MC.ink : MC.inkMuted, fontWeight: bold ? FontWeight.w700 : FontWeight.w400, fontSize: 13.5)),
          Text(v, style: TextStyle(fontWeight: FontWeight.w700, fontSize: bold ? 15 : 13.5, color: bold ? MC.primaryDark : MC.ink)),
        ]),
      );
}
