import 'package:flutter/material.dart';
import '../theme.dart';
import '../widgets.dart';

class FilterResult {
  final int minPrice, maxPrice, star;
  const FilterResult({this.minPrice = 0, this.maxPrice = 5000000, this.star = 0});
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Filter')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Tentukan rate harga', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
              const SizedBox(height: 8),
              RangeSlider(
                values: _price,
                min: 0, max: 5000000, divisions: 50,
                activeColor: MC.primary,
                labels: RangeLabels(rupiah(_price.start.round()), rupiah(_price.end.round())),
                onChanged: (v) => setState(() => _price = v),
              ),
              Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                Text(rupiah(_price.start.round()), style: const TextStyle(fontWeight: FontWeight.w600)),
                Text(rupiah(_price.end.round()), style: const TextStyle(fontWeight: FontWeight.w600)),
              ]),
              const SizedBox(height: 28),
              const Text('Pilih bintang hotel', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
              const SizedBox(height: 12),
              Row(children: List.generate(5, (i) {
                final v = i + 1;
                final sel = _star == v;
                return Padding(
                  padding: const EdgeInsets.only(right: 10),
                  child: GestureDetector(
                    onTap: () => setState(() => _star = sel ? 0 : v),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      decoration: BoxDecoration(
                        color: sel ? MC.primary : MC.field,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(children: [
                        Icon(Icons.star_rounded, size: 16, color: sel ? Colors.white : MC.star),
                        const SizedBox(width: 4),
                        Text('$v', style: TextStyle(color: sel ? Colors.white : MC.ink, fontWeight: FontWeight.w700)),
                      ]),
                    ),
                  ),
                );
              })),
              const Spacer(),
              PrimaryButton('Konfirmasi', onPressed: () {
                Navigator.pop(context, FilterResult(minPrice: _price.start.round(), maxPrice: _price.end.round(), star: _star));
              }),
            ],
          ),
        ),
      ),
    );
  }
}
