import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Secure session storage backed by the Android Keystore
/// (EncryptedSharedPreferences). Holds a short-lived access token plus a
/// long-lived, server-revocable refresh token. Migrates any legacy plaintext
/// access token once.
class TokenStore {
  static const _kAccess = 'token';
  static const _kRefresh = 'refresh';
  static const _s = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  static Future<void> saveSession(String access, String refresh) async {
    await _s.write(key: _kAccess, value: access);
    await _s.write(key: _kRefresh, value: refresh);
  }

  static Future<String?> readAccess() async {
    final v = await _s.read(key: _kAccess);
    if (v != null) return v;
    // One-time migration from the old plaintext SharedPreferences token.
    final prefs = await SharedPreferences.getInstance();
    final legacy = prefs.getString(_kAccess);
    if (legacy != null) {
      await _s.write(key: _kAccess, value: legacy);
      await prefs.remove(_kAccess);
      return legacy;
    }
    return null;
  }

  static Future<String?> readRefresh() => _s.read(key: _kRefresh);

  static Future<void> clear() async {
    await _s.delete(key: _kAccess);
    await _s.delete(key: _kRefresh);
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_kAccess);
  }
}
