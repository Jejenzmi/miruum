import 'theme.dart';

/// Lightweight i18n helper. Pass the Indonesian and English text; returns the
/// one matching the active language. Widgets re-read this on rebuild (the app
/// rebuilds when [AppSettings.locale] changes), so text switches live.
String tr(String id, String en) => AppSettings.locale.value.languageCode == 'en' ? en : id;

bool get isEn => AppSettings.locale.value.languageCode == 'en';
