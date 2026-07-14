import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../api.dart';
import '../theme.dart';
import '../widgets.dart';

/// Opens a price calendar (per-date rate + sold-out) and returns the chosen
/// check-in/check-out range.
Future<DateTimeRange?> showPriceCalendar(BuildContext context, String hotelId, {DateTimeRange? initial}) {
  return showModalBottomSheet<DateTimeRange>(
    context: context,
    isScrollControlled: true,
    backgroundColor: MC.surface,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    builder: (_) => _PriceCalendar(hotelId: hotelId, initial: initial),
  );
}

class _DayInfo {
  final int price;
  final bool available;
  _DayInfo(this.price, this.available);
}

class _PriceCalendar extends StatefulWidget {
  final String hotelId;
  final DateTimeRange? initial;
  const _PriceCalendar({required this.hotelId, this.initial});
  @override
  State<_PriceCalendar> createState() => _PriceCalendarState();
}

class _PriceCalendarState extends State<_PriceCalendar> {
  final _days = <String, _DayInfo>{};
  bool _loading = true;
  DateTime? _checkIn, _checkOut;
  static const _monthsAhead = 3;

  DateTime get _today => DateTime(DateTime.now().year, DateTime.now().month, DateTime.now().day);

  @override
  void initState() {
    super.initState();
    _checkIn = widget.initial?.start;
    _checkOut = widget.initial?.end;
    _load();
  }

  Future<void> _load() async {
    try {
      final to = DateTime(_today.year, _today.month + _monthsAhead, _today.day);
      final rows = await context.read<Api>().hotelAvailability(widget.hotelId, _today, to);
      for (final r in rows) {
        _days[r['date'] as String] = _DayInfo((r['price'] ?? 0) as int, (r['available'] ?? true) as bool);
      }
    } catch (_) {/* fall back to no calendar */}
    if (mounted) setState(() => _loading = false);
  }

  String _key(DateTime d) => '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  void _tap(DateTime d) {
    final info = _days[_key(d)];
    if (d.isBefore(_today) || (info != null && !info.available)) return;
    setState(() {
      if (_checkIn == null || _checkOut != null || d.isBefore(_checkIn!)) {
        _checkIn = d; _checkOut = null;
      } else if (d.isAtSameMomentAs(_checkIn!)) {
        _checkOut = d.add(const Duration(days: 1));
      } else {
        _checkOut = d;
      }
    });
  }

  bool _inRange(DateTime d) =>
      _checkIn != null && _checkOut != null && d.isAfter(_checkIn!) && d.isBefore(_checkOut!);

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.85, maxChildSize: 0.95, minChildSize: 0.5,
      builder: (context, controller) => Column(children: [
        const SizedBox(height: 12),
        Container(width: 40, height: 4, decoration: BoxDecoration(color: MC.line, borderRadius: BorderRadius.circular(2))),
        const Padding(padding: EdgeInsets.all(14), child: Text('Pilih Tanggal Menginap', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16))),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator(color: MC.primary))
              : ListView(controller: controller, padding: const EdgeInsets.symmetric(horizontal: 12), children: [
                  for (var m = 0; m < _monthsAhead; m++) _month(DateTime(_today.year, _today.month + m, 1)),
                  const SizedBox(height: 12),
                ]),
        ),
        Container(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
          decoration: BoxDecoration(color: MC.surface, boxShadow: [
            BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 14, offset: const Offset(0, -3)),
          ]),
          child: SafeArea(
            top: false,
            child: Row(children: [
              Expanded(child: Text(
                _checkIn == null
                    ? 'Pilih tanggal check-in'
                    : _checkOut == null
                        ? 'Pilih tanggal check-out'
                        : '${_checkOut!.difference(_checkIn!).inDays} malam dipilih',
                style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13))),
              const SizedBox(width: 12),
              SizedBox(width: 150, child: PrimaryButton('Terapkan',
                  onPressed: (_checkIn != null && _checkOut != null)
                      ? () => Navigator.pop(context, DateTimeRange(start: _checkIn!, end: _checkOut!))
                      : null)),
            ]),
          ),
        ),
      ]),
    );
  }

  Widget _month(DateTime first) {
    final monthName = const ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'][first.month];
    final daysInMonth = DateTime(first.year, first.month + 1, 0).day;
    final leadBlanks = first.weekday % 7; // Sun=0
    final cells = <Widget>[];
    for (var i = 0; i < leadBlanks; i++) cells.add(const SizedBox());
    for (var day = 1; day <= daysInMonth; day++) {
      cells.add(_dayCell(DateTime(first.year, first.month, day)));
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Padding(padding: const EdgeInsets.fromLTRB(6, 14, 6, 8),
          child: Text('$monthName ${first.year}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15))),
      Row(children: const ['M', 'S', 'S', 'R', 'K', 'J', 'S']
          .map((d) => Expanded(child: Center(child: Text(d, style: TextStyle(color: MC.inkFaint, fontSize: 11, fontWeight: FontWeight.w600)))))
          .toList()),
      const SizedBox(height: 4),
      GridView.count(
        crossAxisCount: 7, shrinkWrap: true, physics: const NeverScrollableScrollPhysics(),
        childAspectRatio: 0.72,
        children: cells,
      ),
    ]);
  }

  Widget _dayCell(DateTime d) {
    final info = _days[_key(d)];
    final past = d.isBefore(_today);
    final soldOut = info != null && !info.available;
    final disabled = past || soldOut;
    final isStart = _checkIn != null && d.isAtSameMomentAs(_checkIn!);
    final isEnd = _checkOut != null && d.isAtSameMomentAs(_checkOut!);
    final selected = isStart || isEnd;
    final inRange = _inRange(d);
    return GestureDetector(
      onTap: disabled ? null : () => _tap(d),
      child: Container(
        margin: const EdgeInsets.all(1.5),
        decoration: BoxDecoration(
          color: selected ? MC.primary : inRange ? MC.primarySoft : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Text('${d.day}',
              style: TextStyle(
                fontSize: 13,
                fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                color: disabled ? MC.inkFaint.withOpacity(0.5) : selected ? Colors.white : MC.ink,
                decoration: soldOut ? TextDecoration.lineThrough : null,
              )),
          if (info != null && !soldOut)
            Text('${(info.price / 1000).round()}rb',
                style: TextStyle(fontSize: 8.5, color: selected ? Colors.white70 : MC.inkFaint)),
        ]),
      ),
    );
  }
}
