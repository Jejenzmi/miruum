import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import '../api.dart';
import '../bloc/cubits.dart';
import '../bloc/view_state.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../hotel_card.dart';
import '../models.dart';
import '../l10n.dart';
import '../theme.dart';
import '../ui_kit.dart';
import '../supply_booking.dart';
import 'filter.dart';

class ResultsScreen extends StatelessWidget {
  final String title;
  final String query;
  final DateTime? checkIn, checkOut;
  final int rooms;
  final FilterResult? initialFilter;
  final double? nearLat, nearLng;
  final bool promoOnly;
  const ResultsScreen({super.key, this.title = '', this.query = '', this.checkIn, this.checkOut, this.rooms = 1, this.initialFilter, this.nearLat, this.nearLng, this.promoOnly = false});

  @override
  Widget build(BuildContext context) {
    final f = initialFilter;
    final near = nearLat != null && nearLng != null;
    return BlocProvider(
      create: (ctx) => HotelsCubit(ctx.read<Api>())..load(query: {
        if (query.isNotEmpty) 'query': query,
        if (promoOnly) 'promo': 1,
        if (near) 'lat': nearLat,
        if (near) 'lng': nearLng,
        if (near) 'radius': 150,
        if (f != null) ...f.toQuery(),
      }),
      child: _ResultsView(title: title, query: query, checkIn: checkIn, checkOut: checkOut, rooms: rooms, initialFilter: f, near: near, nearLat: nearLat, nearLng: nearLng),
    );
  }
}

class _ResultsView extends StatefulWidget {
  final String title, query;
  final DateTime? checkIn, checkOut;
  final int rooms;
  final FilterResult? initialFilter;
  final bool near;
  final double? nearLat, nearLng;
  const _ResultsView({required this.title, required this.query, this.checkIn, this.checkOut, required this.rooms, this.initialFilter, this.near = false, this.nearLat, this.nearLng});
  @override
  State<_ResultsView> createState() => _ResultsViewState();
}

class _ResultsViewState extends State<_ResultsView> {
  late FilterResult _filter = widget.initialFilter ?? const FilterResult();
  final _fmt = DateFormat('d MMM yyyy', 'id_ID');

  // Live external-supply inventory, blended into the same list (source hidden).
  List<Map<String, dynamic>> _external = const [];
  late final String _ci, _co;

  @override
  void initState() {
    super.initState();
    String iso(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
    _ci = iso(widget.checkIn ?? DateTime.now().add(const Duration(days: 1)));
    _co = iso(widget.checkOut ?? DateTime.now().add(const Duration(days: 2)));
    _loadExternal();
  }

  Future<void> _loadExternal() async {
    if (widget.query.isEmpty && !widget.near) return; // need a destination or geo
    try {
      final r = await context.read<Api>().supplySearch(
        destination: widget.near ? null : widget.query,
        lat: widget.near ? widget.nearLat : null, lng: widget.near ? widget.nearLng : null,
        checkIn: _ci, checkOut: _co, adults: 2, rooms: widget.rooms);
      if (mounted) setState(() => _external = (((r['external'] as List?) ?? const []).cast<Map<String, dynamic>>()));
    } catch (_) {/* stay empty on failure */}
  }

  int _starOf(String? c) { final m = RegExp(r'([1-5])').firstMatch(c ?? ''); return m != null ? int.parse(m.group(1)!) : 3; }
  Hotel _extHotel(Map<String, dynamic> h) => Hotel.fromJson({
        'id': 'x-${h['supplierHotelCode']}', 'name': h['name'],
        'city': h['destinationName'] ?? h['zoneName'] ?? '', 'address': h['zoneName'] ?? '',
        'imageUrl': '', 'rating': 0, 'reviewCount': 0,
        'priceFrom': h['minRateIdr'] ?? h['minRate'] ?? 0,
        'starRating': _starOf(h['categoryName']?.toString()), 'isPromo': false, 'propertyType': 'HOTEL',
      });

  void _apply() {
    context.read<HotelsCubit>().load(query: {
      if (widget.query.isNotEmpty) 'query': widget.query,
      if (widget.near) 'lat': widget.nearLat,
      if (widget.near) 'lng': widget.nearLng,
      if (widget.near) 'radius': 150,
      ..._filter.toQuery(),
    });
  }

  void _openFilter() async {
    final res = await Navigator.push<FilterResult>(context, MaterialPageRoute(builder: (_) => FilterScreen(initial: _filter)));
    if (res != null && mounted) {
      setState(() => _filter = res);
      _apply();
    }
  }

  @override
  Widget build(BuildContext context) {
    final dates = widget.near
        ? tr('Diurutkan dari yang terdekat dengan lokasimu', 'Sorted by nearest to your location')
        : widget.checkIn != null && widget.checkOut != null
            ? '${_fmt.format(widget.checkIn!)} - ${_fmt.format(widget.checkOut!)} , ${widget.rooms} ${tr('Kamar', 'Rooms')}'
            : tr('Hotel di sekitar kamu', 'Hotels near you');
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title.isEmpty ? tr('Hasil Pencarian', 'Search Results') : widget.title),
        actions: [IconButton(onPressed: _openFilter, icon: const Icon(Icons.tune_rounded))],
      ),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
              child: Row(children: [
                Icon(Icons.event_rounded, size: 15, color: MC.inkFaint),
                const SizedBox(width: 6),
                Expanded(child: Text(dates, style: TextStyle(fontSize: 12.5, color: MC.inkMuted))),
                GestureDetector(
                  onTap: _openFilter,
                  child: Row(children: [
                    const Icon(Icons.edit_rounded, size: 14, color: MC.primary),
                    const SizedBox(width: 4),
                    Text(tr('Edit', 'Edit'), style: const TextStyle(color: MC.primary, fontWeight: FontWeight.w600, fontSize: 12.5)),
                  ]),
                ),
              ]),
            ),
            Expanded(
              child: BlocBuilder<HotelsCubit, ViewState<List<Hotel>>>(
                builder: (context, state) {
                  if (state.isLoading) {
                    return const SkeletonList();
                  }
                  final hotels = state.data ?? [];
                  if (hotels.isEmpty && _external.isEmpty) {
                    return EmptyState(
                      icon: Icons.search_off_rounded,
                      title: tr('Hotel tidak ditemukan', 'No hotels found'),
                      subtitle: tr('Coba ubah kata kunci atau filter pencarian', 'Try changing your keywords or search filters'),
                    );
                  }
                  final total = hotels.length + _external.length;
                  return ListView.separated(
                    padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
                    itemCount: total,
                    separatorBuilder: (_, __) => const SizedBox(height: 12),
                    itemBuilder: (context, i) {
                      final Widget card = i < hotels.length
                          ? HotelCard(hotels[i], showBook: true)
                          : HotelCard(_extHotel(_external[i - hotels.length]),
                              onCardTap: () => showExternalBooking(context, _external[i - hotels.length],
                                  checkIn: _ci, checkOut: _co, adults: 2, rooms: widget.rooms));
                      return card.animate().fadeIn(delay: (i * 55).ms, duration: 350.ms).slideY(begin: 0.1, end: 0);
                    },
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
