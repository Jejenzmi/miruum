import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../api.dart';
import '../bloc/cubits.dart';
import '../bloc/view_state.dart';
import '../models.dart';
import '../theme.dart';
import '../ui_kit.dart';
import '../widgets.dart';
import 'hotel_detail.dart';
import 'results.dart';

class JelajahScreen extends StatelessWidget {
  const JelajahScreen({super.key});
  static const _cities = ['Yogyakarta', 'Jakarta', 'Padang', 'Sleman'];

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (ctx) => HotelsCubit(ctx.read<Api>())..load(),
      child: Scaffold(
        appBar: AppBar(
          automaticallyImplyLeading: false,
          title: const Text('Jelajah'),
          centerTitle: false,
          titleTextStyle: const TextStyle(color: MC.ink, fontSize: 20, fontWeight: FontWeight.w800),
        ),
        body: SafeArea(
          top: false,
          child: BlocBuilder<HotelsCubit, ViewState<List<Hotel>>>(
            builder: (context, state) {
              if (state.isLoading) {
                return const SkeletonList();
              }
              final hotels = state.data ?? [];
              return ListView(
                padding: const EdgeInsets.all(20),
                children: [
                  const Text('Destinasi Populer', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                  const SizedBox(height: 12),
                  SizedBox(
                    height: 40,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: _cities.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 10),
                      itemBuilder: (context, i) => ActionChip(
                        label: Text(_cities[i]),
                        backgroundColor: MC.surface,
                        side: const BorderSide(color: MC.line),
                        labelStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                        onPressed: () => Navigator.push(context, MaterialPageRoute(
                            builder: (_) => ResultsScreen(title: _cities[i], query: _cities[i]))),
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                  const Text('Jelajahi Hotel', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                  const SizedBox(height: 12),
                  GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2, crossAxisSpacing: 14, mainAxisSpacing: 14, childAspectRatio: 0.74),
                    itemCount: hotels.length,
                    itemBuilder: (context, i) => _ExploreCard(hotels[i])
                        .animate().fadeIn(delay: (i * 60).ms, duration: 350.ms).scale(begin: const Offset(0.9, 0.9)),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}

class _ExploreCard extends StatelessWidget {
  final Hotel hotel;
  const _ExploreCard(this.hotel);
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => HotelDetailScreen(hotel.id))),
      child: Container(
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(color: MC.surface, borderRadius: BorderRadius.circular(16), boxShadow: [softShadow]),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(child: NetImage(hotel.imageUrl, width: double.infinity)),
          Padding(
            padding: const EdgeInsets.all(10),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(hotel.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
              const SizedBox(height: 2),
              Text(hotel.city, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: MC.inkMuted, fontSize: 11.5)),
              const SizedBox(height: 6),
              Row(children: [
                const Icon(Icons.star_rounded, color: MC.star, size: 14),
                const SizedBox(width: 2),
                Text('${hotel.rating.toStringAsFixed(1)}', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12)),
                const Spacer(),
                Text(rupiah(hotel.priceFrom), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: MC.primaryDark)),
              ]),
            ]),
          ),
        ]),
      ),
    );
  }
}
