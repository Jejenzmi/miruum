import 'package:flutter/material.dart';

/// Miruum wordmark — the real logo lockup (orange cat mark + blue "Miruum").
/// Asset: assets/logo.png (registered in pubspec.yaml).
///
/// [size] is the rendered height of the lockup; width scales to the artwork.
/// [onDark] pads it on a white rounded plate so the white-background artwork
/// stays legible over dark/orange surfaces.
class MiruumLogo extends StatelessWidget {
  final double size;
  final bool onDark;
  const MiruumLogo({super.key, this.size = 30, this.onDark = false});

  @override
  Widget build(BuildContext context) {
    final logo = Image.asset(
      'assets/logo.png',
      height: size * 1.7,
      fit: BoxFit.contain,
      filterQuality: FilterQuality.high,
    );
    if (!onDark) return logo;
    return Container(
      padding: EdgeInsets.symmetric(horizontal: size * 0.4, vertical: size * 0.22),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(size * 0.35)),
      child: logo,
    );
  }
}
