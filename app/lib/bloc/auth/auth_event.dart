part of 'auth_bloc.dart';

abstract class AuthEvent extends Equatable {
  const AuthEvent();
  @override
  List<Object?> get props => [];
}

/// App boot — restore session from storage.
class AuthStarted extends AuthEvent {
  const AuthStarted();
}

/// Successful login/register elsewhere → adopt the session.
class AuthSessionGranted extends AuthEvent {
  final String token;
  final AppUser user;
  const AuthSessionGranted(this.token, this.user);
  @override
  List<Object?> get props => [token, user.id];
}

class AuthLoggedOut extends AuthEvent {
  const AuthLoggedOut();
}

class AuthUserUpdated extends AuthEvent {
  final AppUser user;
  const AuthUserUpdated(this.user);
  @override
  List<Object?> get props => [user.id, user.name];
}

class AuthFavoritesRequested extends AuthEvent {
  const AuthFavoritesRequested();
}

class AuthFavoriteToggled extends AuthEvent {
  final String hotelId;
  const AuthFavoriteToggled(this.hotelId);
  @override
  List<Object?> get props => [hotelId];
}
