import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'push.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api.dart';
import 'bloc/auth/auth_bloc.dart';
import 'theme.dart';
import 'screens/splash.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('id_ID', null);
  await initializeDateFormatting('en_US', null);

  // Load saved settings.
  final prefs = await SharedPreferences.getInstance();
  final tm = prefs.getString('miruum_theme') ?? 'light'; // default: mode terang
  AppSettings.themeMode.value = tm == 'dark' ? ThemeMode.dark : tm == 'system' ? ThemeMode.system : ThemeMode.light;
  AppSettings.locale.value = Locale(prefs.getString('miruum_lang') ?? 'id');

  await Push.init(); // Firebase + FCM (guarded; app runs even if unavailable)

  // Crash reporting → Firebase Crashlytics (guarded; no-op if Firebase unavailable).
  try {
    FlutterError.onError = FirebaseCrashlytics.instance.recordFlutterFatalError;
    PlatformDispatcher.instance.onError = (error, stack) {
      FirebaseCrashlytics.instance.recordError(error, stack, fatal: true);
      return true;
    };
  } catch (_) {}

  final api = Api();
  runApp(
    RepositoryProvider<Api>.value(
      value: api,
      child: BlocProvider<AuthBloc>(
        create: (_) => AuthBloc(api)..add(const AuthStarted()),
        child: const MiruumApp(),
      ),
    ),
  );
}

class MiruumApp extends StatefulWidget {
  const MiruumApp({super.key});
  @override
  State<MiruumApp> createState() => _MiruumAppState();
}

class _MiruumAppState extends State<MiruumApp> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangePlatformBrightness() => setState(() {}); // react to system theme

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<ThemeMode>(
      valueListenable: AppSettings.themeMode,
      builder: (context, mode, _) => ValueListenableBuilder<Locale>(
        valueListenable: AppSettings.locale,
        builder: (context, locale, __) {
          final platformDark =
              WidgetsBinding.instance.platformDispatcher.platformBrightness == Brightness.dark;
          kDark = mode == ThemeMode.dark || (mode == ThemeMode.system && platformDark);
          return MaterialApp(
            title: 'Miruum',
            debugShowCheckedModeBanner: false,
            theme: MiruumTheme.build(),
            locale: locale,
            supportedLocales: const [Locale('id'), Locale('en')],
            localizationsDelegates: const [
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
              GlobalCupertinoLocalizations.delegate,
            ],
            home: const SplashScreen(),
          );
        },
      ),
    );
  }
}
