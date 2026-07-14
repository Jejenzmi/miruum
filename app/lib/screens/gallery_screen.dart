import 'package:flutter/material.dart';
import '../widgets.dart';

/// Fullscreen, swipeable, pinch-to-zoom photo gallery.
class GalleryScreen extends StatefulWidget {
  final List<String> photos;
  final int initialIndex;
  const GalleryScreen({super.key, required this.photos, this.initialIndex = 0});
  @override
  State<GalleryScreen> createState() => _GalleryScreenState();
}

class _GalleryScreenState extends State<GalleryScreen> {
  late final _pc = PageController(initialPage: widget.initialIndex);
  late int _index = widget.initialIndex;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(children: [
        PageView.builder(
          controller: _pc,
          onPageChanged: (i) => setState(() => _index = i),
          itemCount: widget.photos.length,
          itemBuilder: (_, i) => InteractiveViewer(
            minScale: 1, maxScale: 4,
            child: Center(child: NetImage(widget.photos[i], fit: BoxFit.contain)),
          ),
        ),
        Positioned(
          top: MediaQuery.of(context).padding.top + 8, left: 8,
          child: IconButton(
            icon: const Icon(Icons.close_rounded, color: Colors.white, size: 28),
            onPressed: () => Navigator.pop(context),
          ),
        ),
        Positioned(
          bottom: MediaQuery.of(context).padding.bottom + 20, left: 0, right: 0,
          child: Center(child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
            decoration: BoxDecoration(color: Colors.black54, borderRadius: BorderRadius.circular(20)),
            child: Text('${_index + 1} / ${widget.photos.length}', style: const TextStyle(color: Colors.white, fontSize: 13)),
          )),
        ),
      ]),
    );
  }
}
