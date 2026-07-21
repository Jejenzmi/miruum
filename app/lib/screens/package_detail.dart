import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import '../api.dart';
import '../feedback.dart';
import '../bloc/cubits.dart';
import '../bloc/view_state.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets.dart';
import '../l10n.dart';
import 'auth.dart';
import 'hotel_detail.dart';
import 'rincian_pesanan.dart';

class PackageDetailScreen extends StatelessWidget {
  final String id;
  const PackageDetailScreen(this.id, {super.key});
  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (ctx) => PackageDetailCubit(ctx.read<Api>())..load(id),
      child: Scaffold(
        backgroundColor: MC.bg,
        body: BlocBuilder<PackageDetailCubit, ViewState<HotelPackage>>(
          builder: (context, state) {
            if (state.isLoading) return const Center(child: CircularProgressIndicator(color: MC.primary));
            if (state.isFailure) {
              return Center(child: OutlineButtonX(tr('Coba lagi', 'Try again'),
                  icon: Icons.refresh_rounded, onPressed: () => context.read<PackageDetailCubit>().load(id)));
            }
            return _PackageView(state.data!);
          },
        ),
      ),
    );
  }
}

class _PackageView extends StatefulWidget {
  final HotelPackage pkg;
  const _PackageView(this.pkg);
  @override
  State<_PackageView> createState() => _PackageViewState();
}

class _PackageViewState extends State<_PackageView> {
  DateTime _checkIn = DateTime.now().add(const Duration(days: 1));
  final _fmt = DateFormat('EEE, d MMM yyyy', 'id_ID');

  HotelPackage get pkg => widget.pkg;
  DateTime get _checkOut => _checkIn.add(Duration(days: pkg.nights));

  Future<void> _pickDate() async {
    final res = await showDatePicker(
      context: context,
      initialDate: _checkIn,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
      builder: (c, w) => Theme(data: Theme.of(c).copyWith(colorScheme: const ColorScheme.light(primary: MC.primary)), child: w!),
    );
    if (res != null) setState(() => _checkIn = res);
  }

  Future<void> _book() async {
    if (!await ensureLoggedIn(context)) return;
    if (!mounted) return;
    Navigator.push(context, MaterialPageRoute(builder: (_) => RincianPesananScreen(
          hotel: pkg.hotel!,
          package: pkg,
          checkIn: _checkIn,
          checkOut: _checkOut,
          nights: pkg.nights,
          rooms: 1,
          adults: pkg.guests,
        )));
  }

  @override
  Widget build(BuildContext context) {
    final hotel = pkg.hotel;
    return Column(children: [
      Expanded(
        child: CustomScrollView(slivers: [
          SliverAppBar(
            pinned: true, expandedHeight: 240, backgroundColor: MC.primary, foregroundColor: Colors.white,
            flexibleSpace: FlexibleSpaceBar(
              background: Stack(fit: StackFit.expand, children: [
                NetImage(pkg.imageUrl),
                const DecoratedBox(decoration: BoxDecoration(
                    gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter,
                        colors: [Colors.black26, Colors.transparent]))),
              ]),
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  if (pkg.badge != null)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(color: MC.accentSoft, borderRadius: BorderRadius.circular(8)),
                      child: Text(pkg.badge!, style: const TextStyle(color: MC.primaryDark, fontWeight: FontWeight.w700, fontSize: 11.5)),
                    ),
                  const Spacer(),
                  RatingPill(pkg.rating, small: true),
                ]),
                const SizedBox(height: 12),
                Text(pkg.title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 20)),
                const SizedBox(height: 6),
                Row(children: [
                  Icon(Icons.location_on_rounded, size: 15, color: MC.inkFaint),
                  const SizedBox(width: 3),
                  Expanded(child: Text(pkg.city, style: TextStyle(color: MC.inkMuted, fontSize: 13))),
                ]),
                const SizedBox(height: 8),
                Wrap(spacing: 8, runSpacing: 8, children: [
                  TagChip(tr('${pkg.nights} Malam / ${pkg.days} Hari', '${pkg.nights} Nights / ${pkg.days} Days'), Icons.calendar_month_rounded),
                  TagChip(tr('${pkg.guests} Tamu', '${pkg.guests} Guests'), Icons.people_alt_rounded),
                  TagChip(pkg.boardLabel, Icons.restaurant_rounded),
                  StarRow(pkg.starRating),
                ]),
                const SizedBox(height: 20),
                Text(tr('Paket Makan', 'Meal Package'), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                const SizedBox(height: 12),
                cardBox(child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Container(
                    padding: const EdgeInsets.all(9),
                    decoration: BoxDecoration(color: MC.primarySoft, borderRadius: BorderRadius.circular(11)),
                    child: const Icon(Icons.restaurant_menu_rounded, color: MC.primary, size: 20),
                  ),
                  const SizedBox(width: 12),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(pkg.boardLabel, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                    const SizedBox(height: 6),
                    if (pkg.meals.isEmpty)
                      Text(tr('Belum termasuk makan', 'Meals not included'), style: TextStyle(color: MC.inkMuted, fontSize: 12.5))
                    else
                      Wrap(spacing: 6, runSpacing: 6, children: [
                        for (final m in pkg.meals)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                            decoration: BoxDecoration(color: MC.primarySoft, borderRadius: BorderRadius.circular(20)),
                            child: Text(m, style: const TextStyle(color: MC.primaryDark, fontWeight: FontWeight.w600, fontSize: 11.5)),
                          ),
                      ]),
                    Text(tr(' • per orang, per hari selama ${pkg.nights} malam', ' • per person, per day for ${pkg.nights} nights'),
                        style: TextStyle(color: MC.inkFaint, fontSize: 11, height: 1.6)),
                  ])),
                ])),
                if (pkg.inclusions.isNotEmpty) ...[
                const SizedBox(height: 20),
                Text(tr('Fasilitas & inklusi lain', 'Other facilities & inclusions'), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                const SizedBox(height: 12),
                cardBox(child: Column(children: [
                  for (var i = 0; i < pkg.inclusions.length; i++) ...[
                    if (i > 0) Divider(height: 18, color: MC.line),
                    Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Icon(Icons.check_circle_rounded, color: MC.primary, size: 20),
                      const SizedBox(width: 10),
                      Expanded(child: Text(pkg.inclusions[i], style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500))),
                    ]),
                  ],
                ])),
                ],
                if (pkg.description != null) ...[
                  const SizedBox(height: 20),
                  Text(tr('Tentang paket', 'About the package'), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                  const SizedBox(height: 8),
                  Text(pkg.description!, style: TextStyle(color: MC.inkMuted, fontSize: 13, height: 1.5)),
                ],
                if (hotel != null) ...[
                  const SizedBox(height: 20),
                  Text(tr('Hotel', 'Hotel'), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                  const SizedBox(height: 10),
                  GestureDetector(
                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => HotelDetailScreen(hotel.id))),
                    child: cardBox(child: Row(children: [
                      ClipRRect(borderRadius: BorderRadius.circular(12), child: NetImage(hotel.imageUrl, width: 64, height: 64)),
                      const SizedBox(width: 12),
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(hotel.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                        const SizedBox(height: 3),
                        Row(children: [
                          StarRow(hotel.starRating),
                          const SizedBox(width: 6),
                          Text(hotel.city, style: TextStyle(color: MC.inkMuted, fontSize: 11.5)),
                        ]),
                      ])),
                      Icon(Icons.chevron_right_rounded, color: MC.inkFaint),
                    ])),
                  ),
                ],
                const SizedBox(height: 20),
                Text(tr('Tanggal menginap', 'Stay dates'), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                const SizedBox(height: 10),
                GestureDetector(
                  onTap: _pickDate,
                  child: cardBox(child: Row(children: [
                    const Icon(Icons.calendar_today_rounded, color: MC.primary, size: 20),
                    const SizedBox(width: 12),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('${_fmt.format(_checkIn)}  →  ${_fmt.format(_checkOut)}',
                          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                      const SizedBox(height: 2),
                      Text(tr('${pkg.nights} malam menginap', '${pkg.nights} nights stay'), style: TextStyle(color: MC.inkFaint, fontSize: 11)),
                    ])),
                    Icon(Icons.edit_calendar_rounded, color: MC.inkFaint, size: 18),
                  ])),
                ),
                const SizedBox(height: 20),
              ]),
            ),
          ),
        ]),
      ),
      _bottomBar(),
    ]);
  }

  Widget _bottomBar() => Container(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
        decoration: BoxDecoration(color: MC.surface, boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.08), blurRadius: 16, offset: const Offset(0, -4)),
        ]),
        child: SafeArea(
          top: false,
          child: Row(children: [
            Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
              if (pkg.originalPrice > pkg.price)
                Text(rupiah(pkg.originalPrice),
                    style: TextStyle(fontSize: 11, color: MC.inkFaint, decoration: TextDecoration.lineThrough)),
              Text(rupiah(pkg.price), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: MC.primaryDark)),
              Text(tr('Harga paket / bundle', 'Package / bundle price'), style: TextStyle(fontSize: 10, color: MC.inkFaint)),
            ]),
            const SizedBox(width: 16),
            Expanded(child: PrimaryButton(tr('Pesan Paket', 'Book Package'), icon: Icons.card_giftcard_rounded, onPressed: _book)),
          ]),
        ),
      );
}
