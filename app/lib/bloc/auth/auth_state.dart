part of 'auth_bloc.dart';

enum AuthStatus { unknown, authenticated, unauthenticated }

class AuthState extends Equatable {
  final AuthStatus status;
  final AppUser? user;
  final Set<String> favoriteIds;

  const AuthState({this.status = AuthStatus.unknown, this.user, this.favoriteIds = const {}});

  bool get isLoggedIn => status == AuthStatus.authenticated && user != null;
  bool isFavorite(String hotelId) => favoriteIds.contains(hotelId);

  AuthState copyWith({AuthStatus? status, AppUser? user, bool clearUser = false, Set<String>? favoriteIds}) {
    return AuthState(
      status: status ?? this.status,
      user: clearUser ? null : (user ?? this.user),
      favoriteIds: favoriteIds ?? this.favoriteIds,
    );
  }

  @override
  List<Object?> get props => [status, user?.id, favoriteIds];
}
