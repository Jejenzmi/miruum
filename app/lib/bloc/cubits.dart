import 'package:flutter_bloc/flutter_bloc.dart';
import '../api.dart';
import '../models.dart';
import 'view_state.dart';

/// Bundle of data shown on the Home tab.
class HomeData {
  final List<Hotel> promo, recommended;
  final List<Promo> promos;
  const HomeData(this.promo, this.recommended, this.promos);
}

class HomeCubit extends Cubit<ViewState<HomeData>> {
  final Api api;
  HomeCubit(this.api) : super(const ViewState.loading());

  Future<void> load() async {
    emit(const ViewState.loading());
    try {
      final res = await Future.wait([api.promoHotels(), api.recommended(), api.promos()]);
      emit(ViewState.success(HomeData(res[0] as List<Hotel>, res[1] as List<Hotel>, res[2] as List<Promo>)));
    } catch (e) {
      emit(ViewState.failure(e.toString()));
    }
  }
}

class HotelsCubit extends Cubit<ViewState<List<Hotel>>> {
  final Api api;
  HotelsCubit(this.api) : super(const ViewState.loading());

  Future<void> load({Map<String, dynamic>? query}) async {
    emit(const ViewState.loading());
    try {
      emit(ViewState.success(await api.hotels(q: query)));
    } catch (e) {
      emit(ViewState.failure(e.toString()));
    }
  }
}

class PackagesCubit extends Cubit<ViewState<List<HotelPackage>>> {
  final Api api;
  PackagesCubit(this.api) : super(const ViewState.loading());

  Future<void> load({Map<String, dynamic>? query}) async {
    emit(const ViewState.loading());
    try {
      emit(ViewState.success(await api.packages(q: query)));
    } catch (e) {
      emit(ViewState.failure(e.toString()));
    }
  }
}

class PackageDetailCubit extends Cubit<ViewState<HotelPackage>> {
  final Api api;
  PackageDetailCubit(this.api) : super(const ViewState.loading());

  Future<void> load(String id) async {
    emit(const ViewState.loading());
    try {
      emit(ViewState.success(await api.package(id)));
    } catch (e) {
      emit(ViewState.failure(e.toString()));
    }
  }
}

class HotelDetailCubit extends Cubit<ViewState<Hotel>> {
  final Api api;
  HotelDetailCubit(this.api) : super(const ViewState.loading());

  Future<void> load(String id) async {
    emit(const ViewState.loading());
    try {
      emit(ViewState.success(await api.hotel(id)));
    } catch (e) {
      emit(ViewState.failure(e.toString()));
    }
  }
}

class ReviewsCubit extends Cubit<ViewState<List<Review>>> {
  final Api api;
  ReviewsCubit(this.api) : super(const ViewState.loading());

  Future<void> load(String hotelId) async {
    emit(const ViewState.loading());
    try {
      emit(ViewState.success(await api.reviews(hotelId)));
    } catch (e) {
      emit(ViewState.failure(e.toString()));
    }
  }
}

class BookingsCubit extends Cubit<ViewState<List<Booking>>> {
  final Api api;
  BookingsCubit(this.api) : super(const ViewState.loading());

  Future<void> load() async {
    emit(const ViewState.loading());
    try {
      emit(ViewState.success(await api.bookings()));
    } catch (e) {
      emit(ViewState.failure(e.toString()));
    }
  }
}

class NotificationsCubit extends Cubit<ViewState<List<AppNotification>>> {
  final Api api;
  NotificationsCubit(this.api) : super(const ViewState.loading());

  Future<void> load() async {
    emit(const ViewState.loading());
    try {
      emit(ViewState.success(await api.notifications()));
    } catch (e) {
      emit(ViewState.failure(e.toString()));
    }
  }
}

class FavoritesCubit extends Cubit<ViewState<List<Hotel>>> {
  final Api api;
  FavoritesCubit(this.api) : super(const ViewState.loading());

  Future<void> load() async {
    emit(const ViewState.loading());
    try {
      emit(ViewState.success(await api.favorites()));
    } catch (e) {
      emit(ViewState.failure(e.toString()));
    }
  }
}
