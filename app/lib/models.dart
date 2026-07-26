/// Data models for Miruum OTA — mirror the backend JSON shapes.
import 'package:equatable/equatable.dart';
import 'l10n.dart';

class AppUser extends Equatable {
  final String id, name, email;
  final String role; // USER | ADMIN | PARTNER | CORPORATE
  final String? phone, gender, birthDate, avatarUrl;
  final String? title, nationality, idType, idNumber, address, city;
  const AppUser({
    required this.id, required this.name, required this.email, this.role = 'USER',
    this.phone, this.gender, this.birthDate, this.avatarUrl,
    this.title, this.nationality, this.idType, this.idNumber, this.address, this.city,
  });
  bool get isCorporate => role == 'CORPORATE';
  factory AppUser.fromJson(Map<String, dynamic> j) => AppUser(
        id: j['id'], name: j['name'] ?? '', email: j['email'] ?? '', role: j['role'] ?? 'USER',
        phone: j['phone'], gender: j['gender'], birthDate: j['birthDate'], avatarUrl: j['avatarUrl'],
        title: j['title'], nationality: j['nationality'], idType: j['idType'],
        idNumber: j['idNumber'], address: j['address'], city: j['city'],
      );

  // Full value equality so any profile change (photo, name, id, …) is detected
  // by the AuthBloc and triggers a rebuild.
  @override
  List<Object?> get props =>
      [id, name, email, role, phone, gender, birthDate, avatarUrl, title, nationality, idType, idNumber, address, city];
}

class Facility {
  final String id, name, icon;
  Facility({this.id = '', required this.name, required this.icon});
  factory Facility.fromJson(Map<String, dynamic> j) => Facility(id: j['id'] ?? '', name: j['name'], icon: j['icon']);
}

class Review {
  final String authorName, body;
  final double rating;
  final String? createdAt, reply;
  final bool verified;
  final List<String> photos;
  final Map<String, double?> scores;
  Review({required this.authorName, required this.body, required this.rating, this.createdAt, this.reply,
    this.verified = false, this.photos = const [], this.scores = const {}});
  factory Review.fromJson(Map<String, dynamic> j) => Review(
        authorName: j['authorName'] ?? tr('Tamu', 'Guest'),
        body: j['body'] ?? '',
        reply: j['reply'],
        rating: (j['rating'] ?? 0).toDouble(),
        createdAt: j['createdAt'],
        verified: j['verified'] ?? false,
        photos: (j['photos'] as List?)?.map((p) => p.toString()).toList() ?? const [],
        scores: {
          'cleanliness': (j['scoreCleanliness'] as num?)?.toDouble(),
          'location': (j['scoreLocation'] as num?)?.toDouble(),
          'staff': (j['scoreStaff'] as num?)?.toDouble(),
          'facilities': (j['scoreFacilities'] as num?)?.toDouble(),
          'comfort': (j['scoreComfort'] as num?)?.toDouble(),
          'value': (j['scoreValue'] as num?)?.toDouble(),
        },
      );
}

class RatePlan {
  final String id, name, boardBasis;
  final bool refundable, freeCancellation;
  final int priceDelta;
  RatePlan({required this.id, required this.name, required this.boardBasis, required this.refundable, required this.freeCancellation, required this.priceDelta});
  factory RatePlan.fromJson(Map<String, dynamic> j) => RatePlan(
        id: j['id'], name: j['name'] ?? 'Kamar Saja', boardBasis: j['boardBasis'] ?? 'ROOM_ONLY',
        refundable: j['refundable'] ?? true, freeCancellation: j['freeCancellation'] ?? false,
        priceDelta: j['priceDelta'] ?? 0,
      );
  String get boardLabel => switch (boardBasis) {
        'BREAKFAST' => tr('Termasuk sarapan', 'Breakfast included'),
        'HALF_BOARD' => tr('Sarapan + 1 makan', 'Breakfast + 1 meal'),
        'FULL_BOARD' => tr('Semua makan', 'All meals included'),
        _ => tr('Tanpa sarapan', 'Room only'),
      };
}

class Room {
  final String id, name, bedInfo;
  final int capacity, price, stock;
  final int? originalPrice;
  final String? discountLabel;
  final bool refundable, breakfast, freeWifi, freeCancellation;
  final List<RatePlan> ratePlans;
  final List<String> photos; // per-room photo URLs (shown on the room card + booking)
  Room({
    required this.id, required this.name, required this.bedInfo, required this.capacity,
    required this.price, required this.stock, this.originalPrice, this.discountLabel,
    required this.refundable, required this.breakfast, required this.freeWifi, required this.freeCancellation,
    this.ratePlans = const [], this.photos = const [],
  });
  factory Room.fromJson(Map<String, dynamic> j) => Room(
        id: j['id'], name: j['name'], bedInfo: j['bedInfo'] ?? '',
        capacity: j['capacity'] ?? 2, price: j['price'] ?? 0, stock: j['stock'] ?? 0,
        originalPrice: j['originalPrice'], discountLabel: j['discountLabel'],
        refundable: j['refundable'] ?? true, breakfast: j['breakfast'] ?? false,
        freeWifi: j['freeWifi'] ?? true, freeCancellation: j['freeCancellation'] ?? true,
        ratePlans: (j['ratePlans'] as List?)?.map((p) => RatePlan.fromJson(p)).toList() ?? const [],
        photos: (j['photos'] as List?)
                ?.map((p) => (p is Map ? (p['url'] ?? '') : p).toString())
                .where((s) => s.isNotEmpty)
                .toList() ??
            const [],
      );
}

class HotelNearby {
  final String name, category;
  final double distanceKm;
  HotelNearby({required this.name, required this.category, required this.distanceKm});
  factory HotelNearby.fromJson(Map<String, dynamic> j) => HotelNearby(
        name: j['name'] ?? '', category: j['category'] ?? 'ATTRACTION', distanceKm: (j['distanceKm'] ?? 0).toDouble());
}

/// Human labels + icon keys for property types.
class PropertyType {
  static String label(String? t) => switch (t) {
        'VILLA' => tr('Vila', 'Villa'),
        'APARTMENT' => tr('Apartemen', 'Apartment'),
        'HOMESTAY' => 'Homestay',
        'GUESTHOUSE' => 'Guesthouse',
        'HOSTEL' => 'Hostel',
        'RESORT' => 'Resort',
        _ => 'Hotel',
      };
  static const all = ['HOTEL', 'VILLA', 'APARTMENT', 'HOMESTAY', 'GUESTHOUSE', 'HOSTEL', 'RESORT'];
}

/// Supply source of a hotel: Miruum's own Channel Manager (DIRECT) or an OTA.
class SupplyChannel {
  final String code, name, type;
  final String? color;
  final double commissionPct;
  SupplyChannel({required this.code, required this.name, required this.type, this.color, this.commissionPct = 0});
  bool get isDirect => type == 'DIRECT';
  factory SupplyChannel.fromJson(Map<String, dynamic> j) => SupplyChannel(
        code: j['code'] ?? '', name: j['name'] ?? '', type: j['type'] ?? 'OTA',
        color: j['color'], commissionPct: (j['commissionPct'] ?? 0).toDouble(),
      );
}

/// One price/availability offer for a hotel from a single supply source.
class HotelOffer {
  final String id, channelId;
  final int basePrice, price, roomsLeft;
  final double markupPct;
  final bool available;
  final String? deeplink;
  final SupplyChannel? channel;
  HotelOffer({
    required this.id, required this.channelId, required this.basePrice, required this.price,
    required this.roomsLeft, required this.markupPct, required this.available, this.deeplink, this.channel,
  });
  factory HotelOffer.fromJson(Map<String, dynamic> j) => HotelOffer(
        id: j['id'], channelId: j['channelId'] ?? '', basePrice: j['basePrice'] ?? 0,
        price: j['price'] ?? 0, roomsLeft: j['roomsLeft'] ?? 0, markupPct: (j['markupPct'] ?? 0).toDouble(),
        available: j['available'] ?? true, deeplink: j['deeplink'],
        channel: j['channel'] != null ? SupplyChannel.fromJson(j['channel']) : null,
      );
}

class Hotel {
  final String id, name, city, address, imageUrl;
  final double rating;
  final int reviewCount, priceFrom, starRating;
  final int? priceBefore;
  final bool isPromo;
  final String? promoLabel, description, checkInInfo, checkOutInfo;
  final List<String> photos;
  final List<Facility> facilities;
  final List<Room> rooms;
  final List<Review> reviews;
  final SupplyChannel? channel;
  final List<HotelOffer> offers;
  final double? lat, lng;
  final String propertyType;
  final List<HotelNearby> nearby;
  final Map<String, double?> reviewScores;

  Hotel({
    required this.id, required this.name, required this.city, required this.address,
    required this.imageUrl, required this.rating, required this.reviewCount,
    required this.priceFrom, required this.starRating, required this.isPromo, this.priceBefore,
    this.promoLabel, this.description, this.checkInInfo, this.checkOutInfo,
    this.photos = const [], this.facilities = const [], this.rooms = const [], this.reviews = const [],
    this.channel, this.offers = const [], this.lat, this.lng,
    this.propertyType = 'HOTEL', this.nearby = const [], this.reviewScores = const {},
  });

  factory Hotel.fromJson(Map<String, dynamic> j) => Hotel(
        id: j['id'], name: j['name'] ?? '', city: j['city'] ?? '', address: j['address'] ?? '',
        imageUrl: j['imageUrl'] ?? '', rating: (j['rating'] ?? 0).toDouble(),
        reviewCount: j['reviewCount'] ?? 0, priceFrom: j['priceFrom'] ?? 0, priceBefore: j['priceBefore'],
        starRating: j['starRating'] ?? 3, isPromo: j['isPromo'] ?? false,
        promoLabel: j['promoLabel'], description: j['description'],
        checkInInfo: j['checkInInfo'], checkOutInfo: j['checkOutInfo'],
        photos: (j['photos'] as List?)?.map((p) => p is String ? p : p['url'] as String).toList() ?? [],
        facilities: (j['facilities'] as List?)?.map((f) => Facility.fromJson(f)).toList() ?? [],
        rooms: (j['rooms'] as List?)?.map((r) => Room.fromJson(r)).toList() ?? [],
        reviews: (j['reviews'] as List?)?.map((r) => Review.fromJson(r)).toList() ?? [],
        channel: j['channel'] != null ? SupplyChannel.fromJson(j['channel']) : null,
        offers: (j['offers'] as List?)?.map((o) => HotelOffer.fromJson(o)).toList() ?? const [],
        lat: (j['lat'] as num?)?.toDouble(), lng: (j['lng'] as num?)?.toDouble(),
        propertyType: j['propertyType'] ?? 'HOTEL',
        nearby: (j['nearby'] as List?)?.map((n) => HotelNearby.fromJson(n)).toList() ?? const [],
        reviewScores: (j['reviewScores'] as Map?)?.map((k, v) => MapEntry(k.toString(), (v as num?)?.toDouble())) ?? const {},
      );
}

class Promo {
  final String id, code, title, description, imageUrl;
  final int discountPct;
  Promo({required this.id, required this.code, required this.title, required this.description, required this.imageUrl, required this.discountPct});
  factory Promo.fromJson(Map<String, dynamic> j) => Promo(
        id: j['id'], code: j['code'], title: j['title'] ?? '', description: j['description'] ?? '',
        imageUrl: j['imageUrl'] ?? '', discountPct: j['discountPct'] ?? 0,
      );
}

/// A guest saved by the user for faster "booking for someone else".
class SavedGuest {
  final String id, name;
  final String? email, phone;
  SavedGuest({required this.id, required this.name, this.email, this.phone});
  factory SavedGuest.fromJson(Map<String, dynamic> j) =>
      SavedGuest(id: j['id'] ?? '', name: j['name'] ?? '', email: j['email'], phone: j['phone']);
}

/// A Miruum promo/campaign PROGRAM + the hotels that joined it.
class Program {
  final String id, type, title, description;
  final int discountPct;
  final String? imageUrl;
  final List<Hotel> hotels;
  Program({required this.id, required this.type, required this.title, required this.description, required this.discountPct, this.imageUrl, required this.hotels});
  bool get isCampaign => type == 'CAMPAIGN';
  factory Program.fromJson(Map<String, dynamic> j) => Program(
        id: j['id'] ?? '', type: j['type'] ?? 'PROMO', title: j['title'] ?? '', description: j['description'] ?? '',
        discountPct: (j['discountPct'] is int) ? j['discountPct'] : int.tryParse('${j['discountPct']}') ?? 0,
        imageUrl: j['imageUrl'],
        hotels: ((j['hotels'] ?? []) as List).map((h) => Hotel.fromJson(h)).toList(),
      );
}

class HotelPackage {
  final String id, slug, title, city, imageUrl;
  final String? description, badge;
  final int nights, days, guests, originalPrice, price, discountPct, reviewCount, starRating;
  final double rating;
  final bool isPopular;
  final String boardBasis; // ROOM_ONLY | BREAKFAST | HALF_BOARD | FULL_BOARD | ALL_INCLUSIVE
  final List<String> inclusions;
  final Hotel? hotel; // present on detail fetch
  final Room? room; // present on detail fetch

  HotelPackage({
    required this.id, required this.slug, required this.title, required this.city,
    required this.imageUrl, this.description, this.badge, required this.nights,
    required this.days, required this.guests, required this.originalPrice, required this.price,
    required this.discountPct, required this.reviewCount, required this.starRating,
    required this.rating, required this.isPopular, this.boardBasis = 'BREAKFAST',
    this.inclusions = const [], this.hotel, this.room,
  });

  /// Short label for the meal plan (board basis).
  String get boardLabel => switch (boardBasis) {
        'ROOM_ONLY' => tr('Tanpa Makan', 'Room only'),
        'HALF_BOARD' => tr('Sarapan + Makan Malam', 'Breakfast + Dinner'),
        'FULL_BOARD' => tr('3x Makan (Pagi, Siang, Malam)', '3 Meals (Breakfast, Lunch, Dinner)'),
        'ALL_INCLUSIVE' => tr('All-Inclusive (Makan + Minuman)', 'All-Inclusive (Meals + Drinks)'),
        _ => tr('Termasuk Sarapan', 'Breakfast included'),
      };

  /// Which meals are covered — for rendering meal chips.
  List<String> get meals => switch (boardBasis) {
        'ROOM_ONLY' => <String>[],
        'HALF_BOARD' => [tr('Sarapan', 'Breakfast'), tr('Makan Malam', 'Dinner')],
        'FULL_BOARD' => [tr('Sarapan', 'Breakfast'), tr('Makan Siang', 'Lunch'), tr('Makan Malam', 'Dinner')],
        'ALL_INCLUSIVE' => [tr('Sarapan', 'Breakfast'), tr('Makan Siang', 'Lunch'), tr('Makan Malam', 'Dinner'), tr('Minuman', 'Drinks')],
        _ => [tr('Sarapan', 'Breakfast')],
      };

  factory HotelPackage.fromJson(Map<String, dynamic> j) => HotelPackage(
        id: j['id'], slug: j['slug'] ?? '', title: j['title'] ?? '', city: j['city'] ?? '',
        imageUrl: j['imageUrl'] ?? '', description: j['description'], badge: j['badge'],
        nights: j['nights'] ?? 1, days: j['days'] ?? 2, guests: j['guests'] ?? 2,
        originalPrice: j['originalPrice'] ?? 0, price: j['price'] ?? 0, discountPct: j['discountPct'] ?? 0,
        reviewCount: j['reviewCount'] ?? 0, starRating: j['starRating'] ?? 4,
        rating: (j['rating'] ?? 0).toDouble(), isPopular: j['isPopular'] ?? false,
        boardBasis: j['boardBasis'] ?? 'BREAKFAST',
        inclusions: (j['inclusions'] as List?)?.map((e) => e.toString()).toList() ?? const [],
        hotel: j['hotel'] != null ? Hotel.fromJson(j['hotel']) : null,
        room: j['room'] != null ? Room.fromJson(j['room']) : null,
      );
}

class PromoBanner {
  final String id, title, subtitle, imageUrl;
  final String? badge;
  PromoBanner({required this.id, required this.title, required this.subtitle, required this.imageUrl, this.badge});
  factory PromoBanner.fromJson(Map<String, dynamic> j) => PromoBanner(
        id: j['id'], title: j['title'] ?? '', subtitle: j['subtitle'] ?? '',
        imageUrl: j['imageUrl'] ?? '', badge: j['badge'],
      );
}

class Booking {
  final String id, code, status;
  final int nights, guests, rooms, roomPrice, taxFee, totalPrice, discount;
  final String checkIn, checkOut, bookerName, bookerEmail, bookerPhone;
  final String? paymentMethod, bank, packageTitle, promoCode, specialRequest;
  final bool onlineCheckedIn, payAtHotel;
  final String? keyCode;
  final Hotel? hotel;
  final Room? room;
  Booking({
    required this.id, required this.code, required this.status, required this.nights,
    required this.guests, required this.rooms, required this.roomPrice, required this.taxFee,
    required this.totalPrice, required this.checkIn, required this.checkOut,
    required this.bookerName, required this.bookerEmail, required this.bookerPhone,
    this.paymentMethod, this.bank, this.packageTitle, this.promoCode, this.specialRequest, this.discount = 0,
    this.onlineCheckedIn = false, this.payAtHotel = false, this.keyCode, this.hotel, this.room,
  });
  factory Booking.fromJson(Map<String, dynamic> j) => Booking(
        id: j['id'], code: j['code'], status: j['status'] ?? 'PENDING',
        nights: j['nights'] ?? 1, guests: j['guests'] ?? 2, rooms: j['rooms'] ?? 1,
        roomPrice: j['roomPrice'] ?? 0, taxFee: j['taxFee'] ?? 0, totalPrice: j['totalPrice'] ?? 0,
        discount: j['discount'] ?? 0,
        checkIn: j['checkIn'] ?? '', checkOut: j['checkOut'] ?? '',
        bookerName: j['bookerName'] ?? '', bookerEmail: j['bookerEmail'] ?? '', bookerPhone: j['bookerPhone'] ?? '',
        paymentMethod: j['paymentMethod'], bank: j['bank'], packageTitle: j['packageTitle'], promoCode: j['promoCode'],
        specialRequest: j['specialRequest'],
        onlineCheckedIn: j['onlineCheckedIn'] ?? false, payAtHotel: j['payAtHotel'] ?? false, keyCode: j['keyCode'],
        hotel: j['hotel'] != null ? Hotel.fromJson(j['hotel']) : null,
        room: j['room'] != null ? Room.fromJson(j['room']) : null,
      );
}

class Payment {
  final String id, provider, method, methodLabel, status;
  final int amount;
  final String? vaNumber, qrString, payUrl, expiresAt;
  Payment({
    required this.id, required this.provider, required this.method, required this.methodLabel,
    required this.status, required this.amount, this.vaNumber, this.qrString, this.payUrl, this.expiresAt,
  });
  bool get isMock => provider == 'MOCK';
  bool get isPaid => status == 'PAID';
  factory Payment.fromJson(Map<String, dynamic> j) => Payment(
        id: j['id'], provider: j['provider'] ?? 'MOCK', method: j['method'] ?? '',
        methodLabel: j['methodLabel'] ?? '', status: j['status'] ?? 'PENDING', amount: j['amount'] ?? 0,
        vaNumber: j['vaNumber'], qrString: j['qrString'], payUrl: j['payUrl'], expiresAt: j['expiresAt'],
      );
}

class ChatMessage {
  final String id, sender, body;
  final String? createdAt;
  ChatMessage({required this.id, required this.sender, required this.body, this.createdAt});
  bool get isUser => sender == 'USER';
  bool get isBot => sender == 'BOT';
  factory ChatMessage.fromJson(Map<String, dynamic> j) => ChatMessage(
        id: j['id'], sender: j['sender'] ?? 'BOT', body: j['body'] ?? '', createdAt: j['createdAt'],
      );
}

class ChatThread {
  final String status;
  final List<ChatMessage> messages;
  ChatThread({required this.status, required this.messages});
  factory ChatThread.fromJson(Map<String, dynamic> j) => ChatThread(
        status: j['status'] ?? 'BOT',
        messages: (j['messages'] as List?)?.map((m) => ChatMessage.fromJson(m)).toList() ?? [],
      );
}

class AppNotification {
  final String id, title, body, type;
  final String? hotelName, orderCode, createdAt;
  AppNotification({required this.id, required this.title, required this.body, required this.type, this.hotelName, this.orderCode, this.createdAt});
  factory AppNotification.fromJson(Map<String, dynamic> j) => AppNotification(
        id: j['id'], title: j['title'] ?? '', body: j['body'] ?? '', type: j['type'] ?? 'info',
        hotelName: j['hotelName'], orderCode: j['orderCode'], createdAt: j['createdAt'],
      );
}

// ─────────────────────────── Tour module ───────────────────────────
class Tour {
  final String id, title, city, category, description, imageUrl;
  final int durationHours, price, maxPax, reviewCount;
  final double rating;
  final List<String> highlights, included;
  final String? meetingPoint;
  Tour({
    required this.id, required this.title, required this.city, required this.category,
    required this.description, required this.imageUrl, required this.durationHours,
    required this.price, required this.maxPax, required this.reviewCount, required this.rating,
    required this.highlights, required this.included, this.meetingPoint,
  });
  factory Tour.fromJson(Map<String, dynamic> j) => Tour(
        id: j['id'], title: j['title'] ?? '', city: j['city'] ?? '', category: j['category'] ?? 'Wisata',
        description: j['description'] ?? '', imageUrl: j['imageUrl'] ?? '',
        durationHours: j['durationHours'] ?? 4, price: j['price'] ?? 0, maxPax: j['maxPax'] ?? 20,
        reviewCount: j['reviewCount'] ?? 0, rating: (j['rating'] ?? 4.8).toDouble(),
        highlights: ((j['highlights'] ?? []) as List).map((e) => e.toString()).toList(),
        included: ((j['included'] ?? []) as List).map((e) => e.toString()).toList(),
        meetingPoint: j['meetingPoint'],
      );
}

// ─────────────────────────── Shuttle module ───────────────────────────
class ShuttleVehicleType {
  final String id, name, icon;
  final int baseFare, perKm, minFare, capacity;
  final int fare; // populated by /estimate
  ShuttleVehicleType({
    required this.id, required this.name, required this.icon,
    required this.baseFare, required this.perKm, required this.minFare, required this.capacity, this.fare = 0,
  });
  factory ShuttleVehicleType.fromJson(Map<String, dynamic> j) => ShuttleVehicleType(
        id: j['id'], name: j['name'] ?? '', icon: j['icon'] ?? 'car',
        baseFare: j['baseFare'] ?? 0, perKm: j['perKm'] ?? 0, minFare: j['minFare'] ?? 0,
        capacity: j['capacity'] ?? 4, fare: j['fare'] ?? 0,
      );
}

class ShuttleRide {
  final String id, code, status, originLabel, destLabel, paymentMethod;
  final double originLat, originLng, destLat, destLng, distanceKm;
  final int fare;
  final String? driverName, driverPhone, driverPlate;
  final double? driverRating;
  final ShuttleVehicleType? vehicleType;
  ShuttleRide({
    required this.id, required this.code, required this.status, required this.originLabel, required this.destLabel,
    required this.paymentMethod, required this.originLat, required this.originLng, required this.destLat, required this.destLng,
    required this.distanceKm, required this.fare, this.driverName, this.driverPhone, this.driverPlate, this.driverRating, this.vehicleType,
  });
  factory ShuttleRide.fromJson(Map<String, dynamic> j) => ShuttleRide(
        id: j['id'], code: j['code'] ?? '', status: j['status'] ?? 'REQUESTED',
        originLabel: j['originLabel'] ?? '', destLabel: j['destLabel'] ?? '', paymentMethod: j['paymentMethod'] ?? 'CASH',
        originLat: (j['originLat'] ?? 0).toDouble(), originLng: (j['originLng'] ?? 0).toDouble(),
        destLat: (j['destLat'] ?? 0).toDouble(), destLng: (j['destLng'] ?? 0).toDouble(),
        distanceKm: (j['distanceKm'] ?? 0).toDouble(), fare: j['fare'] ?? 0,
        driverName: j['driverName'], driverPhone: j['driverPhone'], driverPlate: j['driverPlate'],
        driverRating: j['driverRating'] != null ? (j['driverRating']).toDouble() : null,
        vehicleType: j['vehicleType'] != null ? ShuttleVehicleType.fromJson(j['vehicleType']) : null,
      );
}
