import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../api.dart';
import '../feedback.dart';
import '../bloc/auth/auth_bloc.dart';
import '../bloc/cubits.dart';
import '../bloc/view_state.dart';
import '../hotel_card.dart';
import '../l10n.dart';
import '../models.dart';
import '../theme.dart';
import '../ui_kit.dart';
import '../widgets.dart';
import 'auth.dart';

class FavoritScreen extends StatelessWidget {
  const FavoritScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthBloc>().state;
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: Text(tr('Favorit', 'Saved')),
        centerTitle: false,
        titleTextStyle: TextStyle(color: MC.ink, fontSize: 20, fontWeight: FontWeight.w800),
      ),
      body: SafeArea(
        top: false,
        child: !auth.isLoggedIn
            ? _guestPrompt(context)
            : BlocProvider(
                create: (ctx) => FavoritesCubit(ctx.read<Api>())..load(),
                child: _FavList(favoriteIds: auth.favoriteIds),
              ),
      ),
    );
  }

  Widget _guestPrompt(BuildContext context) => EmptyState(
        icon: Icons.favorite_rounded,
        color: MC.danger,
        title: tr('Isi list favoritmu', 'Fill up your favorites list'),
        subtitle: tr('Simpan hotel kesukaanmu di sini', 'Save your favorite hotels here'),
        action: PrimaryButton(tr('Masuk / Daftar', 'Log In / Sign Up'), expand: false, onPressed: () => ensureLoggedIn(context)),
      );
}

class _FavList extends StatefulWidget {
  final Set<String> favoriteIds;
  const _FavList({required this.favoriteIds});
  @override
  State<_FavList> createState() => _FavListState();
}

class _FavListState extends State<_FavList> {
  @override
  void didUpdateWidget(covariant _FavList old) {
    super.didUpdateWidget(old);
    // Reload when the set of favorites changes (toggled elsewhere).
    if (old.favoriteIds.length != widget.favoriteIds.length) {
      context.read<FavoritesCubit>().load();
    }
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<FavoritesCubit, ViewState<List<Hotel>>>(
      builder: (context, state) {
        if (state.isLoading) {
          return const SkeletonList();
        }
        final hotels = (state.data ?? []).where((h) => widget.favoriteIds.contains(h.id)).toList();
        if (hotels.isEmpty) {
          return EmptyState(
            icon: Icons.favorite_border_rounded, color: MC.danger,
            title: tr('Belum ada favorit', 'No favorites yet'),
            subtitle: tr('Ketuk ikon hati pada hotel untuk menyimpannya', 'Tap the heart icon on a hotel to save it'),
          );
        }
        return RefreshIndicator(
          onRefresh: () => context.read<FavoritesCubit>().load(),
          child: ListView.separated(
            padding: const EdgeInsets.all(20),
            itemCount: hotels.length,
            separatorBuilder: (_, __) => const SizedBox(height: 12),
            itemBuilder: (context, i) => HotelCard(hotels[i], showBook: true)
                .animate().fadeIn(delay: (i * 60).ms, duration: 350.ms).slideY(begin: 0.12, end: 0),
          ),
        );
      },
    );
  }
}
