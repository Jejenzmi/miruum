import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../api.dart';
import '../bloc/auth/auth_bloc.dart';
import '../feedback.dart';
import '../image_upload.dart';
import '../l10n.dart';
import '../theme.dart';
import '../ui_kit.dart';
import '../widgets.dart';

void _toast(BuildContext c, String m, {bool err = true}) =>
    showSnack(c, m, kind: err ? SnackKind.error : SnackKind.success);

// ─────────────────────────── Corporate Login ───────────────────────────
class CorporateLoginScreen extends StatefulWidget {
  const CorporateLoginScreen({super.key});
  @override
  State<CorporateLoginScreen> createState() => _CorporateLoginScreenState();
}

class _CorporateLoginScreenState extends State<CorporateLoginScreen> {
  final _email = TextEditingController();
  final _pass = TextEditingController();
  bool _loading = false, _obscure = true;

  Future<void> _submit({String? code}) async {
    setState(() => _loading = true);
    try {
      final (token, user) = await context.read<Api>().login(_email.text.trim(), _pass.text, code: code);
      if (!mounted) return;
      context.read<AuthBloc>().add(AuthSessionGranted(token, user));
      if (user.isCorporate) {
        Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const CorporatePortalScreen()));
      } else {
        _toast(context, tr('Akun ini bukan akun Bisnis. Masuk sebagai pengguna biasa.', 'This is not a Business account. Signing in as a regular user.'), err: false);
        Navigator.pop(context);
      }
    } on TwoFactorRequired {
      if (mounted) { setState(() => _loading = false); _promptTwoFactor(); }
    } on ApiException catch (e) {
      if (mounted) _toast(context, e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _promptTwoFactor() async {
    final ctl = TextEditingController();
    final code = await showDialog<String>(context: context, builder: (_) => AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      title: Text(tr('Verifikasi 2 Langkah', 'Two-Step Verification')),
      content: Column(mainAxisSize: MainAxisSize.min, children: [
        Text(tr('Kode verifikasi dikirim ke email PIC. Masukkan di bawah.', 'A verification code was sent to the PIC email. Enter it below.'), style: const TextStyle(fontSize: 13)),
        const SizedBox(height: 12),
        TextField(controller: ctl, keyboardType: TextInputType.number, textAlign: TextAlign.center,
          decoration: const InputDecoration(hintText: '••••••'), maxLength: 6),
      ]),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(tr('Batal', 'Cancel'))),
        FilledButton(onPressed: () => Navigator.pop(context, ctl.text.trim()), style: FilledButton.styleFrom(backgroundColor: MC.primary), child: Text(tr('Verifikasi', 'Verify'))),
      ],
    ));
    if (code != null && code.length >= 4) _submit(code: code);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: MC.bg,
      body: Column(children: [
        HeroHeader(
          height: 214,
          child: Column(mainAxisAlignment: MainAxisAlignment.end, crossAxisAlignment: CrossAxisAlignment.center, children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
              decoration: BoxDecoration(color: Colors.white.withOpacity(0.18), borderRadius: BorderRadius.circular(20)),
              child: const Text('CORPORATE & GOVERNMENT', style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.5)),
            ).animate().fadeIn(duration: 400.ms),
            const SizedBox(height: 12),
            Text(tr('Portal Bisnis', 'Business Portal'), textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w800))
                .animate().fadeIn(delay: 120.ms).scale(begin: const Offset(0.9, 0.9)),
            const SizedBox(height: 4),
            Text(tr('Kelola perjalanan dinas & tagihan bisnis Anda', 'Manage business trips & billing'),
                    textAlign: TextAlign.center, style: const TextStyle(color: Colors.white70, fontSize: 13))
                .animate().fadeIn(delay: 220.ms),
          ]),
        ),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 20, 24, 24),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: stagger([
              AuthTextField(tr('Email PIC', 'PIC Email'), Icons.business_center_outlined, _email, keyboard: TextInputType.emailAddress),
              const SizedBox(height: 14),
              AuthTextField(tr('Kata Sandi', 'Password'), Icons.lock_outline_rounded, _pass, obscure: _obscure,
                  suffix: IconButton(
                    icon: Icon(_obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined, size: 20, color: MC.inkFaint),
                    onPressed: () => setState(() => _obscure = !_obscure),
                  )),
              const SizedBox(height: 20),
              PrimaryButton(tr('Masuk Portal Bisnis', 'Enter Business Portal'), loading: _loading, onPressed: _submit),
              const SizedBox(height: 18),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(color: MC.primarySoft, borderRadius: BorderRadius.circular(14)),
                child: Row(children: [
                  const Icon(Icons.info_outline_rounded, color: MC.primaryDark, size: 20),
                  const SizedBox(width: 10),
                  Expanded(child: Text(tr('Belum punya akun bisnis? Ajukan pendaftaran & unggah dokumen legalitas — tim Miruum akan meninjau.',
                      'No business account yet? Apply and upload your legal documents — the Miruum team will review it.'),
                      style: TextStyle(color: MC.ink, fontSize: 12.5, height: 1.35))),
                ]),
              ),
              const SizedBox(height: 14),
              SizedBox(
                height: 50, width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const CorporateRegisterScreen())),
                  icon: const Icon(Icons.apartment_rounded, size: 20, color: MC.primary),
                  label: Text(tr('Daftarkan Perusahaan', 'Register Your Company'), style: const TextStyle(color: MC.primary, fontWeight: FontWeight.w700)),
                  style: OutlinedButton.styleFrom(side: const BorderSide(color: MC.primary), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(26))),
                ),
              ),
            ], startMs: 240)),
          ),
        ),
      ]),
    );
  }
}

// ─────────────────────────── Corporate Register ───────────────────────────
class CorporateRegisterScreen extends StatefulWidget {
  const CorporateRegisterScreen({super.key});
  @override
  State<CorporateRegisterScreen> createState() => _CorporateRegisterScreenState();
}

class _CorporateRegisterScreenState extends State<CorporateRegisterScreen> {
  int _step = 0;
  bool _loadingCfg = true, _submitting = false;

  // Entity types + document catalog (fetched from backend so it stays in sync).
  List<String> _entityTypes = const ['SWASTA', 'BUMN', 'BUMD', 'PEMERINTAH'];
  // Bilingual display labels by entity key. Kept local (not overwritten by the
  // backend) so English users always see English names.
  Map<String, String> get _labels => {
        'SWASTA': tr('Perusahaan Swasta', 'Private Company'),
        'BUMN': 'BUMN',
        'BUMD': 'BUMD',
        'PEMERINTAH': tr('Pemerintahan', 'Government'),
      };
  Map<String, List<Map<String, dynamic>>> _catalog = const {};

  String? _entityType;

  final _company = TextEditingController();
  final _picName = TextEditingController();
  final _picPos = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _address = TextEditingController();
  final _npwp = TextEditingController();
  final _employees = TextEditingController();
  final _note = TextEditingController();

  // Uploaded documents: docKey -> url.
  final Map<String, String> _docs = {};
  String? _uploadingKey;

  static const _entityIcons = {
    'SWASTA': Icons.corporate_fare_rounded,
    'BUMN': Icons.account_balance_rounded,
    'BUMD': Icons.location_city_rounded,
    'PEMERINTAH': Icons.gavel_rounded,
  };
  Map<String, String> get _entityDesc => {
        'SWASTA': tr('PT / CV / perusahaan milik swasta', 'Ltd / private company'),
        'BUMN': tr('Badan Usaha Milik Negara', 'State-owned enterprise'),
        'BUMD': tr('Badan Usaha Milik Daerah', 'Regionally-owned enterprise'),
        'PEMERINTAH': tr('Kementerian / Dinas / Lembaga', 'Ministry / agency / institution'),
      };

  @override
  void initState() {
    super.initState();
    _loadCfg();
  }

  Future<void> _loadCfg() async {
    try {
      final cfg = await context.read<Api>().corporateDocRequirements();
      final types = (cfg['entityTypes'] as List?)?.map((e) => e.toString()).toList();
      final catalog = (cfg['catalog'] as Map?)?.map((k, v) => MapEntry(
            k.toString(),
            (v as List).map((e) => Map<String, dynamic>.from(e as Map)).toList(),
          ));
      if (!mounted) return;
      setState(() {
        if (types != null && types.isNotEmpty) _entityTypes = types;
        // Note: display labels come from the local bilingual `_labels` getter and
        // are intentionally not overwritten by the backend.
        if (catalog != null) _catalog = catalog;
        _loadingCfg = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loadingCfg = false); // fall back to defaults
    }
  }

  List<Map<String, dynamic>> get _docList => _catalog[_entityType] ?? const [];

  bool get _dataValid =>
      _company.text.trim().length >= 2 &&
      _picName.text.trim().length >= 2 &&
      _email.text.contains('@') &&
      _phone.text.trim().length >= 5;

  bool get _docsComplete {
    for (final d in _docList) {
      if (d['required'] == true && !_docs.containsKey(d['key'])) return false;
    }
    return true;
  }

  Future<void> _upload(String key) async {
    setState(() => _uploadingKey = key);
    try {
      final url = await pickAndUploadDoc(context);
      if (url != null && mounted) setState(() => _docs[key] = url);
    } finally {
      if (mounted) setState(() => _uploadingKey = null);
    }
  }

  Future<void> _submit() async {
    if (!_docsComplete) { _toast(context, tr('Lengkapi semua dokumen wajib terlebih dahulu', 'Please complete all required documents first')); return; }
    setState(() => _submitting = true);
    try {
      final documents = _docList
          .where((d) => _docs.containsKey(d['key']))
          .map((d) => {'key': d['key'], 'label': d['label'], 'url': _docs[d['key']]})
          .toList();
      await context.read<Api>().corporateApply({
        'entityType': _entityType,
        'companyName': _company.text.trim(),
        'picName': _picName.text.trim(),
        if (_picPos.text.trim().isNotEmpty) 'picPosition': _picPos.text.trim(),
        'email': _email.text.trim(),
        'phone': _phone.text.trim(),
        if (_address.text.trim().isNotEmpty) 'address': _address.text.trim(),
        if (_npwp.text.trim().isNotEmpty) 'taxId': _npwp.text.trim(),
        'employees': int.tryParse(_employees.text.trim()) ?? 0,
        if (_note.text.trim().isNotEmpty) 'note': _note.text.trim(),
        'documents': documents,
      });
      if (!mounted) return;
      await _showSuccess();
    } on ApiException catch (e) {
      if (mounted) _toast(context, e.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _showSuccess() async {
    await showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 66, height: 66,
            decoration: BoxDecoration(color: MC.primarySoft, shape: BoxShape.circle),
            child: const Icon(Icons.mark_email_read_rounded, color: MC.primaryDark, size: 34),
          ).animate().scale(begin: const Offset(0.6, 0.6), curve: Curves.elasticOut, duration: 600.ms),
          const SizedBox(height: 16),
          Text(tr('Pengajuan Terkirim!', 'Application Submitted!'), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          Text(tr('Tim Miruum akan meninjau dokumen legalitas Anda. Kredensial login akan dikirim ke email PIC setelah disetujui.',
              'The Miruum team will review your legal documents. Login credentials will be sent to the PIC email once approved.'),
              textAlign: TextAlign.center, style: TextStyle(color: MC.inkMuted, fontSize: 13, height: 1.4)),
        ]),
        actions: [
          Center(
            child: FilledButton(
              style: FilledButton.styleFrom(backgroundColor: MC.primary),
              onPressed: () { Navigator.pop(context); Navigator.pop(context); },
              child: Text(tr('Kembali ke Login', 'Back to Login')),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: MC.bg,
      appBar: AppBar(
        title: Text(tr('Daftar Bisnis', 'Business Registration')),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(6),
          child: LinearProgressIndicator(
            value: (_step + 1) / 3, minHeight: 4,
            backgroundColor: MC.line, color: MC.primary,
          ),
        ),
      ),
      body: _loadingCfg
          ? const Center(child: CircularProgressIndicator(color: MC.primary))
          : SafeArea(
              child: Column(children: [
                Expanded(child: _buildStep()),
                _buildNav(),
              ]),
            ),
    );
  }

  Widget _buildStep() {
    switch (_step) {
      case 0: return _stepEntity();
      case 1: return _stepData();
      default: return _stepDocs();
    }
  }

  // Step 1 — pick entity type.
  Widget _stepEntity() {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 8),
      children: [
        Text(tr('Jenis Bisnis', 'Business Type'), style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800)),
        const SizedBox(height: 4),
        Text(tr('Pilih jenis badan usaha bisnis Anda. Dokumen yang diminta menyesuaikan pilihan ini.',
            'Choose your business entity type. The required documents adjust to this choice.'),
            style: TextStyle(color: MC.inkMuted, fontSize: 13, height: 1.4)),
        const SizedBox(height: 18),
        ..._entityTypes.map((t) {
          final selected = _entityType == t;
          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: InkWell(
              borderRadius: BorderRadius.circular(16),
              onTap: () => setState(() => _entityType = t),
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: selected ? MC.primarySoft : MC.surface,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: selected ? MC.primary : MC.line, width: selected ? 1.6 : 1),
                ),
                child: Row(children: [
                  Container(
                    width: 46, height: 46,
                    decoration: BoxDecoration(color: selected ? MC.primary : MC.bg, borderRadius: BorderRadius.circular(12)),
                    child: Icon(_entityIcons[t] ?? Icons.business_rounded, color: selected ? Colors.white : MC.inkMuted),
                  ),
                  const SizedBox(width: 14),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(_labels[t] ?? t, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                    const SizedBox(height: 2),
                    Text(_entityDesc[t] ?? '', style: TextStyle(color: MC.inkMuted, fontSize: 12.5)),
                  ])),
                  Icon(selected ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded,
                      color: selected ? MC.primary : MC.line),
                ]),
              ),
            ),
          );
        }),
      ],
    );
  }

  // Step 2 — company + PIC data.
  Widget _stepData() {
    InputDecoration dec(String label, {String? hint}) => InputDecoration(
          labelText: label, hintText: hint, filled: true, fillColor: MC.surface,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: MC.line)),
          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: MC.line)),
        );
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 8),
      children: [
        Text(tr('Data ${_labels[_entityType] ?? 'Bisnis'}', 'Details — ${_labels[_entityType] ?? 'Business'}'), style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800)),
        const SizedBox(height: 16),
        TextField(controller: _company, decoration: dec(tr('Nama Perusahaan *', 'Company Name *'), hint: 'mis. PT Nusantara Jaya'), onChanged: (_) => setState(() {})),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(child: TextField(controller: _picName, decoration: dec(tr('Nama PIC *', 'PIC Name *')), onChanged: (_) => setState(() {}))),
          const SizedBox(width: 10),
          Expanded(child: TextField(controller: _picPos, decoration: dec(tr('Jabatan PIC', 'PIC Position')))),
        ]),
        const SizedBox(height: 12),
        TextField(controller: _email, keyboardType: TextInputType.emailAddress, decoration: dec(tr('Email PIC *', 'PIC Email *'), hint: 'email@perusahaan.co.id'), onChanged: (_) => setState(() {})),
        const SizedBox(height: 12),
        TextField(controller: _phone, keyboardType: TextInputType.phone, decoration: dec(tr('No. Telepon *', 'Phone Number *'), hint: '08xx / 021xxx'), onChanged: (_) => setState(() {})),
        const SizedBox(height: 12),
        TextField(controller: _address, maxLines: 2, decoration: dec(tr('Alamat', 'Address'))),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(child: TextField(controller: _npwp, decoration: dec(tr('NPWP', 'Tax ID (NPWP)'), hint: '00.000.000.0-000.000'))),
          const SizedBox(width: 10),
          SizedBox(width: 110, child: TextField(controller: _employees, keyboardType: TextInputType.number, decoration: dec(tr('Karyawan', 'Employees')))),
        ]),
        const SizedBox(height: 12),
        TextField(controller: _note, maxLines: 2, decoration: dec(tr('Kebutuhan / Catatan', 'Needs / Notes'), hint: 'mis. ±30 pemesanan dinas/bulan')),
        const SizedBox(height: 4),
        Text(tr('* wajib diisi', '* required'), style: TextStyle(color: MC.inkFaint, fontSize: 12)),
      ],
    );
  }

  // Step 3 — legality documents.
  Widget _stepDocs() {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 8),
      children: [
        Text(tr('Dokumen Legalitas', 'Legal Documents'), style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800)),
        const SizedBox(height: 4),
        Text(tr('Unggah dokumen berikut untuk ${_labels[_entityType] ?? 'bisnis Anda'}. Format foto/scan JPG/PNG, jelas & terbaca.',
            'Upload the following documents for ${_labels[_entityType] ?? 'your business'}. Photo/scan JPG/PNG, clear & legible.'),
            style: TextStyle(color: MC.inkMuted, fontSize: 13, height: 1.4)),
        const SizedBox(height: 16),
        ..._docList.map((d) {
          final key = d['key'] as String;
          final required = d['required'] == true;
          final url = _docs[key];
          final uploaded = url != null;
          final busy = _uploadingKey == key;
          return Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: MC.surface, borderRadius: BorderRadius.circular(14),
              border: Border.all(color: uploaded ? MC.success : MC.line, width: uploaded ? 1.4 : 1),
            ),
            child: Row(children: [
              Icon(uploaded ? Icons.check_circle_rounded : Icons.description_outlined,
                  color: uploaded ? MC.success : MC.inkFaint, size: 26),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Flexible(child: Text(d['label'] as String, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5))),
                  const SizedBox(width: 6),
                  if (required) Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                    decoration: BoxDecoration(color: MC.danger.withOpacity(0.12), borderRadius: BorderRadius.circular(6)),
                    child: Text(tr('Wajib', 'Required'), style: const TextStyle(color: MC.danger, fontSize: 10, fontWeight: FontWeight.w700)),
                  ) else Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                    decoration: BoxDecoration(color: MC.line, borderRadius: BorderRadius.circular(6)),
                    child: Text(tr('Opsional', 'Optional'), style: TextStyle(color: MC.inkMuted, fontSize: 10, fontWeight: FontWeight.w600)),
                  ),
                ]),
                if (uploaded) Padding(padding: const EdgeInsets.only(top: 2), child: Text(tr('Terunggah ✓', 'Uploaded ✓'), style: TextStyle(color: MC.success, fontSize: 12))),
              ])),
              const SizedBox(width: 8),
              busy
                  ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: MC.primary))
                  : TextButton(
                      onPressed: () => _upload(key),
                      child: Text(uploaded ? tr('Ganti', 'Replace') : tr('Unggah', 'Upload'), style: const TextStyle(color: MC.primary, fontWeight: FontWeight.w700)),
                    ),
            ]),
          );
        }),
        const SizedBox(height: 8),
      ],
    );
  }

  Widget _buildNav() {
    final canNext = _step == 0 ? _entityType != null : _step == 1 ? _dataValid : _docsComplete;
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
      decoration: BoxDecoration(color: MC.surface, boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 12, offset: const Offset(0, -2))]),
      child: Row(children: [
        if (_step > 0)
          Expanded(child: OutlinedButton(
            onPressed: _submitting ? null : () => setState(() => _step--),
            style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 15), side: BorderSide(color: MC.line), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
            child: Text(tr('Kembali', 'Back')),
          )),
        if (_step > 0) const SizedBox(width: 12),
        Expanded(
          flex: 2,
          child: _step < 2
              ? FilledButton(
                  onPressed: canNext ? () => setState(() => _step++) : null,
                  style: FilledButton.styleFrom(backgroundColor: MC.primary, padding: const EdgeInsets.symmetric(vertical: 15), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
                  child: Text(tr('Lanjut', 'Next'), style: const TextStyle(fontWeight: FontWeight.w700)),
                )
              : PrimaryButton(tr('Kirim Pengajuan', 'Submit Application'), loading: _submitting, onPressed: canNext ? _submit : null),
        ),
      ]),
    );
  }
}

// ─────────────────────────── Corporate Portal ───────────────────────────
class CorporatePortalScreen extends StatefulWidget {
  const CorporatePortalScreen({super.key});
  @override
  State<CorporatePortalScreen> createState() => _CorporatePortalScreenState();
}

class _CorporatePortalScreenState extends State<CorporatePortalScreen> {
  Map<String, dynamic>? _overview;
  List<dynamic> _invoices = const [];
  List<dynamic> _approvals = const [];
  bool _canApprove = false;
  String _myRole = 'MAKER';
  bool _loading = true;
  bool _acting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final api = context.read<Api>();
      final ov = await api.corporateOverview();
      final inv = await api.corporateInvoices();
      // Approval queue — any corporate user may read it; only Approvers can act.
      Map<String, dynamic> appr = const {};
      try { appr = await api.corporateApprovals(); } catch (_) {}
      if (!mounted) return;
      setState(() {
        _overview = ov;
        _invoices = inv;
        _approvals = (appr['approvals'] as List?) ?? const [];
        _canApprove = appr['canApprove'] == true || ov['canApprove'] == true;
        _myRole = (appr['myRole'] ?? ov['myRole'] ?? 'MAKER').toString();
        _loading = false;
      });
    } catch (e) {
      if (mounted) setState(() { _error = tr('Gagal memuat data portal', 'Failed to load portal data'); _loading = false; });
    }
  }

  String _roleLabel(String r) => r == 'ADMIN'
      ? tr('Admin', 'Admin')
      : r == 'APPROVER' ? tr('Approver', 'Approver') : tr('Maker', 'Maker');

  Future<void> _approve(Map<String, dynamic> b) async {
    final code = b['code']?.toString() ?? '';
    final ok = await confirmDialog(context,
        title: tr('Setujui Pesanan', 'Approve Booking'),
        message: tr('Setujui pesanan $code? E-voucher akan terbit & ditagihkan ke akun bisnis.',
            'Approve booking $code? An e-voucher will be issued & billed to the business account.'),
        confirmText: tr('Ya, setujui', 'Yes, approve'), icon: Icons.verified_rounded);
    if (ok != true) return;
    setState(() => _acting = true);
    try {
      await context.read<Api>().corporateApprove(b['id'].toString());
      if (mounted) _toast(context, tr('Pesanan disetujui', 'Booking approved'), err: false);
      await _load();
    } catch (e) {
      if (mounted) _toast(context, e.toString().replaceFirst('Exception: ', ''));
    } finally { if (mounted) setState(() => _acting = false); }
  }

  Future<void> _reject(Map<String, dynamic> b) async {
    final code = b['code']?.toString() ?? '';
    final ctl = TextEditingController();
    final reason = await showDialog<String>(
      context: context,
      builder: (dctx) => AlertDialog(
        backgroundColor: MC.surface,
        title: Text(tr('Tolak Pesanan $code', 'Reject Booking $code')),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(tr('Beri alasan penolakan (opsional). Pemesan (maker) akan diberi tahu.',
              'Give a reason (optional). The maker will be notified.'), style: const TextStyle(fontSize: 13)),
          const SizedBox(height: 12),
          TextField(controller: ctl, maxLines: 2, decoration: InputDecoration(
            hintText: tr('Alasan penolakan', 'Reason for rejection'), border: const OutlineInputBorder())),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dctx), child: Text(tr('Batal', 'Cancel'))),
          FilledButton(onPressed: () => Navigator.pop(dctx, ctl.text.trim()),
              style: FilledButton.styleFrom(backgroundColor: MC.danger),
              child: Text(tr('Tolak', 'Reject'))),
        ],
      ),
    );
    if (reason == null) return; // cancelled
    setState(() => _acting = true);
    try {
      await context.read<Api>().corporateReject(b['id'].toString(), reason);
      if (mounted) _toast(context, tr('Pesanan ditolak', 'Booking rejected'), err: false);
      await _load();
    } catch (e) {
      if (mounted) _toast(context, e.toString().replaceFirst('Exception: ', ''));
    } finally { if (mounted) setState(() => _acting = false); }
  }

  void _logout() {
    context.read<AuthBloc>().add(const AuthLoggedOut());
    Navigator.of(context).popUntil((r) => r.isFirst);
  }

  @override
  Widget build(BuildContext context) {
    final corp = _overview?['corporate'] as Map<String, dynamic>?;
    final stats = _overview?['stats'] as Map<String, dynamic>?;
    final recent = (_overview?['recent'] as List?) ?? const [];
    final isGov = corp?['type'] == 'GOVERNMENT';
    return Scaffold(
      backgroundColor: MC.bg,
      appBar: AppBar(
        title: Text(tr('Portal Bisnis', 'Business Portal')),
        actions: [
          IconButton(onPressed: _load, icon: const Icon(Icons.refresh_rounded)),
          IconButton(onPressed: _logout, icon: const Icon(Icons.logout_rounded)),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: MC.primary))
          : _error != null
              ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Text(_error!, style: TextStyle(color: MC.inkMuted)),
                  const SizedBox(height: 12),
                  FilledButton(onPressed: _load, style: FilledButton.styleFrom(backgroundColor: MC.primary), child: Text(tr('Coba Lagi', 'Try Again'))),
                ]))
              : RefreshIndicator(
                  color: MC.primary,
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
                    children: [
                      // Account card.
                      Container(
                        padding: const EdgeInsets.all(18),
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(colors: [MC.primary, MC.primaryDark], begin: Alignment.topLeft, end: Alignment.bottomRight),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(isGov ? tr('Pemerintahan', 'Government') : tr('Bisnis', 'Business'), style: const TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w600, letterSpacing: 0.5)),
                          const SizedBox(height: 4),
                          Text(corp?['name']?.toString() ?? '—', style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800)),
                          const SizedBox(height: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                            decoration: BoxDecoration(color: Colors.white.withOpacity(0.18), borderRadius: BorderRadius.circular(20)),
                            child: Row(mainAxisSize: MainAxisSize.min, children: [
                              const Icon(Icons.badge_rounded, color: Colors.white, size: 13),
                              const SizedBox(width: 4),
                              Text(tr('Peran: ${_roleLabel(_myRole)}', 'Role: ${_roleLabel(_myRole)}'),
                                  style: const TextStyle(color: Colors.white, fontSize: 11.5, fontWeight: FontWeight.w700)),
                            ]),
                          ),
                          if (corp?['taxId'] != null) Padding(padding: const EdgeInsets.only(top: 2), child: Text(tr('NPWP: ${corp!['taxId']}', 'Tax ID: ${corp!['taxId']}'), style: const TextStyle(color: Colors.white70, fontSize: 12))),
                          const SizedBox(height: 16),
                          Row(children: [
                            const Icon(Icons.account_balance_wallet_rounded, color: Colors.white70, size: 18),
                            const SizedBox(width: 6),
                            Text(tr('Limit Kredit', 'Credit Limit'), style: const TextStyle(color: Colors.white70, fontSize: 12.5)),
                            const Spacer(),
                            Text(rupiah(_toInt(corp?['creditLimit'])), style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w800)),
                          ]),
                        ]),
                      ),
                      const SizedBox(height: 14),
                      // Stats.
                      Row(children: [
                        _statCard(tr('Total Pesanan', 'Total Bookings'), '${stats?['bookings'] ?? 0}', Icons.receipt_long_rounded),
                        const SizedBox(width: 12),
                        _statCard(tr('Total Belanja', 'Total Spend'), rupiah(_toInt(stats?['spend'])), Icons.payments_rounded),
                      ]),
                      // Approval queue (Approvers/Admin only).
                      if (_canApprove) ...[
                        const SizedBox(height: 22),
                        Row(children: [
                          Text(tr('Persetujuan', 'Approvals'), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                          const SizedBox(width: 8),
                          if (_approvals.isNotEmpty)
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                              decoration: BoxDecoration(color: MC.primary, borderRadius: BorderRadius.circular(20)),
                              child: Text('${_approvals.length}', style: const TextStyle(color: Colors.white, fontSize: 11.5, fontWeight: FontWeight.w800)),
                            ),
                        ]),
                        const SizedBox(height: 4),
                        Text(tr('Pesanan diajukan Maker menunggu persetujuan Anda. Anda tidak dapat menyetujui pesanan yang Anda ajukan sendiri.',
                            'Bookings submitted by Makers awaiting your approval. You cannot approve your own requests.'),
                            style: TextStyle(color: MC.inkMuted, fontSize: 12)),
                        const SizedBox(height: 10),
                        if (_approvals.isEmpty)
                          _emptyBox(tr('Tidak ada pesanan menunggu persetujuan.', 'No bookings awaiting approval.'))
                        else
                          ..._approvals.map((raw) {
                            final b = raw as Map<String, dynamic>;
                            final hotel = b['hotel'] as Map<String, dynamic>?;
                            final room = b['room'] as Map<String, dynamic>?;
                            final maker = b['makerName']?.toString();
                            final mine = b['requestedById'] != null && b['requestedById'] == _overview?['myId'];
                            return Container(
                              margin: const EdgeInsets.only(bottom: 10),
                              padding: const EdgeInsets.all(14),
                              decoration: BoxDecoration(color: MC.surface, borderRadius: BorderRadius.circular(14), border: Border.all(color: MC.line)),
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Row(children: [
                                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                    Text(hotel?['name']?.toString() ?? 'Hotel', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                                    const SizedBox(height: 2),
                                    Text('${b['code'] ?? ''} · ${room?['name'] ?? ''}', style: TextStyle(color: MC.inkMuted, fontSize: 12)),
                                    if (b['bookerName'] != null) Text(tr('Tamu: ${b['bookerName']}', 'Guest: ${b['bookerName']}'), style: TextStyle(color: MC.inkMuted, fontSize: 12)),
                                    if (maker != null) Text(tr('Diajukan: $maker', 'By: $maker'), style: TextStyle(color: MC.inkMuted, fontSize: 12)),
                                  ])),
                                  Text(rupiah(_toInt(b['totalPrice'])), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5)),
                                ]),
                                const SizedBox(height: 12),
                                if (mine)
                                  Text(tr('Pesanan Anda sendiri — menunggu approver lain.', 'Your own request — awaiting another approver.'),
                                      style: TextStyle(color: MC.inkMuted, fontSize: 12, fontStyle: FontStyle.italic))
                                else
                                  Row(children: [
                                    Expanded(child: OutlinedButton.icon(
                                      onPressed: _acting ? null : () => _reject(b),
                                      icon: const Icon(Icons.close_rounded, size: 18),
                                      label: Text(tr('Tolak', 'Reject')),
                                      style: OutlinedButton.styleFrom(foregroundColor: MC.danger, side: BorderSide(color: MC.danger.withOpacity(0.5))),
                                    )),
                                    const SizedBox(width: 10),
                                    Expanded(child: FilledButton.icon(
                                      onPressed: _acting ? null : () => _approve(b),
                                      icon: const Icon(Icons.check_rounded, size: 18),
                                      label: Text(tr('Setujui', 'Approve')),
                                      style: FilledButton.styleFrom(backgroundColor: MC.primary),
                                    )),
                                  ]),
                              ]),
                            );
                          }),
                      ],
                      const SizedBox(height: 22),
                      // Invoices.
                      Text(tr('Tagihan dari Miruum', 'Invoices from Miruum'), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                      const SizedBox(height: 10),
                      if (_invoices.isEmpty)
                        _emptyBox(tr('Belum ada tagihan.', 'No invoices yet.'))
                      else
                        ..._invoices.map((raw) {
                          final inv = raw as Map<String, dynamic>;
                          final status = inv['status']?.toString() ?? 'UNPAID';
                          final paid = status == 'PAID';
                          return Container(
                            margin: const EdgeInsets.only(bottom: 10),
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(color: MC.surface, borderRadius: BorderRadius.circular(14), border: Border.all(color: MC.line)),
                            child: Row(children: [
                              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Text(inv['number']?.toString() ?? '—', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                                const SizedBox(height: 2),
                                Text(tr('${inv['bookingsCount'] ?? 0} pesanan', '${inv['bookingsCount'] ?? 0} bookings'), style: TextStyle(color: MC.inkMuted, fontSize: 12)),
                              ])),
                              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                                Text(rupiah(_toInt(inv['amount'])), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                                const SizedBox(height: 4),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                  decoration: BoxDecoration(color: (paid ? MC.success : MC.primary).withOpacity(0.12), borderRadius: BorderRadius.circular(6)),
                                  child: Text(paid ? tr('Lunas', 'Paid') : status == 'CANCELLED' ? tr('Batal', 'Cancelled') : tr('Belum Bayar', 'Unpaid'),
                                      style: TextStyle(color: paid ? MC.success : MC.primaryDark, fontSize: 11, fontWeight: FontWeight.w700)),
                                ),
                              ]),
                            ]),
                          );
                        }),
                      const SizedBox(height: 22),
                      // Recent bookings.
                      Text(tr('Pesanan Terbaru', 'Recent Bookings'), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                      const SizedBox(height: 10),
                      if (recent.isEmpty)
                        _emptyBox(tr('Belum ada pesanan dinas.', 'No business trips yet.'))
                      else
                        ...recent.map((raw) {
                          final b = raw as Map<String, dynamic>;
                          final hotel = b['hotel'] as Map<String, dynamic>?;
                          return Container(
                            margin: const EdgeInsets.only(bottom: 10),
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(color: MC.surface, borderRadius: BorderRadius.circular(14), border: Border.all(color: MC.line)),
                            child: Row(children: [
                              const Icon(Icons.hotel_rounded, color: MC.primary),
                              const SizedBox(width: 12),
                              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Text(hotel?['name']?.toString() ?? 'Hotel', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                                if (hotel?['city'] != null) Text(hotel!['city'].toString(), style: TextStyle(color: MC.inkMuted, fontSize: 12)),
                              ])),
                              Text(rupiah(_toInt(b['totalPrice'])), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5)),
                            ]),
                          );
                        }),
                    ],
                  ),
                ),
    );
  }

  int _toInt(dynamic v) => v == null ? 0 : (v is int ? v : int.tryParse(v.toString()) ?? 0);

  Widget _statCard(String label, String value, IconData icon) => Expanded(
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: MC.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: MC.line)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(icon, color: MC.primary, size: 22),
            const SizedBox(height: 10),
            Text(value, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
            const SizedBox(height: 2),
            Text(label, style: TextStyle(color: MC.inkMuted, fontSize: 12)),
          ]),
        ),
      );

  Widget _emptyBox(String msg) => Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(color: MC.surface, borderRadius: BorderRadius.circular(14), border: Border.all(color: MC.line)),
        child: Center(child: Text(msg, style: TextStyle(color: MC.inkMuted, fontSize: 13))),
      );
}
