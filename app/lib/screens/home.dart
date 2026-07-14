import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../api.dart';
import '../bloc/auth/auth_bloc.dart';
import '../bloc/cubits.dart';
import '../bloc/view_state.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets.dart';
import 'auth.dart';
import 'hotel_detail.dart';
import 'menu_hotel.dart';
import 'notifikasi.dart';
import 'package_list.dart';
import 'results.dart';

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
                  child: SectionHeader('Promo Terbaru', action: 'Lihat semua', onAction: () {}),
                ),
                const SizedBox(height: 12),
                _promoCarousel(data.banners).animate().fadeIn(delay: 100.ms, duration: 400.ms).slideX(begin: 0.1, end: 0),
                const SizedBox(height: 20),
                Padding(padding: const EdgeInsets.symmetric(horizontal: 20), child: _categoryTiles(context))
                    .animate().fadeIn(delay: 200.ms, duration: 400.ms).slideY(begin: 0.15, end: 0),
                const SizedBox(height: 22),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: SectionHeader('Rekomendasi Hotel', action: 'Lihat semua',
                      onAction: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ResultsScreen(title: 'Rekomendasi Hotel')))),
                ),
                const SizedBox(height: 12),
                _recommendationGrid(context, data.recommended).animate().fadeIn(delay: 300.ms, duration: 450.ms),
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
                    auth.isLoggedIn ? 'Halo, ${auth.user!.name} 👋' : 'Selamat datang di Miruum',
                    style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w500),
                    overflow: TextOverflow.ellipsis,
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
            const Text('Yuk pilih hotel\nsesukamu',
                style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w800, height: 1.15)),
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
                  Text('Cari hotel', style: TextStyle(color: MC.inkFaint, fontSize: 15)),
                ]),
              ),
            ),
            if (!auth.isLoggedIn) ...[
              const SizedBox(height: 14),
              Row(children: [
                Expanded(child: _headerBtn(context, 'Login', Icons.login_rounded, false, const SignInScreen())),
                const SizedBox(width: 12),
                Expanded(child: _headerBtn(context, 'Registrasi', Icons.person_add_alt_1_rounded, true, const SignUpScreen())),
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
  Widget _categoryTiles(BuildContext context) => Row(children: [
        Expanded(
          child: _categoryTile(
            context, 'Hotel', Icons.apartment_rounded, MC.blue,
            const MenuHotelScreen(),
          ),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: _categoryTile(
            context, 'Hotel Package', Icons.card_giftcard_rounded, MC.primary,
            const PackageListScreen(),
          ),
        ),
      ]);

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
                TextSpan(text: '/mlm', style: TextStyle(fontSize: 10, color: MC.inkFaint)),
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
          Text('Gagal memuat data', style: TextStyle(color: MC.inkMuted)),
          const SizedBox(height: 12),
          OutlineButtonX('Coba lagi', onPressed: onRetry, icon: Icons.refresh_rounded),
        ]),
      );
}
