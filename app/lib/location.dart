import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'feedback.dart';
import 'l10n.dart';

/// Resolves the user's current GPS position, handling service + permission
/// prompts. Shows an informative snackbar and returns null on any failure.
Future<Position?> getMyLocation(BuildContext context) async {
  try {
    if (!await Geolocator.isLocationServiceEnabled()) {
      if (context.mounted) {
        showSnack(context, tr('Aktifkan GPS/Lokasi di perangkat untuk mencari hotel terdekat.',
            'Turn on GPS/Location to find nearby hotels.'), kind: SnackKind.warning, title: tr('Lokasi mati', 'Location off'));
      }
      return null;
    }
    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) {
      perm = await Geolocator.requestPermission();
    }
    if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
      if (context.mounted) {
        showSnack(context, tr('Izin lokasi diperlukan untuk fitur ini.', 'Location permission is required for this feature.'),
            kind: SnackKind.warning, title: tr('Izin ditolak', 'Permission denied'));
      }
      return null;
    }
    return await Geolocator.getCurrentPosition(
      desiredAccuracy: LocationAccuracy.high,
      timeLimit: const Duration(seconds: 12),
    );
  } catch (_) {
    if (context.mounted) {
      showSnack(context, tr('Gagal mendapatkan lokasi. Coba lagi.', 'Failed to get location. Try again.'), kind: SnackKind.error);
    }
    return null;
  }
}
