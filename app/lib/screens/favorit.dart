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

class FavoritScreen extends StatelessWidget {
  const FavoritScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthBloc>().state;
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: const Text('Favorit'),
        centerTitle: false,
        titleTextStyle: const TextStyle(color: MC.ink, fontSize: 20, fontWeight: FontWeight.w800),
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

  Widget _guestPrompt(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.favorite_border_rounded, size: 52, color: MC.inkFaint),
            const SizedBox(height: 14),
            const Text('Isi list favoritmu dengan hotel kesukaanmu',
                textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 16),
            PrimaryButton('Masuk / Daftar', expand: false, onPressed: () => ensureLoggedIn(context)),
          ]),
        ),
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
          return const Center(child: CircularProgressIndicator(color: MC.primary));
        }
        final hotels = (state.data ?? []).where((h) => widget.favoriteIds.contains(h.id)).toList();
        if (hotels.isEmpty) {
          return Center(child: Column(mainAxisSize: MainAxisSize.min, children: const [
            Icon(Icons.favorite_border_rounded, size: 52, color: MC.inkFaint),
            SizedBox(height: 14),
            Text('Isi list favoritmu dengan hotel kesukaanmu',
                textAlign: TextAlign.center, style: TextStyle(color: MC.inkMuted)),
          ]));
        }
        return RefreshIndicator(
          onRefresh: () => context.read<FavoritesCubit>().load(),
          child: ListView.separated(
            padding: const EdgeInsets.all(20),
            itemCount: hotels.length,
            separatorBuilder: (_, __) => const SizedBox(height: 12),
            itemBuilder: (context, i) => HotelCard(hotels[i], showBook: true),
          ),
        );
      },
    );
  }
}
