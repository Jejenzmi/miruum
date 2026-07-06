import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../api.dart';
import '../../models.dart';

part 'auth_event.dart';
part 'auth_state.dart';

/// Owns the session (token + user) and the favorite-ids cache.
/// The [Api] instance is shared with the feature cubits; this bloc keeps its
/// token in sync so every request is authenticated.
class AuthBloc extends Bloc<AuthEvent, AuthState> {
  final Api api;
  AuthBloc(this.api) : super(const AuthState()) {
    on<AuthStarted>(_onStarted);
    on<AuthSessionGranted>(_onGranted);
    on<AuthLoggedOut>(_onLoggedOut);
    on<AuthUserUpdated>(_onUserUpdated);
    on<AuthFavoritesRequested>(_onFavoritesRequested);
    on<AuthFavoriteToggled>(_onFavoriteToggled);
  }

  Future<void> _onStarted(AuthStarted e, Emitter<AuthState> emit) async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('token');
    if (token == null) {
      emit(state.copyWith(status: AuthStatus.unauthenticated));
      return;
    }
    api.token = token;
    try {
      final user = await api.me();
      emit(state.copyWith(status: AuthStatus.authenticated, user: user));
      add(const AuthFavoritesRequested());
    } catch (_) {
      api.token = null;
      await prefs.remove('token');
      emit(state.copyWith(status: AuthStatus.unauthenticated, clearUser: true));
    }
  }

  Future<void> _onGranted(AuthSessionGranted e, Emitter<AuthState> emit) async {
    api.token = e.token;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('token', e.token);
    emit(state.copyWith(status: AuthStatus.authenticated, user: e.user, favoriteIds: {}));
    add(const AuthFavoritesRequested());
  }

  Future<void> _onLoggedOut(AuthLoggedOut e, Emitter<AuthState> emit) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('token');
    api.token = null;
    emit(const AuthState(status: AuthStatus.unauthenticated));
  }

  void _onUserUpdated(AuthUserUpdated e, Emitter<AuthState> emit) {
    emit(state.copyWith(user: e.user));
  }

  Future<void> _onFavoritesRequested(AuthFavoritesRequested e, Emitter<AuthState> emit) async {
    if (!state.isLoggedIn) return;
    try {
      final favs = await api.favorites();
      emit(state.copyWith(favoriteIds: favs.map((h) => h.id).toSet()));
    } catch (_) {}
  }

  Future<void> _onFavoriteToggled(AuthFavoriteToggled e, Emitter<AuthState> emit) async {
    if (!state.isLoggedIn) return;
    final next = Set<String>.from(state.favoriteIds);
    final adding = !next.contains(e.hotelId);
    if (adding) {
      next.add(e.hotelId);
    } else {
      next.remove(e.hotelId);
    }
    emit(state.copyWith(favoriteIds: next));
    try {
      if (adding) {
        await api.addFavorite(e.hotelId);
      } else {
        await api.removeFavorite(e.hotelId);
      }
    } catch (_) {
      // revert on failure
      final revert = Set<String>.from(state.favoriteIds);
      if (adding) {
        revert.remove(e.hotelId);
      } else {
        revert.add(e.hotelId);
      }
      emit(state.copyWith(favoriteIds: revert));
    }
  }
}
