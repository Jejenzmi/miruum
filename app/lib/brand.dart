import 'package:flutter/material.dart';
import 'theme.dart';

/// Miruum wordmark — orange cat mark + green "Miruum" (from the Figma cover).
class MiruumLogo extends StatelessWidget {
  final double size;
  final bool onDark;
  const MiruumLogo({super.key, this.size = 30, this.onDark = false});
  @override
  Widget build(BuildContext context) {
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Container(
        width: size, height: size,
        decoration: BoxDecoration(color: MC.accent, borderRadius: BorderRadius.circular(size * 0.3)),
        child: Icon(Icons.pets_rounded, color: Colors.white, size: size * 0.62),
      ),
      SizedBox(width: size * 0.32),
      Text('Miruum',
          style: TextStyle(
            fontSize: size * 0.86,
            fontWeight: FontWeight.w800,
            color: onDark ? Colors.white : MC.blue,
            letterSpacing: -0.5,
          )),
    ]);
  }
}
