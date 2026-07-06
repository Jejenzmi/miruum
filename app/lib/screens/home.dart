import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../api.dart';
import '../bloc/auth/auth_bloc.dart';
import '../bloc/cubits.dart';
import '../bloc/view_state.dart';
import '../hotel_card.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets.dart';
import 'auth.dart';
import 'menu_hotel.dart';
import 'notifikasi.dart';
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
      body: SafeArea(
        child: RefreshIndicator(
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
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                children: [
                  _header(context, auth),
                  const SizedBox(height: 16),
                  _searchBar(context),
                  const SizedBox(height: 16),
                  if (!auth.isLoggedIn) ...[_guestBanner(context), const SizedBox(height: 16)],
                  _promoHero(),
                  const SizedBox(height: 22),
                  _categories(context),
                  const SizedBox(height: 24),
                  SectionHeader('Promo Terbaru', action: 'Lihat semua', onAction: () {}),
                  const SizedBox(height: 12),
                  _promoCarousel(data.promos),
                  const SizedBox(height: 24),
                  SectionHeader('Rekomendasi Hotel', action: 'Lihat semua',
                      onAction: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ResultsScreen(title: 'Rekomendasi Hotel')))),
                  const SizedBox(height: 12),
                  ...data.recommended.map((h) => Padding(padding: const EdgeInsets.only(bottom: 12), child: HotelCard(h))),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _header(BuildContext context, AuthState auth) {
    final greeting = auth.isLoggedIn ? 'Selamat datang,' : 'Selamat datang di';
    final name = auth.isLoggedIn ? '${auth.user!.name}!' : 'Miruum';
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(greeting, style: const TextStyle(color: MC.inkMuted, fontSize: 13)),
              Text(name, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
            ],
          ),
        ),
        _iconBtn(Icons.notifications_none_rounded, () async {
          if (await ensureLoggedIn(context)) {
            if (context.mounted) Navigator.push(context, MaterialPageRoute(builder: (_) => const NotifikasiScreen()));
          }
        }),
      ],
    );
  }

  Widget _iconBtn(IconData icon, VoidCallback onTap) => GestureDetector(
        onTap: onTap,
        child: Container(
          width: 44, height: 44,
          decoration: BoxDecoration(color: MC.surface, borderRadius: BorderRadius.circular(14), boxShadow: [softShadow]),
          child: Icon(icon, color: MC.ink),
        ),
      );

  Widget _searchBar(BuildContext context) => GestureDetector(
        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const MenuHotelScreen())),
        child: Container(
          height: 52,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          decoration: BoxDecoration(color: MC.surface, borderRadius: BorderRadius.circular(16), boxShadow: [softShadow]),
          child: Row(children: const [
            Icon(Icons.search_rounded, color: MC.inkFaint),
            SizedBox(width: 10),
            Text('Cari hotel', style: TextStyle(color: MC.inkFaint, fontSize: 15)),
          ]),
        ),
      );

  Widget _guestBanner(BuildContext context) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: const LinearGradient(colors: [MC.primaryDark, MC.primary]),
          borderRadius: BorderRadius.circular(18),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Login sekarang dan dapatkan promo terbaik !',
                style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 14)),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(
                child: SizedBox(
                  height: 42,
                  child: ElevatedButton.icon(
                    onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SignUpScreen())),
                    icon: const Icon(Icons.person_add_alt_1_rounded, size: 18),
                    label: const Text('Registrasi'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.white, foregroundColor: MC.primaryDark, elevation: 0,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: SizedBox(
                  height: 42,
                  child: OutlinedButton.icon(
                    onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SignInScreen())),
                    icon: const Icon(Icons.login_rounded, size: 18, color: Colors.white),
                    label: const Text('Login', style: TextStyle(color: Colors.white)),
                    style: OutlinedButton.styleFrom(
                      side: const BorderSide(color: Colors.white70),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
                    ),
                  ),
                ),
              ),
            ]),
          ],
        ),
      );

  Widget _promoHero() => Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          gradient: const LinearGradient(colors: [Color(0xFFF5A623), Color(0xFFF6B94D)]),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: const [
                Text('Save up to', style: TextStyle(color: Colors.white, fontSize: 14)),
                Text('30%', style: TextStyle(color: Colors.white, fontSize: 40, fontWeight: FontWeight.w900, height: 1)),
                SizedBox(height: 4),
                Text('Yuk pilih hotel sesukamu', style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600)),
              ],
            ),
          ),
          Container(
            width: 66, height: 66,
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.25), shape: BoxShape.circle),
            child: const Icon(Icons.local_offer_rounded, color: Colors.white, size: 32),
          ),
        ]),
      );

  Widget _categories(BuildContext context) => Row(children: [
        _catTile(context, 'Hotel', Icons.hotel_rounded, MC.primary, () => Navigator.push(context, MaterialPageRoute(builder: (_) => const MenuHotelScreen()))),
        const SizedBox(width: 14),
        _catTile(context, 'Hotel Package', Icons.card_travel_rounded, MC.accent, () => Navigator.push(context, MaterialPageRoute(builder: (_) => const MenuHotelScreen(package: true)))),
      ]);

  Widget _catTile(BuildContext context, String label, IconData icon, Color color, VoidCallback onTap) => Expanded(
        child: GestureDetector(
          onTap: onTap,
          child: cardBox(
            padding: const EdgeInsets.symmetric(vertical: 18),
            child: Column(children: [
              Container(
                width: 48, height: 48,
                decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(14)),
                child: Icon(icon, color: color, size: 26),
              ),
              const SizedBox(height: 10),
              Text(label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5)),
            ]),
          ),
        ),
      );

  Widget _promoCarousel(List<Promo> promos) => SizedBox(
        height: 150,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: promos.length,
          separatorBuilder: (_, __) => const SizedBox(width: 12),
          itemBuilder: (context, i) {
            final p = promos[i];
            return Container(
              width: 260,
              clipBehavior: Clip.antiAlias,
              decoration: BoxDecoration(borderRadius: BorderRadius.circular(18), boxShadow: [softShadow]),
              child: Stack(fit: StackFit.expand, children: [
                NetImage(p.imageUrl),
                Container(decoration: BoxDecoration(
                    gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter,
                        colors: [Colors.transparent, Colors.black.withOpacity(0.65)]))),
                Positioned(
                  left: 14, right: 14, bottom: 12,
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(color: MC.accent, borderRadius: BorderRadius.circular(6)),
                      child: Text('${p.discountPct}% OFF', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700)),
                    ),
                    const SizedBox(height: 6),
                    Text(p.title, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 15)),
                  ]),
                ),
              ]),
            );
          },
        ),
      );
}

class _ErrorState extends StatelessWidget {
  final VoidCallback onRetry;
  const _ErrorState({required this.onRetry});
  @override
  Widget build(BuildContext context) => Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.cloud_off_rounded, size: 48, color: MC.inkFaint),
          const SizedBox(height: 12),
          const Text('Gagal memuat data', style: TextStyle(color: MC.inkMuted)),
          const SizedBox(height: 12),
          OutlineButtonX('Coba lagi', onPressed: onRetry, icon: Icons.refresh_rounded),
        ]),
      );
}
