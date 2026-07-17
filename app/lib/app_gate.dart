import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import 'api.dart';
import 'theme.dart';

/// On app launch: show a forced/optional update prompt or an admin announcement
/// popup — whichever applies first. Animated & non-blocking (never throws).
class AppGate {
  static Future<void> check(BuildContext context) async {
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
      // 3) Announcement popup — shown once until its content changes.
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
            // Animated gradient header with a bouncing rocket.
            Container(
              height: 128,
              width: double.infinity,
              decoration: const BoxDecoration(gradient: LinearGradient(colors: [MC.primary, MC.primaryDark], begin: Alignment.topLeft, end: Alignment.bottomRight)),
              child: Center(
                child: const Icon(Icons.rocket_launch_rounded, color: Colors.white, size: 56)
                    .animate(onPlay: (c) => c.repeat(reverse: true))
                    .moveY(begin: 6, end: -6, duration: 900.ms, curve: Curves.easeInOut),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(22, 20, 22, 22),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Text(forced ? 'Pembaruan Wajib' : 'Pembaruan Tersedia',
                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
                  const Spacer(),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                    decoration: BoxDecoration(color: MC.primarySoft, borderRadius: BorderRadius.circular(20)),
                    child: Text('v$version', style: const TextStyle(color: MC.primaryDark, fontWeight: FontWeight.w700, fontSize: 11.5)),
                  ),
                ]),
                const SizedBox(height: 8),
                Text(
                  forced
                      ? 'Versi baru wajib dipasang untuk terus menggunakan Miruum.'
                      : 'Tersedia versi terbaru Miruum dengan peningkatan & fitur baru.',
                  style: TextStyle(color: MC.inkMuted, fontSize: 13, height: 1.5),
                ),
                if (lines.isNotEmpty) ...[
                  const SizedBox(height: 14),
                  ...lines.take(5).map((l) => Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          const Icon(Icons.check_circle_rounded, color: MC.primary, size: 16),
                          const SizedBox(width: 8),
                          Expanded(child: Text(l.replaceFirst(RegExp(r'^[•\-]\s*'), ''), style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500))),
                        ]),
                      )),
                ],
                const SizedBox(height: 18),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    style: FilledButton.styleFrom(backgroundColor: MC.primary, padding: const EdgeInsets.symmetric(vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(13))),
                    onPressed: () => AppGate._launch(url),
                    child: const Text('Perbarui Sekarang', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5)),
                  ),
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
                      child: Text('Nanti Saja', style: TextStyle(color: MC.inkMuted, fontWeight: FontWeight.w600)),
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
                      child: Text('Tutup', style: TextStyle(color: MC.inkMuted, fontWeight: FontWeight.w600)),
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
