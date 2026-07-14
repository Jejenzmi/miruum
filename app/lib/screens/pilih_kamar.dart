import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets.dart';
import 'auth.dart';
import 'price_calendar.dart';
import 'rincian_pesanan.dart';

class PilihKamarScreen extends StatefulWidget {
  final Hotel hotel;
  final String? channelId; // supply source chosen on the detail screen
  const PilihKamarScreen({super.key, required this.hotel, this.channelId});
  @override
  State<PilihKamarScreen> createState() => _PilihKamarScreenState();
}

class _PilihKamarScreenState extends State<PilihKamarScreen> {
  DateTime _checkIn = DateTime.now().add(const Duration(days: 1));
  int _nights = 1, _rooms = 1, _adults = 2;
  final _fmt = DateFormat('EEEE, d MMMM', 'id_ID');

  DateTime get _checkOut => _checkIn.add(Duration(days: _nights));

  @override
  Widget build(BuildContext context) {
    final h = widget.hotel;
    return Scaffold(
      appBar: AppBar(title: Text(h.name)),
      body: SafeArea(
        child: Column(
          children: [
            _summaryBar(h),
            Expanded(
              child: ListView.separated(
                padding: const EdgeInsets.all(20),
                itemCount: h.rooms.length,
                separatorBuilder: (_, __) => const SizedBox(height: 14),
                itemBuilder: (context, i) => _roomCard(h, h.rooms[i]),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _summaryBar(Hotel h) => Container(
        margin: const EdgeInsets.fromLTRB(20, 4, 20, 0),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: MC.primarySoft, borderRadius: BorderRadius.circular(16)),
        child: Column(children: [
          Row(children: [
            const Icon(Icons.location_on_rounded, size: 16, color: MC.primaryDark),
            const SizedBox(width: 6),
            Text(h.city, style: const TextStyle(fontWeight: FontWeight.w600)),
          ]),
          const SizedBox(height: 10),
          Row(children: [
            _sumItem(Icons.nightlight_round, '$_nights Malam', () => setState(() => _nights = _nights % 5 + 1)),
            _sumItem(Icons.calendar_today_rounded, _fmt.format(_checkIn), _pickDate),
            _sumItem(Icons.meeting_room_rounded, '$_rooms Kamar', () => setState(() => _rooms = _rooms % 3 + 1)),
            _sumItem(Icons.people_alt_rounded, '$_adults Dewasa', () => setState(() => _adults = (_adults % 4) + 1)),
          ]),
        ]),
      );

  Widget _sumItem(IconData icon, String label, VoidCallback onTap) => Expanded(
        child: GestureDetector(
          onTap: onTap,
          child: Column(children: [
            Icon(icon, size: 18, color: MC.primaryDark),
            const SizedBox(height: 4),
            Text(label, textAlign: TextAlign.center, style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w600)),
          ]),
        ),
      );

  Future<void> _pickDate() async {
    final range = await showPriceCalendar(context, widget.hotel.id,
        initial: DateTimeRange(start: _checkIn, end: _checkOut));
    if (range != null) {
      setState(() {
        _checkIn = range.start;
        _nights = range.end.difference(range.start).inDays.clamp(1, 30);
      });
    }
  }

  Widget _roomCard(Hotel h, Room room) {
    final hasDiscount = room.originalPrice != null && room.originalPrice! > room.price;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: MC.surface, borderRadius: BorderRadius.circular(18), boxShadow: [softShadow]),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(room.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15.5)),
          const SizedBox(height: 4),
          Text(room.bedInfo, style: const TextStyle(color: MC.inkMuted, fontSize: 12.5)),
          const SizedBox(height: 10),
          Wrap(spacing: 8, runSpacing: 8, children: [
            if (room.freeWifi) const TagChip('Wifi Gratis', Icons.wifi_rounded),
            if (room.breakfast) const TagChip('Sarapan Gratis', Icons.free_breakfast_rounded),
            if (room.freeCancellation) const TagChip('Pembatalan Gratis', Icons.event_available_rounded),
            TagChip(room.refundable ? 'Refundable' : 'Non refundable', Icons.replay_rounded,
                color: room.refundable ? MC.primary : MC.inkFaint),
          ]),
          const SizedBox(height: 12),
          if (room.discountLabel != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(color: MC.accentSoft, borderRadius: BorderRadius.circular(8)),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.local_offer_rounded, size: 13, color: MC.accent),
                const SizedBox(width: 4),
                Text(room.discountLabel!, style: const TextStyle(color: MC.accent, fontSize: 11.5, fontWeight: FontWeight.w600)),
              ]),
            ),
          const SizedBox(height: 10),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Sisa ${room.stock} Kamar', style: const TextStyle(color: MC.danger, fontSize: 11.5, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 2),
                  if (hasDiscount)
                    Text(rupiah(room.originalPrice!),
                        style: const TextStyle(color: MC.inkFaint, fontSize: 12, decoration: TextDecoration.lineThrough)),
                  RichText(text: TextSpan(style: const TextStyle(color: MC.primaryDark), children: [
                    TextSpan(text: rupiah(room.price), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                    const TextSpan(text: '/malam', style: TextStyle(fontSize: 11, color: MC.inkFaint)),
                  ])),
                ]),
              ),
              SizedBox(
                height: 40,
                child: ElevatedButton(
                  onPressed: () => _selectRoom(h, room),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: MC.primary, foregroundColor: Colors.white, elevation: 0,
                    padding: const EdgeInsets.symmetric(horizontal: 26),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                    textStyle: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                  child: const Text('Pilih'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _selectRoom(Hotel h, Room room) async {
    if (!await ensureLoggedIn(context)) return;
    if (!mounted) return;
    Navigator.push(context, MaterialPageRoute(builder: (_) => RincianPesananScreen(
          hotel: h, room: room, channelId: widget.channelId,
          checkIn: _checkIn, checkOut: _checkOut, nights: _nights, rooms: _rooms, adults: _adults,
        )));
  }
}
