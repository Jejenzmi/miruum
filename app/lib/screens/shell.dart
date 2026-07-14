import 'package:flutter/material.dart';
import '../image_upload.dart';
import '../l10n.dart';
import '../theme.dart';
import 'home.dart';
import 'pesanan.dart';
import 'jelajah.dart';
import 'favorit.dart';
import 'profile.dart';

class MainShell extends StatefulWidget {
  final int initialIndex;
  const MainShell({super.key, this.initialIndex = 0});
  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  late int _index = widget.initialIndex;

  final _tabs = const [HomeScreen(), PesananScreen(), JelajahScreen(), FavoritScreen(), ProfileScreen()];

  @override
  void initState() {
    super.initState();
    // Ask for notification permission once the app is up (Android 13+ / iOS).
    WidgetsBinding.instance.addPostFrameCallback((_) => ensureNotificationPermission());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(index: _index, children: _tabs),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: MC.surface,
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 16, offset: const Offset(0, -3))],
        ),
        child: SafeArea(
          top: false,
          child: NavigationBarTheme(
            data: NavigationBarThemeData(
              backgroundColor: MC.surface,
              indicatorColor: MC.primarySoft,
              labelTextStyle: MaterialStateProperty.resolveWith((s) => TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w600,
                    color: s.contains(MaterialState.selected) ? MC.primaryDark : MC.inkFaint,
                  )),
            ),
            child: NavigationBar(
              height: 64,
              selectedIndex: _index,
              onDestinationSelected: (i) => setState(() => _index = i),
              destinations: [
                NavigationDestination(icon: Icon(Icons.home_outlined, color: MC.inkFaint), selectedIcon: const Icon(Icons.home_rounded, color: MC.primaryDark), label: tr('Beranda', 'Home')),
                NavigationDestination(icon: Icon(Icons.receipt_long_outlined, color: MC.inkFaint), selectedIcon: const Icon(Icons.receipt_long_rounded, color: MC.primaryDark), label: tr('Pesanan', 'Orders')),
                NavigationDestination(icon: Icon(Icons.explore_outlined, color: MC.inkFaint), selectedIcon: const Icon(Icons.explore_rounded, color: MC.primaryDark), label: tr('Jelajah', 'Explore')),
                NavigationDestination(icon: Icon(Icons.favorite_outline_rounded, color: MC.inkFaint), selectedIcon: const Icon(Icons.favorite_rounded, color: MC.primaryDark), label: tr('Favorit', 'Saved')),
                NavigationDestination(icon: Icon(Icons.person_outline_rounded, color: MC.inkFaint), selectedIcon: const Icon(Icons.person_rounded, color: MC.primaryDark), label: tr('Akun', 'Account')),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Helper to jump to a tab from anywhere (pops to shell then sets index).
void goToTab(BuildContext context, int index) {
  Navigator.pushAndRemoveUntil(
    context,
    MaterialPageRoute(builder: (_) => MainShell(initialIndex: index)),
    (route) => false,
  );
}
