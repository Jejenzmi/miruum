import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'api.dart';

// FCM push wiring. Firebase config comes from android/app/google-services.json.
// All calls are guarded so the app still works if FCM is misconfigured/offline.

@pragma('vm:entry-point')
Future<void> _fcmBackgroundHandler(RemoteMessage message) async {
  // Data-only background handling could go here; the system shows notifications.
}

class Push {
  static String? _token;
  static bool _inited = false;

  /// Initialize Firebase + FCM once. Requests permission and fetches the token.
  static Future<void> init() async {
    if (_inited) return;
    _inited = true;
    try {
      await Firebase.initializeApp();
      FirebaseMessaging.onBackgroundMessage(_fcmBackgroundHandler);
      final fm = FirebaseMessaging.instance;
      await fm.requestPermission(alert: true, badge: true, sound: true);
      _token = await fm.getToken();
      fm.onTokenRefresh.listen((t) => _token = t);
    } catch (_) {
      // FCM is optional — never block app startup.
    }
  }

  /// Register the device token against the (now) logged-in user. Best-effort.
  static Future<void> register(Api api) async {
    try {
      if (_token != null) await api.registerDevice(_token!);
    } catch (_) {}
  }
}
