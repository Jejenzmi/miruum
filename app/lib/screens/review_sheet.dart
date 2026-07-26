import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../api.dart';
import '../feedback.dart';
import '../l10n.dart';
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
  final _textF = FocusNode();
  bool _loading = false;
  // Category sub-scores (0–10), default to a neutral 8.
  static const _cats = {
    'cleanliness': 'Kebersihan', 'location': 'Lokasi', 'staff': 'Staf',
    'facilities': 'Fasilitas', 'comfort': 'Kenyamanan', 'value': 'Nilai',
  };
  final Map<String, double> _scores = {for (final k in _cats.keys) k: 8};

  String _catLabel(String key) {
    switch (key) {
      case 'cleanliness': return tr('Kebersihan', 'Cleanliness');
      case 'location': return tr('Lokasi', 'Location');
      case 'staff': return tr('Staf', 'Staff');
      case 'facilities': return tr('Fasilitas', 'Facilities');
      case 'comfort': return tr('Kenyamanan', 'Comfort');
      case 'value': return tr('Nilai', 'Value');
      default: return key;
    }
  }

  Future<void> _submit() async {
    if (_text.text.trim().length < 3) {
      _textF.requestFocus();
      showSnack(context, tr('Tulis ulasan minimal 3 karakter', 'Write a review of at least 3 characters'), kind: SnackKind.error);
      return;
    }
    setState(() => _loading = true);
    try {
      await context.read<Api>().submitReview(widget.hotelId, _rating, _text.text.trim(), scores: _scores);
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
        Text(widget.hotelName != null ? tr('Ulasan untuk ${widget.hotelName}', 'Review for ${widget.hotelName}') : tr('Beri Ulasan', 'Write a Review'),
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
        const SizedBox(height: 4),
        Text(tr('Bagaimana pengalaman menginapmu?', 'How was your stay?'), style: TextStyle(color: MC.inkMuted, fontSize: 13)),
        const SizedBox(height: 16),
        Row(mainAxisAlignment: MainAxisAlignment.center, children: List.generate(5, (i) {
          final v = i + 1;
          return IconButton(
            onPressed: () => setState(() => _rating = v),
            icon: Icon(v <= _rating ? Icons.star_rounded : Icons.star_outline_rounded, size: 40, color: MC.star),
          );
        })),
        const SizedBox(height: 8),
        Padding(
          padding: const EdgeInsets.only(bottom: 6, left: 2),
          child: RichText(text: TextSpan(style: TextStyle(fontSize: 12.5, color: MC.inkMuted), children: [
            TextSpan(text: tr('Ulasan Anda', 'Your review')),
            const TextSpan(text: ' *', style: TextStyle(color: MC.danger, fontWeight: FontWeight.w800)),
          ])),
        ),
        TextField(
          controller: _text,
          focusNode: _textF,
          maxLines: 4,
          decoration: InputDecoration(hintText: tr('Ceritakan pengalamanmu...', 'Tell us about your experience...')),
        ),
        const SizedBox(height: 16),
        Text(tr('Skor per kategori', 'Score by category'), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
        const SizedBox(height: 4),
        ..._cats.entries.map((e) => Row(children: [
          SizedBox(width: 88, child: Text(_catLabel(e.key), style: TextStyle(fontSize: 12.5, color: MC.inkMuted))),
          Expanded(child: Slider(
            value: _scores[e.key]!, min: 1, max: 10, divisions: 9, activeColor: MC.primary,
            label: _scores[e.key]!.toStringAsFixed(0),
            onChanged: (v) => setState(() => _scores[e.key] = v))),
          SizedBox(width: 26, child: Text(_scores[e.key]!.toStringAsFixed(0), textAlign: TextAlign.right,
            style: const TextStyle(fontWeight: FontWeight.w800, color: MC.primaryDark))),
        ])),
        const SizedBox(height: 10),
        PrimaryButton(tr('Kirim Ulasan', 'Submit Review'), loading: _loading, onPressed: _submit),
      ]),
    );
  }
}
