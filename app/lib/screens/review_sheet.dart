import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../api.dart';
import '../feedback.dart';
import '../theme.dart';
import '../widgets.dart';

/// Bottom sheet to submit a hotel review (1–5 stars + text).
Future<bool> showReviewSheet(BuildContext context, String hotelId, {String? hotelName}) async {
  final result = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: MC.surface,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    builder: (ctx) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
      child: _ReviewForm(hotelId: hotelId, hotelName: hotelName),
    ),
  );
  return result ?? false;
}

class _ReviewForm extends StatefulWidget {
  final String hotelId;
  final String? hotelName;
  const _ReviewForm({required this.hotelId, this.hotelName});
  @override
  State<_ReviewForm> createState() => _ReviewFormState();
}

class _ReviewFormState extends State<_ReviewForm> {
  int _rating = 5;
  final _text = TextEditingController();
  bool _loading = false;

  Future<void> _submit() async {
    if (_text.text.trim().length < 3) {
      showSnack(context, 'Tulis ulasan minimal 3 karakter', kind: SnackKind.error);
      return;
    }
    setState(() => _loading = true);
    try {
      await context.read<Api>().submitReview(widget.hotelId, _rating, _text.text.trim());
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 24),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: MC.line, borderRadius: BorderRadius.circular(2)))),
        const SizedBox(height: 16),
        Text(widget.hotelName != null ? 'Ulasan untuk ${widget.hotelName}' : 'Beri Ulasan',
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
        const SizedBox(height: 4),
        Text('Bagaimana pengalaman menginapmu?', style: TextStyle(color: MC.inkMuted, fontSize: 13)),
        const SizedBox(height: 16),
        Row(mainAxisAlignment: MainAxisAlignment.center, children: List.generate(5, (i) {
          final v = i + 1;
          return IconButton(
            onPressed: () => setState(() => _rating = v),
            icon: Icon(v <= _rating ? Icons.star_rounded : Icons.star_outline_rounded, size: 40, color: MC.star),
          );
        })),
        const SizedBox(height: 8),
        TextField(
          controller: _text,
          maxLines: 4,
          decoration: const InputDecoration(hintText: 'Ceritakan pengalamanmu...'),
        ),
        const SizedBox(height: 18),
        PrimaryButton('Kirim Ulasan', loading: _loading, onPressed: _submit),
      ]),
    );
  }
}
