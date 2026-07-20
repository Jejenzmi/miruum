import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:image_picker/image_picker.dart';
import 'package:permission_handler/permission_handler.dart';
import 'api.dart';
import 'theme.dart';

/// Shows a "Kamera / Galeri" sheet, requests the right runtime permission,
/// picks + compresses an image, uploads it to MinIO via the backend, and
/// returns the public URL (or null if cancelled / failed).
Future<String?> pickAndUploadImage(BuildContext context, {String folder = 'avatars'}) async {
  final source = await showModalBottomSheet<ImageSource>(
    context: context,
    backgroundColor: MC.surface,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    builder: (_) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(width: 40, height: 4, decoration: BoxDecoration(color: MC.line, borderRadius: BorderRadius.circular(2))),
          const SizedBox(height: 16),
          const Align(alignment: Alignment.centerLeft,
              child: Text('Ubah foto', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16))),
          const SizedBox(height: 8),
          ListTile(
            leading: const Icon(Icons.photo_camera_rounded, color: MC.primary),
            title: const Text('Ambil dari Kamera'),
            onTap: () => Navigator.pop(context, ImageSource.camera),
          ),
          ListTile(
            leading: const Icon(Icons.photo_library_rounded, color: MC.primary),
            title: const Text('Pilih dari Galeri'),
            onTap: () => Navigator.pop(context, ImageSource.gallery),
          ),
        ]),
      ),
    ),
  );
  if (source == null) return null;

  // Runtime permission: camera needs CAMERA; gallery uses the system photo
  // picker (no storage permission on modern Android, but request as fallback).
  final perm = source == ImageSource.camera ? Permission.camera : Permission.photos;
  var status = await perm.status;
  if (!status.isGranted) status = await perm.request();
  if (!status.isGranted && source == ImageSource.camera) {
    if (context.mounted) _snack(context, 'Izin kamera dibutuhkan untuk mengambil foto');
    return null;
  }

  final XFile? file = await ImagePicker().pickImage(
    source: source, maxWidth: 900, maxHeight: 900, imageQuality: 80,
  );
  if (file == null) return null;

  try {
    final bytes = await file.readAsBytes();
    final ext = file.name.split('.').last.toLowerCase();
    final mime = (ext == 'png') ? 'image/png' : (ext == 'webp') ? 'image/webp' : 'image/jpeg';
    final dataUrl = 'data:$mime;base64,${base64Encode(bytes)}';
    if (!context.mounted) return null;
    return await context.read<Api>().uploadImage(dataUrl, folder: folder);
  } on ApiException catch (e) {
    if (context.mounted) _snack(context, e.message);
    return null;
  } catch (_) {
    if (context.mounted) _snack(context, 'Gagal mengunggah foto');
    return null;
  }
}

void _snack(BuildContext context, String msg) =>
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg), backgroundColor: MC.danger));

/// Pick a legality document by photographing/scanning it (camera or gallery)
/// and upload it via the PUBLIC corporate endpoint (used during registration,
/// before the applicant has an account). Returns the public URL or null.
Future<String?> pickAndUploadDoc(BuildContext context) async {
  final source = await showModalBottomSheet<ImageSource>(
    context: context,
    backgroundColor: MC.surface,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    builder: (_) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(width: 40, height: 4, decoration: BoxDecoration(color: MC.line, borderRadius: BorderRadius.circular(2))),
          const SizedBox(height: 16),
          const Align(alignment: Alignment.centerLeft,
              child: Text('Unggah Dokumen', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16))),
          const SizedBox(height: 4),
          const Align(alignment: Alignment.centerLeft,
              child: Text('Foto / pindai dokumen legalitas dengan jelas & terbaca.',
                  style: TextStyle(color: MC.inkMuted, fontSize: 12.5))),
          const SizedBox(height: 10),
          ListTile(
            leading: const Icon(Icons.document_scanner_rounded, color: MC.primary),
            title: const Text('Pindai / Foto Dokumen'),
            onTap: () => Navigator.pop(context, ImageSource.camera),
          ),
          ListTile(
            leading: const Icon(Icons.photo_library_rounded, color: MC.primary),
            title: const Text('Pilih dari Galeri'),
            onTap: () => Navigator.pop(context, ImageSource.gallery),
          ),
        ]),
      ),
    ),
  );
  if (source == null) return null;

  if (source == ImageSource.camera) {
    var status = await Permission.camera.status;
    if (!status.isGranted) status = await Permission.camera.request();
    if (!status.isGranted) {
      if (context.mounted) _snack(context, 'Izin kamera dibutuhkan untuk memindai dokumen');
      return null;
    }
  }

  final XFile? file = await ImagePicker().pickImage(
    source: source, maxWidth: 1600, maxHeight: 1600, imageQuality: 82,
  );
  if (file == null) return null;

  try {
    final bytes = await file.readAsBytes();
    final ext = file.name.split('.').last.toLowerCase();
    final mime = (ext == 'png') ? 'image/png' : (ext == 'webp') ? 'image/webp' : 'image/jpeg';
    final dataUrl = 'data:$mime;base64,${base64Encode(bytes)}';
    if (!context.mounted) return null;
    return await context.read<Api>().uploadCorporateDoc(dataUrl);
  } on ApiException catch (e) {
    if (context.mounted) _snack(context, e.message);
    return null;
  } catch (_) {
    if (context.mounted) _snack(context, 'Gagal mengunggah dokumen');
    return null;
  }
}

/// Ask for notification permission (Android 13+ / iOS). Safe to call on start.
Future<void> ensureNotificationPermission() async {
  final status = await Permission.notification.status;
  if (status.isDenied) await Permission.notification.request();
}
