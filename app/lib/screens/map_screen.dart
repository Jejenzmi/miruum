import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets.dart';
import 'hotel_detail.dart';

/// Map of hotels (OpenStreetMap tiles). Tap a marker to preview + open detail.
class MapScreen extends StatefulWidget {
  final List<Hotel> hotels;
  const MapScreen({super.key, required this.hotels});
  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  Hotel? _selected;

  List<Hotel> get _located => widget.hotels.where((h) => h.lat != null && h.lng != null).toList();

  LatLng get _center {
    final l = _located;
    if (l.isEmpty) return const LatLng(-7.797, 110.370); // Yogyakarta default
    final lat = l.map((h) => h.lat!).reduce((a, b) => a + b) / l.length;
    final lng = l.map((h) => h.lng!).reduce((a, b) => a + b) / l.length;
    return LatLng(lat, lng);
  }

  @override
  Widget build(BuildContext context) {
    final located = _located;
    return Scaffold(
      appBar: AppBar(title: const Text('Peta Hotel')),
      body: Stack(children: [
        FlutterMap(
          options: MapOptions(initialCenter: _center, initialZoom: located.length > 1 ? 5.2 : 11),
          children: [
            TileLayer(
              urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              userAgentPackageName: 'id.gokar.miruum',
            ),
            MarkerLayer(
              markers: [
                for (final h in located)
                  Marker(
                    point: LatLng(h.lat!, h.lng!),
                    width: 44, height: 44,
                    child: GestureDetector(
                      onTap: () => setState(() => _selected = h),
                      child: Icon(Icons.location_on_rounded,
                          size: _selected?.id == h.id ? 44 : 36,
                          color: _selected?.id == h.id ? MC.primaryDark : MC.primary),
                    ),
                  ),
              ],
            ),
          ],
        ),
        if (located.isEmpty)
          const Center(child: Text('Lokasi hotel belum tersedia', style: TextStyle(color: MC.inkMuted))),
        if (_selected != null)
          Positioned(
            left: 16, right: 16, bottom: 20,
            child: GestureDetector(
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => HotelDetailScreen(_selected!.id))),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: MC.surface, borderRadius: BorderRadius.circular(16), boxShadow: [softShadow]),
                child: Row(children: [
                  ClipRRect(borderRadius: BorderRadius.circular(12), child: NetImage(_selected!.imageUrl, width: 64, height: 64)),
                  const SizedBox(width: 12),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(_selected!.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5)),
                    const SizedBox(height: 2),
                    Text(_selected!.city, style: const TextStyle(color: MC.inkMuted, fontSize: 12)),
                    const SizedBox(height: 4),
                    Row(children: [
                      const Icon(Icons.star_rounded, color: MC.star, size: 14),
                      Text(' ${_selected!.rating.toStringAsFixed(1)}', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12)),
                      const Spacer(),
                      Text(rupiah(_selected!.priceFrom), style: const TextStyle(fontWeight: FontWeight.w800, color: MC.primaryDark, fontSize: 13.5)),
                    ]),
                  ])),
                  const Icon(Icons.chevron_right_rounded, color: MC.inkFaint),
                ]),
              ),
            ),
          ),
      ]),
    );
  }
}
