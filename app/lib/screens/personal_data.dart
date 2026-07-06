import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';

class PersonalDataScreen extends StatelessWidget {
  const PersonalDataScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final u = context.watch<Session>().user!;
    Widget row(String label, String? value) => Container(
          margin: const EdgeInsets.only(bottom: 12),
          child: cardBox(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: const TextStyle(color: MC.inkMuted, fontSize: 12)),
            const SizedBox(height: 4),
            Text(value?.isNotEmpty == true ? value! : '-', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
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
          row('Nama Lengkap', u.name),
          row('Jenis Kelamin', u.gender),
          row('Tanggal Lahir', u.birthDate),
          row('No. Handphone', u.phone),
          row('Email', u.email),
          const SizedBox(height: 20),
          const Center(child: Text('Miruum 2022, Version 1.0', style: TextStyle(color: MC.inkFaint, fontSize: 12))),
        ]),
      ),
    );
  }
}

class EditProfileScreen extends StatefulWidget {
  const EditProfileScreen({super.key});
  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  late final _name = TextEditingController(text: context.read<Session>().user?.name);
  late final _phone = TextEditingController(text: context.read<Session>().user?.phone);
  late final _gender = TextEditingController(text: context.read<Session>().user?.gender);
  late final _birth = TextEditingController(text: context.read<Session>().user?.birthDate);
  bool _loading = false;

  Future<void> _save() async {
    setState(() => _loading = true);
    try {
      await context.read<Session>().updateProfile({
        'name': _name.text.trim(),
        'phone': _phone.text.trim(),
        'gender': _gender.text.trim(),
        'birthDate': _birth.text.trim(),
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Profil diperbarui'), backgroundColor: MC.primary));
        Navigator.pop(context);
      }
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message), backgroundColor: MC.danger));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Widget _field(String label, TextEditingController c, {TextInputType? keyboard}) => Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: const TextStyle(fontSize: 12.5, color: MC.inkMuted)),
          const SizedBox(height: 6),
          TextField(controller: c, keyboardType: keyboard),
        ]),
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Edit Profile')),
      body: SafeArea(
        child: Column(children: [
          Expanded(child: ListView(padding: const EdgeInsets.all(20), children: [
            _field('Nama Lengkap', _name),
            _field('Jenis Kelamin', _gender),
            _field('Tanggal Lahir', _birth),
            _field('No. Handphone', _phone, keyboard: TextInputType.phone),
          ])),
          Padding(padding: const EdgeInsets.all(20), child: PrimaryButton('Simpan', loading: _loading, onPressed: _save)),
        ]),
      ),
    );
  }
}
