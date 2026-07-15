import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../api.dart';
import '../../models.dart';
import '../../push.dart';
import '../../token_store.dart';

part 'auth_event.dart';
part 'auth_state.dart';

/// Owns the session (token + user) and the favorite-ids cache.
/// The [Api] instance is shared with the feature cubits; this bloc keeps its
/// token in sync so every request is authenticated.
class AuthBloc extends Bloc<AuthEvent, AuthState> {
  final Api api;
  AuthBloc(this.api) : super(const AuthState()) {
    // When the refresh token is rejected, force the app back to logged-out.
    api.onSessionExpired = () async => add(const AuthLoggedOut());
    on<AuthStarted>(_onStarted);
    on<AuthSessionGranted>(_onGranted);
    on<AuthLoggedOut>(_onLoggedOut);
    on<AuthUserUpdated>(_onUserUpdated);
    on<AuthFavoritesRequested>(_onFavoritesRequested);
    on<AuthFavoriteToggled>(_onFavoriteToggled);
  }

  Future<void> _onStarted(AuthStarted e, Emitter<AuthState> emit) async {
    final token = await TokenStore.readAccess();
    api.refreshToken = await TokenStore.readRefresh();
    if (token == null) {
      emit(state.copyWith(status: AuthStatus.unauthenticated));
      return;
    }
    api.token = token;
    try {
      final user = await api.me();
      emit(state.copyWith(status: AuthStatus.authenticated, user: user));
      Push.register(api); // map FCM device token to this user
      add(const AuthFavoritesRequested());
    } catch (_) {
      api.token = null;
      api.refreshToken = null;
      await TokenStore.clear();
      emit(state.copyWith(status: AuthStatus.unauthenticated, clearUser: true));
    }
  }

  Future<void> _onGranted(AuthSessionGranted e, Emitter<AuthState> emit) async {
    // The access + refresh pair is already persisted by Api on login/register/
    // google (Api._adoptSession). Just sync the in-memory token and state.
    api.token = e.token;
    emit(state.copyWith(status: AuthStatus.authenticated, user: e.user, favoriteIds: {}));
    Push.register(api); // map FCM device token to this user
    add(const AuthFavoritesRequested());
  }

  Future<void> _onLoggedOut(AuthLoggedOut e, Emitter<AuthState> emit) async {
    await api.logout(); // revoke refresh token server-side + clear local
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
