import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'api.dart';
import 'feedback.dart';
import 'l10n.dart';
import 'theme.dart';
import 'screens/pembayaran.dart';

String _rp(num n) => 'Rp ' + n.toStringAsFixed(0).replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (m) => '.');

/// Book a live-inventory (partner-supplier) hotel: pick a rate → guest details →
/// reserve (pay-first) → payment. The hotel's SOURCE is never shown to the user.
Future<void> showExternalBooking(
  BuildContext context,
  Map<String, dynamic> hotel, {
  required String checkIn,
  required String checkOut,
  required int adults,
  required int rooms,
}) async {
  if (!ensureLoggedIn(context)) return;
  final list = (hotel['rooms'] as List?) ?? const [];
  // 1) pick a rate
  final rate = await showModalBottomSheet<Map<String, dynamic>>(
    context: context, isScrollControlled: true, backgroundColor: MC.surface,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
    builder: (ctx) => DraggableScrollableSheet(
      expand: false, initialChildSize: 0.6, maxChildSize: 0.9,
      builder: (_, scroll) => ListView(controller: scroll, padding: const EdgeInsets.all(18), children: [
        Text(hotel['name']?.toString() ?? 'Hotel', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
        Text([hotel['categoryName'], hotel['destinationName']].where((x) => x != null).join(' · '), style: TextStyle(color: MC.inkMuted, fontSize: 12)),
        const Divider(height: 22),
        ...list.map((raw) {
          final r = raw as Map<String, dynamic>;
          final idr = (r['netIdr'] ?? r['net']) as num? ?? 0;
          return Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Row(children: [
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(r['name']?.toString() ?? '', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                Text('${r['boardName'] ?? ''} · ${(r['refundable'] == true) ? tr('Bisa refund', 'Refundable') : tr('Non-refund', 'Non-refundable')}', style: TextStyle(color: MC.inkFaint, fontSize: 11)),
              ])),
              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                Text(_rp(idr), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
                const SizedBox(height: 4),
                FilledButton(style: FilledButton.styleFrom(backgroundColor: MC.primary, padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6), minimumSize: Size.zero), onPressed: () => Navigator.pop(ctx, r), child: Text(tr('Pilih', 'Select'), style: const TextStyle(fontSize: 12.5))),
              ]),
            ]),
          );
        }),
      ]),
    ),
  );
  if (rate == null || !context.mounted) return;

  // 2) guest details
  final name = TextEditingController(), surname = TextEditingController(), email = TextEditingController(), phone = TextEditingController();
  final holder = await showModalBottomSheet<Map<String, String>>(
    context: context, isScrollControlled: true, backgroundColor: MC.surface,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
    builder: (ctx) => Padding(
      padding: EdgeInsets.fromLTRB(18, 18, 18, MediaQuery.of(ctx).viewInsets.bottom + 18),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(tr('Data Tamu', 'Guest Details'), style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(child: TextField(controller: name, decoration: InputDecoration(labelText: tr('Nama Depan', 'First name'), border: const OutlineInputBorder()))),
          const SizedBox(width: 10),
          Expanded(child: TextField(controller: surname, decoration: InputDecoration(labelText: tr('Nama Belakang', 'Surname'), border: const OutlineInputBorder()))),
        ]),
        const SizedBox(height: 10),
        TextField(controller: email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Email', border: OutlineInputBorder())),
        const SizedBox(height: 10),
        TextField(controller: phone, keyboardType: TextInputType.phone, decoration: InputDecoration(labelText: tr('Telepon', 'Phone'), border: const OutlineInputBorder())),
        const SizedBox(height: 16),
        SizedBox(width: double.infinity, child: FilledButton(
          style: FilledButton.styleFrom(backgroundColor: MC.primary, padding: const EdgeInsets.symmetric(vertical: 14)),
          onPressed: () {
            if (name.text.trim().isEmpty || surname.text.trim().isEmpty) { showSnack(ctx, tr('Isi nama depan & belakang.', 'Enter first & surname.'), kind: SnackKind.error); return; }
            Navigator.pop(ctx, {'name': name.text.trim(), 'surname': surname.text.trim(), 'email': email.text.trim(), 'phone': phone.text.trim()});
          },
          child: Text(tr('Lanjut Bayar', 'Continue to Pay')),
        )),
      ]),
    ),
  );
  if (holder == null || !context.mounted) return;

  // 3) reserve → payment
  try {
    final paxes = List.generate(adults, (i) => {'type': 'AD', 'name': i == 0 ? holder['name'] : 'Guest', 'surname': i == 0 ? holder['surname'] : '${i + 1}'});
    final res = await context.read<Api>().supplyBook({
      'source': hotel['source'], 'rateKey': rate['rateKey'],
      'hotelName': hotel['name'], 'supplierHotelCode': hotel['supplierHotelCode'], 'city': hotel['destinationName'] ?? '',
      'checkIn': checkIn, 'checkOut': checkOut, 'holder': holder, 'paxes': paxes,
      'guests': adults, 'rooms': rooms,
    });
    final id = res['booking']?['id'];
    if (id != null && context.mounted) {
      Navigator.push(context, MaterialPageRoute(builder: (_) => PembayaranScreen(bookingId: id)));
    } else if (context.mounted) {
      showSnack(context, tr('Gagal membuat pesanan.', 'Failed to create booking.'), kind: SnackKind.error);
    }
  } catch (e) {
    if (context.mounted) showSnack(context, tr('Reservasi gagal (rate mungkin kedaluwarsa).', 'Reservation failed (rate may have expired).'), kind: SnackKind.error);
  }
}
