import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../api.dart';
import '../bloc/auth/auth_bloc.dart';
import '../bloc/cubits.dart';
import '../bloc/view_state.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets.dart';
import 'gallery_screen.dart';
import 'reviews.dart';
import 'pilih_kamar.dart';

class HotelDetailScreen extends StatelessWidget {
  final String hotelId;
  const HotelDetailScreen(this.hotelId, {super.key});
  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (ctx) => HotelDetailCubit(ctx.read<Api>())..load(hotelId),
      child: const _HotelDetailView(),
    );
  }
}

class _HotelDetailView extends StatefulWidget {
  const _HotelDetailView();
  @override
  State<_HotelDetailView> createState() => _HotelDetailViewState();
}

class _HotelDetailViewState extends State<_HotelDetailView> {
  bool _descExpanded = false;

  /// Cheapest available offer — used to silently route the booking to the best
  /// supply source (the source is never surfaced to the customer).
  HotelOffer? _bestOffer(Hotel h) {
    final avail = h.offers.where((o) => o.available).toList()..sort((a, b) => a.price.compareTo(b.price));
    return avail.isEmpty ? null : avail.first;
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthBloc>().state;
    return Scaffold(
      body: BlocBuilder<HotelDetailCubit, ViewState<Hotel>>(
        builder: (context, state) {
          if (state.isLoading) {
            return const Center(child: CircularProgressIndicator(color: MC.primary));
          }
          if (!state.isSuccess) return const Center(child: Text('Hotel tidak ditemukan'));
          final h = state.data!;
          final fav = auth.isFavorite(h.id);
          final photos = h.photos.isNotEmpty ? h.photos : [h.imageUrl];
          return Stack(
            children: [
              CustomScrollView(
                slivers: [
                  SliverAppBar(
                    expandedHeight: 280,
                    pinned: true,
                    backgroundColor: MC.surface,
                    leading: _circleBtn(Icons.arrow_back_rounded, () => Navigator.pop(context)),
                    actions: [
                      if (auth.isLoggedIn)
                        _circleBtn(fav ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                            () => context.read<AuthBloc>().add(AuthFavoriteToggled(h.id)), color: fav ? MC.danger : MC.ink),
                      const SizedBox(width: 8),
                    ],
                    flexibleSpace: FlexibleSpaceBar(
                      background: Stack(fit: StackFit.expand, children: [
                        PageView.builder(
                          itemCount: photos.length,
                          itemBuilder: (_, i) => GestureDetector(
                            onTap: () => Navigator.push(context, MaterialPageRoute(
                                builder: (_) => GalleryScreen(photos: photos, initialIndex: i))),
                            child: NetImage(photos[i]),
                          ),
                        ),
                        Positioned(
                          right: 14, bottom: 14,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                            decoration: BoxDecoration(color: Colors.black45, borderRadius: BorderRadius.circular(20)),
                            child: Row(mainAxisSize: MainAxisSize.min, children: [
                              const Icon(Icons.photo_library_rounded, color: Colors.white, size: 14),
                              const SizedBox(width: 5),
                              Text('${photos.length} foto', style: const TextStyle(color: Colors.white, fontSize: 11.5)),
                            ]),
                          ),
                        ),
                      ]),
                    ),
                  ),
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(20, 18, 20, 120),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(children: [
                            Expanded(child: Text(h.name, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800))),
                            RatingPill(h.rating),
                          ]),
                          const SizedBox(height: 4),
                          Row(children: [
                            const Icon(Icons.location_on_rounded, size: 15, color: MC.inkFaint),
                            const SizedBox(width: 4),
                            Text(h.city, style: const TextStyle(color: MC.inkMuted)),
                            const SizedBox(width: 8),
                            StarRow(h.starRating),
                          ]),
                          const SizedBox(height: 6),
                          Text('${rupiah(h.priceFrom)} · (${h.reviewCount} ulasan)',
                              style: const TextStyle(color: MC.primaryDark, fontWeight: FontWeight.w700)),
                          const SizedBox(height: 20),
                          const Text('Fasilitas', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                          const SizedBox(height: 12),
                          Wrap(spacing: 10, runSpacing: 10, children: [
                            for (final f in h.facilities) _facility(f),
                          ]),
                          const SizedBox(height: 22),
                          const Text('Deskripsi', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                          const SizedBox(height: 8),
                          Text(h.description ?? '',
                              maxLines: _descExpanded ? null : 3,
                              overflow: _descExpanded ? null : TextOverflow.ellipsis,
                              style: const TextStyle(color: MC.inkMuted, height: 1.5, fontSize: 13.5)),
                          GestureDetector(
                            onTap: () => setState(() => _descExpanded = !_descExpanded),
                            child: Padding(
                              padding: const EdgeInsets.only(top: 4),
                              child: Text(_descExpanded ? 'Tutup' : 'Baca selengkapnya',
                                  style: const TextStyle(color: MC.primary, fontWeight: FontWeight.w600, fontSize: 13)),
                            ),
                          ),
                          const SizedBox(height: 22),
                          SectionHeader('Ulasan Tamu', action: 'Tampilkan semua',
                              onAction: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ReviewsScreen(hotel: h)))),
                          const SizedBox(height: 12),
                          for (final r in h.reviews.take(2)) _reviewTile(r),
                          const SizedBox(height: 14),
                          const Text('Waktu Check-in & Check-out', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                          const SizedBox(height: 12),
                          Row(children: [
                            Expanded(child: _checkTime('Check-in', h.checkInInfo ?? 'Dari jam 14.00', Icons.login_rounded)),
                            const SizedBox(width: 12),
                            Expanded(child: _checkTime('Check-out', h.checkOutInfo ?? 'Sebelum 12.00', Icons.logout_rounded)),
                          ]),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
              Positioned(
                left: 0, right: 0, bottom: 0,
                child: Container(
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
                  decoration: BoxDecoration(color: MC.surface, boxShadow: [
                    BoxShadow(color: Colors.black.withOpacity(0.08), blurRadius: 16, offset: const Offset(0, -4)),
                  ]),
                  child: SafeArea(
                    top: false,
                    child: Row(children: [
                      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        const Text('Mulai dari', style: TextStyle(fontSize: 11, color: MC.inkFaint)),
                        Text(rupiah(h.priceFrom), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: MC.primaryDark)),
                      ]),
                      const SizedBox(width: 16),
                      Expanded(child: PrimaryButton('Pilih Kamar', onPressed: () =>
                          Navigator.push(context, MaterialPageRoute(builder: (_) => PilihKamarScreen(
                                hotel: h,
                                channelId: _bestOffer(h)?.channelId,
                              ))))),
                    ]),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _circleBtn(IconData icon, VoidCallback onTap, {Color color = MC.ink}) => Padding(
        padding: const EdgeInsets.all(8),
        child: GestureDetector(
          onTap: onTap,
          child: Container(
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.9), shape: BoxShape.circle),
            child: Icon(icon, color: color, size: 22),
          ),
        ),
      );

  Widget _facility(Facility f) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(color: MC.field, borderRadius: BorderRadius.circular(10)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(facilityIcon(f.icon), size: 16, color: MC.primaryDark),
          const SizedBox(width: 6),
          Text(f.name, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500)),
        ]),
      );

  Widget _reviewTile(Review r) => Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: MC.surface, borderRadius: BorderRadius.circular(14), boxShadow: [softShadow]),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            CircleAvatar(radius: 16, backgroundColor: MC.primarySoft, child: Text(r.authorName.characters.first, style: const TextStyle(color: MC.primaryDark, fontWeight: FontWeight.w700))),
            const SizedBox(width: 10),
            Expanded(child: Text(r.authorName, style: const TextStyle(fontWeight: FontWeight.w600))),
            RatingPill(r.rating, small: true),
          ]),
          const SizedBox(height: 8),
          Text(r.body, style: const TextStyle(color: MC.inkMuted, fontSize: 12.5, height: 1.5)),
        ]),
      );

  Widget _checkTime(String label, String value, IconData icon) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: MC.primarySoft, borderRadius: BorderRadius.circular(14)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, color: MC.primaryDark, size: 20),
          const SizedBox(height: 8),
          Text(label, style: const TextStyle(fontSize: 12, color: MC.inkMuted)),
          const SizedBox(height: 2),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
        ]),
      );
}
