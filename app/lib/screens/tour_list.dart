import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../api.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets.dart';
import '../l10n.dart';
import 'tour_detail.dart';

/// Browse tours & activities (module: Tour).
class TourListScreen extends StatefulWidget {
  const TourListScreen({super.key});
  @override
  State<TourListScreen> createState() => _TourListScreenState();
}

class _TourListScreenState extends State<TourListScreen> {
  static const _cats = ['Semua', 'Alam', 'Budaya', 'Petualangan', 'Kuliner', 'Bahari'];
  String _cat = 'Semua';
  late Future<List<Tour>> _future;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() => _future = context.read<Api>().tours(category: _cat == 'Semua' ? null : _cat);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: MC.bg,
      appBar: AppBar(
        title: Text(tr('Tour & Aktivitas', 'Tours & Activities'), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 17)),
      ),
      body: Column(children: [
        SizedBox(
          height: 44,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            itemCount: _cats.length,
            separatorBuilder: (_, __) => const SizedBox(width: 8),
            itemBuilder: (_, i) {
              final c = _cats[i];
              final sel = c == _cat;
              return GestureDetector(
                onTap: () => setState(() { _cat = c; _load(); }),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 8),
                  decoration: BoxDecoration(
                    color: sel ? MC.primary : MC.surface,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: sel ? MC.primary : MC.line),
                  ),
                  child: Text(c, style: TextStyle(color: sel ? Colors.white : MC.inkMuted, fontWeight: FontWeight.w600, fontSize: 12.5)),
                ),
              );
            },
          ),
        ),
        Expanded(
          child: FutureBuilder<List<Tour>>(
            future: _future,
            builder: (context, snap) {
              if (snap.connectionState == ConnectionState.waiting) {
                return const Center(child: CircularProgressIndicator(color: MC.primary));
              }
              if (snap.hasError) {
                return Center(child: Padding(padding: const EdgeInsets.all(24),
                    child: Text(tr('Gagal memuat tour.\n${snap.error}', 'Failed to load tours.\n${snap.error}'), textAlign: TextAlign.center, style: TextStyle(color: MC.inkMuted))));
              }
              final tours = snap.data ?? [];
              if (tours.isEmpty) {
                return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Icon(Icons.travel_explore_rounded, size: 48, color: MC.inkFaint),
                  const SizedBox(height: 10),
                  Text(tr('Belum ada tour pada kategori ini.', 'No tours in this category yet.'), style: TextStyle(color: MC.inkMuted)),
                ]));
              }
              return ListView.builder(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                itemCount: tours.length,
                itemBuilder: (_, i) => _tourCard(tours[i]),
              );
            },
          ),
        ),
      ]),
    );
  }

  Widget _tourCard(Tour t) => GestureDetector(
        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => TourDetailScreen(t.id))),
        child: Container(
          margin: const EdgeInsets.only(bottom: 14),
          decoration: BoxDecoration(color: MC.surface, borderRadius: BorderRadius.circular(18), boxShadow: [softShadow]),
          clipBehavior: Clip.antiAlias,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Stack(children: [
              NetImage(t.imageUrl, height: 150, width: double.infinity),
              Positioned(top: 10, left: 10, child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                decoration: BoxDecoration(color: Colors.black.withOpacity(0.55), borderRadius: BorderRadius.circular(8)),
                child: Text(t.category, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600)),
              )),
            ]),
            Padding(
              padding: const EdgeInsets.all(13),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(t.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                const SizedBox(height: 5),
                Row(children: [
                  Icon(Icons.location_on_rounded, size: 13, color: MC.inkFaint),
                  const SizedBox(width: 3),
                  Text(t.city, style: TextStyle(fontSize: 12, color: MC.inkMuted)),
                  const SizedBox(width: 10),
                  Icon(Icons.schedule_rounded, size: 13, color: MC.inkFaint),
                  const SizedBox(width: 3),
                  Text('${t.durationHours} ${tr('jam', 'hours')}', style: TextStyle(fontSize: 12, color: MC.inkMuted)),
                  const SizedBox(width: 10),
                  const Icon(Icons.star_rounded, size: 14, color: MC.star),
                  const SizedBox(width: 2),
                  Text(t.rating.toStringAsFixed(1), style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                ]),
                const Divider(height: 18),
                Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                  Flexible(child: RichText(text: TextSpan(children: [
                    TextSpan(text: rupiah(t.price), style: const TextStyle(color: MC.primaryDark, fontWeight: FontWeight.w800, fontSize: 15.5)),
                    TextSpan(text: tr(' /orang', ' /person'), style: TextStyle(color: MC.inkFaint, fontSize: 11)),
                  ]))),
                  const Icon(Icons.arrow_forward_ios_rounded, size: 14, color: MC.primary),
                ]),
              ]),
            ),
          ]),
        ),
      );
}
