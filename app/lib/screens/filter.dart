import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../api.dart';
import '../l10n.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets.dart';

class FilterResult {
  final int minPrice, maxPrice, star, minRating;
  final bool freeCancellation, refundable, breakfast;
  final String sort; // '', price_asc, price_desc, rating, popular
  final List<String> facilityIds;
  final List<String> propertyTypes;
  const FilterResult({
    this.minPrice = 0, this.maxPrice = 5000000, this.star = 0, this.minRating = 0,
    this.freeCancellation = false, this.refundable = false, this.breakfast = false,
    this.sort = '', this.facilityIds = const [], this.propertyTypes = const [],
  });

  /// Query params for GET /hotels.
  Map<String, dynamic> toQuery() => {
        if (minPrice > 0) 'minPrice': minPrice,
        if (maxPrice < 5000000) 'maxPrice': maxPrice,
        if (star > 0) 'star': star,
        if (minRating > 0) 'minRating': minRating,
        if (freeCancellation) 'freeCancellation': 1,
        if (refundable) 'refundable': 1,
        if (breakfast) 'breakfast': 1,
        if (sort.isNotEmpty) 'sort': sort,
        if (facilityIds.isNotEmpty) 'facilities': facilityIds.join(','),
        if (propertyTypes.isNotEmpty) 'propertyType': propertyTypes.join(','),
      };

  bool get isActive =>
      minPrice > 0 || maxPrice < 5000000 || star > 0 || minRating > 0 ||
      freeCancellation || refundable || breakfast || sort.isNotEmpty || facilityIds.isNotEmpty || propertyTypes.isNotEmpty;
}

class FilterScreen extends StatefulWidget {
  final FilterResult initial;
  const FilterScreen({super.key, this.initial = const FilterResult()});
  @override
  State<FilterScreen> createState() => _FilterScreenState();
}

class _FilterScreenState extends State<FilterScreen> {
  late RangeValues _price = RangeValues(widget.initial.minPrice.toDouble(), widget.initial.maxPrice.toDouble());
  late int _star = widget.initial.star;
  late int _rating = widget.initial.minRating;
  late bool _freeCancel = widget.initial.freeCancellation;
  late bool _refundable = widget.initial.refundable;
  late bool _breakfast = widget.initial.breakfast;
  late String _sort = widget.initial.sort;
  late Set<String> _facilityIds = widget.initial.facilityIds.toSet();
  late Set<String> _propertyTypes = widget.initial.propertyTypes.toSet();
  List<Facility> _facilities = [];

  @override
  void initState() {
    super.initState();
    context.read<Api>().facilities().then((f) { if (mounted) setState(() => _facilities = f); }).catchError((_) {});
  }

  Widget _section(String t) => Padding(
        padding: const EdgeInsets.only(top: 22, bottom: 10),
        child: Text(t, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
      );

  Widget _chip(String label, bool selected, VoidCallback onTap, {IconData? icon}) => GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
          decoration: BoxDecoration(color: selected ? MC.primary : MC.field, borderRadius: BorderRadius.circular(11),
              border: Border.all(color: selected ? MC.primary : MC.line)),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            if (icon != null) ...[Icon(icon, size: 15, color: selected ? Colors.white : MC.inkMuted), const SizedBox(width: 5)],
            Text(label, style: TextStyle(color: selected ? Colors.white : MC.ink, fontWeight: FontWeight.w600, fontSize: 12.5)),
          ]),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final sorts = {'': tr('Rekomendasi', 'Recommended'), 'price_asc': tr('Termurah', 'Lowest Price'), 'price_desc': tr('Termahal', 'Highest Price'), 'rating': tr('Rating Tertinggi', 'Top Rated'), 'popular': tr('Terpopuler', 'Most Popular')};
    return Scaffold(
      appBar: AppBar(title: Text(tr('Filter & Urutkan', 'Filter & Sort')), actions: [
        TextButton(onPressed: () => Navigator.pop(context, const FilterResult()), child: Text(tr('Reset', 'Reset'), style: const TextStyle(color: MC.primary))),
      ]),
      body: SafeArea(
        child: Column(children: [
          Expanded(child: ListView(padding: const EdgeInsets.symmetric(horizontal: 20), children: [
            _section(tr('Urutkan', 'Sort by')),
            Wrap(spacing: 8, runSpacing: 8, children: sorts.entries.map((e) => _chip(e.value, _sort == e.key, () => setState(() => _sort = e.key))).toList()),

            _section(tr('Rentang harga per malam', 'Price range per night')),
            RangeSlider(
              values: _price, min: 0, max: 5000000, divisions: 50, activeColor: MC.primary,
              labels: RangeLabels(rupiah(_price.start.round()), rupiah(_price.end.round())),
              onChanged: (v) => setState(() => _price = v),
            ),
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              Text(rupiah(_price.start.round()), style: const TextStyle(fontWeight: FontWeight.w600)),
              Text(rupiah(_price.end.round()), style: const TextStyle(fontWeight: FontWeight.w600)),
            ]),

            _section(tr('Jenis properti', 'Property type')),
            Wrap(spacing: 8, runSpacing: 8, children: PropertyType.all.map((t) {
              final sel = _propertyTypes.contains(t);
              return _chip(PropertyType.label(t), sel, () => setState(() => sel ? _propertyTypes.remove(t) : _propertyTypes.add(t)));
            }).toList()),

            _section(tr('Bintang hotel', 'Hotel star rating')),
            Wrap(spacing: 8, children: List.generate(5, (i) {
              final v = i + 1;
              return _chip('$v', _star == v, () => setState(() => _star = _star == v ? 0 : v), icon: Icons.star_rounded);
            })),

            _section(tr('Rating tamu', 'Guest rating')),
            Wrap(spacing: 8, children: [7, 8, 9].map((v) => _chip('$v+ ${tr('Bagus', 'Good')}', _rating == v, () => setState(() => _rating = _rating == v ? 0 : v))).toList()),

            _section(tr('Kebijakan & fasilitas kamar', 'Room policies & amenities')),
            Wrap(spacing: 8, runSpacing: 8, children: [
              _chip(tr('Gratis Pembatalan', 'Free Cancellation'), _freeCancel, () => setState(() => _freeCancel = !_freeCancel), icon: Icons.event_available_rounded),
              _chip(tr('Bisa Refund', 'Refundable'), _refundable, () => setState(() => _refundable = !_refundable), icon: Icons.replay_rounded),
              _chip(tr('Termasuk Sarapan', 'Breakfast Included'), _breakfast, () => setState(() => _breakfast = !_breakfast), icon: Icons.free_breakfast_rounded),
            ]),

            if (_facilities.isNotEmpty) ...[
              _section(tr('Fasilitas hotel', 'Hotel facilities')),
              Wrap(spacing: 8, runSpacing: 8, children: _facilities.map((f) {
                final sel = _facilityIds.contains(f.id);
                return _chip(f.name, sel, () => setState(() => sel ? _facilityIds.remove(f.id) : _facilityIds.add(f.id)));
              }).toList()),
            ],
            const SizedBox(height: 20),
          ])),
          Padding(padding: const EdgeInsets.all(20), child: PrimaryButton(tr('Terapkan Filter', 'Apply Filter'), onPressed: () {
            Navigator.pop(context, FilterResult(
              minPrice: _price.start.round(), maxPrice: _price.end.round(), star: _star, minRating: _rating,
              freeCancellation: _freeCancel, refundable: _refundable, breakfast: _breakfast,
              sort: _sort, facilityIds: _facilityIds.toList(), propertyTypes: _propertyTypes.toList(),
            ));
          })),
        ]),
      ),
    );
  }
}
