import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../api.dart';
import '../feedback.dart';
import '../theme.dart';
import '../widgets.dart';
import '../l10n.dart';
import '../bloc/auth/auth_bloc.dart';
import 'venue_list.dart' show venueTypeLabel;

class VenueDetailScreen extends StatefulWidget {
  final String id;
  const VenueDetailScreen(this.id, {super.key});
  @override
  State<VenueDetailScreen> createState() => _VenueDetailScreenState();
}

class _VenueDetailScreenState extends State<VenueDetailScreen> {
  Map<String, dynamic>? _v;
  bool _loading = true, _submitting = false;
  DateTime? _date;
  String _slot = 'FULLDAY';
  String? _packageId;
  final _pax = TextEditingController(text: '0');
  final _eventType = TextEditingController();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _email = TextEditingController();
  final _notes = TextEditingController();

  @override
  void initState() {
    super.initState();
    final u = context.read<AuthBloc>().state.user;
    _name.text = u?.name ?? '';
    _phone.text = u?.phone ?? '';
    _email.text = u?.email ?? '';
    context.read<Api>().venue(widget.id).then((v) {
      if (mounted) setState(() { _v = v; _loading = false; });
    }).catchError((_) { if (mounted) setState(() => _loading = false); });
  }

  bool get _instant => _v?['bookingMode'] == 'INSTANT';
  List _packages() => (_v?['packages'] as List?) ?? const [];

  int get _estimate {
    if (_v == null) return 0;
    final p = _packages().cast<Map>().where((x) => x['id'] == _packageId).toList();
    final pax = int.tryParse(_pax.text) ?? 0;
    if (p.isNotEmpty) return (p.first['perPax'] == true) ? (p.first['price'] as int) * (pax < 1 ? 1 : pax) : p.first['price'] as int;
    return _v!['basePrice'] as int? ?? 0;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: MC.bg,
      appBar: AppBar(title: Text(tr('Detail Venue', 'Venue Detail'), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 17))),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _v == null
              ? Center(child: Text(tr('Venue tidak ditemukan.', 'Venue not found.'), style: TextStyle(color: MC.inkMuted)))
              : _body(),
    );
  }

  Widget _body() {
    final v = _v!;
    final hotel = (v['hotel'] as Map?) ?? const {};
    final img = (v['imageUrl'] as String?)?.isNotEmpty == true ? v['imageUrl'] : hotel['imageUrl'];
    return ListView(padding: EdgeInsets.zero, children: [
      if (img != null) NetImage(img, width: double.infinity, height: 210),
      Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(v['name'] as String? ?? '', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 21)),
          const SizedBox(height: 4),
          Text('${hotel['name'] ?? ''} · ${hotel['city'] ?? ''}', style: TextStyle(color: MC.inkMuted, fontSize: 13)),
          if ((v['description'] as String?)?.isNotEmpty == true) ...[
            const SizedBox(height: 12),
            Text(v['description'] as String, style: const TextStyle(fontSize: 14, height: 1.5)),
          ],
          const SizedBox(height: 14),
          Row(children: [
            _cap('Theatre', v['capTheatre']),
            _cap('Classroom', v['capClassroom']),
            _cap('Round', v['capRound']),
            _cap('m²', v['area']),
          ]),
          if (_packages().isNotEmpty) ...[
            const SizedBox(height: 18),
            Text(tr('Paket', 'Packages'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            const SizedBox(height: 8),
            ..._packages().cast<Map>().map((p) => Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: MC.surface, borderRadius: BorderRadius.circular(12), boxShadow: [softShadow]),
                  child: Row(children: [
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(p['name'] as String? ?? '', style: const TextStyle(fontWeight: FontWeight.w700)),
                      if ((p['inclusions'] as List?)?.isNotEmpty == true)
                        Padding(padding: const EdgeInsets.only(top: 2), child: Text((p['inclusions'] as List).join(' · '), style: TextStyle(color: MC.inkMuted, fontSize: 12))),
                    ])),
                    Text('${rupiah(p['price'] as int? ?? 0)}${p['perPax'] == true ? tr('/org', '/pax') : ''}', style: const TextStyle(color: MC.primaryDark, fontWeight: FontWeight.w800)),
                  ]),
                )),
          ],
          const SizedBox(height: 20),
          // ── Booking / inquiry form ──
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: MC.surface, borderRadius: BorderRadius.circular(16), boxShadow: [softShadow]),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(_instant ? tr('Pesan Venue', 'Book Venue') : tr('Ajukan Permintaan', 'Request a Quote'),
                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
              const SizedBox(height: 2),
              Text(_instant ? rupiah(_estimate) : tr('Harga menyesuaikan kebutuhan acara.', 'Price tailored to your event.'),
                  style: TextStyle(color: MC.inkMuted, fontSize: 13)),
              const SizedBox(height: 12),
              _field(tr('Tanggal Acara', 'Event Date'),
                  InkWell(
                    onTap: _pickDate,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
                      decoration: BoxDecoration(border: Border.all(color: MC.line), borderRadius: BorderRadius.circular(10)),
                      child: Text(_date == null ? tr('Pilih tanggal', 'Pick a date') : _date!.toIso8601String().substring(0, 10),
                          style: TextStyle(color: _date == null ? MC.inkFaint : MC.ink)),
                    ),
                  )),
              _field(tr('Sesi', 'Session'), _dropdown(_slot, const {
                'FULLDAY': 'Full-day', 'MORNING': 'Pagi', 'AFTERNOON': 'Siang', 'EVENING': 'Malam',
              }, (x) => setState(() => _slot = x))),
              if (_packages().isNotEmpty)
                _field(tr('Paket (opsional)', 'Package (optional)'), _dropdown(_packageId ?? '', {
                  '': tr('Tanpa paket', 'No package'),
                  for (final p in _packages().cast<Map>()) p['id'] as String: p['name'] as String,
                }, (x) => setState(() => _packageId = x.isEmpty ? null : x))),
              Row(children: [
                Expanded(child: _field(tr('Jumlah Tamu', 'Guests'), _input(_pax, keyboard: TextInputType.number, onChanged: (_) => setState(() {})))),
                const SizedBox(width: 10),
                Expanded(child: _field(tr('Jenis Acara', 'Event Type'), _input(_eventType, hint: tr('mis. Wedding', 'e.g. Wedding')))),
              ]),
              const Divider(height: 22),
              _field(tr('Nama', 'Name'), _input(_name)),
              Row(children: [
                Expanded(child: _field(tr('No. HP', 'Phone'), _input(_phone, keyboard: TextInputType.phone))),
                const SizedBox(width: 10),
                Expanded(child: _field('Email', _input(_email, keyboard: TextInputType.emailAddress))),
              ]),
              _field(tr('Catatan', 'Notes'), _input(_notes, hint: tr('Kebutuhan acara…', 'Event requirements…'), lines: 2)),
              const SizedBox(height: 6),
              SizedBox(width: double.infinity, child: ElevatedButton(
                onPressed: _submitting ? null : _submit,
                child: Text(_submitting ? '…' : (_instant ? tr('Pesan Sekarang', 'Book Now') : tr('Kirim Permintaan', 'Send Inquiry'))),
              )),
            ]),
          ),
          const SizedBox(height: 30),
        ]),
      ),
    ]);
  }

  Widget _cap(String label, dynamic val) => Expanded(
        child: Container(
          margin: const EdgeInsets.only(right: 8),
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(color: MC.bg, borderRadius: BorderRadius.circular(12)),
          child: Column(children: [
            Text('${val ?? '-'}', style: const TextStyle(fontWeight: FontWeight.w800)),
            Text(label, style: TextStyle(color: MC.inkFaint, fontSize: 10.5)),
          ]),
        ),
      );

  Widget _field(String label, Widget child) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: TextStyle(color: MC.inkMuted, fontSize: 12.5, fontWeight: FontWeight.w600)),
          const SizedBox(height: 4),
          child,
        ]),
      );

  Widget _input(TextEditingController c, {String? hint, TextInputType? keyboard, int lines = 1, void Function(String)? onChanged}) => TextField(
        controller: c, keyboardType: keyboard, maxLines: lines, onChanged: onChanged,
        decoration: InputDecoration(hintText: hint, isDense: true,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12)),
      );

  Widget _dropdown(String value, Map<String, String> opts, void Function(String) onChanged) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(border: Border.all(color: MC.line), borderRadius: BorderRadius.circular(10)),
        child: DropdownButtonHideUnderline(
          child: DropdownButton<String>(
            value: opts.containsKey(value) ? value : opts.keys.first,
            isExpanded: true,
            items: opts.entries.map((e) => DropdownMenuItem(value: e.key, child: Text(e.value))).toList(),
            onChanged: (x) => x == null ? null : onChanged(x),
          ),
        ),
      );

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final d = await showDatePicker(context: context, initialDate: now.add(const Duration(days: 7)), firstDate: now, lastDate: now.add(const Duration(days: 730)));
    if (d != null) setState(() => _date = d);
  }

  Future<void> _submit() async {
    if (_date == null) { showSnack(context, tr('Pilih tanggal acara.', 'Pick an event date.'), kind: SnackKind.error); return; }
    if (_name.text.trim().isEmpty) { showSnack(context, tr('Isi nama.', 'Enter your name.'), kind: SnackKind.error); return; }
    setState(() => _submitting = true);
    try {
      await context.read<Api>().venueBook(widget.id, {
        'eventDate': _date!.toIso8601String().substring(0, 10),
        'slot': _slot,
        if (_packageId != null) 'packageId': _packageId,
        'pax': int.tryParse(_pax.text) ?? 0,
        'eventType': _eventType.text.trim(),
        'customerName': _name.text.trim(),
        'customerPhone': _phone.text.trim(),
        'customerEmail': _email.text.trim(),
        'notes': _notes.text.trim(),
      });
      if (!mounted) return;
      await showDialog(context: context, builder: (_) => AlertDialog(
        title: Text(_instant ? tr('Booking Terkonfirmasi', 'Booking Confirmed') : tr('Permintaan Terkirim', 'Inquiry Sent')),
        content: Text(_instant
            ? tr('Tim hotel akan menghubungi untuk detail & pembayaran.', 'The hotel will contact you for details & payment.')
            : tr('Tim hotel akan mengirim penawaran secepatnya.', 'The hotel will send you a quotation shortly.')),
        actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('OK'))],
      ));
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) showSnack(context, tr('Gagal mengirim. Coba lagi.', 'Failed to submit. Try again.'), kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}
