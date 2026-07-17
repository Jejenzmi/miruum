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

/// Airport shuttle — antar-jemput Bandara Soekarno-Hatta (CGK). One end is
/// always the airport terminal; the other is the guest's location (GPS or a
/// point tapped on the map). Pick direction → fare per vehicle → ride → track.
class ShuttleScreen extends StatefulWidget {
  const ShuttleScreen({super.key});
  @override
  State<ShuttleScreen> createState() => _ShuttleScreenState();
}

enum _Phase { pick, choose, ride }

// Soekarno-Hatta terminals (approx. coordinates).
final _terminals = <String, LatLng>{
  'Terminal 1': const LatLng(-6.1284, 106.6540),
  'Terminal 2': const LatLng(-6.1256, 106.6520),
  'Terminal 3': const LatLng(-6.1206, 106.6586),
};

class _ShuttleScreenState extends State<ShuttleScreen> {
  final _map = MapController();
  bool _toAirport = true; // true = Ke Bandara, false = Dari Bandara
  String _terminal = 'Terminal 3';
  LatLng? _userPoint; // guest side (GPS or tapped)
  _Phase _phase = _Phase.pick;

  double _distanceKm = 0;
  int _etaMin = 0;
  List<ShuttleVehicleType> _options = [];
  ShuttleVehicleType? _selected;
  String _payment = 'CASH';
  ShuttleRide? _ride;
  bool _busy = false;

  LatLng get _airport => _terminals[_terminal]!;

  @override
  void initState() {
    super.initState();
    _locateMe();
  }

  Future<void> _locateMe() async {
    final pos = await getMyLocation(context);
    if (pos != null && mounted) {
      setState(() => _userPoint = LatLng(pos.latitude, pos.longitude));
      _fit();
    }
  }

  void _fit() {
    if (_userPoint == null) { _map.move(_airport, 12); return; }
    final c = LatLng((_airport.latitude + _userPoint!.latitude) / 2, (_airport.longitude + _userPoint!.longitude) / 2);
    _map.move(c, 10.5);
  }

  Future<void> _estimate() async {
    if (_userPoint == null) return;
    final o = _toAirport ? _userPoint! : _airport;
    final d = _toAirport ? _airport : _userPoint!;
    setState(() => _busy = true);
    try {
      final r = await context.read<Api>().shuttleEstimate(
          originLat: o.latitude, originLng: o.longitude, destLat: d.latitude, destLng: d.longitude);
      final opts = (r['options'] as List).map((v) => ShuttleVehicleType.fromJson(v)).toList();
      setState(() {
        _distanceKm = (r['distanceKm'] ?? 0).toDouble();
        _etaMin = r['etaMin'] ?? 0;
        _options = opts;
        _selected = opts.isNotEmpty ? opts.first : null;
        _phase = _Phase.choose;
      });
    } catch (_) {
      if (mounted) showSnack(context, 'Gagal menghitung tarif.', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _request() async {
    if (_selected == null || _userPoint == null) return;
    final o = _toAirport ? _userPoint! : _airport;
    final d = _toAirport ? _airport : _userPoint!;
    final airportLabel = 'Soekarno-Hatta · $_terminal';
    setState(() => _busy = true);
    try {
      final ride = await context.read<Api>().shuttleRequest(
        vehicleTypeId: _selected!.id,
        originLabel: _toAirport ? 'Lokasi saya' : airportLabel, originLat: o.latitude, originLng: o.longitude,
        destLabel: _toAirport ? airportLabel : 'Lokasi saya', destLat: d.latitude, destLng: d.longitude,
        paymentMethod: _payment);
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
        _phase = _Phase.pick; _options = []; _selected = null; _ride = null; _distanceKm = 0;
      });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: MC.bg,
      appBar: AppBar(title: const Text('Shuttle Bandara', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 17))),
      body: Column(children: [
        Expanded(
          child: Stack(children: [
            FlutterMap(
              mapController: _map,
              options: MapOptions(
                initialCenter: _airport, initialZoom: 11,
                onTap: (_, p) { if (_phase == _Phase.pick) setState(() => _userPoint = p); },
              ),
              children: [
                TileLayer(urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', userAgentPackageName: 'id.gokar.miruum'),
                if (_userPoint != null)
                  PolylineLayer(polylines: [Polyline(points: [_airport, _userPoint!], strokeWidth: 4, color: MC.primary.withOpacity(0.7))]),
                MarkerLayer(markers: [
                  Marker(point: _airport, width: 46, height: 46, child: Container(
                    decoration: BoxDecoration(color: MC.blue, shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 2)),
                    child: const Icon(Icons.local_airport_rounded, color: Colors.white, size: 24))),
                  if (_userPoint != null)
                    Marker(point: _userPoint!, width: 44, height: 44, child: const Icon(Icons.location_on_rounded, color: MC.primary, size: 40)),
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
                  Expanded(child: Text(_userPoint == null ? 'Ketuk peta / GPS untuk titik lokasimu' : 'Lokasi dipilih — lihat tarif di bawah',
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
        return _wrap(Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          // Direction toggle
          Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(color: MC.field, borderRadius: BorderRadius.circular(12)),
            child: Row(children: [
              _dirBtn('Ke Bandara', Icons.flight_takeoff_rounded, true),
              _dirBtn('Dari Bandara', Icons.flight_land_rounded, false),
            ]),
          ),
          const SizedBox(height: 14),
          // Route rows (airport end fixed; guest end = location)
          if (_toAirport) ...[
            _routeRow(Icons.my_location_rounded, MC.success, 'Titik Jemput', _userPoint == null ? 'Ketuk peta untuk memilih' : 'Lokasi saya'),
            const Divider(height: 16),
            _airportRow('Tujuan'),
          ] else ...[
            _airportRow('Titik Jemput'),
            const Divider(height: 16),
            _routeRow(Icons.location_on_rounded, MC.primary, 'Tujuan', _userPoint == null ? 'Ketuk peta untuk memilih' : 'Lokasi saya'),
          ],
          const SizedBox(height: 14),
          PrimaryButton('Lihat Tarif', icon: Icons.local_taxi_rounded, loading: _busy,
              onPressed: _userPoint == null ? null : _estimate),
        ]));
      case _Phase.choose:
        return _wrap(Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(_toAirport ? Icons.flight_takeoff_rounded : Icons.flight_land_rounded, size: 16, color: MC.blue),
            const SizedBox(width: 6),
            Text(_toAirport ? 'Ke $_terminal' : 'Dari $_terminal', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
            const Spacer(),
            Text('${_distanceKm.toStringAsFixed(1)} km · ±$_etaMin mnt', style: TextStyle(color: MC.inkMuted, fontSize: 12)),
            const SizedBox(width: 8),
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

  Widget _dirBtn(String label, IconData icon, bool val) {
    final sel = _toAirport == val;
    return Expanded(child: GestureDetector(
      onTap: () => setState(() { _toAirport = val; }),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 9),
        decoration: BoxDecoration(color: sel ? MC.surface : Colors.transparent, borderRadius: BorderRadius.circular(9),
            boxShadow: sel ? [softShadow] : null),
        child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(icon, size: 16, color: sel ? MC.primaryDark : MC.inkFaint),
          const SizedBox(width: 6),
          Text(label, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: sel ? MC.ink : MC.inkMuted)),
        ]),
      ),
    ));
  }

  // Airport endpoint row with an inline terminal picker.
  Widget _airportRow(String label) => Row(children: [
        Icon(Icons.local_airport_rounded, color: MC.blue, size: 20), const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: TextStyle(color: MC.inkFaint, fontSize: 11)),
          const Text('Bandara Soekarno-Hatta', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
        ])),
        DropdownButton<String>(
          value: _terminal, underline: const SizedBox(), isDense: true,
          style: const TextStyle(color: MC.primaryDark, fontWeight: FontWeight.w700, fontSize: 12.5),
          items: _terminals.keys.map((t) => DropdownMenuItem(value: t, child: Text(t))).toList(),
          onChanged: (v) { if (v != null) setState(() { _terminal = v; _fit(); }); },
        ),
      ]);

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
      const SizedBox(height: 8),
      Row(children: [
        Icon(_toAirport ? Icons.flight_takeoff_rounded : Icons.flight_land_rounded, size: 15, color: MC.blue),
        const SizedBox(width: 6),
        Expanded(child: Text('${r.originLabel}  →  ${r.destLabel}', style: TextStyle(fontSize: 12, color: MC.inkMuted), maxLines: 1, overflow: TextOverflow.ellipsis)),
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
        PrimaryButton('Pesan Shuttle Lagi', onPressed: _reset),
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
