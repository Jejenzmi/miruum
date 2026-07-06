import 'package:equatable/equatable.dart';

enum ViewStatus { loading, success, failure }

/// Generic async view state used by the data cubits.
class ViewState<T> extends Equatable {
  final ViewStatus status;
  final T? data;
  final String? error;

  const ViewState._(this.status, {this.data, this.error});

  const ViewState.loading() : this._(ViewStatus.loading);
  const ViewState.success(T data) : this._(ViewStatus.success, data: data);
  const ViewState.failure(String error) : this._(ViewStatus.failure, error: error);

  bool get isLoading => status == ViewStatus.loading;
  bool get isSuccess => status == ViewStatus.success;
  bool get isFailure => status == ViewStatus.failure;

  @override
  List<Object?> get props => [status, data, error];
}
