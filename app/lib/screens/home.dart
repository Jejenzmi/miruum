import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:shared_preferences/shared_preferences.dart';
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
import 'auth.dart';
import 'hotel_detail.dart';
import 'chat_screen.dart';
import 'menu_hotel.dart';
import 'notifikasi.dart';
import 'package_list.dart';
import 'results.dart';
import 'tour_list.dart';
import 'shuttle.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (ctx) => HomeCubit(ctx.read<Api>())..load(),
      child: const _HomeView(),
    );
  }
}

class _HomeView extends StatelessWidget {
  const _HomeView();

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthBloc>().state;
    return Scaffold(
      backgroundColor: MC.bg,
      body: RefreshIndicator(
        onRefresh: () => context.read<HomeCubit>().load(),
        child: BlocBuilder<HomeCubit, ViewState<HomeData>>(
          builder: (context, state) {
            if (state.isLoading) {
              return const Center(child: CircularProgressIndicator(color: MC.primary));
            }
            if (state.isFailure) {
              return _ErrorState(onRetry: () => context.read<HomeCubit>().load());
            }
            final data = state.data!;
            return ListView(
              padding: EdgeInsets.zero,
              children: [
                _header(context, auth),
                const SizedBox(height: 20),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: SectionHeader(tr('Promo Terbaru', 'Latest Promos'), action: tr('Lihat semua', 'See all'),
                      onAction: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ResultsScreen(title: tr('Promo Hotel', 'Hotel Promos'), promoOnly: true)))),
                ),
                const SizedBox(height: 12),
                _promoCarousel(data.banners).animate().fadeIn(delay: 100.ms, duration: 400.ms).slideX(begin: 0.1, end: 0),
                const SizedBox(height: 20),
                Padding(padding: const EdgeInsets.symmetric(horizontal: 20), child: _categoryTiles(context))
                    .animate().fadeIn(delay: 200.ms, duration: 400.ms).slideY(begin: 0.15, end: 0),
                const _RecentlyViewedSection(),
                const SizedBox(height: 22),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: SectionHeader(tr('Rekomendasi Hotel', 'Recommended Hotels'), action: tr('Lihat semua', 'See all'),
                      onAction: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ResultsScreen(title: tr('Rekomendasi Hotel', 'Recommended Hotels'))))),
                ),
                const SizedBox(height: 12),
                _recommendationGrid(context, data.recommended).animate().fadeIn(delay: 300.ms, duration: 450.ms),
                _ProgramRail(type: 'PROMO', title: tr('Promo Spesial', 'Special Promo')),
                _ProgramRail(type: 'CAMPAIGN', title: tr('Campaign', 'Campaign')),
                const SizedBox(height: 24),
              ],
            );
          },
        ),
      ),
    );
  }

  // ── Orange rounded header ──
  Widget _header(BuildContext context, AuthState auth) {
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 22),
      decoration: const BoxDecoration(
        gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [MC.headerTop, MC.headerBottom]),
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(28)),
      ),
      child: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 6),
            Row(
              children: [
                Expanded(
                  child: Text(
                    auth.isLoggedIn ? tr('Halo, ${auth.user!.name} 👋', 'Hi, ${auth.user!.name} 👋') : tr('Selamat datang di Miruum', 'Welcome to Miruum'),
                    style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w500),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                GestureDetector(
                  onTap: () async {
                    if (await ensureLoggedIn(context)) {
                      if (context.mounted) Navigator.push(context, MaterialPageRoute(builder: (_) => const ChatScreen()));
                    }
                  },
                  child: Container(
                    width: 38, height: 38,
                    margin: const EdgeInsets.only(right: 8),
                    decoration: BoxDecoration(color: Colors.white.withOpacity(0.22), borderRadius: BorderRadius.circular(12)),
                    child: const Icon(Icons.chat_bubble_outline_rounded, color: Colors.white, size: 19),
                  ),
                ),
                GestureDetector(
                  onTap: () async {
                    if (await ensureLoggedIn(context)) {
                      if (context.mounted) Navigator.push(context, MaterialPageRoute(builder: (_) => const NotifikasiScreen()));
                    }
                  },
                  child: Container(
                    width: 38, height: 38,
                    decoration: BoxDecoration(color: Colors.white.withOpacity(0.22), borderRadius: BorderRadius.circular(12)),
                    child: const Icon(Icons.notifications_none_rounded, color: Colors.white, size: 20),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Text(tr('Yuk pilih hotel\nsesukamu', 'Pick the hotel\nyou love'),
                style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w800, height: 1.15)),
            const SizedBox(height: 16),
            GestureDetector(
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const MenuHotelScreen())),
              child: Container(
                height: 50,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), boxShadow: [softShadow]),
                child: Row(children: [
                  const Icon(Icons.search_rounded, color: MC.primary),
                  SizedBox(width: 10),
                  Text(tr('Cari hotel', 'Search hotels'), style: TextStyle(color: MC.inkFaint, fontSize: 15)),
                ]),
              ),
            ),
            const SizedBox(height: 12),
            const _NearMeButton(),
            const _MarketToggle(),
            if (!auth.isLoggedIn) ...[
              const SizedBox(height: 14),
              Row(children: [
                Expanded(child: _headerBtn(context, tr('Login', 'Login'), Icons.login_rounded, false, const SignInScreen())),
                const SizedBox(width: 12),
                Expanded(child: _headerBtn(context, tr('Registrasi', 'Register'), Icons.person_add_alt_1_rounded, true, const SignUpScreen())),
              ]),
            ],
          ],
        ),
      ),
    );
  }

  Widget _headerBtn(BuildContext context, String label, IconData icon, bool filled, Widget page) {
    return SizedBox(
      height: 40,
      child: filled
          ? ElevatedButton.icon(
              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => page)),
              icon: Icon(icon, size: 17),
              label: Text(label),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.white, foregroundColor: MC.primaryDark, elevation: 0,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
                textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5),
              ),
            )
          : OutlinedButton.icon(
              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => page)),
              icon: Icon(icon, size: 17, color: Colors.white),
              label: Text(label, style: const TextStyle(color: Colors.white)),
              style: OutlinedButton.styleFrom(
                side: const BorderSide(color: Colors.white70),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
                textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5),
              ),
            ),
    );
  }

  // ── Category tiles: Hotel + Hotel Package (per mockup) ──
  Widget _categoryTiles(BuildContext context) => ValueListenableBuilder<Map<String, bool>>(
        valueListenable: AppSettings.modules,
        builder: (context, mods, _) {
          final tiles = <Widget>[
            _categoryTile(context, tr('Hotel', 'Hotel'), Icons.apartment_rounded, MC.blue, const MenuHotelScreen()),
            if (mods['hotelPackage'] ?? true)
              _categoryTile(context, tr('Paket Hotel', 'Hotel Package'), Icons.card_giftcard_rounded, MC.primary, const PackageListScreen()),
            if (mods['tour'] ?? true)
              _categoryTile(context, tr('Tur', 'Tour'), Icons.travel_explore_rounded, MC.success, const TourListScreen()),
            if (mods['shuttle'] ?? true)
              _categoryTile(context, tr('Shuttle Bandara', 'Airport Shuttle'), Icons.local_airport_rounded, MC.accent, const ShuttleScreen()),
          ];
          // 2 per row.
          final rows = <Widget>[];
          for (var i = 0; i < tiles.length; i += 2) {
            rows.add(Row(children: [
              Expanded(child: tiles[i]),
              const SizedBox(width: 14),
              if (i + 1 < tiles.length) Expanded(child: tiles[i + 1]) else const Expanded(child: SizedBox()),
            ]));
            if (i + 2 < tiles.length) rows.add(const SizedBox(height: 12));
          }
          return Column(children: rows);
        },
      );

  Widget _categoryTile(BuildContext context, String label, IconData icon, Color color, Widget page) =>
      GestureDetector(
        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => page)),
        child: Container(
          height: 64,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(16), boxShadow: [softShadow]),
          child: Row(children: [
            Container(
              width: 38, height: 38,
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10)),
              child: Icon(icon, color: color, size: 22),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(label, maxLines: 2, overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13.5, height: 1.1)),
            ),
          ]),
        ),
      );

  // ── Promo Terbaru (admin-managed banners) ──
  Widget _promoCarousel(List<PromoBanner> banners) => SizedBox(
        height: 150,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 20),
          itemCount: banners.length,
          separatorBuilder: (_, __) => const SizedBox(width: 12),
          itemBuilder: (context, i) {
            final b = banners[i];
            return Container(
              width: 290,
              clipBehavior: Clip.antiAlias,
              decoration: BoxDecoration(borderRadius: BorderRadius.circular(18), boxShadow: [softShadow]),
              child: Stack(fit: StackFit.expand, children: [
                NetImage(b.imageUrl),
                Container(decoration: BoxDecoration(
                    gradient: LinearGradient(colors: [Colors.black.withOpacity(0.55), Colors.black.withOpacity(0.05)]))),
                Positioned(
                  left: 14, top: 14, bottom: 14, right: b.badge != null ? 90 : 14,
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
                    Text(b.title, maxLines: 1, overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16)),
                    const SizedBox(height: 4),
                    Text(b.subtitle, maxLines: 2, overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: Colors.white70, fontSize: 11.5)),
                  ]),
                ),
                if (b.badge != null)
                  Positioned(
                    right: 14, top: 0, bottom: 0,
                    child: Center(
                      child: Container(
                        width: 60, height: 60,
                        decoration: const BoxDecoration(color: MC.accent, shape: BoxShape.circle),
                        child: Center(child: Text(b.badge!, textAlign: TextAlign.center,
                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 15))),
                      ),
                    ),
                  ),
              ]),
            );
          },
        ),
      );

  // ── Rekomendasi Hotel (2-column vertical cards) ──
  Widget _recommendationGrid(BuildContext context, List<Hotel> hotels) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2, crossAxisSpacing: 14, mainAxisSpacing: 14, childAspectRatio: 0.68),
          itemCount: hotels.length,
          itemBuilder: (context, i) => _VerticalHotelCard(hotels[i]),
        ),
      );

}

class _VerticalHotelCard extends StatelessWidget {
  final Hotel hotel;
  const _VerticalHotelCard(this.hotel);
  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthBloc>().state;
    final fav = auth.isFavorite(hotel.id);
    return GestureDetector(
      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => HotelDetailScreen(hotel.id))),
      child: Container(
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(color: MC.surface, borderRadius: BorderRadius.circular(16), boxShadow: [softShadow]),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Stack(children: [
            NetImage(hotel.imageUrl, width: double.infinity, height: 104),
            if (auth.isLoggedIn)
              Positioned(
                right: 8, top: 8,
                child: GestureDetector(
                  onTap: () => context.read<AuthBloc>().add(AuthFavoriteToggled(hotel.id)),
                  child: Container(
                    padding: const EdgeInsets.all(5),
                    decoration: BoxDecoration(color: Colors.white.withOpacity(0.9), shape: BoxShape.circle),
                    child: Icon(fav ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                        size: 15, color: fav ? MC.danger : MC.inkFaint),
                  ),
                ),
              ),
          ]),
          Padding(
            padding: const EdgeInsets.all(10),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(hotel.name, maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
              const SizedBox(height: 3),
              Row(children: [
                Icon(Icons.location_on_rounded, size: 12, color: MC.inkFaint),
                const SizedBox(width: 2),
                Expanded(child: Text(hotel.city, maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: MC.inkMuted, fontSize: 11))),
              ]),
              const SizedBox(height: 6),
              Row(children: [
                const Icon(Icons.star_rounded, color: MC.star, size: 14),
                const SizedBox(width: 2),
                Text(hotel.rating.toStringAsFixed(1), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12)),
              ]),
              const SizedBox(height: 4),
              RichText(text: TextSpan(style: const TextStyle(color: MC.primaryDark), children: [
                TextSpan(text: rupiah(hotel.priceFrom), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
                TextSpan(text: tr('/mlm', '/night'), style: TextStyle(fontSize: 10, color: MC.inkFaint)),
              ])),
            ]),
          ),
        ]),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  final VoidCallback onRetry;
  const _ErrorState({required this.onRetry});
  @override
  Widget build(BuildContext context) => Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.cloud_off_rounded, size: 48, color: MC.inkFaint),
          const SizedBox(height: 12),
          Text(tr('Gagal memuat data', 'Failed to load data'), style: TextStyle(color: MC.inkMuted)),
          const SizedBox(height: 12),
          OutlineButtonX(tr('Coba lagi', 'Try again'), onPressed: onRetry, icon: Icons.refresh_rounded),
        ]),
      );
}

/// "Cari di sekitar saya" — reads GPS then opens results sorted by distance.
/// Browsing is open to everyone, so this does NOT require login.
// Nationality (market) pricing selector — Domestik/Asing. Shown only when the
// admin enabled it. Switching re-keys the app so every screen re-prices.
class _MarketToggle extends StatelessWidget {
  const _MarketToggle();

  Future<void> _set(String m) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('miruum_market', m);
    AppSettings.marketChosen = true;
    AppSettings.market.value = m; // re-keys the navigator → re-fetches prices
  }

  @override
  Widget build(BuildContext context) {
    if (!AppSettings.marketEnabled) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: ValueListenableBuilder<String>(
        valueListenable: AppSettings.market,
        builder: (context, market, _) {
          Widget seg(String value, String label, IconData icon) {
            final on = market == value;
            return Expanded(
              child: GestureDetector(
                onTap: on ? null : () => _set(value),
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 9),
                  decoration: BoxDecoration(
                    color: on ? Colors.white : Colors.transparent,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                    Icon(icon, size: 15, color: on ? MC.primary : Colors.white),
                    const SizedBox(width: 5),
                    Text(label, style: TextStyle(color: on ? MC.primary : Colors.white, fontSize: 12.5, fontWeight: FontWeight.w700)),
                  ]),
                ),
              ),
            );
          }
          return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              const Icon(Icons.public_rounded, color: Colors.white, size: 14),
              const SizedBox(width: 5),
              Text(tr('Tarif tamu', 'Guest rate'), style: const TextStyle(color: Colors.white, fontSize: 11.5, fontWeight: FontWeight.w600)),
              if (AppSettings.marketMarkup > 0) ...[
                const Spacer(),
                Text(tr('Asing +${AppSettings.marketMarkup}%', 'Foreign +${AppSettings.marketMarkup}%'),
                    style: TextStyle(color: Colors.white.withOpacity(0.85), fontSize: 11)),
              ],
            ]),
            const SizedBox(height: 6),
            Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(color: Colors.white.withOpacity(0.14), borderRadius: BorderRadius.circular(13)),
              child: Row(children: [
                seg('DOMESTIC', tr('Domestik', 'Local'), Icons.flag_rounded),
                const SizedBox(width: 4),
                seg('FOREIGN', tr('Asing', 'Foreign'), Icons.language_rounded),
              ]),
            ),
          ]);
        },
      ),
    );
  }
}

class _NearMeButton extends StatefulWidget {
  const _NearMeButton();
  @override
  State<_NearMeButton> createState() => _NearMeButtonState();
}

class _NearMeButtonState extends State<_NearMeButton> {
  bool _busy = false;

  Future<void> _go() async {
    if (_busy) return;
    setState(() => _busy = true);
    final pos = await getMyLocation(context);
    if (mounted) setState(() => _busy = false);
    if (pos == null || !mounted) return;
    Navigator.push(context, MaterialPageRoute(builder: (_) => ResultsScreen(
      title: tr('Hotel di Sekitarmu', 'Hotels Near You'),
      nearLat: pos.latitude,
      nearLng: pos.longitude,
    )));
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: _go,
      child: Container(
        height: 46,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.16),
          borderRadius: BorderRadius.circular(13),
          border: Border.all(color: Colors.white.withOpacity(0.35)),
        ),
        child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          _busy
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : const Icon(Icons.my_location_rounded, color: Colors.white, size: 19),
          const SizedBox(width: 10),
          Text(_busy ? tr('Mencari lokasi…', 'Finding location…') : tr('Cari hotel di sekitar saya', 'Find hotels near me'),
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 14)),
        ]),
      ),
    );
  }
}

/// Home rail that shows Miruum PROGRAMS of a given type (PROMO / CAMPAIGN) and
/// the hotels participating in each — so Promo & Campaign are clearly distinct.
class _ProgramRail extends StatefulWidget {
  final String type, title;
  const _ProgramRail({required this.type, required this.title});
  @override
  State<_ProgramRail> createState() => _ProgramRailState();
}

class _ProgramRailState extends State<_ProgramRail> {
  late Future<List<Program>> _future;
  @override
  void initState() {
    super.initState();
    _future = context.read<Api>().programs(widget.type);
  }

  @override
  Widget build(BuildContext context) {
    final campaign = widget.type == 'CAMPAIGN';
    return FutureBuilder<List<Program>>(
      future: _future,
      builder: (context, snap) {
        final programs = (snap.data ?? []).where((p) => p.hotels.isNotEmpty).toList();
        if (programs.isEmpty) return const SizedBox.shrink();
        return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const SizedBox(height: 22),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Row(children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                decoration: BoxDecoration(color: campaign ? MC.blue.withOpacity(.12) : MC.primary.withOpacity(.12), borderRadius: BorderRadius.circular(8)),
                child: Text(campaign ? tr('KAMPANYE', 'CAMPAIGN') : tr('PROMO', 'PROMO'), style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: .5, color: campaign ? MC.blue : MC.primaryDark)),
              ),
              const SizedBox(width: 8),
              Text(widget.title, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
            ]),
          ),
          for (final p in programs) _programBlock(context, p, campaign),
        ]);
      },
    );
  }

  Widget _programBlock(BuildContext context, Program p, bool campaign) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 2),
        child: Row(children: [
          Expanded(child: Text(p.title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14))),
          if (p.discountPct > 0)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
              decoration: BoxDecoration(color: MC.danger, borderRadius: BorderRadius.circular(20)),
              child: Text('-${p.discountPct}%', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800)),
            ),
        ]),
      ),
      Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 4),
        child: Text(p.description, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(color: MC.inkMuted, fontSize: 12, height: 1.35)),
      ),
      SizedBox(
        height: 176,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 4),
          itemCount: p.hotels.length,
          separatorBuilder: (_, __) => const SizedBox(width: 12),
          itemBuilder: (_, i) => _programHotelTile(context, p.hotels[i], campaign),
        ),
      ),
    ]);
  }

  Widget _programHotelTile(BuildContext context, Hotel h, bool campaign) {
    return GestureDetector(
      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => HotelDetailScreen(h.id))),
      child: Container(
        width: 178,
        decoration: BoxDecoration(color: MC.surface, borderRadius: BorderRadius.circular(16), boxShadow: [softShadow]),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          ClipRRect(
            borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
            child: Stack(children: [
              SizedBox(height: 96, width: 178, child: NetImage(h.imageUrl)),
              Positioned(top: 8, left: 8, child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: (campaign ? MC.blue : MC.primary).withOpacity(.92), borderRadius: BorderRadius.circular(20)),
                child: Text(campaign ? tr('Kampanye', 'Campaign') : tr('Promo', 'Promo'), style: const TextStyle(color: Colors.white, fontSize: 9.5, fontWeight: FontWeight.w700)),
              )),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(11, 9, 11, 11),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(h.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
              const SizedBox(height: 2),
              Row(children: [
                Icon(Icons.location_on_rounded, size: 12, color: MC.inkFaint),
                const SizedBox(width: 2),
                Expanded(child: Text(h.city, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: MC.inkMuted, fontSize: 11))),
              ]),
              const SizedBox(height: 6),
              Row(children: [
                Flexible(
                  child: FittedBox(
                    fit: BoxFit.scaleDown, alignment: Alignment.centerLeft,
                    child: Text(rupiah(h.priceFrom), maxLines: 1, style: const TextStyle(color: MC.primaryDark, fontWeight: FontWeight.w800, fontSize: 13)),
                  ),
                ),
                Text(tr(' /mlm', ' /night'), style: TextStyle(color: MC.inkFaint, fontSize: 10)),
              ]),
            ]),
          ),
        ]),
      ),
    );
  }
}

/// Horizontal "Baru dilihat" strip — the hotels the user recently opened.
class _RecentlyViewedSection extends StatefulWidget {
  const _RecentlyViewedSection();
  @override
  State<_RecentlyViewedSection> createState() => _RecentlyViewedSectionState();
}

class _RecentlyViewedSectionState extends State<_RecentlyViewedSection> {
  List<Hotel> _hotels = [];
  @override
  void initState() {
    super.initState();
    if (context.read<AuthBloc>().state.isLoggedIn) {
      context.read<Api>().recentlyViewed().then((h) {
        if (mounted) setState(() => _hotels = h);
      }).catchError((_) {});
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_hotels.isEmpty) return const SizedBox.shrink();
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const SizedBox(height: 22),
      Padding(padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Text(tr('Baru dilihat', 'Recently viewed'), style: const TextStyle(fontSize: 16.5, fontWeight: FontWeight.w700))),
      const SizedBox(height: 12),
      SizedBox(height: 168, child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 20),
        itemCount: _hotels.length,
        separatorBuilder: (_, __) => const SizedBox(width: 12),
        itemBuilder: (_, i) {
          final h = _hotels[i];
          return GestureDetector(
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => HotelDetailScreen(h.id))),
            child: SizedBox(width: 150, child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              ClipRRect(borderRadius: BorderRadius.circular(14), child: NetImage(h.imageUrl, width: 150, height: 100)),
              const SizedBox(height: 6),
              Text(h.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
              Text(h.city, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: MC.inkFaint, fontSize: 11)),
              Text(rupiah(h.priceFrom), style: const TextStyle(color: MC.primaryDark, fontWeight: FontWeight.w800, fontSize: 12.5)),
            ])),
          );
        },
      )),
    ]);
  }
}
