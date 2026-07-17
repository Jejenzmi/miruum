import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import 'package:share_plus/share_plus.dart';
import '../api.dart';
import '../bloc/auth/auth_bloc.dart';
import '../bloc/cubits.dart';
import '../bloc/view_state.dart';
import '../feedback.dart';
import '../l10n.dart';
import '../location.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets.dart';
import 'gallery_screen.dart';
import 'map_screen.dart';
import 'reviews.dart';
import 'hotel_chat.dart';
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
  bool _watching = false, _watchChecked = false;

  void _checkWatch(String hotelId) {
    if (_watchChecked || !context.read<AuthBloc>().state.isLoggedIn) return;
    _watchChecked = true;
    context.read<Api>().priceAlertHotelIds().then((ids) {
      if (mounted) setState(() => _watching = ids.contains(hotelId));
    }).catchError((_) {});
  }

  Future<void> _toggleWatch(String hotelId) async {
    if (!ensureLoggedIn(context, reason: tr('Masuk untuk memantau harga.', 'Log in to watch prices.'))) return;
    try {
      final w = await context.read<Api>().togglePriceAlert(hotelId);
      if (mounted) {
        setState(() => _watching = w);
        showSnack(context, w ? tr('Aktif — kami beri tahu jika harga turun', 'On — we\'ll alert you on price drops') : tr('Pantau harga dimatikan', 'Price watch off'),
            kind: w ? SnackKind.success : SnackKind.info);
      }
    } catch (_) {
      if (mounted) showSnack(context, tr('Gagal memperbarui', 'Failed to update'), kind: SnackKind.error);
    }
  }

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
          WidgetsBinding.instance.addPostFrameCallback((_) => _checkWatch(h.id));
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
                      _circleBtn(Icons.chat_bubble_outline_rounded, () {
                        if (!ensureLoggedIn(context, reason: tr('Masuk untuk chat dengan hotel.', 'Log in to chat with the hotel.'))) return;
                        Navigator.push(context, MaterialPageRoute(builder: (_) => HotelChatScreen(hotelId: h.id, hotelName: h.name)));
                      }),
                      const SizedBox(width: 8),
                      _circleBtn(Icons.share_rounded, () => Share.share(
                          'Cek ${h.name} di Miruum — hotel di ${h.city} mulai ${rupiah(h.priceFrom)}/malam!\nUnduh aplikasinya: https://ota.gokar.id')),
                      const SizedBox(width: 8),
                      _circleBtn(_watching ? Icons.notifications_active_rounded : Icons.notifications_none_rounded,
                          () => _toggleWatch(h.id), color: _watching ? MC.primary : MC.ink),
                      const SizedBox(width: 8),
                      _circleBtn(fav ? Icons.favorite_rounded : Icons.favorite_border_rounded, () {
                        if (!ensureLoggedIn(context, reason: tr('Masuk untuk menyimpan hotel ke favorit.', 'Log in to save hotels to favorites.'))) return;
                        context.read<AuthBloc>().add(AuthFavoriteToggled(h.id));
                        showSnack(context, fav ? tr('Dihapus dari favorit', 'Removed from favorites') : tr('Ditambahkan ke favorit', 'Added to favorites'),
                            kind: fav ? SnackKind.info : SnackKind.success);
                      }, color: fav ? MC.danger : MC.ink),
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
                            Icon(Icons.location_on_rounded, size: 15, color: MC.inkFaint),
                            const SizedBox(width: 4),
                            Text(h.city, style: TextStyle(color: MC.inkMuted)),
                            const SizedBox(width: 8),
                            StarRow(h.starRating),
                          ]),
                          const SizedBox(height: 8),
                          Row(children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                              decoration: BoxDecoration(color: MC.primarySoft, borderRadius: BorderRadius.circular(8)),
                              child: Row(mainAxisSize: MainAxisSize.min, children: [
                                Icon(_propIcon(h.propertyType), size: 13, color: MC.primaryDark),
                                const SizedBox(width: 4),
                                Text(PropertyType.label(h.propertyType), style: const TextStyle(color: MC.primaryDark, fontSize: 11.5, fontWeight: FontWeight.w700)),
                              ]),
                            ),
                            const SizedBox(width: 10),
                            Expanded(child: Text('${rupiah(h.priceFrom)} · (${h.reviewCount} ulasan)',
                                style: const TextStyle(color: MC.primaryDark, fontWeight: FontWeight.w700))),
                          ]),
                          if (h.priceBefore != null && h.priceBefore! > h.priceFrom) ...[
                            const SizedBox(height: 6),
                            Row(children: [
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                decoration: BoxDecoration(color: MC.success.withOpacity(0.12), borderRadius: BorderRadius.circular(6)),
                                child: Row(mainAxisSize: MainAxisSize.min, children: [
                                  const Icon(Icons.trending_down_rounded, size: 13, color: MC.success),
                                  const SizedBox(width: 3),
                                  Text('Harga turun ${(100 - h.priceFrom / h.priceBefore! * 100).round()}%',
                                      style: const TextStyle(color: MC.success, fontSize: 11, fontWeight: FontWeight.w700)),
                                ]),
                              ),
                              const SizedBox(width: 8),
                              Text(rupiah(h.priceBefore!), style: TextStyle(color: MC.inkFaint, fontSize: 12, decoration: TextDecoration.lineThrough)),
                            ]),
                          ],
                          const SizedBox(height: 8),
                          Row(children: [
                            const Icon(Icons.visibility_rounded, size: 13, color: MC.accent),
                            const SizedBox(width: 4),
                            Text('${3 + h.id.hashCode.abs() % 12} orang sedang melihat',
                                style: TextStyle(color: MC.inkMuted, fontSize: 11.5, fontWeight: FontWeight.w500)),
                            if (_lowestStock(h) != null && _lowestStock(h)! <= 5) ...[
                              const SizedBox(width: 12),
                              const Icon(Icons.local_fire_department_rounded, size: 13, color: MC.danger),
                              const SizedBox(width: 3),
                              Text('Tinggal ${_lowestStock(h)} kamar', style: const TextStyle(color: MC.danger, fontSize: 11.5, fontWeight: FontWeight.w700)),
                            ],
                          ]),
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
                              style: TextStyle(color: MC.inkMuted, height: 1.5, fontSize: 13.5)),
                          GestureDetector(
                            onTap: () => setState(() => _descExpanded = !_descExpanded),
                            child: Padding(
                              padding: const EdgeInsets.only(top: 4),
                              child: Text(_descExpanded ? 'Tutup' : 'Baca selengkapnya',
                                  style: const TextStyle(color: MC.primary, fontWeight: FontWeight.w600, fontSize: 13)),
                            ),
                          ),
                          if (h.lat != null && h.lng != null) ...[
                            const SizedBox(height: 22),
                            const Text('Lokasi', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                            const SizedBox(height: 12),
                            HotelLocationMap(hotel: h),
                          ],
                          if (h.nearby.isNotEmpty) ...[
                            const SizedBox(height: 22),
                            const Text('Yang ada di sekitar', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                            const SizedBox(height: 12),
                            for (final n in h.nearby) _nearbyRow(n),
                          ],
                          const SizedBox(height: 22),
                          SectionHeader('Ulasan Tamu', action: 'Tampilkan semua',
                              onAction: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ReviewsScreen(hotel: h)))),
                          const SizedBox(height: 12),
                          if (_hasScores(h)) ...[
                            _reviewScores(h),
                            const SizedBox(height: 14),
                          ],
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
                        Text('Mulai dari', style: TextStyle(fontSize: 11, color: MC.inkFaint)),
                        Text(rupiah(h.priceFrom), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: MC.primaryDark)),
                      ]),
                      const SizedBox(width: 16),
                      Expanded(child: PrimaryButton('Pilih Kamar', onPressed: () {
                          if (!ensureLoggedIn(context, reason: tr('Masuk dulu untuk memesan kamar.', 'Log in to book a room.'))) return;
                          Navigator.push(context, MaterialPageRoute(builder: (_) => PilihKamarScreen(
                                hotel: h,
                                channelId: _bestOffer(h)?.channelId,
                              )));
                        })),
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

  Widget _circleBtn(IconData icon, VoidCallback onTap, {Color? color}) => Padding(
        padding: const EdgeInsets.all(8),
        child: GestureDetector(
          onTap: onTap,
          child: Container(
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.9), shape: BoxShape.circle),
            child: Icon(icon, color: color ?? MC.ink, size: 22),
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
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(r.authorName, style: const TextStyle(fontWeight: FontWeight.w600)),
              if (r.verified) Row(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.verified_rounded, size: 12, color: MC.success),
                const SizedBox(width: 3),
                Text('Menginap terverifikasi', style: TextStyle(fontSize: 10.5, color: MC.success, fontWeight: FontWeight.w600)),
              ]),
            ])),
            RatingPill(r.rating, small: true),
          ]),
          const SizedBox(height: 8),
          Text(r.body, style: TextStyle(color: MC.inkMuted, fontSize: 12.5, height: 1.5)),
          if (r.photos.isNotEmpty) ...[
            const SizedBox(height: 8),
            SizedBox(height: 64, child: ListView.separated(
              scrollDirection: Axis.horizontal, itemCount: r.photos.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (_, i) => ClipRRect(borderRadius: BorderRadius.circular(8), child: NetImage(r.photos[i], width: 64, height: 64)),
            )),
          ],
          if ((r.reply ?? '').isNotEmpty) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(11),
              decoration: BoxDecoration(color: MC.primarySoft, borderRadius: BorderRadius.circular(11)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  const Icon(Icons.storefront_rounded, size: 13, color: MC.primaryDark),
                  const SizedBox(width: 5),
                  Text('Balasan Hotel', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: MC.primaryDark)),
                ]),
                const SizedBox(height: 5),
                Text(r.reply!, style: const TextStyle(fontSize: 12.5, height: 1.5, fontWeight: FontWeight.w500)),
              ]),
            ),
          ],
        ]),
      );

  static const _scoreLabels = {
    'cleanliness': 'Kebersihan', 'location': 'Lokasi', 'staff': 'Staf',
    'facilities': 'Fasilitas', 'comfort': 'Kenyamanan', 'value': 'Nilai',
  };
  bool _hasScores(Hotel h) => h.reviewScores.values.any((v) => v != null);
  int? _lowestStock(Hotel h) {
    final stocks = h.rooms.map((r) => r.stock).where((s) => s > 0).toList();
    return stocks.isEmpty ? null : stocks.reduce((a, b) => a < b ? a : b);
  }

  Widget _reviewScores(Hotel h) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: MC.surface, borderRadius: BorderRadius.circular(14), boxShadow: [softShadow]),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Skor per kategori', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
          const SizedBox(height: 10),
          Wrap(spacing: 18, runSpacing: 12, children: [
            for (final e in _scoreLabels.entries)
              if (h.reviewScores[e.key] != null)
                SizedBox(width: 150, child: Row(children: [
                  Expanded(child: Text(e.value, style: TextStyle(fontSize: 12, color: MC.inkMuted))),
                  const SizedBox(width: 6),
                  Text(h.reviewScores[e.key]!.toStringAsFixed(1), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5, color: MC.primaryDark)),
                  const SizedBox(width: 6),
                  Expanded(child: ClipRRect(borderRadius: BorderRadius.circular(3),
                    child: LinearProgressIndicator(value: (h.reviewScores[e.key]! / 10).clamp(0, 1), minHeight: 5, backgroundColor: MC.field, color: MC.primary))),
                ])),
          ]),
        ]),
      );

  Widget _nearbyRow(HotelNearby n) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Row(children: [
          Container(width: 30, height: 30, decoration: BoxDecoration(color: MC.primarySoft, borderRadius: BorderRadius.circular(8)),
            child: Icon(_nearbyIcon(n.category), size: 16, color: MC.primaryDark)),
          const SizedBox(width: 10),
          Expanded(child: Text(n.name, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500))),
          Text('${n.distanceKm.toStringAsFixed(1)} km', style: TextStyle(fontSize: 12.5, color: MC.inkMuted, fontWeight: FontWeight.w600)),
        ]),
      );

  IconData _propIcon(String t) => switch (t) {
        'VILLA' => Icons.villa_rounded,
        'APARTMENT' => Icons.apartment_rounded,
        'HOMESTAY' => Icons.house_rounded,
        'GUESTHOUSE' => Icons.cottage_rounded,
        'HOSTEL' => Icons.bed_rounded,
        'RESORT' => Icons.beach_access_rounded,
        _ => Icons.hotel_rounded,
      };
  IconData _nearbyIcon(String c) => switch (c) {
        'AIRPORT' => Icons.local_airport_rounded,
        'STATION' => Icons.train_rounded,
        'MALL' => Icons.local_mall_rounded,
        'BEACH' => Icons.beach_access_rounded,
        'HOSPITAL' => Icons.local_hospital_rounded,
        'RESTAURANT' => Icons.restaurant_rounded,
        'LANDMARK' => Icons.location_city_rounded,
        _ => Icons.place_rounded,
      };

  Widget _checkTime(String label, String value, IconData icon) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: MC.primarySoft, borderRadius: BorderRadius.circular(14)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, color: MC.primaryDark, size: 20),
          const SizedBox(height: 8),
          Text(label, style: TextStyle(fontSize: 12, color: MC.inkMuted)),
          const SizedBox(height: 2),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
        ]),
      );
}

/// Mini map on the hotel detail with the hotel marker + auto distance from the
/// user's GPS location. Tapping opens the full-screen map.
class HotelLocationMap extends StatefulWidget {
  final Hotel hotel;
  const HotelLocationMap({super.key, required this.hotel});
  @override
  State<HotelLocationMap> createState() => _HotelLocationMapState();
}

class _HotelLocationMapState extends State<HotelLocationMap> {
  double? _distanceKm;
  bool _resolving = true;

  @override
  void initState() {
    super.initState();
    _autoDistance();
  }

  // Auto-compute distance only if location permission is already granted — no nag.
  Future<void> _autoDistance() async {
    try {
      final perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.always || perm == LocationPermission.whileInUse) {
        final pos = await Geolocator.getCurrentPosition(
            desiredAccuracy: LocationAccuracy.medium, timeLimit: const Duration(seconds: 10));
        final d = Geolocator.distanceBetween(pos.latitude, pos.longitude, widget.hotel.lat!, widget.hotel.lng!) / 1000;
        if (mounted) setState(() => _distanceKm = d);
      }
    } catch (_) {}
    if (mounted) setState(() => _resolving = false);
  }

  Future<void> _enableDistance() async {
    final pos = await getMyLocation(context);
    if (pos == null || !mounted) return;
    final d = Geolocator.distanceBetween(pos.latitude, pos.longitude, widget.hotel.lat!, widget.hotel.lng!) / 1000;
    setState(() => _distanceKm = d);
    showSnack(context, 'Sekitar ${d < 1 ? '${(d * 1000).round()} m' : '${d.toStringAsFixed(1)} km'} dari lokasimu.', kind: SnackKind.info);
  }

  @override
  Widget build(BuildContext context) {
    final point = LatLng(widget.hotel.lat!, widget.hotel.lng!);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: SizedBox(
          height: 170,
          child: Stack(children: [
            FlutterMap(
              options: MapOptions(
                initialCenter: point,
                initialZoom: 14,
                interactionOptions: const InteractionOptions(flags: InteractiveFlag.none),
              ),
              children: [
                TileLayer(urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', userAgentPackageName: 'id.gokar.miruum'),
                MarkerLayer(markers: [
                  Marker(
                    point: point, width: 44, height: 44,
                    child: const Icon(Icons.location_on, color: MC.primary, size: 40),
                  ),
                ]),
              ],
            ),
            Positioned.fill(
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => MapScreen(hotels: [widget.hotel]))),
                  child: Align(
                    alignment: Alignment.bottomRight,
                    child: Container(
                      margin: const EdgeInsets.all(10),
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                      decoration: BoxDecoration(color: MC.surface, borderRadius: BorderRadius.circular(20), boxShadow: [softShadow]),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        const Icon(Icons.map_rounded, size: 14, color: MC.primary),
                        const SizedBox(width: 6),
                        Text('Buka peta', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: MC.ink)),
                      ]),
                    ),
                  ),
                ),
              ),
            ),
          ]),
        ),
      ),
      const SizedBox(height: 12),
      Row(children: [
        Container(
          width: 38, height: 38,
          decoration: BoxDecoration(color: MC.primarySoft, borderRadius: BorderRadius.circular(11)),
          child: const Icon(Icons.place_rounded, color: MC.primaryDark, size: 20),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(widget.hotel.city, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
            const SizedBox(height: 1),
            Text(widget.hotel.address, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: MC.inkMuted, fontSize: 12)),
          ]),
        ),
        const SizedBox(width: 8),
        if (_distanceKm != null)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 7),
            decoration: BoxDecoration(color: MC.primarySoft, borderRadius: BorderRadius.circular(20)),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.near_me_rounded, size: 13, color: MC.primaryDark),
              const SizedBox(width: 5),
              Text(_distanceKm! < 1 ? '${(_distanceKm! * 1000).round()} m' : '${_distanceKm!.toStringAsFixed(1)} km',
                  style: const TextStyle(color: MC.primaryDark, fontWeight: FontWeight.w800, fontSize: 12.5)),
            ]),
          )
        else if (!_resolving)
          GestureDetector(
            onTap: _enableDistance,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 7),
              decoration: BoxDecoration(border: Border.all(color: MC.primary), borderRadius: BorderRadius.circular(20)),
              child: Row(mainAxisSize: MainAxisSize.min, children: const [
                Icon(Icons.my_location_rounded, size: 13, color: MC.primary),
                SizedBox(width: 5),
                Text('Cek jarak', style: TextStyle(color: MC.primary, fontWeight: FontWeight.w700, fontSize: 12.5)),
              ]),
            ),
          ),
      ]),
    ]);
  }
}
