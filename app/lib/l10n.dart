import 'theme.dart';

/// Lightweight i18n helper. Pass the Indonesian and English text; returns the
/// one matching the active language. Widgets re-read this on rebuild (the app
/// rebuilds when [AppSettings.locale] changes), so text switches live.
String tr(String id, String en) {
  final o = AppSettings.i18n.value[id];
  final useEn = AppSettings.locale.value.languageCode == 'en';
  if (o != null) {
    if (useEn) return (o['en']?.isNotEmpty ?? false) ? o['en']! : (o['id']?.isNotEmpty ?? false ? o['id']! : en);
    return (o['id']?.isNotEmpty ?? false) ? o['id']! : id;
  }
  return useEn ? en : id;
}

bool get isEn => AppSettings.locale.value.languageCode == 'en';
