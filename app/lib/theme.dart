import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Miruum brand tokens (extracted from the Figma "Mockup OTA Miruum").
class MC {
  static const primary = Color(0xFF2FA84F); // Miruum green
  static const primaryDark = Color(0xFF1E7E38);
  static const primarySoft = Color(0xFFE7F6EC);
  static const accent = Color(0xFFF5A623); // Miruum orange
  static const accentSoft = Color(0xFFFDF1DD);

  static const ink = Color(0xFF04021D); // Text / Dark - 100%
  static const inkMuted = Color(0xFF6B7280);
  static const inkFaint = Color(0xFF9AA0A6);

  static const bg = Color(0xFFF6F7FB);
  static const surface = Color(0xFFFFFFFF);
  static const field = Color(0xFFF2F3F7);
  static const line = Color(0xFFECEDF1);

  static const star = Color(0xFFF5A623);
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
