import 'dart:convert';
import 'package:http/http.dart' as http;
import 'models.dart';
import 'token_store.dart';

/// Thin API client for the Miruum backend.
/// Served same-origin behind nginx → base path is `/api`.
class Api {
  static const String base = String.fromEnvironment('API_BASE', defaultValue: '/api');
  String? token;
  String? refreshToken;

  /// Called when the refresh token is rejected → the session is truly over.
  Future<void> Function()? onSessionExpired;
  bool _refreshing = false;

  /// A human label for this device — used for session/security management.
  static String deviceLabel = 'Aplikasi Miruum';

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'X-Device': deviceLabel,
        if (token != null) 'Authorization': 'Bearer $token',
      };

  Uri _u(String path, [Map<String, dynamic>? q]) {
    final query = q?.map((k, v) => MapEntry(k, '$v'))
      ?..removeWhere((k, v) => v.isEmpty || v == 'null');
    return Uri.parse('$base$path').replace(queryParameters: (query?.isEmpty ?? true) ? null : query);
  }

  Future<http.Response> _raw(String method, String path, {Map<String, dynamic>? q, Object? body}) {
    final uri = _u(path, q);
    switch (method) {
      case 'GET':
        return http.get(uri, headers: _headers);
      case 'POST':
        return http.post(uri, headers: _headers, body: jsonEncode(body ?? {}));
      case 'PUT':
        return http.put(uri, headers: _headers, body: jsonEncode(body ?? {}));
      case 'DELETE':
        return http.delete(uri, headers: _headers);
    }
    throw ApiException('Metode tidak didukung', 0);
  }

  /// Core request with a single transparent access-token refresh on 401.
  Future<dynamic> _req(String method, String path, {Map<String, dynamic>? q, Object? body}) async {
    var r = await _raw(method, path, q: q, body: body);
    if (r.statusCode == 401 && refreshToken != null && !path.startsWith('/auth/')) {
      if (await _tryRefresh()) r = await _raw(method, path, q: q, body: body);
    }
    return _decode(r);
  }

  /// Exchange the refresh token for a new access+refresh pair. Persists on
  /// success; triggers [onSessionExpired] and clears tokens on hard failure.
  Future<bool> _tryRefresh() async {
    if (refreshToken == null || _refreshing) return false;
    _refreshing = true;
    try {
      final r = await http.post(_u('/auth/refresh'),
          headers: {'Content-Type': 'application/json'}, body: jsonEncode({'refreshToken': refreshToken}));
      if (r.statusCode >= 400) {
        token = null;
        refreshToken = null;
        await TokenStore.clear();
        await onSessionExpired?.call();
        return false;
      }
      final j = jsonDecode(r.body);
      token = j['token'] as String;
      refreshToken = j['refreshToken'] as String;
      await TokenStore.saveSession(token!, refreshToken!);
      return true;
    } catch (_) {
      return false;
    } finally {
      _refreshing = false;
    }
  }

  Future<dynamic> _get(String path, [Map<String, dynamic>? q]) => _req('GET', path, q: q);
  Future<dynamic> _post(String path, [Map<String, dynamic>? body]) => _req('POST', path, body: body);
  Future<dynamic> _put(String path, Map<String, dynamic> body) => _req('PUT', path, body: body);
  Future<dynamic> _delete(String path) => _req('DELETE', path);

  dynamic _decode(http.Response r) {
    final body = r.body.isEmpty ? {} : jsonDecode(r.body);
    if (r.statusCode >= 400) {
      throw ApiException(body is Map ? (body['error'] ?? 'Terjadi kesalahan') : 'Terjadi kesalahan', r.statusCode);
    }
    return body;
  }

  // ── Auth ──
  /// Store + persist the session pair returned by an auth endpoint.
  Future<AppUser> _adoptSession(Map j) async {
    token = j['token'] as String;
    refreshToken = j['refreshToken'] as String?;
    if (refreshToken != null) await TokenStore.saveSession(token!, refreshToken!);
    return AppUser.fromJson(j['user']);
  }

  Future<(String, AppUser)> login(String email, String password, {String? code}) async {
    final j = await _post('/auth/login', {'email': email, 'password': password, if (code != null) 'code': code});
    if (j is Map && j['twoFactorRequired'] == true) throw TwoFactorRequired();
    final user = await _adoptSession(j);
    return (j['token'] as String, user);
  }

  Future<(String, AppUser)> register(String name, String email, String password) async {
    final j = await _post('/auth/register', {'name': name, 'email': email, 'password': password});
    final user = await _adoptSession(j);
    return (j['token'] as String, user);
  }

  Future<(String, AppUser)> googleLogin(String idToken) async {
    final j = await _post('/auth/google', {'idToken': idToken});
    final user = await _adoptSession(j);
    return (j['token'] as String, user);
  }

  /// UU PDP: export all my data (portability).
  Future<Map<String, dynamic>> exportMyData() async => (await _get('/auth/export')) as Map<String, dynamic>;

  /// UU PDP: delete my account (anonymizes PII; keeps anonymized transaction records).
  Future<void> deleteAccount() async => _post('/auth/delete-account', {'confirm': 'HAPUS'});

  /// Revoke the refresh token server-side (best-effort), then clear locally.
  Future<void> logout() async {
    try {
      if (refreshToken != null) await _post('/auth/logout', {'refreshToken': refreshToken});
    } catch (_) {/* ignore network errors on logout */}
    token = null;
    refreshToken = null;
    await TokenStore.clear();
  }

  Future<AppUser> me() async => AppUser.fromJson((await _get('/auth/me'))['user']);

  Future<AppUser> updateMe(Map<String, dynamic> data) async =>
      AppUser.fromJson((await _put('/auth/me', data))['user']);

  /// Upload a base64 data URL to MinIO via the backend; returns the public URL.
  Future<String> uploadImage(String dataUrl, {String folder = 'avatars'}) async =>
      (await _post('/uploads', {'dataUrl': dataUrl, 'folder': folder}))['url'] as String;

  // ── Corporate / Government (login uses the shared /auth/login) ──
  /// Entity types + the legality-document checklist required per type.
  Future<Map<String, dynamic>> corporateDocRequirements() async =>
      (await _get('/corporate/doc-requirements')) as Map<String, dynamic>;

  /// Upload a single legality document (PDF/JPG/PNG data URL). Public — no auth.
  Future<String> uploadCorporateDoc(String dataUrl) async =>
      (await _post('/corporate/upload-doc', {'dataUrl': dataUrl}))['url'] as String;

  /// Submit a corporate/government account application.
  Future<void> corporateApply(Map<String, dynamic> data) async => _post('/corporate/apply', data);

  /// Corporate portal: account + stats + recent bookings.
  Future<Map<String, dynamic>> corporateOverview() async =>
      (await _get('/corporate/overview')) as Map<String, dynamic>;

  /// Corporate portal: billing statements (tagihan) issued by Miruum.
  Future<List<dynamic>> corporateInvoices() async =>
      (await _get('/corporate/invoices'))['invoices'] as List;

  /// Corporate portal: all bookings made on the corporate account.
  Future<List<dynamic>> corporateBookings() async =>
      (await _get('/corporate/bookings'))['bookings'] as List;

  /// Request an OTP. Returns a dev code string only when the server has no
  /// email/WA channel configured (so the flow still works in demo); else null.
  Future<String?> requestOtp() async {
    final j = await _post('/auth/otp/request');
    return (j is Map && j['devCode'] != null) ? j['devCode'].toString() : null;
  }
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

  Future<void> submitReview(String hotelId, int rating, String body,
      {Map<String, double>? scores, List<String>? photos}) async =>
      _post('/hotels/$hotelId/reviews', {
        'rating': rating, 'body': body,
        if (scores != null) ...{
          if (scores['cleanliness'] != null) 'scoreCleanliness': scores['cleanliness'],
          if (scores['location'] != null) 'scoreLocation': scores['location'],
          if (scores['staff'] != null) 'scoreStaff': scores['staff'],
          if (scores['facilities'] != null) 'scoreFacilities': scores['facilities'],
          if (scores['comfort'] != null) 'scoreComfort': scores['comfort'],
          if (scores['value'] != null) 'scoreValue': scores['value'],
        },
        if (photos != null && photos.isNotEmpty) 'photos': photos,
      });

  /// Per-date cheapest price + availability for a hotel (calendar).
  Future<List<Map<String, dynamic>>> hotelAvailability(String hotelId, DateTime from, DateTime to) async {
    final j = await _get('/hotels/$hotelId/availability',
        {'from': from.toIso8601String().split('T').first, 'to': to.toIso8601String().split('T').first});
    return (j['days'] as List).cast<Map<String, dynamic>>();
  }

  Future<void> forgotPassword(String email) async => _post('/auth/forgot', {'email': email});
  Future<void> resetPassword(String email, String code, String password) async =>
      _post('/auth/reset', {'email': email, 'code': code, 'password': password});
  Future<void> changePassword(String current, String next) async =>
      _post('/auth/change-password', {'currentPassword': current, 'newPassword': next});

  /// Validate a promo code for an amount → {discount, discountPct, title}.
  Future<Map<String, dynamic>> validatePromo(String code, int amount) async =>
      (await _post('/promos/validate', {'code': code, 'amount': amount})) as Map<String, dynamic>;

  String _origin() => base.endsWith('/api') ? base.substring(0, base.length - 4) : base;

  /// Public e-voucher URL for a booking code (opens the printable HTML page).
  String voucherUrl(String code) => '${_origin()}/api/vouchers/$code';

  /// Public invoice URL for a booking code.
  String invoiceUrl(String code) => '${_origin()}/api/invoices/$code';

  // ── Hotel Packages ──
  Future<List<HotelPackage>> packages({Map<String, dynamic>? q}) async =>
      ((await _get('/packages', q))['packages'] as List).map((p) => HotelPackage.fromJson(p)).toList();

  Future<HotelPackage> package(String id) async =>
      HotelPackage.fromJson((await _get('/packages/$id'))['package']);

  Future<List<Promo>> promos() async =>
      ((await _get('/promos'))['promos'] as List).map((p) => Promo.fromJson(p)).toList();

  Future<List<PromoBanner>> banners() async =>
      ((await _get('/banners'))['banners'] as List).map((b) => PromoBanner.fromJson(b)).toList();

  /// Active promo/campaign programs (type = PROMO | CAMPAIGN) + participating hotels.
  Future<List<Program>> programs(String type) async =>
      ((await _get('/programs', {'type': type}))['programs'] as List).map((p) => Program.fromJson(p)).toList();

  /// Register an FCM device token (maps to the logged-in user if authenticated).
  Future<void> registerDevice(String token) async => _post('/devices', {'token': token, 'platform': 'android'});

  /// Saved guests for "booking for someone else".
  Future<List<SavedGuest>> savedGuests() async =>
      ((await _get('/saved-guests'))['guests'] as List).map((g) => SavedGuest.fromJson(g)).toList();
  Future<void> saveGuest(String name, {String? email, String? phone}) async =>
      _post('/saved-guests', {'name': name, if (email != null && email.isNotEmpty) 'email': email, if (phone != null && phone.isNotEmpty) 'phone': phone});

  /// Static content page (terms / privacy / about) → {title, body}.
  Future<Map<String, String>> content(String slug) async {
    final c = (await _get('/content/$slug'))['content'];
    return {'title': (c['title'] ?? '').toString(), 'body': (c['body'] ?? '').toString()};
  }

  Future<List<dynamic>> paymentMethods() async => (await _get('/payment-methods'))['methods'] as List;

  /// Facility catalog for the search filter.
  Future<List<Facility>> facilities() async =>
      ((await _get('/facilities'))['facilities'] as List).map((f) => Facility.fromJson(f)).toList();

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

  /// Refund estimate before cancelling → {note, refundPct, refundAmount, cancellable}.
  Future<Map<String, dynamic>> refundQuote(String id) async =>
      (await _get('/bookings/$id/refund-quote')) as Map<String, dynamic>;

  /// Reschedule quote → {allowed, reason?, nights, newTotal, diff, oldTotal}.
  Future<Map<String, dynamic>> rescheduleQuote(String id, DateTime checkIn, DateTime checkOut) async =>
      (await _get('/bookings/$id/reschedule-quote', {
        'checkIn': checkIn.toIso8601String().split('T').first,
        'checkOut': checkOut.toIso8601String().split('T').first,
      })) as Map<String, dynamic>;

  /// Digital (online) check-in → returns (booking, keyCode).
  Future<(Booking, String)> digitalCheckin(String id) async {
    final j = await _post('/bookings/$id/digital-checkin');
    return (Booking.fromJson(j['booking']), (j['keyCode'] ?? '').toString());
  }

  /// Apply a reschedule → (booking, diff).
  Future<(Booking, int)> reschedule(String id, DateTime checkIn, DateTime checkOut) async {
    final j = await _post('/bookings/$id/reschedule', {
      'checkIn': checkIn.toIso8601String().split('T').first,
      'checkOut': checkOut.toIso8601String().split('T').first,
    });
    return (Booking.fromJson(j['booking']), (j['diff'] ?? 0) as int);
  }

  /// Cancel a booking → returns (booking, refundPct, refundAmount).
  /// [bank] carries {bankName, bankAccount, accountHolder} when a cash refund is due.
  Future<(Booking, int, int)> cancelBooking(String id, {Map<String, dynamic>? bank}) async {
    final j = await _post('/bookings/$id/cancel', bank ?? const {});
    return (Booking.fromJson(j['booking']), (j['refundPct'] ?? 0) as int, (j['refundAmount'] ?? 0) as int);
  }

  // ── Payments ──
  /// Create a payment for a booking → returns instructions (VA/QR/e-wallet URL).
  Future<Payment> createPayment(String bookingId, String method) async =>
      Payment.fromJson((await _post('/bookings/$bookingId/pay', {'method': method}))['payment']);

  Future<Payment> paymentStatus(String paymentId) async =>
      Payment.fromJson((await _get('/payments/$paymentId'))['payment']);

  /// Mock-only: simulate a successful payment (returns the confirmed booking).
  Future<Booking> settlePayment(String paymentId) async =>
      Booking.fromJson((await _post('/payments/$paymentId/settle'))['booking']);

  // ── CS Chat ──
  Future<ChatThread> chat() async => ChatThread.fromJson(await _get('/chat'));
  Future<ChatThread> sendChat(String body) async => ChatThread.fromJson(await _post('/chat', {'body': body}));

  // ── Notifications ──
  Future<List<AppNotification>> notifications() async =>
      ((await _get('/notifications'))['notifications'] as List).map((n) => AppNotification.fromJson(n)).toList();

  // ── App config (launch popup + update prompt) ──
  Future<Map<String, dynamic>> appConfig() async =>
      (await _get('/app/config')) as Map<String, dynamic>;

  // ── Loyalty points ──
  Future<Map<String, dynamic>> loyalty() async => (await _get('/loyalty')) as Map<String, dynamic>;

  // ── Guest ↔ Hotel chat ──
  Future<Map<String, dynamic>> hotelChat(String hotelId) async =>
      (await _get('/hotel-chat/$hotelId')) as Map<String, dynamic>;
  Future<Map<String, dynamic>> sendHotelChat(String hotelId, String body) async =>
      (await _post('/hotel-chat/$hotelId', {'body': body})) as Map<String, dynamic>;

  // ── Security: sessions, login history, 2FA ──
  Future<List<dynamic>> sessions() async =>
      (await _post('/auth/sessions/current', {if (refreshToken != null) 'refreshToken': refreshToken}))['sessions'] as List;
  Future<void> revokeSession(String id) async => _post('/auth/sessions/$id/revoke');
  Future<void> revokeOtherSessions() async => _post('/auth/sessions/revoke-others', {if (refreshToken != null) 'refreshToken': refreshToken});
  Future<List<dynamic>> loginHistory() async => (await _get('/auth/login-history'))['events'] as List;
  Future<bool> get2fa() async => ((await _get('/auth/2fa')) as Map)['enabled'] == true;
  Future<bool> set2fa(bool enable) async => ((await _post('/auth/2fa', {'enable': enable})) as Map)['enabled'] == true;

  // ── Wishlists / Trips ──
  Future<List<dynamic>> wishlists() async => (await _get('/wishlists'))['wishlists'] as List;
  Future<Map<String, dynamic>> createWishlist(String name) async => (await _post('/wishlists', {'name': name}))['wishlist'] as Map<String, dynamic>;
  Future<void> deleteWishlist(String id) async => _req('DELETE', '/wishlists/$id');
  Future<void> addToWishlist(String id, Map<String, dynamic> item) async => _post('/wishlists/$id/items', item);
  Future<void> removeWishlistItem(String itemId) async => _req('DELETE', '/wishlists/items/$itemId');

  // ── Similar properties ──
  Future<List<Hotel>> similarHotels(String id) async =>
      ((await _get('/hotels/$id/similar'))['hotels'] as List).map((h) => Hotel.fromJson(h)).toList();

  // ── Recently viewed ──
  Future<void> trackView(String hotelId) async { try { await _post('/hotels/$hotelId/view'); } catch (_) {} }
  Future<List<Hotel>> recentlyViewed() async =>
      ((await _get('/recently-viewed'))['hotels'] as List).map((h) => Hotel.fromJson(h)).toList();

  // ── Voucher wallet ("Voucher Saya") ──
  Future<Map<String, dynamic>> myVouchers() async => (await _get('/my-vouchers')) as Map<String, dynamic>;
  Future<void> claimVoucher(String promoId) async => _post('/promos/$promoId/claim');

  // ── Referral ──
  Future<Map<String, dynamic>> referral() async => (await _get('/referral')) as Map<String, dynamic>;
  Future<Map<String, dynamic>> applyReferral(String code) async =>
      (await _post('/referral/apply', {'code': code})) as Map<String, dynamic>;

  // ── Property Q&A ──
  Future<List<dynamic>> hotelQuestions(String hotelId) async => (await _get('/hotels/$hotelId/questions'))['questions'] as List;
  Future<void> askQuestion(String hotelId, String body) async => _post('/hotels/$hotelId/questions', {'body': body});

  // ── Price alerts (watch a hotel for price drops) ──
  Future<bool> togglePriceAlert(String hotelId) async =>
      ((await _post('/hotels/$hotelId/price-alert')) as Map)['watching'] == true;
  Future<Set<String>> priceAlertHotelIds() async =>
      ((await _get('/price-alerts'))['hotelIds'] as List).map((e) => e.toString()).toSet();

  // ── Module config (which modules are enabled) ──
  Future<Map<String, bool>> modules() async {
    final r = (await _get('/config')) as Map<String, dynamic>;
    final m = (r['modules'] as Map?) ?? const {};
    return m.map((k, v) => MapEntry(k.toString(), v == true));
  }

  // ── Tour ──
  Future<List<Tour>> tours({String? category, String? q}) async =>
      ((await _get('/tours', {if (category != null) 'category': category, if (q != null) 'q': q}))['tours'] as List)
          .map((t) => Tour.fromJson(t)).toList();
  Future<Tour> tour(String id) async => Tour.fromJson((await _get('/tours/$id'))['tour']);
  Future<Map<String, dynamic>> bookTour(String id, {required String date, required int pax, required String bookerName, required String bookerPhone, required String paymentMethod}) async =>
      (await _post('/tours/$id/book', {'date': date, 'pax': pax, 'bookerName': bookerName, 'bookerPhone': bookerPhone, 'paymentMethod': paymentMethod})) as Map<String, dynamic>;
  Future<List<dynamic>> tourBookings() async => (await _get('/tour-bookings'))['bookings'] as List;

  // ── Shuttle ──
  Future<List<ShuttleVehicleType>> shuttleVehicleTypes() async =>
      ((await _get('/shuttle/vehicle-types'))['vehicleTypes'] as List).map((v) => ShuttleVehicleType.fromJson(v)).toList();
  Future<Map<String, dynamic>> shuttleEstimate({required double originLat, required double originLng, required double destLat, required double destLng}) async =>
      (await _post('/shuttle/estimate', {'originLat': originLat, 'originLng': originLng, 'destLat': destLat, 'destLng': destLng})) as Map<String, dynamic>;
  Future<ShuttleRide> shuttleRequest({required String vehicleTypeId, required String originLabel, required double originLat, required double originLng, required String destLabel, required double destLat, required double destLng, required String paymentMethod}) async =>
      ShuttleRide.fromJson((await _post('/shuttle/request', {'vehicleTypeId': vehicleTypeId, 'originLabel': originLabel, 'originLat': originLat, 'originLng': originLng, 'destLabel': destLabel, 'destLat': destLat, 'destLng': destLng, 'paymentMethod': paymentMethod}))['ride']);
  Future<List<ShuttleRide>> shuttleRides() async =>
      ((await _get('/shuttle/rides'))['rides'] as List).map((r) => ShuttleRide.fromJson(r)).toList();
  Future<ShuttleRide> shuttleRideStatus(String id, String status) async =>
      ShuttleRide.fromJson((await _post('/shuttle/rides/$id/status', {'status': status}))['ride']);
}

/// Thrown by login() when the account has 2FA on and an emailed code is needed.
class TwoFactorRequired implements Exception {}

class ApiException implements Exception {
  final String message;
  final int status;
  ApiException(this.message, this.status);
  @override
  String toString() => message;
}
