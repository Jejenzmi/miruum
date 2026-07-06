import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'session.dart';
import 'theme.dart';
import 'screens/splash.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('id_ID', null);
  runApp(
    ChangeNotifierProvider(
      create: (_) => Session()..bootstrap(),
      child: const MiruumApp(),
    ),
  );
}

class MiruumApp extends StatelessWidget {
  const MiruumApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Miruum',
      debugShowCheckedModeBanner: false,
      theme: MiruumTheme.light(),
      home: const SplashScreen(),
    );
  }
}
