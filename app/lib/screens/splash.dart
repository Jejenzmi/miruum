import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../brand.dart';
import '../theme.dart';
import 'onboarding.dart';
import 'shell.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});
  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    Future.delayed(const Duration(milliseconds: 1700), () async {
      final onboarded = await hasOnboarded();
      if (!mounted) return;
      Navigator.pushReplacement(context, MaterialPageRoute(
          builder: (_) => onboarded ? const MainShell() : const OnboardingScreen()));
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: Stack(
        children: [
          // Orange wave at the bottom (per Figma splash).
          Positioned(
            left: 0, right: 0, bottom: 0,
            child: ClipPath(
              clipper: _WaveClipper(),
              child: Container(
                height: 260,
                decoration: const BoxDecoration(
                  gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter,
                      colors: [MC.headerTop, MC.headerBottom]),
                ),
              ),
            ),
          ),
          Center(
            child: const MiruumLogo(size: 54)
                .animate()
                .scale(begin: const Offset(0.7, 0.7), end: const Offset(1, 1), duration: 700.ms, curve: Curves.easeOutBack)
                .fadeIn(duration: 500.ms)
                .then(delay: 200.ms)
                .shimmer(duration: 900.ms, color: MC.primary.withOpacity(0.3)),
          ),
        ],
      ),
    );
  }
}

/// Gentle wave used on the splash bottom.
class _WaveClipper extends CustomClipper<Path> {
  @override
  Path getClip(Size size) {
    final p = Path();
    p.moveTo(0, size.height * 0.32);
    p.quadraticBezierTo(size.width * 0.25, size.height * 0.10, size.width * 0.52, size.height * 0.20);
    p.quadraticBezierTo(size.width * 0.80, size.height * 0.31, size.width, size.height * 0.12);
    p.lineTo(size.width, size.height);
    p.lineTo(0, size.height);
    p.close();
    return p;
  }

  @override
  bool shouldReclip(covariant CustomClipper<Path> oldClipper) => false;
}
