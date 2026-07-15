import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../api.dart';
import '../l10n.dart';
import '../theme.dart';

/// Renders a Back-Office-managed static page (Terms / Privacy / About).
class ContentScreen extends StatefulWidget {
  final String slug;
  final String fallbackTitle;
  const ContentScreen({super.key, required this.slug, required this.fallbackTitle});
  @override
  State<ContentScreen> createState() => _ContentScreenState();
}

class _ContentScreenState extends State<ContentScreen> {
  late Future<Map<String, String>> _future;

  @override
  void initState() {
    super.initState();
    _future = context.read<Api>().content(widget.slug);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.fallbackTitle)),
      body: FutureBuilder<Map<String, String>>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError || snap.data == null) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(28),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Icon(Icons.wifi_off_rounded, color: MC.inkFaint, size: 40),
                  const SizedBox(height: 12),
                  Text(tr('Gagal memuat konten', 'Failed to load content'),
                      style: TextStyle(color: MC.inkMuted)),
                  const SizedBox(height: 14),
                  OutlinedButton(
                    onPressed: () => setState(() => _future = context.read<Api>().content(widget.slug)),
                    child: Text(tr('Coba lagi', 'Retry')),
                  ),
                ]),
              ),
            );
          }
          final data = snap.data!;
          final title = (data['title'] ?? '').isNotEmpty ? data['title']! : widget.fallbackTitle;
          final body = data['body'] ?? '';
          return ListView(
            padding: const EdgeInsets.fromLTRB(22, 22, 22, 40),
            children: [
              Text(title, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: MC.ink)),
              const SizedBox(height: 16),
              Text(body, style: TextStyle(fontSize: 14.5, height: 1.7, color: MC.inkMuted)),
            ],
          );
        },
      ),
    );
  }
}
