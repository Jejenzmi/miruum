import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Miruum brand tokens (extracted from the Figma "Mockup OTA Miruum").
class MC {
  // Miruum is orange-forward (per Figma): warm orange header/actions, blue accents.
  static const primary = Color(0xFFF59331); // Miruum orange
  static const primaryDark = Color(0xFFE07C17);
  static const primarySoft = Color(0xFFFDEED9);
  static const accent = Color(0xFFF5A623); // golden orange (badges/promos)
  static const accentSoft = Color(0xFFFDF1DD);

  // Orange header gradient.
  static const headerTop = Color(0xFFF9A23C);
  static const headerBottom = Color(0xFFF2872A);

  static const blue = Color(0xFF2E6CB5); // brand blue (logo text, PeduliLindungi)
  static const blueSoft = Color(0xFFE6EFF9);

  static const ink = Color(0xFF1B2430);
  static const inkMuted = Color(0xFF6B7280);
  static const inkFaint = Color(0xFF9AA0A6);

  static const bg = Color(0xFFF6F7FB);
  static const surface = Color(0xFFFFFFFF);
  static const field = Color(0xFFF2F3F7);
  static const line = Color(0xFFECEDF1);

  static const star = Color(0xFFF5A623);
  static const success = Color(0xFF2FA84F);
  static const danger = Color(0xFFE5484D);
  static const coverDark = Color(0xFF2B2B2D);
}

class MiruumTheme {
  static ThemeData light() {
    final base = ThemeData.light(useMaterial3: true);
    final text = GoogleFonts.poppinsTextTheme(base.textTheme).apply(
      bodyColor: MC.ink,
      displayColor: MC.ink,
    );
    return base.copyWith(
      scaffoldBackgroundColor: MC.bg,
      colorScheme: base.colorScheme.copyWith(
        primary: MC.primary,
        secondary: MC.accent,
        surface: MC.surface,
      ),
      // Smooth shared-axis-style transitions on every navigation.
      pageTransitionsTheme: const PageTransitionsTheme(builders: {
        TargetPlatform.android: FadeUpwardsPageTransitionsBuilder(),
        TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
      }),
      textTheme: text,
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        iconTheme: IconThemeData(color: MC.ink),
        titleTextStyle: TextStyle(
          color: MC.ink, fontSize: 18, fontWeight: FontWeight.w600),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: MC.field,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: MC.primary, width: 1.4),
        ),
        hintStyle: const TextStyle(color: MC.inkFaint, fontSize: 14),
      ),
    );
  }
}

/// Common spacing / radius helpers.
class Insets {
  static const page = EdgeInsets.symmetric(horizontal: 20);
}

BoxShadow get softShadow => BoxShadow(
      color: Colors.black.withOpacity(0.06),
      blurRadius: 18,
      offset: const Offset(0, 8),
    );
