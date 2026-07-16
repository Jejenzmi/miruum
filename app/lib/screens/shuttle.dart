import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../api.dart';
import '../feedback.dart';
import '../location.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets.dart';

/// Shuttle / ride-hailing (Grab-style). Pick pickup + destination on the map,
/// compare fares by vehicle type, request → driver assigned → track the trip.
class ShuttleScreen extends StatefulWidget {
  const ShuttleScreen({super.key});
  @override
  State<ShuttleScreen> createState() => _ShuttleScreenState();
}

enum _Phase { pick, choose, ride }

class _ShuttleScreenState extends State<ShuttleScreen> {
  final _map = MapController();
  LatLng _pickup = const LatLng(-6.2088, 106.8456); // Jakarta default
  LatLng? _dest;
  _Phase _phase = _Phase.pick;

  double _distanceKm = 0;
  int _etaMin = 0;
  List<ShuttleVehicleType> _options = [];
  ShuttleVehicleType? _selected;
  String _payment = 'CASH';
  ShuttleRide? _ride;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _locateMe();
  }

  Future<void> _locateMe() async {
    final pos = await getMyLocation(context);
    if (pos != null && mounted) {
      setState(() => _pickup = LatLng(pos.latitude, pos.longitude));
      _map.move(_pickup, 14);
    }
  }

  Future<void> _estimate() async {
    if (_dest == null) return;
    setState(() => _busy = true);
    try {
      final r = await context.read<Api>().shuttleEstimate(
          originLat: _pickup.latitude, originLng: _pickup.longitude, destLat: _dest!.latitude, destLng: _dest!.longitude);
      final opts = (r['options'] as List).map((v) => ShuttleVehicleType.fromJson(v)).toList();
      setState(() {
        _distanceKm = (r['distanceKm'] ?? 0).toDouble();
        _etaMin = r['etaMin'] ?? 0;
        _options = opts;
        _selected = opts.isNotEmpty ? opts.first : null;
        _phase = _Phase.choose;
      });
    } catch (e) {
      if (mounted) showSnack(context, 'Gagal menghitung tarif.', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _request() async {
    if (_selected == null || _dest == null) return;
    setState(() => _busy = true);
    try {
      final ride = await context.read<Api>().shuttleRequest(
        vehicleTypeId: _selected!.id,
        originLabel: 'Lokasi saya', originLat: _pickup.latitude, originLng: _pickup.longitude,
        destLabel: 'Tujuan', destLat: _dest!.latitude, destLng: _dest!.longitude, paymentMethod: _payment);
      setState(() { _ride = ride; _phase = _Phase.ride; });
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.status == 401 ? 'Silakan login untuk memesan shuttle.' : e.message, kind: SnackKind.error);
    } catch (_) {
      if (mounted) showSnack(context, 'Gagal memesan shuttle.', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _advance(String status) async {
    if (_ride == null) return;
    setState(() => _busy = true);
    try {
      final r = await context.read<Api>().shuttleRideStatus(_ride!.id, status);
      setState(() => _ride = r);
    } catch (_) {
      if (mounted) showSnack(context, 'Gagal memperbarui perjalanan.', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _reset() => setState(() {
        _dest = null; _phase = _Phase.pick; _options = []; _selected = null; _ride = null; _distanceKm = 0;
      });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: MC.bg,
      appBar: AppBar(title: const Text('Shuttle', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 17))),
      body: Column(children: [
        Expanded(
          child: Stack(children: [
            FlutterMap(
              mapController: _map,
              options: MapOptions(
                initialCenter: _pickup, initialZoom: 13,
                onTap: (_, p) { if (_phase == _Phase.pick) setState(() => _dest = p); },
              ),
              children: [
                TileLayer(urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', userAgentPackageName: 'id.gokar.miruum'),
                if (_dest != null)
                  PolylineLayer(polylines: [Polyline(points: [_pickup, _dest!], strokeWidth: 4, color: MC.primary.withOpacity(0.7))]),
                MarkerLayer(markers: [
                  Marker(point: _pickup, width: 40, height: 40, child: const Icon(Icons.my_location_rounded, color: MC.success, size: 30)),
                  if (_dest != null)
                    Marker(point: _dest!, width: 44, height: 44, child: const Icon(Icons.location_on_rounded, color: MC.primary, size: 40)),
                ]),
              ],
            ),
            if (_phase == _Phase.pick)
              Positioned(top: 12, left: 16, right: 16, child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(color: MC.surface, borderRadius: BorderRadius.circular(12), boxShadow: [softShadow]),
                child: Row(children: [
                  const Icon(Icons.touch_app_rounded, color: MC.primary, size: 18),
                  const SizedBox(width: 8),
                  Expanded(child: Text(_dest == null ? 'Ketuk peta untuk memilih tujuan' : 'Tujuan dipilih — lihat tarif di bawah',
                      style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600))),
                ]),
              )),
            Positioned(right: 16, bottom: 16, child: FloatingActionButton.small(
              heroTag: 'loc', backgroundColor: MC.surface, foregroundColor: MC.primary, onPressed: _locateMe,
              child: const Icon(Icons.gps_fixed_rounded))),
          ]),
        ),
        _panel(),
      ]),
    );
  }

  Widget _panel() {
    switch (_phase) {
      case _Phase.pick:
        return _wrap(Column(mainAxisSize: MainAxisSize.min, children: [
          _routeRow(Icons.my_location_rounded, MC.success, 'Titik Jemput', 'Lokasi saya'),
          const Divider(height: 16),
          _routeRow(Icons.location_on_rounded, MC.primary, 'Tujuan', _dest == null ? 'Ketuk peta untuk memilih' : 'Titik tujuan dipilih'),
          const SizedBox(height: 14),
          PrimaryButton('Lihat Tarif', icon: Icons.local_taxi_rounded, loading: _busy,
              onPressed: _dest == null ? null : _estimate),
        ]));
      case _Phase.choose:
        return _wrap(Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Text('Jarak ${_distanceKm.toStringAsFixed(1)} km', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
            const SizedBox(width: 12),
            Icon(Icons.schedule_rounded, size: 14, color: MC.inkFaint),
            const SizedBox(width: 3),
            Text('± $_etaMin menit', style: TextStyle(color: MC.inkMuted, fontSize: 12.5)),
            const Spacer(),
            GestureDetector(onTap: _reset, child: Text('Ubah', style: TextStyle(color: MC.primary, fontWeight: FontWeight.w700, fontSize: 12.5))),
          ]),
          const SizedBox(height: 10),
          ..._options.map(_vehicleTile),
          const SizedBox(height: 10),
          Row(children: [
            Text('Bayar:', style: TextStyle(color: MC.inkMuted, fontSize: 12.5, fontWeight: FontWeight.w600)),
            const SizedBox(width: 8),
            ...['CASH', 'WALLET', 'QRIS'].map((m) => Padding(padding: const EdgeInsets.only(right: 6),
              child: ChoiceChip(label: Text(m == 'CASH' ? 'Tunai' : m), selected: _payment == m, onSelected: (_) => setState(() => _payment = m),
                selectedColor: MC.primarySoft, visualDensity: VisualDensity.compact,
                labelStyle: TextStyle(color: _payment == m ? MC.primaryDark : MC.inkMuted, fontWeight: FontWeight.w600, fontSize: 11.5)))),
          ]),
          const SizedBox(height: 12),
          PrimaryButton(_selected == null ? 'Pilih kendaraan' : 'Pesan ${_selected!.name} · ${rupiah(_selected!.fare)}',
              loading: _busy, onPressed: _selected == null ? null : _request),
        ]));
      case _Phase.ride:
        return _wrap(_rideCard());
    }
  }

  Widget _vehicleTile(ShuttleVehicleType v) {
    final sel = _selected?.id == v.id;
    return GestureDetector(
      onTap: () => setState(() => _selected = v),
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: sel ? MC.primarySoft : MC.field, borderRadius: BorderRadius.circular(12),
          border: Border.all(color: sel ? MC.primary : Colors.transparent, width: 1.4)),
        child: Row(children: [
          Icon(_vehicleIcon(v.icon), color: sel ? MC.primaryDark : MC.inkMuted, size: 26),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(v.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
            Text('${v.capacity} penumpang', style: TextStyle(color: MC.inkFaint, fontSize: 11.5)),
          ])),
          Text(rupiah(v.fare), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: MC.primaryDark)),
        ]),
      ),
    );
  }

  Widget _rideCard() {
    final r = _ride!;
    final done = r.status == 'COMPLETED' || r.status == 'CANCELLED';
    return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(color: _statusColor(r.status).withOpacity(0.14), borderRadius: BorderRadius.circular(20)),
          child: Text(_statusLabel(r.status), style: TextStyle(color: _statusColor(r.status), fontWeight: FontWeight.w700, fontSize: 12))),
        const Spacer(),
        Text('No. ${r.code}', style: TextStyle(color: MC.inkFaint, fontSize: 11.5)),
      ]),
      const SizedBox(height: 12),
      if (r.driverName != null)
        Row(children: [
          CircleAvatar(radius: 24, backgroundColor: MC.primarySoft, child: const Icon(Icons.person_rounded, color: MC.primaryDark, size: 28)),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(r.driverName!, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
            Row(children: [
              const Icon(Icons.star_rounded, size: 14, color: MC.star),
              const SizedBox(width: 2),
              Text('${(r.driverRating ?? 5).toStringAsFixed(1)}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
              const SizedBox(width: 8),
              Text('${r.vehicleType?.name ?? ''} · ${r.driverPlate ?? ''}', style: TextStyle(color: MC.inkMuted, fontSize: 12)),
            ]),
          ])),
          IconButton(onPressed: () {}, icon: const Icon(Icons.call_rounded, color: MC.success)),
        ]),
      const Divider(height: 20),
      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Text('${r.distanceKm.toStringAsFixed(1)} km · ${r.paymentMethod == 'CASH' ? 'Tunai' : r.paymentMethod}', style: TextStyle(color: MC.inkMuted, fontSize: 13)),
        Text(rupiah(r.fare), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17, color: MC.primaryDark)),
      ]),
      const SizedBox(height: 14),
      if (r.status == 'DRIVER_ASSIGNED')
        Row(children: [
          Expanded(child: OutlineButtonX('Batalkan', onPressed: _busy ? null : () => _advance('CANCELLED'))),
          const SizedBox(width: 10),
          Expanded(child: PrimaryButton('Mulai Perjalanan', loading: _busy, onPressed: () => _advance('ONGOING'))),
        ])
      else if (r.status == 'ONGOING')
        PrimaryButton('Selesaikan Perjalanan', icon: Icons.flag_rounded, loading: _busy, onPressed: () => _advance('COMPLETED'))
      else if (done)
        PrimaryButton(r.status == 'COMPLETED' ? 'Pesan Lagi' : 'Pesan Shuttle Lagi', onPressed: _reset),
    ]);
  }

  Widget _wrap(Widget child) => Container(
        width: double.infinity,
        decoration: BoxDecoration(color: MC.surface, borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
            boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.08), blurRadius: 16, offset: const Offset(0, -4))]),
        padding: const EdgeInsets.fromLTRB(18, 16, 18, 18),
        child: SafeArea(top: false, child: child),
      );

  Widget _routeRow(IconData i, Color c, String label, String value) => Row(children: [
        Icon(i, color: c, size: 20), const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: TextStyle(color: MC.inkFaint, fontSize: 11)),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5)),
        ])),
      ]);

  IconData _vehicleIcon(String k) => switch (k) {
        'bike' => Icons.two_wheeler_rounded,
        'premium' => Icons.local_taxi_rounded,
        'van' => Icons.airport_shuttle_rounded,
        _ => Icons.directions_car_rounded,
      };
  Color _statusColor(String s) => switch (s) {
        'COMPLETED' => MC.success,
        'CANCELLED' => MC.danger,
        'ONGOING' => MC.blue,
        _ => MC.accent,
      };
  String _statusLabel(String s) => switch (s) {
        'DRIVER_ASSIGNED' => 'Driver ditemukan',
        'ONGOING' => 'Dalam perjalanan',
        'COMPLETED' => 'Selesai',
        'CANCELLED' => 'Dibatalkan',
        _ => s,
      };
}
