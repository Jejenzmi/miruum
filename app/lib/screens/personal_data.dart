import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../api.dart';
import '../feedback.dart';
import '../bloc/auth/auth_bloc.dart';
import '../l10n.dart';
import '../theme.dart';
import '../widgets.dart';

class PersonalDataScreen extends StatelessWidget {
  const PersonalDataScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final u = context.watch<AuthBloc>().state.user!;

    // Data-completeness meter.
    final fields = <String?>[u.name, u.gender, u.birthDate, u.phone, u.title, u.nationality, u.idType, u.idNumber, u.address, u.city];
    final filled = fields.where((f) => (f ?? '').trim().isNotEmpty).length;
    final pct = (filled / fields.length);

    Widget row(String label, String? value) => Container(
          margin: const EdgeInsets.only(bottom: 10),
          child: cardBox(child: Row(children: [
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(label, style: TextStyle(color: MC.inkMuted, fontSize: 12)),
              const SizedBox(height: 4),
              Text(value?.trim().isNotEmpty == true ? value! : tr('Belum diisi', 'Not filled'),
                  style: TextStyle(
                      fontWeight: FontWeight.w600, fontSize: 15,
                      color: value?.trim().isNotEmpty == true ? MC.ink : MC.inkFaint)),
            ])),
            if (value?.trim().isNotEmpty != true)
              Icon(Icons.error_outline_rounded, size: 18, color: MC.inkFaint),
          ])),
        );

    return Scaffold(
      appBar: AppBar(
        title: Text(tr('Data Pribadi', 'Personal Data')),
        actions: [IconButton(icon: const Icon(Icons.edit_rounded, color: MC.primary),
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const EditProfileScreen())))],
      ),
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.all(20), children: [
          // Completeness meter
          cardBox(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Text(tr('Kelengkapan Data', 'Data Completeness'), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
              const Spacer(),
              Text('${(pct * 100).round()}%', style: const TextStyle(fontWeight: FontWeight.w800, color: MC.primaryDark)),
            ]),
            const SizedBox(height: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: LinearProgressIndicator(value: pct, minHeight: 8, backgroundColor: MC.field, color: MC.primary),
            ),
            const SizedBox(height: 8),
            Text(pct >= 1.0 ? tr('Lengkap! Pemesanan jadi lebih cepat.', 'Complete! Booking is now faster.') : tr('Lengkapi data agar pemesanan otomatis terisi & sesuai identitas.', 'Complete your data so bookings auto-fill and match your ID.'),
                style: TextStyle(color: MC.inkMuted, fontSize: 12)),
          ])),
          const SizedBox(height: 14),

          _sectionTitle(tr('Identitas', 'Identity')),
          row(tr('Sapaan', 'Title'), u.title),
          row(tr('Nama Lengkap', 'Full Name'), u.name),
          row(tr('Jenis Kelamin', 'Gender'), u.gender),
          row(tr('Tanggal Lahir', 'Date of Birth'), u.birthDate),
          row(tr('Kewarganegaraan', 'Nationality'), u.nationality),
          row(tr('Jenis Identitas', 'ID Type'), _idTypeLabel(u.idType)),
          row(tr('Nomor Identitas', 'ID Number'), u.idNumber),

          const SizedBox(height: 8),
          _sectionTitle(tr('Kontak & Alamat', 'Contact & Address')),
          row(tr('No. Handphone', 'Phone Number'), u.phone),
          row(tr('Email', 'Email'), u.email),
          row(tr('Alamat', 'Address'), u.address),
          row(tr('Kota', 'City'), u.city),

          const SizedBox(height: 18),
          PrimaryButton(tr('Lengkapi / Edit Data', 'Complete / Edit Data'), onPressed: () =>
              Navigator.push(context, MaterialPageRoute(builder: (_) => const EditProfileScreen()))),
          const SizedBox(height: 16),
          Center(child: Text(tr('Miruum · Versi 1.1', 'Miruum · Version 1.1'), style: TextStyle(color: MC.inkFaint, fontSize: 12))),
        ]),
      ),
    );
  }

  Widget _sectionTitle(String t) => Padding(
        padding: const EdgeInsets.only(left: 4, bottom: 8, top: 4),
        child: Text(t, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: MC.inkMuted)),
      );

  static String? _idTypeLabel(String? t) => {
        'KTP': 'KTP', 'PASSPORT': tr('Paspor', 'Passport'), 'SIM': 'SIM',
      }[t] ?? t;
}

class EditProfileScreen extends StatefulWidget {
  const EditProfileScreen({super.key});
  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  late final _u = context.read<AuthBloc>().state.user!;
  late final _name = TextEditingController(text: _u.name);
  late final _phone = TextEditingController(text: _u.phone);
  late final _birth = TextEditingController(text: _u.birthDate);
  late final _nationality = TextEditingController(text: _u.nationality ?? 'Indonesia');
  late final _idNumber = TextEditingController(text: _u.idNumber);
  late final _address = TextEditingController(text: _u.address);
  late final _city = TextEditingController(text: _u.city);
  late String? _title = _u.title;
  late String? _gender = _u.gender;
  late String? _idType = _u.idType;
  bool _loading = false;

  Future<void> _save() async {
    if (_name.text.trim().length < 2) {
      showSnack(context, tr('Nama minimal 2 karakter', 'Name must be at least 2 characters'), kind: SnackKind.error);
      return;
    }
    setState(() => _loading = true);
    try {
      final user = await context.read<Api>().updateMe({
        'name': _name.text.trim(),
        'phone': _phone.text.trim(),
        'gender': _gender ?? '',
        'birthDate': _birth.text.trim(),
        'title': _title ?? '',
        'nationality': _nationality.text.trim(),
        'idType': _idType ?? '',
        'idNumber': _idNumber.text.trim(),
        'address': _address.text.trim(),
        'city': _city.text.trim(),
      });
      if (mounted) {
        context.read<AuthBloc>().add(AuthUserUpdated(user));
        showSnack(context, tr('Data pribadi diperbarui', 'Personal data updated'), kind: SnackKind.success);
        Navigator.pop(context);
      }
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _pickBirth() async {
    DateTime initial = DateTime(2000, 1, 1);
    final parsed = DateTime.tryParse(_birth.text.trim());
    if (parsed != null) initial = parsed;
    final d = await showDatePicker(
      context: context, initialDate: initial,
      firstDate: DateTime(1940), lastDate: DateTime.now(),
      helpText: tr('Pilih Tanggal Lahir', 'Select Date of Birth'),
    );
    if (d != null) {
      _birth.text = '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
      setState(() {});
    }
  }

  Widget _label(String t) => Padding(
        padding: const EdgeInsets.only(bottom: 6, top: 2),
        child: Text(t, style: TextStyle(fontSize: 12.5, color: MC.inkMuted)),
      );

  Widget _field(String label, TextEditingController c, {TextInputType? keyboard, String? hint, int maxLines = 1}) => Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          _label(label),
          TextField(controller: c, keyboardType: keyboard, maxLines: maxLines,
              decoration: InputDecoration(hintText: hint)),
        ]),
      );

  Widget _dropdown(String label, String? value, Map<String, String> options, ValueChanged<String?> onChanged, {String? hint}) => Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          _label(label),
          DropdownButtonFormField<String>(
            value: (value != null && value.isNotEmpty && options.containsKey(value)) ? value : null,
            isExpanded: true,
            hint: Text(hint ?? tr('Pilih', 'Select'), style: TextStyle(color: MC.inkFaint)),
            items: options.entries.map((e) => DropdownMenuItem(value: e.key, child: Text(e.value))).toList(),
            onChanged: onChanged,
          ),
        ]),
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(tr('Edit Data Pribadi', 'Edit Personal Data'))),
      body: SafeArea(
        child: Column(children: [
          Expanded(child: ListView(padding: const EdgeInsets.all(20), children: [
            _dropdown(tr('Sapaan', 'Title'), _title, {'Tuan': tr('Tuan', 'Mr.'), 'Nyonya': tr('Nyonya', 'Mrs.'), 'Nona': tr('Nona', 'Ms.')}, (v) => setState(() => _title = v)),
            _field(tr('Nama Lengkap', 'Full Name'), _name, hint: tr('Sesuai identitas', 'As on your ID')),
            _dropdown(tr('Jenis Kelamin', 'Gender'), _gender, {'Laki-laki': tr('Laki-laki', 'Male'), 'Perempuan': tr('Perempuan', 'Female')}, (v) => setState(() => _gender = v)),
            GestureDetector(
              onTap: _pickBirth,
              child: AbsorbPointer(child: _field(tr('Tanggal Lahir', 'Date of Birth'), _birth, hint: 'YYYY-MM-DD')),
            ),
            _field(tr('Kewarganegaraan', 'Nationality'), _nationality, hint: 'Indonesia'),
            _dropdown(tr('Jenis Identitas', 'ID Type'), _idType, {'KTP': 'KTP', 'PASSPORT': tr('Paspor', 'Passport'), 'SIM': 'SIM'}, (v) => setState(() => _idType = v)),
            _field(tr('Nomor Identitas', 'ID Number'), _idNumber, keyboard: TextInputType.number, hint: tr('No. KTP/Paspor/SIM', 'KTP/Passport/SIM number')),
            _field(tr('No. Handphone', 'Phone Number'), _phone, keyboard: TextInputType.phone, hint: '08xxxxxxxxxx'),
            _field(tr('Alamat', 'Address'), _address, hint: tr('Alamat lengkap', 'Full address'), maxLines: 2),
            _field(tr('Kota', 'City'), _city, hint: tr('Kota domisili', 'City of residence')),
          ])),
          Padding(padding: const EdgeInsets.all(20), child: PrimaryButton(tr('Simpan', 'Save'), loading: _loading, onPressed: _save)),
        ]),
      ),
    );
  }
}
