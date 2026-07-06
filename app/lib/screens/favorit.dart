import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../hotel_card.dart';
import '../models.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';
import 'auth.dart';

class FavoritScreen extends StatefulWidget {
  const FavoritScreen({super.key});
  @override
  State<FavoritScreen> createState() => _FavoritScreenState();
}

class _FavoritScreenState extends State<FavoritScreen> {
  Future<List<Hotel>>? _future;

  void _reload() {
    final session = context.read<Session>();
    if (session.isLoggedIn) _future = session.api.favorites();
  }

  @override
  void initState() {
    super.initState();
    _reload();
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<Session>();
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: const Text('Favorit'),
        centerTitle: false,
        titleTextStyle: const TextStyle(color: MC.ink, fontSize: 20, fontWeight: FontWeight.w800),
      ),
      body: SafeArea(
        top: false,
        child: !session.isLoggedIn
            ? Center(child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.favorite_border_rounded, size: 52, color: MC.inkFaint),
                  const SizedBox(height: 14),
                  const Text('Isi list favoritmu dengan hotel kesukaanmu',
                      textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 16),
                  PrimaryButton('Masuk / Daftar', expand: false, onPressed: () async {
                    if (await ensureLoggedIn(context)) setState(_reload);
                  }),
                ]),
              ))
            : FutureBuilder<List<Hotel>>(
                future: _future,
                builder: (context, snap) {
                  if (snap.connectionState == ConnectionState.waiting) {
                    return const Center(child: CircularProgressIndicator(color: MC.primary));
                  }
                  final hotels = snap.data ?? [];
                  if (hotels.isEmpty) {
                    return Center(child: Column(mainAxisSize: MainAxisSize.min, children: const [
                      Icon(Icons.favorite_border_rounded, size: 52, color: MC.inkFaint),
                      SizedBox(height: 14),
                      Text('Isi list favoritmu dengan hotel kesukaanmu',
                          textAlign: TextAlign.center, style: TextStyle(color: MC.inkMuted)),
                    ]));
                  }
                  return RefreshIndicator(
                    onRefresh: () async => setState(_reload),
                    child: ListView.separated(
                      padding: const EdgeInsets.all(20),
                      itemCount: hotels.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 12),
                      itemBuilder: (context, i) => HotelCard(hotels[i], showBook: true),
                    ),
                  );
                },
              ),
      ),
    );
  }
}
