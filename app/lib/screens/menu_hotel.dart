import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../theme.dart';
import '../widgets.dart';
import 'results.dart';
import 'filter.dart';

class MenuHotelScreen extends StatefulWidget {
  final bool package;
  const MenuHotelScreen({super.key, this.package = false});
  @override
  State<MenuHotelScreen> createState() => _MenuHotelScreenState();
}

class _MenuHotelScreenState extends State<MenuHotelScreen> {
  final _loc = TextEditingController();
  DateTime _checkIn = DateTime.now().add(const Duration(days: 1));
  DateTime _checkOut = DateTime.now().add(const Duration(days: 2));
  int _rooms = 1, _adults = 2, _children = 0;
  FilterResult _filter = const FilterResult();
  final _fmt = DateFormat('EEE, d MMM', 'id_ID');

  Future<void> _pickDate(bool checkIn) async {
    final res = await showDatePicker(
      context: context,
      initialDate: checkIn ? _checkIn : _checkOut,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
      builder: (c, w) => Theme(data: Theme.of(c).copyWith(colorScheme: const ColorScheme.light(primary: MC.primary)), child: w!),
    );
    if (res == null) return;
    setState(() {
      if (checkIn) {
        _checkIn = res;
        if (!_checkOut.isAfter(_checkIn)) _checkOut = _checkIn.add(const Duration(days: 1));
      } else {
        _checkOut = res.isAfter(_checkIn) ? res : _checkIn.add(const Duration(days: 1));
      }
    });
  }

  void _guestSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: MC.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (_) => StatefulBuilder(builder: (context, setSheet) {
        Widget stepper(String label, int value, VoidCallback dec, VoidCallback inc) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                Text(label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
                Row(children: [
                  IconButton(onPressed: dec, icon: const Icon(Icons.remove_circle_outline_rounded, color: MC.primary)),
                  Text('$value', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                  IconButton(onPressed: inc, icon: const Icon(Icons.add_circle_rounded, color: MC.primary)),
                ]),
              ]),
            );
        return Padding(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 28),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Text('Masukan tamu & kamar', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
            const SizedBox(height: 10),
            stepper('Kamar', _rooms, () => setSheet(() => _rooms = (_rooms - 1).clamp(1, 9)), () => setSheet(() => _rooms++)),
            const Divider(color: MC.line),
            stepper('Dewasa', _adults, () => setSheet(() => _adults = (_adults - 1).clamp(1, 20)), () => setSheet(() => _adults++)),
            const Divider(color: MC.line),
            stepper('Anak', _children, () => setSheet(() => _children = (_children - 1).clamp(0, 20)), () => setSheet(() => _children++)),
            const SizedBox(height: 16),
            PrimaryButton('Simpan', onPressed: () {
              setState(() {});
              Navigator.pop(context);
            }),
          ]),
        );
      }),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.package ? 'Hotel Package' : 'Hotel')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Hotel disekitar kamu', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
              const SizedBox(height: 16),
              _field(Icons.location_on_rounded, 'Lokasi', TextField(
                controller: _loc,
                decoration: const InputDecoration(hintText: 'Kota / nama hotel', border: InputBorder.none, isDense: true),
              )),
              const SizedBox(height: 12),
              Row(children: [
                Expanded(child: _dateBox('Check-in', _checkIn, () => _pickDate(true))),
                const SizedBox(width: 12),
                Expanded(child: _dateBox('Check-out', _checkOut, () => _pickDate(false))),
              ]),
              const SizedBox(height: 12),
              GestureDetector(
                onTap: _guestSheet,
                child: _field(Icons.people_alt_rounded, 'Tamu & Kamar',
                    Text('$_rooms Kamar $_adults Dewasa, $_children Anak', style: const TextStyle(fontWeight: FontWeight.w600))),
              ),
              const SizedBox(height: 12),
              GestureDetector(
                onTap: () async {
                  final res = await Navigator.push<FilterResult>(context, MaterialPageRoute(builder: (_) => FilterScreen(initial: _filter)));
                  if (res != null) setState(() => _filter = res);
                },
                child: _field(Icons.tune_rounded, 'Filter',
                    Text(_filter.star > 0 || _filter.minPrice > 0 || _filter.maxPrice < 5000000
                        ? 'Harga & bintang diatur'
                        : 'Atur harga & bintang',
                        style: TextStyle(color: _filter.star > 0 || _filter.minPrice > 0 || _filter.maxPrice < 5000000 ? MC.primary : MC.inkMuted, fontWeight: FontWeight.w600))),
              ),
              const SizedBox(height: 24),
              PrimaryButton('Cari Hotel', icon: Icons.search_rounded, onPressed: () {
                Navigator.push(context, MaterialPageRoute(builder: (_) => ResultsScreen(
                      title: 'Hasil Pencarian',
                      query: _loc.text.trim(),
                      checkIn: _checkIn,
                      checkOut: _checkOut,
                      rooms: _rooms,
                      initialFilter: _filter,
                    )));
              }),
            ],
          ),
        ),
      ),
    );
  }

  Widget _field(IconData icon, String label, Widget child) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(color: MC.surface, borderRadius: BorderRadius.circular(14), boxShadow: [softShadow]),
        child: Row(children: [
          Icon(icon, color: MC.primary, size: 20),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(label, style: const TextStyle(fontSize: 11, color: MC.inkFaint)),
              const SizedBox(height: 2),
              child,
            ]),
          ),
        ]),
      );

  Widget _dateBox(String label, DateTime date, VoidCallback onTap) => GestureDetector(
        onTap: onTap,
        child: _field(Icons.calendar_today_rounded, label, Text(_fmt.format(date), style: const TextStyle(fontWeight: FontWeight.w600))),
      );
}
