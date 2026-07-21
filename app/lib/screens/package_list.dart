import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../api.dart';
import '../bloc/cubits.dart';
import '../bloc/view_state.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets.dart';
import '../l10n.dart';
import 'package_detail.dart';

/// "Hotel Package" — curated bundled deals list.
class PackageListScreen extends StatelessWidget {
  final String? query;
  const PackageListScreen({super.key, this.query});
  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (ctx) => PackagesCubit(ctx.read<Api>())..load(query: query == null ? null : {'query': query}),
      child: Scaffold(
        appBar: AppBar(title: Text(tr('Paket Hotel', 'Hotel Package'))),
        body: BlocBuilder<PackagesCubit, ViewState<List<HotelPackage>>>(
          builder: (context, state) {
            if (state.isLoading) return const Center(child: CircularProgressIndicator(color: MC.primary));
            if (state.isFailure) {
              return Center(child: OutlineButtonX(tr('Coba lagi', 'Try again'),
                  icon: Icons.refresh_rounded, onPressed: () => context.read<PackagesCubit>().load()));
            }
            final pkgs = state.data!;
            if (pkgs.isEmpty) {
              return Center(child: Text(tr('Belum ada paket tersedia', 'No packages available yet'), style: TextStyle(color: MC.inkMuted)));
            }
            return ListView.separated(
              padding: const EdgeInsets.all(20),
              itemCount: pkgs.length,
              separatorBuilder: (_, __) => const SizedBox(height: 14),
              itemBuilder: (context, i) => PackageCard(pkgs[i]),
            );
          },
        ),
      ),
    );
  }
}

class PackageCard extends StatelessWidget {
  final HotelPackage pkg;
  const PackageCard(this.pkg, {super.key});
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => PackageDetailScreen(pkg.id))),
      child: Container(
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(color: MC.surface, borderRadius: BorderRadius.circular(18), boxShadow: [softShadow]),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Stack(children: [
            NetImage(pkg.imageUrl, width: double.infinity, height: 140),
            Positioned(
              left: 12, top: 12,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(color: MC.primary, borderRadius: BorderRadius.circular(8)),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.card_giftcard_rounded, color: Colors.white, size: 13),
                  const SizedBox(width: 4),
                  Text(tr('${pkg.nights}M${pkg.days}H', '${pkg.nights}N${pkg.days}D'),
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 11)),
                ]),
              ),
            ),
            if (pkg.badge != null)
              Positioned(
                right: 12, top: 12,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(color: MC.accent, borderRadius: BorderRadius.circular(8)),
                  child: Text(pkg.badge!, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 11)),
                ),
              ),
            if (pkg.discountPct > 0)
              Positioned(
                right: 0, bottom: 0,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: const BoxDecoration(
                    color: MC.danger,
                    borderRadius: BorderRadius.only(topLeft: Radius.circular(12)),
                  ),
                  child: Text('- ${pkg.discountPct}%',
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 12)),
                ),
              ),
          ]),
          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(pkg.title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
              const SizedBox(height: 4),
              Row(children: [
                Icon(Icons.location_on_rounded, size: 13, color: MC.inkFaint),
                const SizedBox(width: 2),
                Expanded(child: Text(pkg.city, maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: MC.inkMuted, fontSize: 12))),
                const Icon(Icons.star_rounded, color: MC.star, size: 15),
                const SizedBox(width: 2),
                Text(pkg.rating.toStringAsFixed(1), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12)),
              ]),
              const SizedBox(height: 10),
              Wrap(spacing: 6, runSpacing: 6, children: [
                TagChip(pkg.boardLabel, Icons.restaurant_rounded),
                for (final inc in pkg.inclusions.take(2))
                  TagChip(inc, Icons.check_rounded),
              ]),
              Divider(height: 22, color: MC.line),
              Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    if (pkg.originalPrice > pkg.price)
                      Text(rupiah(pkg.originalPrice),
                          style: TextStyle(fontSize: 11, color: MC.inkFaint, decoration: TextDecoration.lineThrough)),
                    RichText(text: TextSpan(style: const TextStyle(color: MC.primaryDark), children: [
                      TextSpan(text: rupiah(pkg.price), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                      TextSpan(text: tr(' / paket', ' / package'), style: TextStyle(fontSize: 11, color: MC.inkFaint)),
                    ])),
                  ]),
                ),
                const Icon(Icons.arrow_circle_right_rounded, color: MC.primary, size: 32),
              ]),
            ]),
          ),
        ]),
      ),
    );
  }
}
