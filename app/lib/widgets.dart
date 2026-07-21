import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'l10n.dart';
import 'models.dart';
import 'theme.dart';

final _rp = NumberFormat.currency(locale: 'id_ID', symbol: 'Rp ', decimalDigits: 0);
String rupiah(int v) => _rp.format(v);

/// Primary pill button (Miruum green).
class PrimaryButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final bool loading, expand;
  final Color? color;
  final IconData? icon;
  const PrimaryButton(this.label, {super.key, this.onPressed, this.loading = false, this.expand = true, this.color, this.icon});

  @override
  Widget build(BuildContext context) {
    final btn = SizedBox(
      height: 52,
      child: ElevatedButton(
        onPressed: loading ? null : onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: color ?? MC.primary,
          foregroundColor: Colors.white,
          elevation: 0,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
        child: loading
            ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
            // FittedBox keeps the label centered and shrinks it to fit a tight
            // button (e.g. the checkout bottom bar) instead of overflowing.
            : FittedBox(
                fit: BoxFit.scaleDown,
                child: Row(mainAxisAlignment: MainAxisAlignment.center, mainAxisSize: MainAxisSize.min, children: [
                  if (icon != null) ...[Icon(icon, size: 20), const SizedBox(width: 8)],
                  Text(label, maxLines: 1),
                ]),
              ),
      ),
    );
    return expand ? SizedBox(width: double.infinity, child: btn) : btn;
  }
}

class OutlineButtonX extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  const OutlineButtonX(this.label, {super.key, this.onPressed, this.icon});
  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 48,
      child: OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          foregroundColor: MC.primary,
          side: const BorderSide(color: MC.primary, width: 1.4),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(26)),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (icon != null) ...[Icon(icon, size: 18), const SizedBox(width: 6)],
          Text(label),
        ]),
      ),
    );
  }
}

/// Rating chip "8.5 / 10".
class RatingPill extends StatelessWidget {
  final double rating;
  final bool small;
  const RatingPill(this.rating, {super.key, this.small = false});
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: small ? 8 : 10, vertical: small ? 4 : 6),
      decoration: BoxDecoration(color: MC.primarySoft, borderRadius: BorderRadius.circular(10)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.star_rounded, color: MC.star, size: 16),
        const SizedBox(width: 3),
        Text('${rating.toStringAsFixed(1)} / 10',
            style: TextStyle(fontSize: small ? 11 : 12.5, fontWeight: FontWeight.w600, color: MC.primaryDark)),
      ]),
    );
  }
}

class StarRow extends StatelessWidget {
  final int count;
  const StarRow(this.count, {super.key});
  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        for (var i = 0; i < 5; i++)
          Icon(i < count ? Icons.star_rounded : Icons.star_outline_rounded, size: 15, color: MC.star),
      ]);
}

/// Section header with optional "Lihat semua".
class SectionHeader extends StatelessWidget {
  final String title;
  final String? action;
  final VoidCallback? onAction;
  const SectionHeader(this.title, {super.key, this.action, this.onAction});
  @override
  Widget build(BuildContext context) => Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(title, style: const TextStyle(fontSize: 16.5, fontWeight: FontWeight.w700)),
          if (action != null)
            GestureDetector(
              onTap: onAction,
              child: Text(action!, style: const TextStyle(color: MC.primary, fontWeight: FontWeight.w600, fontSize: 13)),
            ),
        ],
      );
}

/// Network image with graceful placeholder + error fallback.
class NetImage extends StatelessWidget {
  final String url;
  final double? width, height;
  final BoxFit fit;
  const NetImage(this.url, {super.key, this.width, this.height, this.fit = BoxFit.cover});
  @override
  Widget build(BuildContext context) {
    return Image.network(
      url, width: width, height: height, fit: fit,
      loadingBuilder: (c, child, p) => p == null
          ? child
          : Container(width: width, height: height, color: MC.field, child: Center(
              child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2, color: MC.inkFaint)))),
      errorBuilder: (c, e, s) => Container(
        width: width, height: height, color: MC.field,
        child: Icon(Icons.hotel_rounded, color: MC.inkFaint, size: 34),
      ),
    );
  }
}

/// Booking checkout stepper: Rincian → Review → Pembayaran → Voucher.
class BookingStepper extends StatelessWidget {
  final int step; // 1..4
  const BookingStepper(this.step, {super.key});
  List<String> get _labels => [tr('Rincian', 'Details'), tr('Review', 'Review'), tr('Pembayaran', 'Payment'), tr('Voucher', 'Voucher')];
  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (var i = 0; i < 4; i++) ...[
          Column(children: [
            Container(
              width: 30, height: 30,
              decoration: BoxDecoration(
                color: (i + 1) <= step ? MC.primary : MC.field,
                shape: BoxShape.circle,
              ),
              child: Center(
                child: (i + 1) < step
                    ? const Icon(Icons.check, color: Colors.white, size: 16)
                    : Text('${i + 1}',
                        style: TextStyle(color: (i + 1) <= step ? Colors.white : MC.inkFaint, fontWeight: FontWeight.w700, fontSize: 13)),
              ),
            ),
            const SizedBox(height: 4),
            Text(_labels[i], style: TextStyle(fontSize: 10.5, color: (i + 1) <= step ? MC.ink : MC.inkFaint, fontWeight: FontWeight.w500)),
          ]),
          if (i < 3)
            Expanded(child: Container(height: 2, margin: EdgeInsets.only(bottom: 18), color: (i + 1) < step ? MC.primary : MC.line)),
        ],
      ],
    );
  }
}

/// Simple labelled tag chip (e.g. facilities on room card).
class TagChip extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color? color;
  const TagChip(this.label, this.icon, {super.key, this.color});
  @override
  Widget build(BuildContext context) {
    final c = color ?? MC.primary;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(color: c.withOpacity(0.10), borderRadius: BorderRadius.circular(8)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 13, color: c),
        const SizedBox(width: 4),
        Text(label, style: TextStyle(fontSize: 11, color: c, fontWeight: FontWeight.w500)),
      ]),
    );
  }
}

Widget cardBox({required Widget child, EdgeInsets? padding}) => Container(
      padding: padding ?? const EdgeInsets.all(14),
      decoration: BoxDecoration(color: MC.surface, borderRadius: BorderRadius.circular(18), boxShadow: [softShadow]),
      child: child,
    );

/// Supply-source chip: "Direct" (own Channel Manager) or "via <OTA>".
class SourceBadge extends StatelessWidget {
  final SupplyChannel channel;
  final bool compact;
  const SourceBadge(this.channel, {super.key, this.compact = false});
  @override
  Widget build(BuildContext context) {
    final c = _hex(channel.color) ?? (channel.isDirect ? MC.success : MC.blue);
    final label = channel.isDirect ? tr('Langsung', 'Direct') : 'via ${channel.name}';
    final icon = channel.isDirect ? Icons.verified_rounded : Icons.storefront_rounded;
    return Container(
      padding: EdgeInsets.symmetric(horizontal: compact ? 6 : 8, vertical: compact ? 2.5 : 4),
      decoration: BoxDecoration(color: c.withOpacity(0.12), borderRadius: BorderRadius.circular(7)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: compact ? 11 : 13, color: c),
        const SizedBox(width: 3),
        Text(label, style: TextStyle(fontSize: compact ? 10 : 11, fontWeight: FontWeight.w600, color: c)),
      ]),
    );
  }

  static Color? _hex(String? h) {
    if (h == null) return null;
    var s = h.replaceFirst('#', '');
    if (s.length == 6) s = 'FF$s';
    final v = int.tryParse(s, radix: 16);
    return v == null ? null : Color(v);
  }
}

IconData facilityIcon(String key) {
  switch (key) {
    case 'wifi': return Icons.wifi_rounded;
    case 'tv': return Icons.tv_rounded;
    case 'pool': return Icons.pool_rounded;
    case 'ac_unit': return Icons.ac_unit_rounded;
    case 'restaurant': return Icons.restaurant_rounded;
    case 'local_parking': return Icons.local_parking_rounded;
    case 'fitness_center': return Icons.fitness_center_rounded;
    case 'spa': return Icons.spa_rounded;
    case 'free_breakfast': return Icons.free_breakfast_rounded;
    default: return Icons.check_circle_outline_rounded;
  }
}
