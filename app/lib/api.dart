import 'dart:convert';
import 'package:http/http.dart' as http;
import 'models.dart';

/// Thin API client for the Miruum backend.
/// Served same-origin behind nginx → base path is `/api`.
class Api {
  static const String base = String.fromEnvironment('API_BASE', defaultValue: '/api');
  String? token;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      };

  Uri _u(String path, [Map<String, dynamic>? q]) {
    final query = q?.map((k, v) => MapEntry(k, '$v'))
      ?..removeWhere((k, v) => v.isEmpty || v == 'null');
    return Uri.parse('$base$path').replace(queryParameters: (query?.isEmpty ?? true) ? null : query);
  }

  Future<dynamic> _get(String path, [Map<String, dynamic>? q]) async {
    final r = await http.get(_u(path, q), headers: _headers);
    return _decode(r);
  }

  Future<dynamic> _post(String path, [Map<String, dynamic>? body]) async {
    final r = await http.post(_u(path), headers: _headers, body: jsonEncode(body ?? {}));
    return _decode(r);
  }

  Future<dynamic> _put(String path, Map<String, dynamic> body) async {
    final r = await http.put(_u(path), headers: _headers, body: jsonEncode(body));
    return _decode(r);
  }

  Future<dynamic> _delete(String path) async {
    final r = await http.delete(_u(path), headers: _headers);
    return _decode(r);
  }

  dynamic _decode(http.Response r) {
    final body = r.body.isEmpty ? {} : jsonDecode(r.body);
    if (r.statusCode >= 400) {
      throw ApiException(body is Map ? (body['error'] ?? 'Terjadi kesalahan') : 'Terjadi kesalahan', r.statusCode);
    }
    return body;
  }

  // ── Auth ──
  Future<(String, AppUser)> login(String email, String password) async {
    final j = await _post('/auth/login', {'email': email, 'password': password});
    return (j['token'] as String, AppUser.fromJson(j['user']));
  }

  Future<(String, AppUser)> register(String name, String email, String password) async {
    final j = await _post('/auth/register', {'name': name, 'email': email, 'password': password});
    return (j['token'] as String, AppUser.fromJson(j['user']));
  }

  Future<AppUser> me() async => AppUser.fromJson((await _get('/auth/me'))['user']);

  Future<AppUser> updateMe(Map<String, dynamic> data) async =>
      AppUser.fromJson((await _put('/auth/me', data))['user']);

  /// Upload a base64 data URL to MinIO via the backend; returns the public URL.
  Future<String> uploadImage(String dataUrl, {String folder = 'avatars'}) async =>
      (await _post('/uploads', {'dataUrl': dataUrl, 'folder': folder}))['url'] as String;

  Future<void> requestOtp() async => _post('/auth/otp/request');
  Future<void> verifyOtp(String code) async => _post('/auth/otp/verify', {'code': code});

  // ── Hotels ──
  Future<List<Hotel>> hotels({Map<String, dynamic>? q}) async =>
      ((await _get('/hotels', q))['hotels'] as List).map((h) => Hotel.fromJson(h)).toList();

  Future<List<Hotel>> promoHotels() async =>
      ((await _get('/hotels/promo'))['hotels'] as List).map((h) => Hotel.fromJson(h)).toList();

  Future<List<Hotel>> recommended() async =>
      ((await _get('/hotels/recommended'))['hotels'] as List).map((h) => Hotel.fromJson(h)).toList();

  Future<Hotel> hotel(String id) async => Hotel.fromJson((await _get('/hotels/$id'))['hotel']);

  Future<List<Review>> reviews(String id) async =>
      ((await _get('/hotels/$id/reviews'))['reviews'] as List).map((r) => Review.fromJson(r)).toList();

  Future<void> submitReview(String hotelId, int rating, String body) async =>
      _post('/hotels/$hotelId/reviews', {'rating': rating, 'body': body});

  /// Per-date cheapest price + availability for a hotel (calendar).
  Future<List<Map<String, dynamic>>> hotelAvailability(String hotelId, DateTime from, DateTime to) async {
    final j = await _get('/hotels/$hotelId/availability',
        {'from': from.toIso8601String().split('T').first, 'to': to.toIso8601String().split('T').first});
    return (j['days'] as List).cast<Map<String, dynamic>>();
  }

  Future<void> forgotPassword(String email) async => _post('/auth/forgot', {'email': email});
  Future<void> resetPassword(String email, String code, String password) async =>
      _post('/auth/reset', {'email': email, 'code': code, 'password': password});

  /// Public e-voucher URL for a booking code (opens the printable HTML page).
  String voucherUrl(String code) {
    final origin = base.endsWith('/api') ? base.substring(0, base.length - 4) : base;
    return '$origin/api/vouchers/$code';
  }

  // ── Hotel Packages ──
  Future<List<HotelPackage>> packages({Map<String, dynamic>? q}) async =>
      ((await _get('/packages', q))['packages'] as List).map((p) => HotelPackage.fromJson(p)).toList();

  Future<HotelPackage> package(String id) async =>
      HotelPackage.fromJson((await _get('/packages/$id'))['package']);

  Future<List<Promo>> promos() async =>
      ((await _get('/promos'))['promos'] as List).map((p) => Promo.fromJson(p)).toList();

  Future<List<dynamic>> paymentMethods() async => (await _get('/payment-methods'))['methods'] as List;

  // ── Favorites ──
  Future<List<Hotel>> favorites() async =>
      ((await _get('/favorites'))['hotels'] as List).map((h) => Hotel.fromJson(h)).toList();
  Future<void> addFavorite(String hotelId) async => _post('/favorites/$hotelId');
  Future<void> removeFavorite(String hotelId) async => _delete('/favorites/$hotelId');

  // ── Bookings ──
  Future<Booking> createBooking(Map<String, dynamic> data) async =>
      Booking.fromJson((await _post('/bookings', data))['booking']);

  Future<List<Booking>> bookings({String? status}) async =>
      ((await _get('/bookings', {if (status != null) 'status': status}))['bookings'] as List)
          .map((b) => Booking.fromJson(b)).toList();

  Future<Booking> booking(String id) async => Booking.fromJson((await _get('/bookings/$id'))['booking']);

  // ── Payments ──
  /// Create a payment for a booking → returns instructions (VA/QR/e-wallet URL).
  Future<Payment> createPayment(String bookingId, String method) async =>
      Payment.fromJson((await _post('/bookings/$bookingId/pay', {'method': method}))['payment']);

  Future<Payment> paymentStatus(String paymentId) async =>
      Payment.fromJson((await _get('/payments/$paymentId'))['payment']);

  /// Mock-only: simulate a successful payment (returns the confirmed booking).
  Future<Booking> settlePayment(String paymentId) async =>
      Booking.fromJson((await _post('/payments/$paymentId/settle'))['booking']);

  // ── Notifications ──
  Future<List<AppNotification>> notifications() async =>
      ((await _get('/notifications'))['notifications'] as List).map((n) => AppNotification.fromJson(n)).toList();
}

class ApiException implements Exception {
  final String message;
  final int status;
  ApiException(this.message, this.status);
  @override
  String toString() => message;
}
