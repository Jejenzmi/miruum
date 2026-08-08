import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../api.dart';
import '../theme.dart';
import '../widgets.dart';
import '../l10n.dart';
import 'venue_detail.dart';

/// Browse venues / function spaces (module: Venue / MICE).
class VenueListScreen extends StatefulWidget {
  const VenueListScreen({super.key});
  @override
  State<VenueListScreen> createState() => _VenueListScreenState();
}

String venueTypeLabel(String x) => {
      'MEETING_ROOM': 'Meeting Room',
      'BALLROOM': 'Ballroom',
      'FUNCTION_HALL': 'Function Hall',
      'OUTDOOR': 'Outdoor',
    }[x] ?? x;
String venueBasisLabel(String x) => {
      'HOUR': tr('/jam', '/hour'),
      'HALFDAY': '/half-day',
      'FULLDAY': '/full-day',
      'PERPAX': tr('/org', '/pax'),
    }[x] ?? '';
int venueMaxCap(Map v) => [v['capTheatre'], v['capClassroom'], v['capRound'], v['capStanding']]
    .map((e) => (e ?? 0) as int)
    .fold<int>(0, (a, b) => a > b ? a : b);

class _VenueListScreenState extends State<VenueListScreen> {
  late Future<List<dynamic>> _future;
  @override
  void initState() {
    super.initState();
    _future = context.read<Api>().venues();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: MC.bg,
      appBar: AppBar(title: Text(tr('Venue & Meeting', 'Venues & Meetings'), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 17))),
      body: FutureBuilder<List<dynamic>>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) return const Center(child: CircularProgressIndicator());
          final venues = snap.data ?? const [];
          if (venues.isEmpty) return Center(child: Text(tr('Belum ada venue tersedia.', 'No venues available yet.'), style: TextStyle(color: MC.inkMuted)));
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: venues.length,
            separatorBuilder: (_, __) => const SizedBox(height: 14),
            itemBuilder: (_, i) => _card(venues[i] as Map),
          );
        },
      ),
    );
  }

  Widget _card(Map v) {
    final hotel = (v['hotel'] as Map?) ?? const {};
    final img = (v['imageUrl'] as String?)?.isNotEmpty == true ? v['imageUrl'] : hotel['imageUrl'];
    final instant = v['bookingMode'] == 'INSTANT';
    return GestureDetector(
      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => VenueDetailScreen(v['id'] as String))),
      child: Container(
        decoration: BoxDecoration(color: MC.surface, borderRadius: BorderRadius.circular(18), boxShadow: [softShadow]),
        clipBehavior: Clip.antiAlias,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          if (img != null) NetImage(img, width: double.infinity, height: 150),
          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                _pill(venueTypeLabel(v['type'] as String? ?? ''), MC.primary),
                const SizedBox(width: 6),
                _pill(instant ? 'Instant' : 'Inquiry', instant ? MC.success : MC.accent),
              ]),
              const SizedBox(height: 8),
              Text(v['name'] as String? ?? '', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
              const SizedBox(height: 3),
              Text('${hotel['name'] ?? ''} · ${hotel['city'] ?? ''}', style: TextStyle(color: MC.inkMuted, fontSize: 12.5)),
              const SizedBox(height: 2),
              Text('${tr('Kapasitas s/d', 'Up to')} ${venueMaxCap(v)} ${tr('org', 'pax')}', style: TextStyle(color: MC.inkFaint, fontSize: 12)),
              const SizedBox(height: 8),
              Row(children: [
                Text(rupiah(v['basePrice'] as int? ?? 0), style: const TextStyle(color: MC.primaryDark, fontWeight: FontWeight.w800, fontSize: 16)),
                Text(venueBasisLabel(v['priceBasis'] as String? ?? ''), style: TextStyle(color: MC.inkFaint, fontSize: 11)),
              ]),
            ]),
          ),
        ]),
      ),
    );
  }

  Widget _pill(String text, Color c) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
        decoration: BoxDecoration(color: c.withOpacity(0.12), borderRadius: BorderRadius.circular(20)),
        child: Text(text, style: TextStyle(color: c, fontWeight: FontWeight.w700, fontSize: 11)),
      );
}
