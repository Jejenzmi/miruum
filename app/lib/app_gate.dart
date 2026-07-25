import 'dart:io' show Platform;
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:in_app_update/in_app_update.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import 'api.dart';
import 'l10n.dart';
import 'theme.dart';

/// On app launch: show a forced/optional update prompt or an admin announcement
/// popup — whichever applies first. Animated & non-blocking (never throws).
class AppGate {
  static Future<void> check(BuildContext context) async {
    // ── Google Play In-App Update (AUTOMATIC) ──
    // Play itself detects a newer release the moment you publish it — no manual
    // `app_latest_version` setting needed. Works for installs from Google Play;
    // on a sideloaded APK checkForUpdate throws and we fall back to the backend
    // version-config popup below (that channel still uses the manual setting).
    bool playHandlesUpdates = false;
    if (!kIsWeb && Platform.isAndroid) {
      try {
        final info = await InAppUpdate.checkForUpdate();
        playHandlesUpdates = true; // came from Play → Play owns update prompting
        if (info.updateAvailability == UpdateAvailability.updateAvailable) {
          try {
            if (info.flexibleUpdateAllowed) {
              await InAppUpdate.startFlexibleUpdate();
              await InAppUpdate.completeFlexibleUpdate();
            } else if (info.immediateUpdateAllowed) {
              await InAppUpdate.performImmediateUpdate();
            }
          } catch (_) {/* user cancelled the update — Play still owns updates */}
        }
      } catch (_) {
        playHandlesUpdates = false; // not a Play install / API unavailable
      }
    }

    try {
      final api = context.read<Api>();
      final cfg = await api.appConfig();
      if (!context.mounted) return;

      String current = '1.0.0';
      try {
        current = (await PackageInfo.fromPlatform()).version;
      } catch (_) {}

      final update = (cfg['update'] as Map?) ?? const {};
      final minV = (update['minVersion'] ?? '').toString();
      final latestV = (update['latestVersion'] ?? '').toString();
      final url = (update['url'] ?? 'https://api.miruum.id/ota.apk').toString();
      final notes = (update['notes'] ?? '').toString();

      // The manual version popup only runs when Play's in-app update is NOT
      // handling updates (i.e. sideloaded APK from api.miruum.id/ota.apk).
      if (!playHandlesUpdates) {
        // 1) Forced update — user's version is below the minimum allowed.
        if (minV.isNotEmpty && _cmp(current, minV) < 0) {
          if (context.mounted) await _showUpdate(context, forced: true, url: url, notes: notes, version: latestV.isNotEmpty ? latestV : minV);
          return;
        }
        // 2) Optional update — a newer version exists (dismissible once per version).
        if (latestV.isNotEmpty && _cmp(current, latestV) < 0) {
          final prefs = await SharedPreferences.getInstance();
          if (prefs.getString('update_dismissed') != latestV) {
            if (context.mounted) await _showUpdate(context, forced: false, url: url, notes: notes, version: latestV);
            return;
          }
        }
      }
      // 3) Announcement popup — shown once until its content changes (independent
      // of the update channel).
      final popup = cfg['popup'] as Map?;
      if (popup != null) {
        final prefs = await SharedPreferences.getInstance();
        final key = '${popup['id']}:${popup['updatedAt']}';
        if (prefs.getString('popup_seen') != key) {
          if (context.mounted) await _showPopup(context, popup);
          await prefs.setString('popup_seen', key);
        }
      }
    } catch (_) {/* never block launch */}
  }

  /// Compare dotted versions ("1.0.0+1" ok). <0 if a<b, 0 equal, >0 if a>b.
  static int _cmp(String a, String b) {
    final pa = a.split(RegExp(r'[.+\-]')).map((x) => int.tryParse(x) ?? 0).toList();
    final pb = b.split(RegExp(r'[.+\-]')).map((x) => int.tryParse(x) ?? 0).toList();
    final n = pa.length > pb.length ? pa.length : pb.length;
    for (var i = 0; i < n; i++) {
      final x = i < pa.length ? pa[i] : 0, y = i < pb.length ? pb[i] : 0;
      if (x != y) return x - y;
    }
    return 0;
  }

  static Future<void> _launch(String url) async {
    final uri = Uri.tryParse(url);
    if (uri != null) await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  // ── Update dialog ──
  static Future<void> _showUpdate(BuildContext context,
      {required bool forced, required String url, required String notes, required String version}) {
    return showGeneralDialog(
      context: context,
      barrierDismissible: !forced,
      barrierLabel: 'update',
      barrierColor: Colors.black.withOpacity(0.55),
      transitionDuration: const Duration(milliseconds: 320),
      pageBuilder: (_, __, ___) => const SizedBox.shrink(),
      transitionBuilder: (ctx, anim, __, ___) {
        final curved = CurvedAnimation(parent: anim, curve: Curves.easeOutBack);
        return PopScope(
          canPop: !forced,
          child: Opacity(
            opacity: anim.value.clamp(0.0, 1.0),
            child: Center(
              child: Transform.scale(
                scale: 0.85 + 0.15 * curved.value,
                child: _UpdateCard(forced: forced, url: url, notes: notes, version: version),
              ),
            ),
          ),
        );
      },
    );
  }

  // ── Announcement popup ──
  static Future<void> _showPopup(BuildContext context, Map popup) {
    return showGeneralDialog(
      context: context,
      barrierDismissible: true,
      barrierLabel: 'popup',
      barrierColor: Colors.black.withOpacity(0.5),
      transitionDuration: const Duration(milliseconds: 320),
      pageBuilder: (_, __, ___) => const SizedBox.shrink(),
      transitionBuilder: (ctx, anim, __, ___) {
        final curved = CurvedAnimation(parent: anim, curve: Curves.easeOutBack);
        return Opacity(
          opacity: anim.value.clamp(0.0, 1.0),
          child: Center(
            child: Transform.scale(scale: 0.85 + 0.15 * curved.value, child: _PopupCard(popup: popup)),
          ),
        );
      },
    );
  }
}

class _UpdateCard extends StatelessWidget {
  final bool forced;
  final String url, notes, version;
  const _UpdateCard({required this.forced, required this.url, required this.notes, required this.version});

  @override
  Widget build(BuildContext context) {
    final lines = notes.split('\n').map((e) => e.trim()).where((e) => e.isNotEmpty).toList();
    return Padding(
      padding: const EdgeInsets.all(28),
      child: Material(
        color: Colors.transparent,
        child: Container(
          width: 340,
          decoration: BoxDecoration(
            color: MC.surface,
            borderRadius: BorderRadius.circular(24),
            boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.25), blurRadius: 40, offset: const Offset(0, 18))],
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            // Animated gradient header: pulsing glow, floating sparkles, bouncing rocket.
            SizedBox(
              height: 150,
              width: double.infinity,
              child: Stack(alignment: Alignment.center, children: [
                // Gradient base
                Container(
                  decoration: const BoxDecoration(gradient: LinearGradient(colors: [MC.primary, MC.primaryDark], begin: Alignment.topLeft, end: Alignment.bottomRight)),
                ),
                // Soft pulsing glow behind the icon
                Container(width: 120, height: 120, decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white.withOpacity(0.16)))
                    .animate(onPlay: (c) => c.repeat(reverse: true))
                    .scaleXY(begin: 0.8, end: 1.15, duration: 1400.ms, curve: Curves.easeInOut),
                // Floating sparkles
                Positioned(left: 54, top: 34, child: const Icon(Icons.auto_awesome, color: Colors.white70, size: 16)
                    .animate(onPlay: (c) => c.repeat(reverse: true)).fadeIn(duration: 600.ms).moveY(begin: 0, end: -8, duration: 1200.ms, curve: Curves.easeInOut)),
                Positioned(right: 60, top: 46, child: const Icon(Icons.star_rounded, color: Colors.white70, size: 13)
                    .animate(onPlay: (c) => c.repeat(reverse: true)).moveY(begin: 4, end: -6, duration: 1500.ms, curve: Curves.easeInOut)),
                Positioned(right: 78, bottom: 34, child: const Icon(Icons.auto_awesome, color: Colors.white54, size: 12)
                    .animate(onPlay: (c) => c.repeat(reverse: true)).scaleXY(begin: 0.7, end: 1.2, duration: 1100.ms, curve: Curves.easeInOut)),
                // Rocket: bounce + gentle tilt
                const Icon(Icons.rocket_launch_rounded, color: Colors.white, size: 60)
                    .animate(onPlay: (c) => c.repeat(reverse: true))
                    .moveY(begin: 7, end: -7, duration: 900.ms, curve: Curves.easeInOut)
                    .rotate(begin: -0.02, end: 0.02, duration: 900.ms, curve: Curves.easeInOut),
              ]),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(22, 20, 22, 22),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Text(forced ? tr('Pembaruan Wajib', 'Required Update') : tr('Pembaruan Tersedia', 'Update Available'),
                          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18))
                      .animate().fadeIn(duration: 300.ms).moveX(begin: -10, end: 0, curve: Curves.easeOut),
                  const Spacer(),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                    decoration: BoxDecoration(color: MC.primarySoft, borderRadius: BorderRadius.circular(20)),
                    child: Text('v$version', style: const TextStyle(color: MC.primaryDark, fontWeight: FontWeight.w700, fontSize: 11.5)),
                  ).animate().scale(delay: 220.ms, duration: 360.ms, curve: Curves.easeOutBack),
                ]),
                const SizedBox(height: 8),
                Text(
                  forced
                      ? tr('Versi baru wajib dipasang untuk terus menggunakan Miruum.',
                          'A new version must be installed to keep using Miruum.')
                      : tr('Tersedia versi terbaru Miruum dengan peningkatan & fitur baru.',
                          'A newer version of Miruum is available with improvements & new features.'),
                  style: TextStyle(color: MC.inkMuted, fontSize: 13, height: 1.5),
                ).animate().fadeIn(delay: 150.ms),
                if (lines.isNotEmpty) ...[
                  const SizedBox(height: 14),
                  ...lines.take(5).toList().asMap().entries.map((e) => Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          const Icon(Icons.check_circle_rounded, color: MC.primary, size: 16),
                          const SizedBox(width: 8),
                          Expanded(child: Text(e.value.replaceFirst(RegExp(r'^[•\-]\s*'), ''), style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500))),
                        ]),
                      ).animate().fadeIn(delay: (280 + e.key * 90).ms).moveX(begin: 14, end: 0, curve: Curves.easeOut)),
                ],
                const SizedBox(height: 18),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    style: FilledButton.styleFrom(backgroundColor: MC.primary, padding: const EdgeInsets.symmetric(vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(13))),
                    onPressed: () => AppGate._launch(url),
                    icon: const Icon(Icons.download_rounded, size: 18),
                    label: Text(tr('Perbarui Sekarang', 'Update Now'), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5)),
                  ).animate(onPlay: (c) => c.repeat())
                      .shimmer(delay: 1200.ms, duration: 1600.ms, color: Colors.white.withOpacity(0.35)),
                ),
                if (!forced) ...[
                  const SizedBox(height: 6),
                  SizedBox(
                    width: double.infinity,
                    child: TextButton(
                      onPressed: () async {
                        final prefs = await SharedPreferences.getInstance();
                        await prefs.setString('update_dismissed', version);
                        if (context.mounted) Navigator.pop(context);
                      },
                      child: Text(tr('Nanti Saja', 'Later'), style: TextStyle(color: MC.inkMuted, fontWeight: FontWeight.w600)),
                    ),
                  ),
                ],
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}

class _PopupCard extends StatelessWidget {
  final Map popup;
  const _PopupCard({required this.popup});

  @override
  Widget build(BuildContext context) {
    final img = (popup['imageUrl'] ?? '').toString();
    final ctaText = (popup['ctaText'] ?? '').toString();
    final ctaUrl = (popup['ctaUrl'] ?? '').toString();
    return Padding(
      padding: const EdgeInsets.all(28),
      child: Material(
        color: Colors.transparent,
        child: Container(
          width: 320,
          decoration: BoxDecoration(
            color: MC.surface,
            borderRadius: BorderRadius.circular(24),
            boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.25), blurRadius: 40, offset: const Offset(0, 18))],
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            if (img.isNotEmpty)
              Image.network(img, height: 150, width: double.infinity, fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => _headerFallback())
            else
              _headerFallback(),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 18, 20, 20),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text((popup['title'] ?? '').toString(), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17))
                    .animate().fadeIn(delay: 120.ms).moveY(begin: 6, end: 0),
                const SizedBox(height: 7),
                Text((popup['body'] ?? '').toString(), style: TextStyle(color: MC.inkMuted, fontSize: 13, height: 1.5))
                    .animate().fadeIn(delay: 200.ms),
                const SizedBox(height: 18),
                Row(children: [
                  Expanded(
                    child: TextButton(
                      onPressed: () => Navigator.pop(context),
                      style: TextButton.styleFrom(backgroundColor: MC.field, padding: const EdgeInsets.symmetric(vertical: 12), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                      child: Text(tr('Tutup', 'Close'), style: TextStyle(color: MC.inkMuted, fontWeight: FontWeight.w600)),
                    ),
                  ),
                  if (ctaText.isNotEmpty) ...[
                    const SizedBox(width: 10),
                    Expanded(
                      child: FilledButton(
                        style: FilledButton.styleFrom(backgroundColor: MC.primary, padding: const EdgeInsets.symmetric(vertical: 12), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                        onPressed: () {
                          Navigator.pop(context);
                          if (ctaUrl.isNotEmpty) AppGate._launch(ctaUrl);
                        },
                        child: Text(ctaText, style: const TextStyle(fontWeight: FontWeight.w700), overflow: TextOverflow.ellipsis),
                      ),
                    ),
                  ],
                ]),
              ]),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _headerFallback() => Container(
        height: 96,
        width: double.infinity,
        decoration: const BoxDecoration(gradient: LinearGradient(colors: [MC.primary, MC.primaryDark], begin: Alignment.topLeft, end: Alignment.bottomRight)),
        child: const Icon(Icons.campaign_rounded, color: Colors.white, size: 44)
            .animate(onPlay: (c) => c.repeat(reverse: true))
            .scaleXY(begin: 0.92, end: 1.06, duration: 900.ms, curve: Curves.easeInOut),
      );
}
