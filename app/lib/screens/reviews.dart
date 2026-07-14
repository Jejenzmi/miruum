import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../api.dart';
import '../bloc/cubits.dart';
import '../bloc/view_state.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets.dart';

class ReviewsScreen extends StatelessWidget {
  final Hotel hotel;
  const ReviewsScreen({super.key, required this.hotel});

  String _label(double r) => r >= 9 ? 'Sempurna' : r >= 8 ? 'Sangat Bagus' : r >= 7 ? 'Bagus' : 'Cukup';

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (ctx) => ReviewsCubit(ctx.read<Api>())..load(hotel.id),
      child: Scaffold(
        appBar: AppBar(title: const Text('Semua Ulasan')),
        body: SafeArea(
          child: BlocBuilder<ReviewsCubit, ViewState<List<Review>>>(
            builder: (context, state) {
              if (state.isLoading) {
                return const Center(child: CircularProgressIndicator(color: MC.primary));
              }
              final reviews = state.data ?? [];
              return ListView(
                padding: const EdgeInsets.all(20),
                children: [
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(color: MC.primarySoft, borderRadius: BorderRadius.circular(16)),
                    child: Row(children: [
                      Container(
                        width: 60, height: 60,
                        decoration: BoxDecoration(color: MC.primary, borderRadius: BorderRadius.circular(14)),
                        child: Center(child: Text(hotel.rating.toStringAsFixed(1),
                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 20))),
                      ),
                      const SizedBox(width: 14),
                      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(_label(hotel.rating), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                        const SizedBox(height: 2),
                        Text('Dari ${hotel.reviewCount} ulasan', style: TextStyle(color: MC.inkMuted, fontSize: 13)),
                      ]),
                    ]),
                  ),
                  const SizedBox(height: 20),
                  const Text('Ulasan Tamu', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                  const SizedBox(height: 12),
                  for (final r in reviews) Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(color: MC.surface, borderRadius: BorderRadius.circular(14), boxShadow: [softShadow]),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        CircleAvatar(radius: 18, backgroundColor: MC.primarySoft,
                            child: Text(r.authorName.characters.first, style: const TextStyle(color: MC.primaryDark, fontWeight: FontWeight.w700))),
                        const SizedBox(width: 10),
                        Expanded(child: Text(r.authorName, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15))),
                        RatingPill(r.rating, small: true),
                      ]),
                      const SizedBox(height: 8),
                      Text(r.body, style: TextStyle(color: MC.inkMuted, fontSize: 13, height: 1.5)),
                    ]),
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
