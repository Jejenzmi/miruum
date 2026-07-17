import 'package:flutter/material.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets.dart';
import 'hotel_detail.dart';

/// Side-by-side comparison of 2–3 properties.
class CompareScreen extends StatelessWidget {
  final List<Hotel> hotels;
  const CompareScreen({super.key, required this.hotels});

  @override
  Widget build(BuildContext context) {
    final list = hotels.take(3).toList();
    // Cheapest / highest-rated highlights.
    final minPrice = list.map((h) => h.priceFrom).reduce((a, b) => a < b ? a : b);
    final maxRating = list.map((h) => h.rating).reduce((a, b) => a > b ? a : b);
    return Scaffold(
      backgroundColor: MC.bg,
      appBar: AppBar(title: const Text('Bandingkan Properti')),
      body: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start,
            children: list.map((h) => _col(context, h, isCheapest: h.priceFrom == minPrice, isTopRated: h.rating == maxRating)).toList()),
        ),
      ),
    );
  }

  Widget _col(BuildContext context, Hotel h, {required bool isCheapest, required bool isTopRated}) {
    Widget row(IconData ic, String label, String value, {Color? color, bool best = false}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 7),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [Icon(ic, size: 13, color: MC.inkFaint), const SizedBox(width: 4),
              Text(label, style: TextStyle(color: MC.inkFaint, fontSize: 10.5))]),
            const SizedBox(height: 2),
            Row(children: [
              Flexible(child: Text(value, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5, color: color ?? MC.ink))),
              if (best) ...[const SizedBox(width: 4), const Icon(Icons.check_circle_rounded, size: 13, color: MC.success)],
            ]),
          ]),
        );
    return Container(
      width: 172,
      margin: const EdgeInsets.only(right: 12),
      decoration: BoxDecoration(color: MC.surface, borderRadius: BorderRadius.circular(16), boxShadow: [softShadow]),
      clipBehavior: Clip.antiAlias,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        NetImage(h.imageUrl, width: 172, height: 108),
        Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(h.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5, height: 1.2)),
          Text(PropertyType.label(h.propertyType), style: TextStyle(color: MC.inkMuted, fontSize: 11)),
          const Divider(height: 16),
          row(Icons.sell_rounded, 'Harga/malam', rupiah(h.priceFrom), color: MC.primaryDark, best: isCheapest),
          row(Icons.star_rounded, 'Rating tamu', '${h.rating.toStringAsFixed(1)} / 10', best: isTopRated),
          row(Icons.grade_rounded, 'Bintang', '${h.starRating} ★'),
          row(Icons.location_on_rounded, 'Kota', h.city),
          row(Icons.reviews_rounded, 'Ulasan', '${h.reviewCount}'),
          const SizedBox(height: 10),
          SizedBox(width: double.infinity, height: 34, child: ElevatedButton(
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => HotelDetailScreen(h.id))),
            style: ElevatedButton.styleFrom(backgroundColor: MC.primary, foregroundColor: Colors.white, elevation: 0,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)), textStyle: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600)),
            child: const Text('Lihat'))),
        ])),
      ]),
    );
  }
}
