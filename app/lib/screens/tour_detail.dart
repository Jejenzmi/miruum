import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import '../api.dart';
import '../feedback.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets.dart';

class TourDetailScreen extends StatefulWidget {
  final String tourId;
  const TourDetailScreen(this.tourId, {super.key});
  @override
  State<TourDetailScreen> createState() => _TourDetailScreenState();
}

class _TourDetailScreenState extends State<TourDetailScreen> {
  late Future<Tour> _future;
  @override
  void initState() {
    super.initState();
    _future = context.read<Api>().tour(widget.tourId);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: MC.bg,
      body: FutureBuilder<Tour>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator(color: MC.primary));
          }
          if (!snap.hasData) {
            return Center(child: Text('Gagal memuat tour.', style: TextStyle(color: MC.inkMuted)));
          }
          final t = snap.data!;
          return Column(children: [
            Expanded(
              child: CustomScrollView(slivers: [
                SliverAppBar(
                  expandedHeight: 240, pinned: true, backgroundColor: MC.primary,
                  flexibleSpace: FlexibleSpaceBar(background: NetImage(t.imageUrl, fit: BoxFit.cover)),
                ),
                SliverToBoxAdapter(child: Padding(
                  padding: const EdgeInsets.all(18),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Container(padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                        decoration: BoxDecoration(color: MC.primarySoft, borderRadius: BorderRadius.circular(8)),
                        child: Text(t.category, style: const TextStyle(color: MC.primaryDark, fontSize: 11.5, fontWeight: FontWeight.w700))),
                      const Spacer(),
                      const Icon(Icons.star_rounded, size: 16, color: MC.star),
                      const SizedBox(width: 2),
                      Text('${t.rating.toStringAsFixed(1)} (${t.reviewCount})', style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600)),
                    ]),
                    const SizedBox(height: 10),
                    Text(t.title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 20, height: 1.25)),
                    const SizedBox(height: 8),
                    Row(children: [
                      Icon(Icons.location_on_rounded, size: 15, color: MC.inkFaint),
                      const SizedBox(width: 4),
                      Text(t.city, style: TextStyle(color: MC.inkMuted, fontSize: 13)),
                      const SizedBox(width: 14),
                      Icon(Icons.schedule_rounded, size: 15, color: MC.inkFaint),
                      const SizedBox(width: 4),
                      Text('${t.durationHours} jam', style: TextStyle(color: MC.inkMuted, fontSize: 13)),
                    ]),
                    const Divider(height: 26),
                    _section('Deskripsi'),
                    Text(t.description, style: TextStyle(color: MC.inkMuted, fontSize: 13.5, height: 1.6)),
                    if (t.highlights.isNotEmpty) ...[
                      const SizedBox(height: 18), _section('Highlight'),
                      ...t.highlights.map((h) => _bullet(h, Icons.star_rounded, MC.accent)),
                    ],
                    if (t.included.isNotEmpty) ...[
                      const SizedBox(height: 18), _section('Termasuk'),
                      ...t.included.map((h) => _bullet(h, Icons.check_circle_rounded, MC.success)),
                    ],
                    if ((t.meetingPoint ?? '').isNotEmpty) ...[
                      const SizedBox(height: 18), _section('Titik Kumpul'),
                      Row(children: [
                        const Icon(Icons.place_rounded, size: 16, color: MC.primary),
                        const SizedBox(width: 6),
                        Expanded(child: Text(t.meetingPoint!, style: TextStyle(color: MC.inkMuted, fontSize: 13.5))),
                      ]),
                    ],
                    const SizedBox(height: 20),
                  ]),
                )),
              ]),
            ),
            _bottomBar(t),
          ]);
        },
      ),
    );
  }

  Widget _section(String t) => Padding(padding: const EdgeInsets.only(bottom: 8),
      child: Text(t, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)));
  Widget _bullet(String text, IconData icon, Color c) => Padding(
        padding: const EdgeInsets.only(bottom: 7),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, size: 16, color: c), const SizedBox(width: 8),
          Expanded(child: Text(text, style: TextStyle(fontSize: 13.5, color: MC.ink, height: 1.4))),
        ]),
      );

  Widget _bottomBar(Tour t) => Container(
        padding: const EdgeInsets.fromLTRB(18, 12, 18, 18),
        decoration: BoxDecoration(color: MC.surface, boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.07), blurRadius: 14, offset: const Offset(0, -3))]),
        child: SafeArea(top: false, child: Row(children: [
          Expanded(flex: 4, child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            Text('Mulai dari', style: TextStyle(fontSize: 11, color: MC.inkFaint), maxLines: 1),
            Text(rupiah(t.price), maxLines: 1, overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: MC.primaryDark, fontWeight: FontWeight.w800, fontSize: 18)),
            Text('per orang', style: TextStyle(fontSize: 10.5, color: MC.inkFaint), maxLines: 1),
          ])),
          const SizedBox(width: 12),
          Expanded(flex: 5, child: PrimaryButton('Pesan Tour', icon: Icons.event_available_rounded, onPressed: () => _openBooking(t))),
        ])),
      );

  void _openBooking(Tour t) => showModalBottomSheet(
        context: context, isScrollControlled: true, backgroundColor: Colors.transparent,
        builder: (_) => _BookingSheet(tour: t),
      );
}

class _BookingSheet extends StatefulWidget {
  final Tour tour;
  const _BookingSheet({required this.tour});
  @override
  State<_BookingSheet> createState() => _BookingSheetState();
}

class _BookingSheetState extends State<_BookingSheet> {
  final _name = TextEditingController();
  final _phone = TextEditingController();
  DateTime _date = DateTime.now().add(const Duration(days: 1));
  int _pax = 2;
  String _method = 'QRIS';
  bool _loading = false;

  int get _total => widget.tour.price * _pax;

  Future<void> _submit() async {
    if (_name.text.trim().isEmpty || _phone.text.trim().length < 6) {
      showSnack(context, 'Isi nama & nomor telepon pemesan.', kind: SnackKind.error);
      return;
    }
    setState(() => _loading = true);
    try {
      final res = await context.read<Api>().bookTour(widget.tour.id,
          date: DateFormat('yyyy-MM-dd').format(_date), pax: _pax,
          bookerName: _name.text.trim(), bookerPhone: _phone.text.trim(), paymentMethod: _method);
      final code = (res['booking']?['code'] ?? '').toString();
      if (!mounted) return;
      Navigator.pop(context);
      showDialog(context: context, builder: (_) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Row(children: [const Icon(Icons.check_circle_rounded, color: MC.success), const SizedBox(width: 8), const Text('Tour Terpesan')]),
        content: Text('Pemesanan tour berhasil.\nNo. Pesanan: $code\n${_pax} peserta · ${DateFormat('d MMM yyyy', 'id_ID').format(_date)}'),
        actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Selesai'))],
      ));
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.status == 401 ? 'Silakan login untuk memesan tour.' : e.message, kind: SnackKind.error);
    } catch (_) {
      if (mounted) showSnack(context, 'Gagal memesan tour.', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        decoration: BoxDecoration(color: MC.surface, borderRadius: const BorderRadius.vertical(top: Radius.circular(24))),
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: MC.line, borderRadius: BorderRadius.circular(2)))),
          const SizedBox(height: 14),
          Text('Pesan ${widget.tour.title}', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          const SizedBox(height: 16),
          // Date
          _label('Tanggal Keberangkatan'),
          GestureDetector(
            onTap: () async {
              final d = await showDatePicker(context: context, initialDate: _date,
                  firstDate: DateTime.now(), lastDate: DateTime.now().add(const Duration(days: 365)));
              if (d != null) setState(() => _date = d);
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
              decoration: BoxDecoration(color: MC.field, borderRadius: BorderRadius.circular(12)),
              child: Row(children: [
                const Icon(Icons.calendar_month_rounded, size: 18, color: MC.primary),
                const SizedBox(width: 10),
                Text(DateFormat('EEEE, d MMM yyyy', 'id_ID').format(_date), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5)),
              ]),
            ),
          ),
          const SizedBox(height: 14),
          // Pax stepper
          Row(children: [
            Expanded(child: _label('Jumlah Peserta')),
            _stepBtn(Icons.remove_rounded, () { if (_pax > 1) setState(() => _pax--); }),
            SizedBox(width: 42, child: Text('$_pax', textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16))),
            _stepBtn(Icons.add_rounded, () { if (_pax < widget.tour.maxPax) setState(() => _pax++); }),
          ]),
          const SizedBox(height: 14),
          _label('Nama Pemesan'),
          TextField(controller: _name, decoration: _dec('Nama lengkap')),
          const SizedBox(height: 12),
          _label('No. Telepon'),
          TextField(controller: _phone, keyboardType: TextInputType.phone, decoration: _dec('08xxxxxxxxxx')),
          const SizedBox(height: 14),
          _label('Metode Pembayaran'),
          Wrap(spacing: 8, children: ['QRIS', 'Transfer Bank', 'E-Wallet'].map((m) {
            final sel = m == _method;
            return ChoiceChip(label: Text(m), selected: sel, onSelected: (_) => setState(() => _method = m),
                selectedColor: MC.primarySoft, labelStyle: TextStyle(color: sel ? MC.primaryDark : MC.inkMuted, fontWeight: FontWeight.w600, fontSize: 12.5));
          }).toList()),
          const SizedBox(height: 16),
          Container(padding: const EdgeInsets.all(14), decoration: BoxDecoration(color: MC.primarySoft, borderRadius: BorderRadius.circular(14)),
            child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              Text('Total ($_pax orang)', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5)),
              Text(rupiah(_total), style: const TextStyle(color: MC.primaryDark, fontWeight: FontWeight.w800, fontSize: 18)),
            ])),
          const SizedBox(height: 16),
          PrimaryButton('Bayar & Pesan', loading: _loading, onPressed: _submit),
        ]),
      ),
    );
  }

  Widget _label(String t) => Padding(padding: const EdgeInsets.only(bottom: 6), child: Text(t, style: TextStyle(fontWeight: FontWeight.w600, fontSize: 12.5, color: MC.inkMuted)));
  InputDecoration _dec(String hint) => InputDecoration(hintText: hint, filled: true, fillColor: MC.field, isDense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none));
  Widget _stepBtn(IconData i, VoidCallback onTap) => GestureDetector(onTap: onTap, child: Container(
      width: 38, height: 38, decoration: BoxDecoration(color: MC.primarySoft, borderRadius: BorderRadius.circular(10)),
      child: Icon(i, size: 20, color: MC.primaryDark)));
}
