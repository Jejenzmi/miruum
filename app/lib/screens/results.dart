import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import '../api.dart';
import '../bloc/cubits.dart';
import '../bloc/view_state.dart';
import '../hotel_card.dart';
import '../models.dart';
import '../theme.dart';
import 'filter.dart';

class ResultsScreen extends StatelessWidget {
  final String title;
  final String query;
  final DateTime? checkIn, checkOut;
  final int rooms;
  const ResultsScreen({super.key, this.title = 'Hasil Pencarian', this.query = '', this.checkIn, this.checkOut, this.rooms = 1});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (ctx) => HotelsCubit(ctx.read<Api>())..load(query: query.isNotEmpty ? {'query': query} : null),
      child: _ResultsView(title: title, query: query, checkIn: checkIn, checkOut: checkOut, rooms: rooms),
    );
  }
}

class _ResultsView extends StatefulWidget {
  final String title, query;
  final DateTime? checkIn, checkOut;
  final int rooms;
  const _ResultsView({required this.title, required this.query, this.checkIn, this.checkOut, required this.rooms});
  @override
  State<_ResultsView> createState() => _ResultsViewState();
}

class _ResultsViewState extends State<_ResultsView> {
  FilterResult _filter = const FilterResult();
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
                const Icon(Icons.event_rounded, size: 15, color: MC.inkFaint),
                const SizedBox(width: 6),
                Expanded(child: Text(dates, style: const TextStyle(fontSize: 12.5, color: MC.inkMuted))),
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
                    return const Center(child: CircularProgressIndicator(color: MC.primary));
                  }
                  final hotels = state.data ?? [];
                  if (hotels.isEmpty) {
                    return const Center(child: Padding(
                      padding: EdgeInsets.all(40),
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                        Icon(Icons.search_off_rounded, size: 48, color: MC.inkFaint),
                        SizedBox(height: 12),
                        Text('Hotel tidak ditemukan', style: TextStyle(color: MC.inkMuted)),
                      ]),
                    ));
                  }
                  return ListView.separated(
                    padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
                    itemCount: hotels.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 12),
                    itemBuilder: (context, i) => HotelCard(hotels[i], showBook: true),
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
