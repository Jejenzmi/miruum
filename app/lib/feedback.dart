import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'bloc/auth/auth_bloc.dart';
import 'theme.dart';
import 'screens/auth.dart';

/// One place for all user feedback: animated dialogs, informative snackbars,
/// and the "please log in" gate. Keeps responses consistent & attractive.

enum SnackKind { success, error, info, warning }

({Color color, Color soft, IconData icon}) _kindStyle(SnackKind k) {
  switch (k) {
    case SnackKind.success:
      return (color: MC.success, soft: const Color(0xFFE7F6EC), icon: Icons.check_circle_rounded);
    case SnackKind.error:
      return (color: MC.danger, soft: const Color(0xFFFDE7E7), icon: Icons.error_rounded);
    case SnackKind.warning:
      return (color: MC.accent, soft: const Color(0xFFFDF1DD), icon: Icons.warning_rounded);
    case SnackKind.info:
      return (color: MC.blue, soft: const Color(0xFFE6EFF9), icon: Icons.info_rounded);
  }
}

/// Attractive floating snackbar with icon + optional title. Use for every response.
void showSnack(BuildContext context, String message, {SnackKind kind = SnackKind.success, String? title}) {
  final s = _kindStyle(kind);
  final messenger = ScaffoldMessenger.of(context);
  messenger.hideCurrentSnackBar();
  messenger.showSnackBar(SnackBar(
    behavior: SnackBarBehavior.floating,
    backgroundColor: MC.surface,
    elevation: 12,
    duration: const Duration(milliseconds: 3200),
    margin: const EdgeInsets.fromLTRB(14, 0, 14, 14),
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    content: Row(children: [
      Container(
        width: 34, height: 34,
        decoration: BoxDecoration(color: s.soft, shape: BoxShape.circle),
        child: Icon(s.icon, color: s.color, size: 20),
      ),
      const SizedBox(width: 12),
      Expanded(
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          if (title != null) ...[
            Text(title, style: TextStyle(color: MC.ink, fontWeight: FontWeight.w800, fontSize: 13.5)),
            const SizedBox(height: 1),
          ],
          Text(message, style: TextStyle(color: MC.inkMuted, fontSize: 12.8, height: 1.35)),
        ]),
      ),
    ]),
  ));
}

/// Animated (fade + scale-back) confirm dialog. Returns true if confirmed.
Future<bool> confirmDialog(
  BuildContext context, {
  required String title,
  required String message,
  String confirmText = 'Ya, lanjutkan',
  String cancelText = 'Batal',
  IconData icon = Icons.help_rounded,
  bool danger = false,
}) async {
  final accent = danger ? MC.danger : MC.primary;
  final result = await showGeneralDialog<bool>(
    context: context,
    barrierDismissible: true,
    barrierLabel: 'dismiss',
    barrierColor: Colors.black.withOpacity(0.5),
    transitionDuration: const Duration(milliseconds: 280),
    pageBuilder: (_, __, ___) => const SizedBox.shrink(),
    transitionBuilder: (ctx, anim, _, __) {
      final curved = CurvedAnimation(parent: anim, curve: Curves.easeOutBack, reverseCurve: Curves.easeInCubic);
      return Opacity(
        opacity: anim.value.clamp(0.0, 1.0),
        child: Transform.scale(
          scale: 0.88 + 0.12 * curved.value,
          child: Center(
            child: _DialogCard(
              icon: icon, accent: accent, title: title, message: message,
              actions: Row(children: [
                Expanded(child: OutlinedButton(
                  onPressed: () => Navigator.pop(ctx, false),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: MC.inkMuted, side: BorderSide(color: MC.line),
                    padding: const EdgeInsets.symmetric(vertical: 13),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(13)),
                  ),
                  child: Text(cancelText, style: const TextStyle(fontWeight: FontWeight.w700)),
                )),
                const SizedBox(width: 10),
                Expanded(child: ElevatedButton(
                  onPressed: () => Navigator.pop(ctx, true),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: accent, foregroundColor: Colors.white, elevation: 0,
                    padding: const EdgeInsets.symmetric(vertical: 13),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(13)),
                  ),
                  child: Text(confirmText, style: const TextStyle(fontWeight: FontWeight.w700)),
                )),
              ]),
            ),
          ),
        ),
      );
    },
  );
  return result ?? false;
}

/// Animated result dialog (success/error/info) with a single OK button.
Future<void> resultDialog(
  BuildContext context, {
  required String title,
  required String message,
  SnackKind kind = SnackKind.success,
  String okText = 'Oke',
}) async {
  final s = _kindStyle(kind);
  await showGeneralDialog<void>(
    context: context,
    barrierDismissible: true,
    barrierLabel: 'dismiss',
    barrierColor: Colors.black.withOpacity(0.5),
    transitionDuration: const Duration(milliseconds: 280),
    pageBuilder: (_, __, ___) => const SizedBox.shrink(),
    transitionBuilder: (ctx, anim, _, __) {
      final curved = CurvedAnimation(parent: anim, curve: Curves.easeOutBack, reverseCurve: Curves.easeInCubic);
      return Opacity(
        opacity: anim.value.clamp(0.0, 1.0),
        child: Transform.scale(
          scale: 0.88 + 0.12 * curved.value,
          child: Center(
            child: _DialogCard(
              icon: s.icon, accent: s.color, title: title, message: message,
              actions: SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => Navigator.pop(ctx),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: s.color, foregroundColor: Colors.white, elevation: 0,
                    padding: const EdgeInsets.symmetric(vertical: 13),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(13)),
                  ),
                  child: Text(okText, style: const TextStyle(fontWeight: FontWeight.w700)),
                ),
              ),
            ),
          ),
        ),
      );
    },
  );
}

/// Returns true if logged in. Otherwise shows an attractive gate sheet and returns false.
/// Use to protect every action that needs an account (booking, favorite, orders…).
bool ensureLoggedIn(BuildContext context, {String? reason}) {
  final state = context.read<AuthBloc>().state;
  if (state.isLoggedIn) return true;
  _showLoginGate(context, reason ?? 'Masuk dulu untuk melanjutkan aksi ini.');
  return false;
}

void _showLoginGate(BuildContext context, String reason) {
  showModalBottomSheet(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (sheetCtx) => Container(
      decoration: BoxDecoration(
        color: MC.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(26)),
      ),
      padding: EdgeInsets.fromLTRB(24, 14, 24, 24 + MediaQuery.of(sheetCtx).padding.bottom),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(width: 44, height: 4, margin: const EdgeInsets.only(bottom: 20),
            decoration: BoxDecoration(color: MC.line, borderRadius: BorderRadius.circular(3))),
        Container(
          width: 66, height: 66,
          decoration: BoxDecoration(color: MC.primarySoft, shape: BoxShape.circle),
          child: const Icon(Icons.lock_person_rounded, color: MC.primaryDark, size: 32),
        ),
        const SizedBox(height: 16),
        Text('Masuk ke Miruum', style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: MC.ink)),
        const SizedBox(height: 6),
        Text(reason, textAlign: TextAlign.center, style: TextStyle(color: MC.inkMuted, fontSize: 13.5, height: 1.45)),
        const SizedBox(height: 22),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            onPressed: () {
              Navigator.pop(sheetCtx);
              Navigator.push(context, MaterialPageRoute(builder: (_) => const SignInScreen()));
            },
            icon: const Icon(Icons.login_rounded, size: 19),
            label: const Text('Masuk', style: TextStyle(fontWeight: FontWeight.w800)),
            style: ElevatedButton.styleFrom(
              backgroundColor: MC.primary, foregroundColor: Colors.white, elevation: 0,
              padding: const EdgeInsets.symmetric(vertical: 15),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15)),
            ),
          ),
        ),
        const SizedBox(height: 10),
        TextButton(
          onPressed: () {
            Navigator.pop(sheetCtx);
            Navigator.push(context, MaterialPageRoute(builder: (_) => const SignUpScreen()));
          },
          child: RichText(text: TextSpan(
            style: TextStyle(color: MC.inkMuted, fontSize: 13),
            children: [
              const TextSpan(text: 'Belum punya akun? '),
              TextSpan(text: 'Daftar sekarang', style: TextStyle(color: MC.primary, fontWeight: FontWeight.w800)),
            ],
          )),
        ),
      ]),
    ),
  );
}

class _DialogCard extends StatelessWidget {
  final IconData icon;
  final Color accent;
  final String title;
  final String message;
  final Widget actions;
  const _DialogCard({required this.icon, required this.accent, required this.title, required this.message, required this.actions});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Material(
        color: Colors.transparent,
        child: Container(
          width: double.infinity,
          constraints: const BoxConstraints(maxWidth: 380),
          padding: const EdgeInsets.fromLTRB(26, 28, 26, 22),
          decoration: BoxDecoration(
            color: MC.surface,
            borderRadius: BorderRadius.circular(24),
            boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.22), blurRadius: 40, offset: const Offset(0, 20))],
          ),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Container(
              width: 62, height: 62,
              decoration: BoxDecoration(color: accent.withOpacity(0.12), shape: BoxShape.circle),
              child: Icon(icon, color: accent, size: 30),
            ),
            const SizedBox(height: 16),
            Text(title, textAlign: TextAlign.center, style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: MC.ink)),
            const SizedBox(height: 7),
            Text(message, textAlign: TextAlign.center, style: TextStyle(color: MC.inkMuted, fontSize: 13.5, height: 1.45)),
            const SizedBox(height: 22),
            actions,
          ]),
        ),
      ),
    );
  }
}
