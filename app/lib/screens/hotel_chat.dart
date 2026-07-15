import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../api.dart';
import '../feedback.dart';
import '../theme.dart';

/// Direct chat between the guest and a hotel (polls every 5s, like CS chat).
class HotelChatScreen extends StatefulWidget {
  final String hotelId, hotelName;
  const HotelChatScreen({super.key, required this.hotelId, required this.hotelName});
  @override
  State<HotelChatScreen> createState() => _HotelChatScreenState();
}

class _HotelChatScreenState extends State<HotelChatScreen> {
  final _ctl = TextEditingController();
  final _scroll = ScrollController();
  List<Map<String, dynamic>> _messages = [];
  bool _loading = true, _sending = false;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    _load();
    _poll = Timer.periodic(const Duration(seconds: 5), (_) => _load(silent: true));
  }

  @override
  void dispose() {
    _poll?.cancel();
    _ctl.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
    try {
      final d = await context.read<Api>().hotelChat(widget.hotelId);
      if (!mounted) return;
      setState(() {
        _messages = ((d['messages'] as List?) ?? []).cast<Map<String, dynamic>>();
        _loading = false;
      });
      _toBottom();
    } catch (_) {
      if (mounted && !silent) setState(() => _loading = false);
    }
  }

  void _toBottom() => WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scroll.hasClients) _scroll.animateTo(_scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
      });

  Future<void> _send() async {
    final text = _ctl.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    _ctl.clear();
    try {
      await context.read<Api>().sendHotelChat(widget.hotelId, text);
      await _load(silent: true);
    } catch (e) {
      if (mounted) showSnack(context, 'Gagal mengirim pesan', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: MC.bg,
      appBar: AppBar(
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(widget.hotelName, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          Text('Chat langsung dengan hotel', style: TextStyle(fontSize: 11, color: MC.inkFaint)),
        ]),
      ),
      body: Column(children: [
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator(color: MC.primary))
              : _messages.isEmpty
                  ? _empty()
                  : ListView.builder(
                      controller: _scroll,
                      padding: const EdgeInsets.all(16),
                      itemCount: _messages.length,
                      itemBuilder: (_, i) => _bubble(_messages[i]),
                    ),
        ),
        _composer(),
      ]),
    );
  }

  Widget _empty() => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.chat_bubble_outline_rounded, size: 48, color: MC.inkFaint),
            const SizedBox(height: 12),
            Text('Mulai percakapan dengan ${widget.hotelName}.\nTanyakan fasilitas, permintaan khusus, atau info check-in.',
                textAlign: TextAlign.center, style: TextStyle(color: MC.inkMuted, fontSize: 13, height: 1.5)),
          ]),
        ),
      );

  Widget _bubble(Map<String, dynamic> m) {
    final fromGuest = m['fromGuest'] == true;
    return Align(
      alignment: fromGuest ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
        decoration: BoxDecoration(
          color: fromGuest ? MC.primary : MC.surface,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16), topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(fromGuest ? 16 : 4), bottomRight: Radius.circular(fromGuest ? 4 : 16),
          ),
          boxShadow: fromGuest ? null : [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8)],
        ),
        child: Text((m['body'] ?? '').toString(),
            style: TextStyle(color: fromGuest ? Colors.white : MC.ink, fontSize: 13.5, height: 1.4)),
      ),
    );
  }

  Widget _composer() => SafeArea(
        top: false,
        child: Container(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
          decoration: BoxDecoration(color: MC.surface, boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 12, offset: const Offset(0, -2))]),
          child: Row(children: [
            Expanded(
              child: TextField(
                controller: _ctl,
                minLines: 1, maxLines: 4,
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => _send(),
                decoration: InputDecoration(
                  hintText: 'Tulis pesan…',
                  filled: true, fillColor: MC.field,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide.none),
                ),
              ),
            ),
            const SizedBox(width: 8),
            CircleAvatar(
              radius: 22, backgroundColor: MC.primary,
              child: IconButton(
                icon: _sending
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.send_rounded, color: Colors.white, size: 20),
                onPressed: _send,
              ),
            ),
          ]),
        ),
      );
}
