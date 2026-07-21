import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../l10n.dart';
import '../theme.dart';
import '../widgets.dart';
import 'shell.dart';

const _kOnboardedKey = 'miruum_onboarded_v1';

Future<bool> hasOnboarded() async =>
    (await SharedPreferences.getInstance()).getBool(_kOnboardedKey) ?? false;

class _Slide {
  final IconData icon;
  final Color color;
  final String title, body;
  const _Slide(this.icon, this.color, this.title, this.body);
}

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});
  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _pc = PageController();
  int _i = 0;

  List<_Slide> get _slides => [
    _Slide(Icons.hotel_rounded, MC.primary, tr('Ribuan Hotel & Paket', 'Thousands of Hotels & Packages'),
        tr('Temukan hotel dan paket staycation terbaik di seluruh Indonesia — harga selalu yang termurah.',
            'Discover the best hotels and staycation packages across Indonesia — always at the lowest prices.')),
    _Slide(Icons.calendar_month_rounded, MC.blue, tr('Booking Mudah & Fleksibel', 'Easy & Flexible Booking'),
        tr('Pilih tanggal lewat kalender harga, bayar dengan VA / e-wallet / QRIS, dan e-voucher langsung terbit.',
            'Pick your dates on the price calendar, pay via VA / e-wallet / QRIS, and get your e-voucher instantly.')),
    _Slide(Icons.verified_user_rounded, MC.success, tr('Aman & Bisa Dibatalkan', 'Safe & Cancellable'),
        tr('Pembatalan dengan kebijakan refund yang jelas, dan setiap transaksi tersimpan rapi di akunmu.',
            'Cancellation with clear refund policies, and every transaction neatly kept in your account.')),
  ];

  Future<void> _finish() async {
    (await SharedPreferences.getInstance()).setBool(_kOnboardedKey, true);
    if (mounted) Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const MainShell()));
  }

  @override
  Widget build(BuildContext context) {
    final last = _i == _slides.length - 1;
    return Scaffold(
      backgroundColor: MC.surface,
      body: SafeArea(
        child: Column(children: [
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(onPressed: _finish, child: Text(tr('Lewati', 'Skip'), style: TextStyle(color: MC.inkMuted))),
          ),
          Expanded(
            child: PageView.builder(
              controller: _pc,
              onPageChanged: (i) => setState(() => _i = i),
              itemCount: _slides.length,
              itemBuilder: (_, i) {
                final s = _slides[i];
                return Padding(
                  padding: const EdgeInsets.all(32),
                  child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                    Container(
                      width: 150, height: 150,
                      decoration: BoxDecoration(color: s.color.withOpacity(0.12), shape: BoxShape.circle),
                      child: Icon(s.icon, size: 76, color: s.color),
                    ).animate(key: ValueKey(i)).scale(begin: const Offset(0.7, 0.7), duration: 500.ms, curve: Curves.elasticOut),
                    const SizedBox(height: 40),
                    Text(s.title, textAlign: TextAlign.center, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800))
                        .animate(key: ValueKey('t$i')).fadeIn().slideY(begin: 0.2, end: 0),
                    const SizedBox(height: 12),
                    Text(s.body, textAlign: TextAlign.center, style: TextStyle(color: MC.inkMuted, fontSize: 14, height: 1.5))
                        .animate(key: ValueKey('b$i')).fadeIn(delay: 100.ms),
                  ]),
                );
              },
            ),
          ),
          Row(mainAxisAlignment: MainAxisAlignment.center, children: List.generate(_slides.length, (i) => AnimatedContainer(
            duration: const Duration(milliseconds: 250),
            margin: const EdgeInsets.symmetric(horizontal: 4),
            width: _i == i ? 24 : 8, height: 8,
            decoration: BoxDecoration(color: _i == i ? MC.primary : MC.line, borderRadius: BorderRadius.circular(4)),
          ))),
          Padding(
            padding: const EdgeInsets.all(24),
            child: PrimaryButton(last ? tr('Mulai Sekarang', 'Get Started') : tr('Lanjut', 'Next'),
                icon: last ? Icons.arrow_forward_rounded : null,
                onPressed: () {
                  if (last) {
                    _finish();
                  } else {
                    _pc.nextPage(duration: const Duration(milliseconds: 300), curve: Curves.easeOut);
                  }
                }),
          ),
        ]),
      ),
    );
  }
}
