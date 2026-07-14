import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Resolved once per app build (see [MiruumApp]). Brand colors are constant;
/// only the 7 structural colors below flip between light and dark.
bool kDark = false;

/// App-wide user settings (theme + language), persisted via shared_preferences.
class AppSettings {
  static final themeMode = ValueNotifier<ThemeMode>(ThemeMode.system);
  static final locale = ValueNotifier<Locale>(const Locale('id'));
}

/// Miruum brand tokens. Brand hues stay constant across light/dark; structural
/// colors (ink/bg/surface/field/line) are getters that read [kDark].
class MC {
  // ── Brand (constant in both modes) ──
  static const primary = Color(0xFFF59331);
  static const primaryDark = Color(0xFFE07C17);
  static const primarySoft = Color(0xFFFDEED9);
  static const accent = Color(0xFFF5A623);
  static const accentSoft = Color(0xFFFDF1DD);
  static const headerTop = Color(0xFFF9A23C);
  static const headerBottom = Color(0xFFF2872A);
  static const blue = Color(0xFF2E6CB5);
  static const blueSoft = Color(0xFFE6EFF9);
  static const star = Color(0xFFF5A623);
  static const success = Color(0xFF2FA84F);
  static const danger = Color(0xFFE5484D);
  static const coverDark = Color(0xFF2B2B2D);

  // ── Structural (light ⇆ dark) ──
  static Color get ink => kDark ? const Color(0xFFEDEFF3) : const Color(0xFF1B2430);
  static Color get inkMuted => kDark ? const Color(0xFF9AA3B2) : const Color(0xFF6B7280);
  static Color get inkFaint => kDark ? const Color(0xFF6B7788) : const Color(0xFF9AA0A6);
  static Color get bg => kDark ? const Color(0xFF10141B) : const Color(0xFFF6F7FB);
  static Color get surface => kDark ? const Color(0xFF1B2230) : const Color(0xFFFFFFFF);
  static Color get field => kDark ? const Color(0xFF262E3C) : const Color(0xFFF2F3F7);
  static Color get line => kDark ? const Color(0xFF313A49) : const Color(0xFFECEDF1);
}

class MiruumTheme {
  /// Build the theme for the current [kDark] value.
  static ThemeData build() {
    final base = kDark ? ThemeData.dark(useMaterial3: true) : ThemeData.light(useMaterial3: true);
    final text = GoogleFonts.poppinsTextTheme(base.textTheme).apply(
      bodyColor: MC.ink,
      displayColor: MC.ink,
    );
    return base.copyWith(
      scaffoldBackgroundColor: MC.bg,
      canvasColor: MC.surface,
      colorScheme: base.colorScheme.copyWith(
        primary: MC.primary,
        secondary: MC.accent,
        surface: MC.surface,
      ),
      pageTransitionsTheme: const PageTransitionsTheme(builders: {
        TargetPlatform.android: FadeUpwardsPageTransitionsBuilder(),
        TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
      }),
      textTheme: text,
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        iconTheme: IconThemeData(color: MC.ink),
        titleTextStyle: TextStyle(color: MC.ink, fontSize: 18, fontWeight: FontWeight.w600),
      ),
      dialogTheme: DialogTheme(backgroundColor: MC.surface),
      bottomSheetTheme: BottomSheetThemeData(backgroundColor: MC.surface),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: MC.field,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: MC.primary, width: 1.4),
        ),
        hintStyle: TextStyle(color: MC.inkFaint, fontSize: 14),
      ),
    );
  }
}

/// Common spacing / radius helpers.
class Insets {
  static const page = EdgeInsets.symmetric(horizontal: 20);
}

BoxShadow get softShadow => BoxShadow(
      color: Colors.black.withOpacity(kDark ? 0.3 : 0.06),
      blurRadius: 18,
      offset: const Offset(0, 8),
    );
