import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api.dart';
import 'models.dart';

/// Global session — auth state + favorite ids cache.
class Session extends ChangeNotifier {
  final Api api = Api();
  AppUser? user;
  bool ready = false;
  final Set<String> favoriteIds = {};

  bool get isLoggedIn => user != null;

  Future<void> bootstrap() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('token');
    if (token != null) {
      api.token = token;
      try {
        user = await api.me();
        await refreshFavorites();
      } catch (_) {
        api.token = null;
        await prefs.remove('token');
      }
    }
    ready = true;
    notifyListeners();
  }

  Future<void> _persist(String token) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('token', token);
  }

  Future<void> login(String email, String password) async {
    final (token, u) = await api.login(email, password);
    api.token = token;
    user = u;
    await _persist(token);
    await refreshFavorites();
    notifyListeners();
  }

  Future<void> register(String name, String email, String password) async {
    final (token, u) = await api.register(name, email, password);
    api.token = token;
    user = u;
    await _persist(token);
    notifyListeners();
  }

  Future<void> logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('token');
    api.token = null;
    user = null;
    favoriteIds.clear();
    notifyListeners();
  }

  Future<void> updateProfile(Map<String, dynamic> data) async {
    user = await api.updateMe(data);
    notifyListeners();
  }

  Future<void> refreshFavorites() async {
    if (!isLoggedIn) return;
    try {
      final favs = await api.favorites();
      favoriteIds
        ..clear()
        ..addAll(favs.map((h) => h.id));
      notifyListeners();
    } catch (_) {}
  }

  bool isFavorite(String hotelId) => favoriteIds.contains(hotelId);

  Future<void> toggleFavorite(String hotelId) async {
    if (!isLoggedIn) return;
    if (favoriteIds.contains(hotelId)) {
      favoriteIds.remove(hotelId);
      notifyListeners();
      await api.removeFavorite(hotelId);
    } else {
      favoriteIds.add(hotelId);
      notifyListeners();
      await api.addFavorite(hotelId);
    }
  }
}
