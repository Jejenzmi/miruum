import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:url_launcher/url_launcher.dart';
import 'theme.dart';

/// Open a URL in the external browser; returns false if it couldn't launch.
Future<bool> openUrl(String url) async {
  final uri = Uri.parse(url);
  if (await canLaunchUrl(uri)) return launchUrl(uri, mode: LaunchMode.externalApplication);
  return false;
}

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

/// A shimmering skeleton placeholder box.
class SkeletonBox extends StatelessWidget {
  final double? width, height;
  final double radius;
  const SkeletonBox({super.key, this.width, this.height, this.radius = 12});
  @override
  Widget build(BuildContext context) {
    return Container(
      width: width, height: height,
      decoration: BoxDecoration(color: MC.field, borderRadius: BorderRadius.circular(radius)),
    ).animate(onPlay: (c) => c.repeat()).shimmer(duration: 1200.ms, color: Colors.white.withOpacity(0.6));
  }
}

/// Loading skeleton that mimics a list of cards.
class SkeletonList extends StatelessWidget {
  final int count;
  const SkeletonList({super.key, this.count = 5});
  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      padding: const EdgeInsets.all(20),
      itemCount: count,
      separatorBuilder: (_, __) => const SizedBox(height: 12),
      itemBuilder: (_, __) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: MC.surface, borderRadius: BorderRadius.circular(18), boxShadow: [softShadow]),
        child: Row(children: [
          const SkeletonBox(width: 72, height: 72, radius: 12),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: const [
            SkeletonBox(width: 160, height: 13),
            SizedBox(height: 8),
            SkeletonBox(width: 110, height: 11),
            SizedBox(height: 8),
            SkeletonBox(width: 90, height: 11),
          ])),
        ]),
      ),
    );
  }
}

/// Friendly empty-state: soft icon circle + title + subtitle + optional action.
class EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? action;
  final Color? color;
  const EmptyState({super.key, required this.icon, required this.title, this.subtitle, this.action, this.color});
  @override
  Widget build(BuildContext context) {
    final c = color ?? MC.primary;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 92, height: 92,
            decoration: BoxDecoration(color: c.withOpacity(0.10), shape: BoxShape.circle),
            child: Icon(icon, size: 44, color: c),
          ).animate().scale(begin: const Offset(0.6, 0.6), duration: 500.ms, curve: Curves.elasticOut),
          const SizedBox(height: 18),
          Text(title, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15.5)),
          if (subtitle != null) ...[
            const SizedBox(height: 6),
            Text(subtitle!, textAlign: TextAlign.center, style: TextStyle(color: MC.inkMuted, fontSize: 13)),
          ],
          if (action != null) ...[const SizedBox(height: 18), action!],
        ]).animate().fadeIn(duration: 400.ms),
      ),
    );
  }
}

/// Rounded-bottom gradient hero header used on auth / profile screens.
/// Content is padded clear of the rounded corners so nothing gets clipped.
class HeroHeader extends StatelessWidget {
  final double height;
  final Widget child;
  final bool showBack;
  const HeroHeader({super.key, required this.child, this.height = 230, this.showBack = true});
  @override
  Widget build(BuildContext context) {
    return Container(
      height: height,
      width: double.infinity,
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft, end: Alignment.bottomRight,
          colors: [MC.headerTop, MC.headerBottom],
        ),
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(30)),
        boxShadow: [BoxShadow(color: Color(0x33F2872A), blurRadius: 18, offset: Offset(0, 8))],
      ),
      child: SafeArea(
        bottom: false,
        child: Stack(children: [
          if (showBack)
            Positioned(
              left: 6, top: 2,
              child: IconButton(
                icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
                onPressed: () => Navigator.maybePop(context),
              ),
            ),
          Padding(padding: const EdgeInsets.fromLTRB(24, 12, 24, 26), child: child),
        ]),
      ),
    );
  }
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
