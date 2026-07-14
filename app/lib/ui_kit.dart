import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'theme.dart';

/// Staggered fade + slide-up entrance for a list of children.
List<Widget> stagger(List<Widget> children, {int startMs = 100, int stepMs = 70}) {
  return [
    for (var i = 0; i < children.length; i++)
      children[i]
          .animate()
          .fadeIn(delay: Duration(milliseconds: startMs + i * stepMs), duration: 380.ms)
          .slideY(begin: 0.18, end: 0, curve: Curves.easeOutCubic),
  ];
}

/// Curved gradient hero header used on auth / profile screens.
class HeroHeader extends StatelessWidget {
  final double height;
  final Widget child;
  final bool showBack;
  const HeroHeader({super.key, required this.child, this.height = 230, this.showBack = true});
  @override
  Widget build(BuildContext context) {
    return ClipPath(
      clipper: _BottomWaveClipper(),
      child: Container(
        height: height,
        width: double.infinity,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft, end: Alignment.bottomRight,
            colors: [MC.headerTop, MC.headerBottom],
          ),
        ),
        child: SafeArea(
          bottom: false,
          child: Stack(children: [
            if (showBack)
              Positioned(
                left: 6, top: 4,
                child: IconButton(
                  icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
                  onPressed: () => Navigator.maybePop(context),
                ),
              ),
            Padding(padding: const EdgeInsets.fromLTRB(24, 8, 24, 24), child: child),
          ]),
        ),
      ),
    );
  }
}

class _BottomWaveClipper extends CustomClipper<Path> {
  @override
  Path getClip(Size s) {
    final p = Path()..lineTo(0, s.height - 40);
    p.quadraticBezierTo(s.width * 0.25, s.height, s.width * 0.5, s.height - 18);
    p.quadraticBezierTo(s.width * 0.78, s.height - 38, s.width, s.height - 8);
    p.lineTo(s.width, 0);
    return p..close();
  }

  @override
  bool shouldReclip(covariant CustomClipper<Path> _) => false;
}

/// Wraps a child with a springy scale-on-press feedback.
class Pressable extends StatefulWidget {
  final Widget child;
  final VoidCallback? onTap;
  final double scale;
  const Pressable({super.key, required this.child, this.onTap, this.scale = 0.96});
  @override
  State<Pressable> createState() => _PressableState();
}

class _PressableState extends State<Pressable> {
  bool _down = false;
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: (_) => setState(() => _down = true),
      onTapUp: (_) => setState(() => _down = false),
      onTapCancel: () => setState(() => _down = false),
      onTap: widget.onTap,
      child: AnimatedScale(
        scale: _down ? widget.scale : 1,
        duration: const Duration(milliseconds: 110),
        curve: Curves.easeOut,
        child: widget.child,
      ),
    );
  }
}

/// Rounded, icon-led text field for auth forms.
class AuthTextField extends StatelessWidget {
  final String hint;
  final IconData icon;
  final TextEditingController controller;
  final bool obscure;
  final Widget? suffix;
  final TextInputType? keyboard;
  const AuthTextField(this.hint, this.icon, this.controller,
      {super.key, this.obscure = false, this.suffix, this.keyboard});
  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(borderRadius: BorderRadius.circular(16), boxShadow: [softShadow]),
      child: TextField(
        controller: controller,
        obscureText: obscure,
        keyboardType: keyboard,
        decoration: InputDecoration(
          hintText: hint,
          filled: true,
          fillColor: MC.surface,
          prefixIcon: Icon(icon, color: MC.primary, size: 20),
          suffixIcon: suffix,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: const BorderSide(color: MC.primary, width: 1.4)),
        ),
      ),
    );
  }
}
