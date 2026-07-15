import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import '../api.dart';
import '../bloc/cubits.dart';
import '../bloc/view_state.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../hotel_card.dart';
import '../models.dart';
import '../theme.dart';
import '../ui_kit.dart';
import 'filter.dart';

class ResultsScreen extends StatelessWidget {
  final String title;
  final String query;
  final DateTime? checkIn, checkOut;
  final int rooms;
  final FilterResult? initialFilter;
  final double? nearLat, nearLng;
  final bool promoOnly;
  const ResultsScreen({super.key, this.title = 'Hasil Pencarian', this.query = '', this.checkIn, this.checkOut, this.rooms = 1, this.initialFilter, this.nearLat, this.nearLng, this.promoOnly = false});

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
        ? 'Diurutkan dari yang terdekat dengan lokasimu'
        : widget.checkIn != null && widget.checkOut != null
            ? '${_fmt.format(widget.checkIn!)} - ${_fmt.format(widget.checkOut!)} , ${widget.rooms} Kamar'
            : 'Hotel di sekitar kamu';
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title),
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
                  child: const Row(children: [
                    Icon(Icons.edit_rounded, size: 14, color: MC.primary),
                    SizedBox(width: 4),
                    Text('Edit', style: TextStyle(color: MC.primary, fontWeight: FontWeight.w600, fontSize: 12.5)),
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
                  if (hotels.isEmpty) {
                    return const EmptyState(
                      icon: Icons.search_off_rounded,
                      title: 'Hotel tidak ditemukan',
                      subtitle: 'Coba ubah kata kunci atau filter pencarian',
                    );
                  }
                  return ListView.separated(
                    padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
                    itemCount: hotels.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 12),
                    itemBuilder: (context, i) => HotelCard(hotels[i], showBook: true)
                        .animate().fadeIn(delay: (i * 55).ms, duration: 350.ms).slideY(begin: 0.1, end: 0),
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
