import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import '../api.dart';
import '../feedback.dart';
import '../bloc/auth/auth_bloc.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets.dart';
import 'pembayaran.dart';

class RincianPesananScreen extends StatefulWidget {
  final Hotel hotel;
  final Room? room;
  final HotelPackage? package; // set → this is a Hotel Package bundle booking
  final String? channelId; // supply source to route this booking to
  final DateTime checkIn, checkOut;
  final int nights, rooms, adults;
  const RincianPesananScreen({
    super.key, required this.hotel, this.room, this.package, this.channelId, required this.checkIn,
    required this.checkOut, required this.nights, required this.rooms, required this.adults,
  });
  @override
  State<RincianPesananScreen> createState() => _RincianPesananScreenState();
}

class _RincianPesananScreenState extends State<RincianPesananScreen> {
  late final _name = TextEditingController(text: context.read<AuthBloc>().state.user?.name ?? '');
  late final _email = TextEditingController(text: context.read<AuthBloc>().state.user?.email ?? '');
  late final _phone = TextEditingController(text: context.read<AuthBloc>().state.user?.phone ?? '');
  final _guest = TextEditingController(); // guest name when booking for someone else
  final _request = TextEditingController();
  final _promo = TextEditingController();
  bool _forSelf = true, _loading = false, _checkingPromo = false;
  int _discount = 0;
  String? _appliedPromo;
  List<SavedGuest> _savedGuests = [];
  bool _saveGuest = true;
  double _taxPct = 11; // fetched from server so the breakdown matches the booking exactly
  // Loyalty
  bool _usePoints = false;
  int _points = 0, _redeemValue = 100, _maxRedeemPct = 30;
  bool _loyaltyEnabled = false;

  @override
  void initState() {
    super.initState();
    context.read<Api>().savedGuests().then((g) { if (mounted) setState(() => _savedGuests = g); }).catchError((_) {});
    context.read<Api>().appConfig().then((c) {
      final t = (c['taxPct'] as num?)?.toDouble();
      if (t != null && mounted) setState(() => _taxPct = t);
    }).catchError((_) {});
    context.read<Api>().loyalty().then((l) {
      if (!mounted) return;
      setState(() {
        _loyaltyEnabled = l['enabled'] == true;
        _points = (l['points'] ?? 0) as int;
        _redeemValue = (l['redeemValue'] ?? 100) as int;
        _maxRedeemPct = (l['maxRedeemPct'] ?? 30) as int;
      });
    }).catchError((_) {});
  }

  /// Estimated points discount (server is authoritative; this mirrors its cap).
  int get _pointsDiscount {
    if (!_usePoints || _points <= 0) return 0;
    final preTotal = _roomPrice + _tax - _discount;
    final maxRupiah = (preTotal * _maxRedeemPct / 100).floor();
    final usablePoints = (_points).clamp(0, (maxRupiah / _redeemValue).floor());
    return usablePoints * _redeemValue;
  }
  final _fmt = DateFormat('EEEE, d MMMM', 'id_ID');

  bool get _isPackage => widget.package != null;
  int get _roomPrice => _isPackage
      ? widget.package!.price * widget.rooms
      : widget.room!.price * widget.nights * widget.rooms;
  int get _tax => (_roomPrice * _taxPct / 100).round();
  int get _total => _roomPrice + _tax - _discount - _pointsDiscount;

  Future<void> _applyPromo() async {
    final code = _promo.text.trim();
    if (code.isEmpty) return;
    setState(() => _checkingPromo = true);
    try {
      final r = await context.read<Api>().validatePromo(code, _roomPrice);
      setState(() { _discount = (r['discount'] ?? 0) as int; _appliedPromo = r['code'] as String?; });
      if (mounted) showSnack(context, 'Promo diterapkan: hemat ${rupiah(_discount)}', kind: SnackKind.success);
    } on ApiException catch (e) {
      setState(() { _discount = 0; _appliedPromo = null; });
      if (mounted) showSnack(context, e.message, kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _checkingPromo = false);
    }
  }

  Future<void> _submit() async {
    if (_name.text.trim().isEmpty || !_email.text.contains('@') || _phone.text.trim().length < 5) {
      showSnack(context, 'Lengkapi detail kontak pemesan.', kind: SnackKind.error);
      return;
    }
    if (!_forSelf && _guest.text.trim().isEmpty) {
      showSnack(context, 'Isi nama tamu yang menginap.', kind: SnackKind.error);
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
          if (widget.channelId != null) 'channelId': widget.channelId,
        },
        'checkIn': widget.checkIn.toIso8601String(),
        'guests': widget.adults,
        'rooms': widget.rooms,
        if (_appliedPromo != null) 'promoCode': _appliedPromo,
        if (_usePoints && _pointsDiscount > 0) 'usePoints': true,
        'bookerName': (_forSelf ? _name.text : _guest.text).trim(),
        'bookerEmail': _email.text.trim(),
        'bookerPhone': _phone.text.trim(),
        'forSelf': _forSelf,
        'specialRequest': _request.text.trim(),
      });
      // Save the guest for next time (fire-and-forget).
      if (!_forSelf && _saveGuest && _guest.text.trim().isNotEmpty) {
        context.read<Api>().saveGuest(_guest.text.trim()).catchError((_) {});
      }
      if (!mounted) return;
      Navigator.push(context, MaterialPageRoute(builder: (_) => PembayaranScreen(bookingId: booking.id)));
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, kind: SnackKind.error);
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
                  const SizedBox(height: 16),
                  _promoCard(),
                  if (_loyaltyEnabled && _points > 0) ...[
                    const SizedBox(height: 16),
                    _loyaltyCard(),
                  ],
                  const SizedBox(height: 16),
                  _priceBreakdown(),
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
              Text(widget.hotel.city, style: TextStyle(color: MC.inkMuted, fontSize: 12)),
            ])),
          ]),
          Divider(height: 24, color: MC.line),
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
            Divider(height: 24, color: MC.line),
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
          SizedBox(width: 96, child: Text(k, style: TextStyle(color: MC.inkMuted, fontSize: 13))),
          Expanded(child: Text(v, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13))),
        ]),
      );

  Widget _dataPemesan() => cardBox(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Icon(Icons.person_pin_rounded, color: MC.primary, size: 20),
            const SizedBox(width: 8),
            const Text('Detail Kontak', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
          ]),
          const SizedBox(height: 4),
          Text('E-voucher & info pesanan dikirim ke sini.', style: TextStyle(fontSize: 11.5, color: MC.inkFaint)),
          const SizedBox(height: 14),
          _labeled('Nama Lengkap', _name),
          _labeled('Email', _email),
          _labeled('No. Telepon', _phone, keyboard: TextInputType.phone),

          const SizedBox(height: 6),
          Divider(color: MC.line, height: 24),
          Row(children: [
            const Icon(Icons.hotel_rounded, color: MC.primary, size: 20),
            const SizedBox(width: 8),
            const Text('Untuk siapa pesanan ini?', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
          ]),
          const SizedBox(height: 12),
          _segToggle(),
          AnimatedSize(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOut,
            child: _forSelf
                ? Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Row(children: [
                      const Icon(Icons.check_circle_rounded, color: MC.success, size: 16),
                      const SizedBox(width: 7),
                      Expanded(child: Text('Tamu menginap atas nama ${_name.text.trim().isEmpty ? 'Anda' : _name.text.trim()}.',
                          style: TextStyle(fontSize: 12, color: MC.inkMuted))),
                    ]),
                  )
                : Padding(
                    padding: const EdgeInsets.only(top: 14),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      if (_savedGuests.isNotEmpty) ...[
                        Text('Tamu Tersimpan', style: TextStyle(fontSize: 12, color: MC.inkMuted)),
                        const SizedBox(height: 8),
                        Wrap(spacing: 8, runSpacing: 8, children: _savedGuests.map((g) {
                          final sel = _guest.text.trim() == g.name;
                          return GestureDetector(
                            onTap: () => setState(() => _guest.text = g.name),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                              decoration: BoxDecoration(
                                color: sel ? MC.primarySoft : MC.field,
                                borderRadius: BorderRadius.circular(20),
                                border: Border.all(color: sel ? MC.primary : Colors.transparent),
                              ),
                              child: Row(mainAxisSize: MainAxisSize.min, children: [
                                Icon(sel ? Icons.check_circle_rounded : Icons.person_outline_rounded,
                                    size: 15, color: sel ? MC.primaryDark : MC.inkMuted),
                                const SizedBox(width: 6),
                                Text(g.name, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: sel ? MC.primaryDark : MC.ink)),
                              ]),
                            ),
                          );
                        }).toList()),
                        const SizedBox(height: 14),
                      ],
                      _labeled('Nama Tamu yang Menginap', _guest, hint: 'Sesuai identitas tamu'),
                      GestureDetector(
                        onTap: () => setState(() => _saveGuest = !_saveGuest),
                        behavior: HitTestBehavior.opaque,
                        child: Row(children: [
                          Icon(_saveGuest ? Icons.check_box_rounded : Icons.check_box_outline_blank_rounded,
                              size: 20, color: _saveGuest ? MC.primary : MC.inkFaint),
                          const SizedBox(width: 8),
                          Text('Simpan tamu ini untuk pemesanan berikutnya', style: TextStyle(fontSize: 12.5, color: MC.inkMuted)),
                        ]),
                      ),
                    ]),
                  ),
          ),
        ]),
      );

  Widget _segToggle() => Container(
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(color: MC.field, borderRadius: BorderRadius.circular(14)),
        child: Row(children: [
          _segOpt('Saya Sendiri', Icons.person_rounded, _forSelf, () => setState(() => _forSelf = true)),
          _segOpt('Orang Lain', Icons.group_rounded, !_forSelf, () => setState(() => _forSelf = false)),
        ]),
      );

  Widget _segOpt(String label, IconData icon, bool selected, VoidCallback onTap) => Expanded(
        child: GestureDetector(
          onTap: onTap,
          behavior: HitTestBehavior.opaque,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            curve: Curves.easeOut,
            padding: const EdgeInsets.symmetric(vertical: 10),
            decoration: BoxDecoration(
              color: selected ? MC.surface : Colors.transparent,
              borderRadius: BorderRadius.circular(11),
              boxShadow: selected ? [softShadow] : null,
            ),
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              Icon(icon, size: 16, color: selected ? MC.primary : MC.inkFaint),
              const SizedBox(width: 6),
              Text(label, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: selected ? MC.ink : MC.inkMuted)),
            ]),
          ),
        ),
      );

  Widget _labeled(String label, TextEditingController c, {TextInputType? keyboard, String? hint}) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: TextStyle(fontSize: 12, color: MC.inkMuted)),
          const SizedBox(height: 6),
          TextField(
            controller: c, keyboardType: keyboard,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(isDense: true, hintText: hint),
          ),
        ]),
      );

  Widget _promoCard() => cardBox(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Kode Promo', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(child: TextField(
              controller: _promo,
              textCapitalization: TextCapitalization.characters,
              decoration: const InputDecoration(hintText: 'mis. MIRUUM30', isDense: true),
            )),
            const SizedBox(width: 10),
            SizedBox(height: 44, child: ElevatedButton(
              onPressed: _checkingPromo ? null : _applyPromo,
              style: ElevatedButton.styleFrom(
                backgroundColor: MC.primary, foregroundColor: Colors.white, elevation: 0,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: _checkingPromo
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Terapkan'),
            )),
          ]),
          if (_appliedPromo != null) ...[
            const SizedBox(height: 10),
            Row(children: [
              const Icon(Icons.check_circle_rounded, color: MC.success, size: 16),
              const SizedBox(width: 6),
              Text('$_appliedPromo diterapkan — hemat ${rupiah(_discount)}',
                  style: const TextStyle(color: MC.success, fontSize: 12.5, fontWeight: FontWeight.w600)),
            ]),
          ],
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

  Widget _priceRow(String label, String value, {bool discount = false, bool bold = false}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text(label, style: TextStyle(fontSize: bold ? 14.5 : 13, color: bold ? MC.ink : MC.inkMuted, fontWeight: bold ? FontWeight.w800 : FontWeight.w500)),
          Text(value, style: TextStyle(fontSize: bold ? 16 : 13, fontWeight: bold ? FontWeight.w800 : FontWeight.w600, color: discount ? MC.success : (bold ? MC.primaryDark : MC.ink))),
        ]),
      );

  Widget _priceBreakdown() {
    final unit = _isPackage ? 'paket' : '${widget.nights} malam × ${widget.rooms} kamar';
    return cardBox(child: Column(children: [
      Row(children: [const Icon(Icons.receipt_long_rounded, size: 18, color: MC.primary), const SizedBox(width: 8),
        const Text('Rincian Harga', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15))]),
      const SizedBox(height: 10),
      _priceRow('Harga kamar ($unit)', rupiah(_roomPrice)),
      _priceRow('Pajak & biaya layanan (${_taxPct.toStringAsFixed(_taxPct % 1 == 0 ? 0 : 1)}%)', rupiah(_tax)),
      if (_discount > 0) _priceRow('Diskon${_appliedPromo != null ? ' ($_appliedPromo)' : ''}', '- ${rupiah(_discount)}', discount: true),
      if (_pointsDiscount > 0) _priceRow('Poin Miruum', '- ${rupiah(_pointsDiscount)}', discount: true),
      Divider(height: 18, color: MC.line),
      _priceRow('Total', rupiah(_total), bold: true),
    ]));
  }

  Widget _loyaltyCard() => cardBox(
        child: Row(children: [
          Container(
            padding: const EdgeInsets.all(9),
            decoration: BoxDecoration(color: MC.primarySoft, borderRadius: BorderRadius.circular(11)),
            child: const Icon(Icons.stars_rounded, color: MC.primary, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Gunakan Poin Miruum', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
            Text('$_points poin · hemat s/d ${rupiah(((_roomPrice + _tax - _discount) * _maxRedeemPct / 100).floor())}',
                style: TextStyle(color: MC.inkMuted, fontSize: 12)),
          ])),
          Switch(value: _usePoints, activeColor: MC.primary, onChanged: (v) => setState(() => _usePoints = v)),
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
            Expanded(
              flex: 4,
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                Text('Total', style: TextStyle(fontSize: 11, color: MC.inkFaint), maxLines: 1, overflow: TextOverflow.ellipsis),
                Text(rupiah(_total), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: MC.primaryDark), maxLines: 1, overflow: TextOverflow.ellipsis),
                Text('Termasuk pajak & layanan', style: TextStyle(fontSize: 10, color: MC.inkFaint), maxLines: 1, overflow: TextOverflow.ellipsis),
              ]),
            ),
            const SizedBox(width: 12),
            Expanded(flex: 5, child: PrimaryButton('Pesan Sekarang', loading: _loading, onPressed: _submit)),
          ]),
        ),
      );
}
