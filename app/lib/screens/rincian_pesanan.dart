import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import '../api.dart';
import '../bloc/auth/auth_bloc.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets.dart';
import 'pembayaran.dart';

class RincianPesananScreen extends StatefulWidget {
  final Hotel hotel;
  final Room? room;
  final HotelPackage? package; // set → this is a Hotel Package bundle booking
  final DateTime checkIn, checkOut;
  final int nights, rooms, adults;
  const RincianPesananScreen({
    super.key, required this.hotel, this.room, this.package, required this.checkIn,
    required this.checkOut, required this.nights, required this.rooms, required this.adults,
  });
  @override
  State<RincianPesananScreen> createState() => _RincianPesananScreenState();
}

class _RincianPesananScreenState extends State<RincianPesananScreen> {
  late final _name = TextEditingController(text: context.read<AuthBloc>().state.user?.name ?? '');
  late final _email = TextEditingController(text: context.read<AuthBloc>().state.user?.email ?? '');
  late final _phone = TextEditingController(text: context.read<AuthBloc>().state.user?.phone ?? '');
  final _request = TextEditingController();
  bool _forSelf = true, _loading = false;
  final _fmt = DateFormat('EEEE, d MMMM', 'id_ID');

  bool get _isPackage => widget.package != null;
  int get _roomPrice => _isPackage
      ? widget.package!.price * widget.rooms
      : widget.room!.price * widget.nights * widget.rooms;
  int get _tax => (_roomPrice * 0.11).round();
  int get _total => _roomPrice + _tax;

  Future<void> _submit() async {
    if (_name.text.trim().isEmpty || !_email.text.contains('@') || _phone.text.trim().length < 5) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Lengkapi data pemesan'), backgroundColor: MC.danger));
      return;
    }
    setState(() => _loading = true);
    try {
      final booking = await context.read<Api>().createBooking({
        if (_isPackage) 'packageId': widget.package!.id
        else ...{
          'hotelId': widget.hotel.id,
          'roomId': widget.room!.id,
          'checkOut': widget.checkOut.toIso8601String(),
        },
        'checkIn': widget.checkIn.toIso8601String(),
        'guests': widget.adults,
        'rooms': widget.rooms,
        'bookerName': _name.text.trim(),
        'bookerEmail': _email.text.trim(),
        'bookerPhone': _phone.text.trim(),
        'forSelf': _forSelf,
        'specialRequest': _request.text.trim(),
      });
      if (!mounted) return;
      Navigator.push(context, MaterialPageRoute(builder: (_) => PembayaranScreen(bookingId: booking.id)));
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message), backgroundColor: MC.danger));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Rincian Pesanan')),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(20),
                children: [
                  const BookingStepper(1),
                  const SizedBox(height: 22),
                  _hotelSummary(),
                  const SizedBox(height: 16),
                  _dataPemesan(),
                  const SizedBox(height: 16),
                  _specialRequest(),
                ],
              ),
            ),
            _bottomBar(),
          ],
        ),
      ),
    );
  }

  Widget _hotelSummary() => cardBox(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            ClipRRect(borderRadius: BorderRadius.circular(12), child: NetImage(widget.hotel.imageUrl, width: 64, height: 64)),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(widget.hotel.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
              const SizedBox(height: 2),
              Text(widget.hotel.city, style: const TextStyle(color: MC.inkMuted, fontSize: 12)),
            ])),
          ]),
          const Divider(height: 24, color: MC.line),
          if (_isPackage) _row('Paket', widget.package!.title),
          _row('Kamar', _isPackage
              ? (widget.package!.room?.name ?? '${widget.rooms}x Kamar')
              : '(${widget.rooms}x) ${widget.room!.name}'),
          _row('Tamu', '${widget.adults} Dewasa'),
          _row('Durasi', '${widget.nights} Malam / ${widget.nights + 1} Hari'),
          _row('Check-in', _fmt.format(widget.checkIn)),
          _row('Check-out', _fmt.format(widget.checkOut)),
          if (!_isPackage) _row('Tempat tidur', widget.room!.bedInfo),
          if (_isPackage) ...[
            const Divider(height: 24, color: MC.line),
            const Text('Termasuk dalam paket', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
            const SizedBox(height: 8),
            for (final inc in widget.package!.inclusions)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Icon(Icons.check_circle_rounded, color: MC.primary, size: 16),
                  const SizedBox(width: 8),
                  Expanded(child: Text(inc, style: const TextStyle(fontSize: 12.5))),
                ]),
              ),
          ],
        ]),
      );

  Widget _row(String k, String v) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(width: 96, child: Text(k, style: const TextStyle(color: MC.inkMuted, fontSize: 13))),
          Expanded(child: Text(v, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13))),
        ]),
      );

  Widget _dataPemesan() => cardBox(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Data Pemesan', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(child: _radio('Saya pesan untuk sendiri', _forSelf, () => setState(() => _forSelf = true))),
            Expanded(child: _radio('Untuk orang lain', !_forSelf, () => setState(() => _forSelf = false))),
          ]),
          const SizedBox(height: 12),
          _labeled('Nama Lengkap', _name),
          _labeled('Email', _email),
          _labeled('No. Telpon', _phone, keyboard: TextInputType.phone),
        ]),
      );

  Widget _radio(String label, bool selected, VoidCallback onTap) => GestureDetector(
        onTap: onTap,
        child: Row(children: [
          Icon(selected ? Icons.radio_button_checked_rounded : Icons.radio_button_off_rounded,
              color: selected ? MC.primary : MC.inkFaint, size: 20),
          const SizedBox(width: 6),
          Expanded(child: Text(label, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500))),
        ]),
      );

  Widget _labeled(String label, TextEditingController c, {TextInputType? keyboard}) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: const TextStyle(fontSize: 12, color: MC.inkMuted)),
          const SizedBox(height: 6),
          TextField(controller: c, keyboardType: keyboard, decoration: const InputDecoration(isDense: true)),
        ]),
      );

  Widget _specialRequest() => cardBox(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Permintaan Khusus', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
          const SizedBox(height: 10),
          TextField(controller: _request, maxLines: 3,
              decoration: const InputDecoration(hintText: 'Contoh: kamar bebas asap rokok, lantai atas...')),
        ]),
      );

  Widget _bottomBar() => Container(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
        decoration: BoxDecoration(color: MC.surface, boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.08), blurRadius: 16, offset: const Offset(0, -4)),
        ]),
        child: SafeArea(
          top: false,
          child: Row(children: [
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Total Price', style: TextStyle(fontSize: 11, color: MC.inkFaint)),
              Text(rupiah(_total), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: MC.primaryDark)),
              const Text('Termasuk pajak & layanan', style: TextStyle(fontSize: 10, color: MC.inkFaint)),
            ]),
            const SizedBox(width: 16),
            Expanded(child: PrimaryButton('Pesan Sekarang', loading: _loading, onPressed: _submit)),
          ]),
        ),
      );
}
