import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models.dart';
import '../feedback.dart';
import '../l10n.dart';
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
            _sumItem(Icons.nightlight_round, '$_nights ${tr('Malam', 'Nights')}', () => setState(() => _nights = _nights % 5 + 1)),
            _sumItem(Icons.calendar_today_rounded, _fmt.format(_checkIn), _pickDate),
            _sumItem(Icons.meeting_room_rounded, '$_rooms ${tr('Kamar', 'Rooms')}', () => setState(() => _rooms = _rooms % 3 + 1)),
            _sumItem(Icons.people_alt_rounded, '$_adults ${tr('Dewasa', 'Adults')}', () => setState(() => _adults = (_adults % 4) + 1)),
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
          if (room.photos.isNotEmpty) ...[
            SizedBox(
              height: 116,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: room.photos.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (_, i) => ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: NetImage(room.photos[i], width: room.photos.length == 1 ? 260 : 168, height: 116),
                ),
              ),
            ),
            const SizedBox(height: 12),
          ],
          Text(room.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15.5)),
          const SizedBox(height: 4),
          Text(room.bedInfo, style: TextStyle(color: MC.inkMuted, fontSize: 12.5)),
          const SizedBox(height: 10),
          Wrap(spacing: 8, runSpacing: 8, children: [
            if (room.freeWifi) TagChip(tr('Wifi Gratis', 'Free Wifi'), Icons.wifi_rounded),
            if (room.breakfast) TagChip(tr('Sarapan Gratis', 'Free Breakfast'), Icons.free_breakfast_rounded),
            if (room.freeCancellation) TagChip(tr('Pembatalan Gratis', 'Free Cancellation'), Icons.event_available_rounded),
            TagChip(room.refundable ? tr('Refundable', 'Refundable') : tr('Non refundable', 'Non-refundable'), Icons.replay_rounded,
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
          const SizedBox(height: 8),
          Text(tr('Sisa ${room.stock} Kamar', '${room.stock} Rooms left'), style: const TextStyle(color: MC.danger, fontSize: 11.5, fontWeight: FontWeight.w600)),
          if (room.ratePlans.isEmpty) ...[
            const SizedBox(height: 6),
            Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                if (hasDiscount)
                  Text(rupiah(room.originalPrice!), style: TextStyle(color: MC.inkFaint, fontSize: 12, decoration: TextDecoration.lineThrough)),
                RichText(text: TextSpan(style: const TextStyle(color: MC.primaryDark), children: [
                  TextSpan(text: rupiah(room.price), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  TextSpan(text: tr('/malam', '/night'), style: TextStyle(fontSize: 11, color: MC.inkFaint)),
                ])),
              ])),
              SizedBox(height: 40, child: ElevatedButton(
                onPressed: () => _selectRoom(h, room),
                style: ElevatedButton.styleFrom(backgroundColor: MC.primary, foregroundColor: Colors.white, elevation: 0,
                  padding: const EdgeInsets.symmetric(horizontal: 26), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                  textStyle: const TextStyle(fontWeight: FontWeight.w600)),
                child: Text(tr('Pilih', 'Select')))),
            ]),
          ] else ...[
            const SizedBox(height: 6),
            Text(tr('Pilihan tarif', 'Rate options'), style: TextStyle(fontSize: 11.5, color: MC.inkMuted, fontWeight: FontWeight.w600)),
            for (var i = 0; i < room.ratePlans.length; i++) ...[
              if (i > 0) Divider(height: 16, color: MC.line),
              _planRow(h, room, room.ratePlans[i]),
            ],
          ],
        ],
      ),
    );
  }

  Future<void> _selectRoom(Hotel h, Room room, [RatePlan? plan]) async {
    if (!await ensureLoggedIn(context)) return;
    if (!mounted) return;
    Navigator.push(context, MaterialPageRoute(builder: (_) => RincianPesananScreen(
          hotel: h, room: room, ratePlan: plan, channelId: widget.channelId,
          checkIn: _checkIn, checkOut: _checkOut, nights: _nights, rooms: _rooms, adults: _adults,
        )));
  }

  Widget _miniChip(String label, IconData icon, Color c) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
        decoration: BoxDecoration(color: c.withOpacity(0.10), borderRadius: BorderRadius.circular(6)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 11, color: c), const SizedBox(width: 3),
          Text(label, style: TextStyle(fontSize: 10.5, color: c, fontWeight: FontWeight.w600)),
        ]),
      );

  Widget _planRow(Hotel h, Room room, RatePlan p) {
    final price = room.price + p.priceDelta;
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(p.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
          const SizedBox(height: 4),
          Wrap(spacing: 6, runSpacing: 4, children: [
            _miniChip(p.boardLabel, p.boardBasis == 'ROOM_ONLY' ? Icons.no_meals_rounded : Icons.free_breakfast_rounded, MC.primary),
            if (p.freeCancellation) _miniChip(tr('Bebas batal', 'Free cancel'), Icons.event_available_rounded, MC.success)
            else if (p.refundable) _miniChip(tr('Refundable', 'Refundable'), Icons.replay_rounded, MC.blue)
            else _miniChip(tr('Non-refund', 'Non-refund'), Icons.block_rounded, MC.inkFaint),
          ]),
          const SizedBox(height: 5),
          RichText(text: TextSpan(style: const TextStyle(color: MC.primaryDark), children: [
            TextSpan(text: rupiah(price), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
            TextSpan(text: tr('/malam', '/night'), style: TextStyle(fontSize: 10.5, color: MC.inkFaint)),
          ])),
        ])),
        const SizedBox(width: 8),
        SizedBox(height: 36, child: ElevatedButton(
          onPressed: () => _selectRoom(h, room, p),
          style: ElevatedButton.styleFrom(backgroundColor: MC.primary, foregroundColor: Colors.white, elevation: 0,
            padding: const EdgeInsets.symmetric(horizontal: 20), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18))),
          child: Text(tr('Pilih', 'Select'), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)))),
      ]),
    );
  }
}
