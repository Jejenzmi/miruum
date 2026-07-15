import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../api.dart';
import '../feedback.dart';
import '../bloc/auth/auth_bloc.dart';
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
              Text(value?.trim().isNotEmpty == true ? value! : 'Belum diisi',
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
        title: const Text('Data Pribadi'),
        actions: [IconButton(icon: const Icon(Icons.edit_rounded, color: MC.primary),
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const EditProfileScreen())))],
      ),
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.all(20), children: [
          // Completeness meter
          cardBox(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              const Text('Kelengkapan Data', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
              const Spacer(),
              Text('${(pct * 100).round()}%', style: const TextStyle(fontWeight: FontWeight.w800, color: MC.primaryDark)),
            ]),
            const SizedBox(height: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: LinearProgressIndicator(value: pct, minHeight: 8, backgroundColor: MC.field, color: MC.primary),
            ),
            const SizedBox(height: 8),
            Text(pct >= 1.0 ? 'Lengkap! Pemesanan jadi lebih cepat.' : 'Lengkapi data agar pemesanan otomatis terisi & sesuai identitas.',
                style: TextStyle(color: MC.inkMuted, fontSize: 12)),
          ])),
          const SizedBox(height: 14),

          _sectionTitle('Identitas'),
          row('Sapaan', u.title),
          row('Nama Lengkap', u.name),
          row('Jenis Kelamin', u.gender),
          row('Tanggal Lahir', u.birthDate),
          row('Kewarganegaraan', u.nationality),
          row('Jenis Identitas', _idTypeLabel(u.idType)),
          row('Nomor Identitas', u.idNumber),

          const SizedBox(height: 8),
          _sectionTitle('Kontak & Alamat'),
          row('No. Handphone', u.phone),
          row('Email', u.email),
          row('Alamat', u.address),
          row('Kota', u.city),

          const SizedBox(height: 18),
          PrimaryButton('Lengkapi / Edit Data', onPressed: () =>
              Navigator.push(context, MaterialPageRoute(builder: (_) => const EditProfileScreen()))),
          const SizedBox(height: 16),
          Center(child: Text('Miruum · Version 1.1', style: TextStyle(color: MC.inkFaint, fontSize: 12))),
        ]),
      ),
    );
  }

  Widget _sectionTitle(String t) => Padding(
        padding: const EdgeInsets.only(left: 4, bottom: 8, top: 4),
        child: Text(t, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: MC.inkMuted)),
      );

  static String? _idTypeLabel(String? t) => const {
        'KTP': 'KTP', 'PASSPORT': 'Paspor', 'SIM': 'SIM',
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
      showSnack(context, 'Nama minimal 2 karakter', kind: SnackKind.error);
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
        showSnack(context, 'Data pribadi diperbarui', kind: SnackKind.success);
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
      helpText: 'Pilih Tanggal Lahir',
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
            hint: Text(hint ?? 'Pilih', style: TextStyle(color: MC.inkFaint)),
            items: options.entries.map((e) => DropdownMenuItem(value: e.key, child: Text(e.value))).toList(),
            onChanged: onChanged,
          ),
        ]),
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Edit Data Pribadi')),
      body: SafeArea(
        child: Column(children: [
          Expanded(child: ListView(padding: const EdgeInsets.all(20), children: [
            _dropdown('Sapaan', _title, const {'Tuan': 'Tuan', 'Nyonya': 'Nyonya', 'Nona': 'Nona'}, (v) => setState(() => _title = v)),
            _field('Nama Lengkap', _name, hint: 'Sesuai identitas'),
            _dropdown('Jenis Kelamin', _gender, const {'Laki-laki': 'Laki-laki', 'Perempuan': 'Perempuan'}, (v) => setState(() => _gender = v)),
            GestureDetector(
              onTap: _pickBirth,
              child: AbsorbPointer(child: _field('Tanggal Lahir', _birth, hint: 'YYYY-MM-DD')),
            ),
            _field('Kewarganegaraan', _nationality, hint: 'Indonesia'),
            _dropdown('Jenis Identitas', _idType, const {'KTP': 'KTP', 'PASSPORT': 'Paspor', 'SIM': 'SIM'}, (v) => setState(() => _idType = v)),
            _field('Nomor Identitas', _idNumber, keyboard: TextInputType.number, hint: 'No. KTP/Paspor/SIM'),
            _field('No. Handphone', _phone, keyboard: TextInputType.phone, hint: '08xxxxxxxxxx'),
            _field('Alamat', _address, hint: 'Alamat lengkap', maxLines: 2),
            _field('Kota', _city, hint: 'Kota domisili'),
          ])),
          Padding(padding: const EdgeInsets.all(20), child: PrimaryButton('Simpan', loading: _loading, onPressed: _save)),
        ]),
      ),
    );
  }
}
