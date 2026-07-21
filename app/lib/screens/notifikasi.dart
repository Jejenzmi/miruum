import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../api.dart';
import '../bloc/cubits.dart';
import '../bloc/view_state.dart';
import '../l10n.dart';
import '../models.dart';
import '../theme.dart';
import '../ui_kit.dart';
import '../widgets.dart';

class NotifikasiScreen extends StatelessWidget {
  const NotifikasiScreen({super.key});

  ({IconData icon, Color color}) _style(String type) => switch (type) {
        'success' => (icon: Icons.check_circle_rounded, color: MC.primary),
        'pending' => (icon: Icons.timer_outlined, color: MC.accent),
        'cancel' => (icon: Icons.cancel_rounded, color: MC.danger),
        _ => (icon: Icons.notifications_rounded, color: MC.inkMuted),
      };

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (ctx) => NotificationsCubit(ctx.read<Api>())..load(),
      child: Scaffold(
        appBar: AppBar(title: Text(tr('Notifikasi', 'Notifications'))),
        body: SafeArea(
          child: BlocBuilder<NotificationsCubit, ViewState<List<AppNotification>>>(
            builder: (context, state) {
              if (state.isLoading) {
                return const SkeletonList();
              }
              final items = state.data ?? [];
              if (items.isEmpty) {
                return EmptyState(
                  icon: Icons.notifications_none_rounded,
                  title: tr('Belum ada notifikasi', 'No notifications yet'),
                  subtitle: tr('Info pesanan & promo akan muncul di sini', 'Booking info & promos will appear here'),
                );
              }
              return ListView.separated(
                padding: const EdgeInsets.all(20),
                itemCount: items.length,
                separatorBuilder: (_, __) => const SizedBox(height: 12),
                itemBuilder: (context, i) {
                  final n = items[i];
                  final st = _style(n.type);
                  return cardBox(child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Container(
                      width: 42, height: 42,
                      decoration: BoxDecoration(color: st.color.withOpacity(0.12), borderRadius: BorderRadius.circular(12)),
                      child: Icon(st.icon, color: st.color, size: 22),
                    ),
                    const SizedBox(width: 12),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(n.title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                      const SizedBox(height: 3),
                      Text(n.body, style: TextStyle(color: MC.inkMuted, fontSize: 12.5, height: 1.4)),
                    ])),
                  ])).animate().fadeIn(delay: (i * 60).ms, duration: 350.ms).slideX(begin: 0.1, end: 0);
                },
              );
            },
          ),
        ),
      ),
    );
  }
}
