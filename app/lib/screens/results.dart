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
  const ResultsScreen({super.key, this.title = 'Hasil Pencarian', this.query = '', this.checkIn, this.checkOut, this.rooms = 1, this.initialFilter});

  @override
  Widget build(BuildContext context) {
    final f = initialFilter;
    return BlocProvider(
      create: (ctx) => HotelsCubit(ctx.read<Api>())..load(query: {
        if (query.isNotEmpty) 'query': query,
        if (f != null && f.minPrice > 0) 'minPrice': f.minPrice,
        if (f != null && f.maxPrice < 5000000) 'maxPrice': f.maxPrice,
        if (f != null && f.star > 0) 'star': f.star,
      }),
      child: _ResultsView(title: title, query: query, checkIn: checkIn, checkOut: checkOut, rooms: rooms, initialFilter: f),
    );
  }
}

class _ResultsView extends StatefulWidget {
  final String title, query;
  final DateTime? checkIn, checkOut;
  final int rooms;
  final FilterResult? initialFilter;
  const _ResultsView({required this.title, required this.query, this.checkIn, this.checkOut, required this.rooms, this.initialFilter});
  @override
  State<_ResultsView> createState() => _ResultsViewState();
}

class _ResultsViewState extends State<_ResultsView> {
  late FilterResult _filter = widget.initialFilter ?? const FilterResult();
  final _fmt = DateFormat('d MMM yyyy', 'id_ID');

  void _apply() {
    context.read<HotelsCubit>().load(query: {
      if (widget.query.isNotEmpty) 'query': widget.query,
      if (_filter.minPrice > 0) 'minPrice': _filter.minPrice,
      if (_filter.maxPrice < 5000000) 'maxPrice': _filter.maxPrice,
      if (_filter.star > 0) 'star': _filter.star,
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
    final dates = widget.checkIn != null && widget.checkOut != null
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
