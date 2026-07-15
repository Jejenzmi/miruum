import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../api.dart';
import '../feedback.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets.dart';

/// Customer Service chat — bot answers instantly; type "agen" to reach a live
/// agent (who replies from Back Office). Polls for new agent messages.
class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});
  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  List<ChatMessage> _messages = [];
  String _status = 'BOT';
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
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
    try {
      final t = await context.read<Api>().chat();
      if (!mounted) return;
      final changed = t.messages.length != _messages.length;
      setState(() { _messages = t.messages; _status = t.status; _loading = false; });
      if (changed) _toBottom();
    } catch (_) {
      if (mounted && !silent) setState(() => _loading = false);
    }
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty || _sending) return;
    _input.clear();
    setState(() {
      _sending = true;
      _messages = [..._messages, ChatMessage(id: 'tmp', sender: 'USER', body: text)];
    });
    _toBottom();
    try {
      final t = await context.read<Api>().sendChat(text);
      if (mounted) setState(() { _messages = t.messages; _status = t.status; });
      _toBottom();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message), backgroundColor: MC.danger));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  void _toBottom() => WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scroll.hasClients) _scroll.animateTo(_scroll.position.maxScrollExtent + 80, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
      });

  @override
  Widget build(BuildContext context) {
    final agentMode = _status == 'AGENT' || _status == 'WAITING_AGENT';
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Row(children: [
          Container(
            width: 38, height: 38,
            decoration: BoxDecoration(color: MC.primarySoft, shape: BoxShape.circle),
            child: Icon(agentMode ? Icons.support_agent_rounded : Icons.smart_toy_rounded, color: MC.primaryDark, size: 20),
          ),
          const SizedBox(width: 10),
          Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            const Text('Miruum CS', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
            Text(_status == 'AGENT' ? 'Agen online' : _status == 'WAITING_AGENT' ? 'Menghubungkan agen…' : 'Asisten otomatis',
                style: const TextStyle(fontSize: 11, color: MC.success)),
          ]),
        ]),
      ),
      body: SafeArea(
        child: Column(children: [
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: MC.primary))
                : ListView.builder(
                    controller: _scroll,
                    padding: const EdgeInsets.all(16),
                    itemCount: _messages.length,
                    itemBuilder: (_, i) => _bubble(_messages[i]),
                  ),
          ),
          Container(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
            decoration: BoxDecoration(color: MC.surface, boxShadow: [
              BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 12, offset: const Offset(0, -3)),
            ]),
            child: Row(children: [
              Expanded(child: TextField(
                controller: _input,
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => _send(),
                decoration: const InputDecoration(hintText: 'Tulis pesan…', isDense: true),
              )),
              const SizedBox(width: 8),
              GestureDetector(
                onTap: _send,
                child: Container(
                  width: 46, height: 46,
                  decoration: const BoxDecoration(color: MC.primary, shape: BoxShape.circle),
                  child: _sending
                      ? const Padding(padding: EdgeInsets.all(13), child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.send_rounded, color: Colors.white, size: 20),
                ),
              ),
            ]),
          ),
        ]),
      ),
    );
  }

  Widget _bubble(ChatMessage m) {
    final mine = m.isUser;
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.76),
        decoration: BoxDecoration(
          color: mine ? MC.primary : m.isBot ? MC.blueSoft : MC.field,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16), topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(mine ? 16 : 4), bottomRight: Radius.circular(mine ? 4 : 16),
          ),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          if (!mine) Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Icon(m.isBot ? Icons.smart_toy_rounded : Icons.support_agent_rounded,
                  size: 12, color: m.isBot ? MC.blue : MC.primaryDark),
              const SizedBox(width: 4),
              Text(m.isBot ? 'Asisten' : 'Agen',
                  style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: m.isBot ? MC.blue : MC.primaryDark)),
            ]),
          ),
          Text(m.body, style: TextStyle(color: mine ? Colors.white : MC.ink, fontSize: 13.5, height: 1.35)),
        ]),
      ),
    );
  }
}
