import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'api.dart';
import 'bloc/auth/auth_bloc.dart';
import 'theme.dart';
import 'screens/splash.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('id_ID', null);
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
