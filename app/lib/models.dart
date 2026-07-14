/// Data models for Miruum OTA — mirror the backend JSON shapes.

class AppUser {
  final String id, name, email;
  final String? phone, gender, birthDate, avatarUrl;
  AppUser({required this.id, required this.name, required this.email, this.phone, this.gender, this.birthDate, this.avatarUrl});
  factory AppUser.fromJson(Map<String, dynamic> j) => AppUser(
        id: j['id'], name: j['name'] ?? '', email: j['email'] ?? '',
        phone: j['phone'], gender: j['gender'], birthDate: j['birthDate'], avatarUrl: j['avatarUrl'],
      );
}

class Facility {
  final String name, icon;
  Facility({required this.name, required this.icon});
  factory Facility.fromJson(Map<String, dynamic> j) => Facility(name: j['name'], icon: j['icon']);
}

class Review {
  final String authorName, body;
  final double rating;
  final String? createdAt;
  Review({required this.authorName, required this.body, required this.rating, this.createdAt});
  factory Review.fromJson(Map<String, dynamic> j) => Review(
        authorName: j['authorName'] ?? 'Tamu',
        body: j['body'] ?? '',
        rating: (j['rating'] ?? 0).toDouble(),
        createdAt: j['createdAt'],
      );
}

class Room {
  final String id, name, bedInfo;
  final int capacity, price, stock;
  final int? originalPrice;
  final String? discountLabel;
  final bool refundable, breakfast, freeWifi, freeCancellation;
  Room({
    required this.id, required this.name, required this.bedInfo, required this.capacity,
    required this.price, required this.stock, this.originalPrice, this.discountLabel,
    required this.refundable, required this.breakfast, required this.freeWifi, required this.freeCancellation,
  });
  factory Room.fromJson(Map<String, dynamic> j) => Room(
        id: j['id'], name: j['name'], bedInfo: j['bedInfo'] ?? '',
        capacity: j['capacity'] ?? 2, price: j['price'] ?? 0, stock: j['stock'] ?? 0,
        originalPrice: j['originalPrice'], discountLabel: j['discountLabel'],
        refundable: j['refundable'] ?? true, breakfast: j['breakfast'] ?? false,
        freeWifi: j['freeWifi'] ?? true, freeCancellation: j['freeCancellation'] ?? true,
      );
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
  final bool isPromo;
  final String? promoLabel, description, checkInInfo, checkOutInfo;
  final List<String> photos;
  final List<Facility> facilities;
  final List<Room> rooms;
  final List<Review> reviews;
  final SupplyChannel? channel;
  final List<HotelOffer> offers;
  final double? lat, lng;

  Hotel({
    required this.id, required this.name, required this.city, required this.address,
    required this.imageUrl, required this.rating, required this.reviewCount,
    required this.priceFrom, required this.starRating, required this.isPromo,
    this.promoLabel, this.description, this.checkInInfo, this.checkOutInfo,
    this.photos = const [], this.facilities = const [], this.rooms = const [], this.reviews = const [],
    this.channel, this.offers = const [], this.lat, this.lng,
  });

  factory Hotel.fromJson(Map<String, dynamic> j) => Hotel(
        id: j['id'], name: j['name'] ?? '', city: j['city'] ?? '', address: j['address'] ?? '',
        imageUrl: j['imageUrl'] ?? '', rating: (j['rating'] ?? 0).toDouble(),
        reviewCount: j['reviewCount'] ?? 0, priceFrom: j['priceFrom'] ?? 0,
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

class HotelPackage {
  final String id, slug, title, city, imageUrl;
  final String? description, badge;
  final int nights, days, guests, originalPrice, price, discountPct, reviewCount, starRating;
  final double rating;
  final bool isPopular;
  final List<String> inclusions;
  final Hotel? hotel; // present on detail fetch
  final Room? room; // present on detail fetch

  HotelPackage({
    required this.id, required this.slug, required this.title, required this.city,
    required this.imageUrl, this.description, this.badge, required this.nights,
    required this.days, required this.guests, required this.originalPrice, required this.price,
    required this.discountPct, required this.reviewCount, required this.starRating,
    required this.rating, required this.isPopular, this.inclusions = const [], this.hotel, this.room,
  });

  factory HotelPackage.fromJson(Map<String, dynamic> j) => HotelPackage(
        id: j['id'], slug: j['slug'] ?? '', title: j['title'] ?? '', city: j['city'] ?? '',
        imageUrl: j['imageUrl'] ?? '', description: j['description'], badge: j['badge'],
        nights: j['nights'] ?? 1, days: j['days'] ?? 2, guests: j['guests'] ?? 2,
        originalPrice: j['originalPrice'] ?? 0, price: j['price'] ?? 0, discountPct: j['discountPct'] ?? 0,
        reviewCount: j['reviewCount'] ?? 0, starRating: j['starRating'] ?? 4,
        rating: (j['rating'] ?? 0).toDouble(), isPopular: j['isPopular'] ?? false,
        inclusions: (j['inclusions'] as List?)?.map((e) => e.toString()).toList() ?? const [],
        hotel: j['hotel'] != null ? Hotel.fromJson(j['hotel']) : null,
        room: j['room'] != null ? Room.fromJson(j['room']) : null,
      );
}

class Banner {
  final String id, title, subtitle, imageUrl;
  final String? badge;
  Banner({required this.id, required this.title, required this.subtitle, required this.imageUrl, this.badge});
  factory Banner.fromJson(Map<String, dynamic> j) => Banner(
        id: j['id'], title: j['title'] ?? '', subtitle: j['subtitle'] ?? '',
        imageUrl: j['imageUrl'] ?? '', badge: j['badge'],
      );
}

class Booking {
  final String id, code, status;
  final int nights, guests, rooms, roomPrice, taxFee, totalPrice, discount;
  final String checkIn, checkOut, bookerName, bookerEmail, bookerPhone;
  final String? paymentMethod, bank, packageTitle, promoCode;
  final Hotel? hotel;
  final Room? room;
  Booking({
    required this.id, required this.code, required this.status, required this.nights,
    required this.guests, required this.rooms, required this.roomPrice, required this.taxFee,
    required this.totalPrice, required this.checkIn, required this.checkOut,
    required this.bookerName, required this.bookerEmail, required this.bookerPhone,
    this.paymentMethod, this.bank, this.packageTitle, this.promoCode, this.discount = 0, this.hotel, this.room,
  });
  factory Booking.fromJson(Map<String, dynamic> j) => Booking(
        id: j['id'], code: j['code'], status: j['status'] ?? 'PENDING',
        nights: j['nights'] ?? 1, guests: j['guests'] ?? 2, rooms: j['rooms'] ?? 1,
        roomPrice: j['roomPrice'] ?? 0, taxFee: j['taxFee'] ?? 0, totalPrice: j['totalPrice'] ?? 0,
        discount: j['discount'] ?? 0,
        checkIn: j['checkIn'] ?? '', checkOut: j['checkOut'] ?? '',
        bookerName: j['bookerName'] ?? '', bookerEmail: j['bookerEmail'] ?? '', bookerPhone: j['bookerPhone'] ?? '',
        paymentMethod: j['paymentMethod'], bank: j['bank'], packageTitle: j['packageTitle'], promoCode: j['promoCode'],
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

class AppNotification {
  final String id, title, body, type;
  final String? hotelName, orderCode, createdAt;
  AppNotification({required this.id, required this.title, required this.body, required this.type, this.hotelName, this.orderCode, this.createdAt});
  factory AppNotification.fromJson(Map<String, dynamic> j) => AppNotification(
        id: j['id'], title: j['title'] ?? '', body: j['body'] ?? '', type: j['type'] ?? 'info',
        hotelName: j['hotelName'], orderCode: j['orderCode'], createdAt: j['createdAt'],
      );
}
