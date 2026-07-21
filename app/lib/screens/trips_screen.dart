import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../api.dart';
import '../feedback.dart';
import '../l10n.dart';
import '../theme.dart';
import '../widgets.dart';
import 'hotel_detail.dart';
import 'tour_detail.dart';

/// "Trips" — named wishlists holding hotels AND tours (mixed itinerary).
class TripsScreen extends StatefulWidget {
  const TripsScreen({super.key});
  @override
  State<TripsScreen> createState() => _TripsScreenState();
}

class _TripsScreenState extends State<TripsScreen> {
  List<dynamic> _lists = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    try { final w = await context.read<Api>().wishlists(); if (mounted) setState(() { _lists = w; _loading = false; }); }
    catch (_) { if (mounted) setState(() => _loading = false); }
  }

  Future<void> _create() async {
    final name = await _promptName(context);
    if (name == null || name.trim().isEmpty) return;
    await context.read<Api>().createWishlist(name.trim());
    _load();
  }

  Future<void> _delete(String id) async {
    await context.read<Api>().deleteWishlist(id);
    _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: MC.bg,
      appBar: AppBar(title: Text(tr('Trips Saya', 'My Trips')), actions: [
        IconButton(onPressed: _create, icon: const Icon(Icons.add_rounded)),
      ]),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: MC.primary))
          : _lists.isEmpty
              ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Icon(Icons.luggage_rounded, size: 52, color: MC.inkFaint),
                  const SizedBox(height: 12),
                  Text(tr('Belum ada trip. Buat trip & simpan\nhotel + tour untuk rencanamu.', 'No trips yet. Create a trip & save\nhotels + tours for your plans.'), textAlign: TextAlign.center, style: TextStyle(color: MC.inkMuted, height: 1.5)),
                  const SizedBox(height: 16),
                  PrimaryButton(tr('Buat Trip', 'Create Trip'), expand: false, icon: Icons.add_rounded, onPressed: _create),
                ]))
              : ListView(padding: const EdgeInsets.all(20), children: [
                  for (final w in _lists) _tripCard(w),
                ]),
    );
  }

  Widget _tripCard(Map w) {
    final items = (w['items'] as List?) ?? [];
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(color: MC.surface, borderRadius: BorderRadius.circular(16), boxShadow: [softShadow]),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(padding: const EdgeInsets.fromLTRB(14, 12, 8, 4), child: Row(children: [
          const Icon(Icons.luggage_rounded, size: 18, color: MC.primary),
          const SizedBox(width: 8),
          Expanded(child: Text((w['name'] ?? '').toString(), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15.5))),
          Text('${items.length} ${tr('item', 'items')}', style: TextStyle(color: MC.inkFaint, fontSize: 12)),
          IconButton(onPressed: () => _delete((w['id']).toString()), icon: Icon(Icons.delete_outline_rounded, size: 20, color: MC.inkFaint)),
        ])),
        if (items.isEmpty)
          Padding(padding: const EdgeInsets.fromLTRB(14, 0, 14, 14), child: Text(tr('Kosong — simpan hotel/tour dari halaman detail.', 'Empty — save hotels/tours from the detail page.'), style: TextStyle(color: MC.inkMuted, fontSize: 12.5)))
        else
          ...items.map((i) => _itemTile(i as Map)),
        const SizedBox(height: 6),
      ]),
    );
  }

  Widget _itemTile(Map i) {
    final kind = (i['kind'] ?? 'HOTEL').toString();
    return ListTile(
      leading: ClipRRect(borderRadius: BorderRadius.circular(8),
        child: NetImage((i['imageUrl'] ?? '').toString(), width: 48, height: 48)),
      title: Text((i['title'] ?? '').toString(), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5)),
      subtitle: Row(children: [
        Container(padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
          decoration: BoxDecoration(color: (kind == 'TOUR' ? MC.success : MC.blue).withOpacity(0.12), borderRadius: BorderRadius.circular(4)),
          child: Text(kind == 'TOUR' ? tr('Tur', 'Tour') : tr('Hotel', 'Hotel'), style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w700, color: kind == 'TOUR' ? MC.success : MC.blue))),
        const SizedBox(width: 6),
        Expanded(child: Text((i['subtitle'] ?? '').toString(), maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: MC.inkFaint, fontSize: 11.5))),
      ]),
      trailing: Text(rupiah((i['price'] ?? 0) as int), style: const TextStyle(color: MC.primaryDark, fontWeight: FontWeight.w800, fontSize: 12.5)),
      onTap: () {
        final id = (i['refId'] ?? '').toString();
        Navigator.push(context, MaterialPageRoute(builder: (_) => kind == 'TOUR' ? TourDetailScreen(id) : HotelDetailScreen(id)));
      },
    );
  }
}

Future<String?> _promptName(BuildContext context) {
  final ctl = TextEditingController();
  return showDialog<String>(context: context, builder: (_) => AlertDialog(
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
    title: Text(tr('Buat Trip Baru', 'Create New Trip')),
    content: TextField(controller: ctl, autofocus: true, decoration: InputDecoration(hintText: tr('Contoh: Liburan Bali', 'e.g. Bali Getaway'))),
    actions: [
      TextButton(onPressed: () => Navigator.pop(context), child: Text(tr('Batal', 'Cancel'))),
      FilledButton(onPressed: () => Navigator.pop(context, ctl.text), style: FilledButton.styleFrom(backgroundColor: MC.primary), child: Text(tr('Buat', 'Create'))),
    ],
  ));
}

/// Bottom sheet to save a hotel/tour into one of the user's trips (creates one if needed).
Future<void> showSaveToTrip(BuildContext context, {required String kind, required String refId,
    required String title, String? imageUrl, String? subtitle, int price = 0}) async {
  final api = context.read<Api>();
  List<dynamic> lists;
  try { lists = await api.wishlists(); } catch (_) { if (context.mounted) showSnack(context, tr('Masuk dulu untuk menyimpan.', 'Sign in first to save.'), kind: SnackKind.error); return; }
  if (!context.mounted) return;
  await showModalBottomSheet(context: context, backgroundColor: MC.surface,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    builder: (ctx) => StatefulBuilder(builder: (ctx, setSheet) => Padding(
      padding: const EdgeInsets.fromLTRB(20, 14, 20, 24),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: MC.line, borderRadius: BorderRadius.circular(2)))),
        const SizedBox(height: 14),
        Text(tr('Simpan ke Trip', 'Save to Trip'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
        const SizedBox(height: 12),
        ...lists.map((w) => ListTile(
          contentPadding: EdgeInsets.zero,
          leading: const Icon(Icons.luggage_rounded, color: MC.primary),
          title: Text((w['name'] ?? '').toString(), style: const TextStyle(fontWeight: FontWeight.w600)),
          trailing: const Icon(Icons.add_circle_outline_rounded, color: MC.primary),
          onTap: () async {
            await api.addToWishlist((w['id']).toString(), {'kind': kind, 'refId': refId, 'title': title, 'imageUrl': imageUrl, 'subtitle': subtitle, 'price': price});
            if (ctx.mounted) Navigator.pop(ctx);
            if (context.mounted) showSnack(context, tr('Disimpan ke "${w['name']}".', 'Saved to "${w['name']}".'), kind: SnackKind.success);
          },
        )),
        const Divider(),
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: const Icon(Icons.add_rounded, color: MC.primary),
          title: Text(tr('Buat trip baru', 'Create new trip'), style: const TextStyle(fontWeight: FontWeight.w600, color: MC.primary)),
          onTap: () async {
            final name = await _promptName(ctx);
            if (name == null || name.trim().isEmpty) return;
            final w = await api.createWishlist(name.trim());
            await api.addToWishlist((w['id']).toString(), {'kind': kind, 'refId': refId, 'title': title, 'imageUrl': imageUrl, 'subtitle': subtitle, 'price': price});
            if (ctx.mounted) Navigator.pop(ctx);
            if (context.mounted) showSnack(context, tr('Disimpan ke "$name".', 'Saved to "$name".'), kind: SnackKind.success);
          },
        ),
      ]),
    )),
  );
}
