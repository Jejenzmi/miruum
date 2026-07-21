import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'bloc/auth/auth_bloc.dart';
import 'l10n.dart';
import 'models.dart';
import 'theme.dart';
import 'widgets.dart';
import 'screens/hotel_detail.dart';

/// Horizontal hotel card — used on Home, Results, Favorit, Pesanan, etc.
class HotelCard extends StatelessWidget {
  final Hotel hotel;
  final bool showBook;
  final String bookLabel;
  final VoidCallback? onBook;
  const HotelCard(this.hotel, {super.key, this.showBook = false, this.bookLabel = '', this.onBook});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthBloc>().state;
    final fav = auth.isFavorite(hotel.id);
    return GestureDetector(
      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => HotelDetailScreen(hotel.id))),
      child: cardBox(
        padding: const EdgeInsets.all(10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: NetImage(hotel.imageUrl, width: 104, height: 104),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(child: Text(hotel.name, maxLines: 1, overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15))),
                      if (auth.isLoggedIn)
                        GestureDetector(
                          onTap: () => context.read<AuthBloc>().add(AuthFavoriteToggled(hotel.id)),
                          child: Icon(fav ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                              size: 20, color: fav ? MC.danger : MC.inkFaint),
                        ),
                    ],
                  ),
                  const SizedBox(height: 3),
                  Row(children: [
                    Icon(Icons.location_on_rounded, size: 13, color: MC.inkFaint),
                    const SizedBox(width: 2),
                    Expanded(child: Text(hotel.city, maxLines: 1, overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 12, color: MC.inkMuted))),
                  ]),
                  const SizedBox(height: 6),
                  RatingPill(hotel.rating, small: true),
                  const SizedBox(height: 8),
                  if (hotel.priceBefore != null && hotel.priceBefore! > hotel.priceFrom)
                    Row(children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(color: MC.success.withOpacity(0.12), borderRadius: BorderRadius.circular(5)),
                        child: Row(mainAxisSize: MainAxisSize.min, children: [
                          const Icon(Icons.trending_down_rounded, size: 11, color: MC.success),
                          const SizedBox(width: 2),
                          Text(tr('Harga turun', 'Price drop'), style: const TextStyle(color: MC.success, fontSize: 9.5, fontWeight: FontWeight.w700)),
                        ]),
                      ),
                      const SizedBox(width: 6),
                      Text(rupiah(hotel.priceBefore!), style: TextStyle(color: MC.inkFaint, fontSize: 10.5, decoration: TextDecoration.lineThrough)),
                    ]),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Expanded(
                        child: RichText(
                          text: TextSpan(
                            style: TextStyle(color: MC.ink),
                            children: [
                              TextSpan(text: rupiah(hotel.priceFrom),
                                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: MC.primaryDark)),
                              TextSpan(text: tr(' /malam', ' /night'), style: TextStyle(fontSize: 11, color: MC.inkFaint)),
                            ],
                          ),
                        ),
                      ),
                      if (showBook)
                        SizedBox(
                          height: 34,
                          child: ElevatedButton(
                            onPressed: onBook ?? () => Navigator.push(context,
                                MaterialPageRoute(builder: (_) => HotelDetailScreen(hotel.id))),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: MC.primary, foregroundColor: Colors.white, elevation: 0,
                              padding: const EdgeInsets.symmetric(horizontal: 18),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
                              textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                            ),
                            child: Text(bookLabel.isEmpty ? tr('Pesan', 'Book') : bookLabel),
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
