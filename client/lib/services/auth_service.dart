import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

import 'server_config.dart';

/// Represents an authenticated user (guest or full account).
class AuthUser {
  final String userId;
  final String username;
  final String token;
  final bool isGuest;

  AuthUser({
    required this.userId,
    required this.username,
    required this.token,
    required this.isGuest,
  });

  factory AuthUser.fromJson(Map<String, dynamic> json) => AuthUser(
        userId: json['userId'] as String,
        username: json['username'] as String,
        token: json['token'] as String,
        isGuest: json['isGuest'] as bool,
      );
}

/// Handles guest registration, login, account upgrade, and JWT persistence.
class AuthService extends ChangeNotifier {
  static const _tokenKey = 'auth_token';
  static const _userKey = 'auth_user';
  static const _deviceIdKey = 'device_id';

  AuthUser? _currentUser;
  late SharedPreferences _prefs;

  AuthUser? get currentUser => _currentUser;
  String? get token => _currentUser?.token;
  bool get isLoggedIn => _currentUser != null;

  /// Load stored session from SharedPreferences.
  Future<void> initialize() async {
    _prefs = await SharedPreferences.getInstance();
    final userJson = _prefs.getString(_userKey);
    if (userJson != null) {
      try {
        _currentUser = AuthUser.fromJson(jsonDecode(userJson));
      } catch (_) {
        // Corrupted data — clear it
        await _prefs.remove(_userKey);
        await _prefs.remove(_tokenKey);
      }
    }
  }

  /// Returns a stable device ID, creating one on first call.
  Future<String> getDeviceId() async {
    var deviceId = _prefs.getString(_deviceIdKey);
    if (deviceId == null) {
      deviceId = const Uuid().v4();
      await _prefs.setString(_deviceIdKey, deviceId);
    }
    return deviceId;
  }

  /// Register as a guest with a display name.
  Future<void> registerGuest(String displayName) async {
    final deviceId = await getDeviceId();
    final url = '${ServerConfig.baseUrl}/api/auth/guest';
    final payload = jsonEncode({'deviceId': deviceId, 'displayName': displayName});
    debugPrint('[AuthService] baseUrl=${ServerConfig.baseUrl}');
    debugPrint('[AuthService] POST $url');
    debugPrint('[AuthService] headers: Content-Type=application/json');
    debugPrint('[AuthService] body: $payload');

    try {
      final response = await http.post(
        Uri.parse(url),
        headers: {'Content-Type': 'application/json'},
        body: payload,
      );

      debugPrint('[AuthService] response.statusCode=${response.statusCode}');
      debugPrint('[AuthService] response.headers=${response.headers}');
      debugPrint('[AuthService] response.body=${response.body}');

      if (response.statusCode != 200) {
        String msg = 'Registration failed (${response.statusCode})';
        try {
          final body = jsonDecode(response.body);
          if (body['error'] != null) msg = body['error'];
        } catch (_) {}
        throw Exception(msg);
      }

      final data = jsonDecode(response.body);
      _currentUser = AuthUser.fromJson(data);
      await _saveUser();
      notifyListeners();
    } catch (e, st) {
      debugPrint('[AuthService] registerGuest error: $e');
      debugPrint('[AuthService] stacktrace: $st');
      rethrow;
    }
  }

  /// Log in with email and password.
  Future<void> login(String email, String password) async {
    final response = await http.post(
      Uri.parse('${ServerConfig.baseUrl}/api/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email, 'password': password}),
    );

    if (response.statusCode != 200) {
      throw Exception('Login failed: ${response.body}');
    }

    final data = jsonDecode(response.body);
    _currentUser = AuthUser.fromJson(data);
    await _saveUser();
    notifyListeners();
  }

  /// Upgrade guest account to a full account with email/password.
  Future<void> upgradeAccount(String email, String password) async {
    if (_currentUser == null) throw Exception('Not logged in');

    final response = await http.post(
      Uri.parse('${ServerConfig.baseUrl}/api/auth/upgrade'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ${_currentUser!.token}',
      },
      body: jsonEncode({'email': email, 'password': password}),
    );

    if (response.statusCode != 200) {
      throw Exception('Account upgrade failed: ${response.body}');
    }

    final data = jsonDecode(response.body);
    _currentUser = AuthUser.fromJson(data);
    await _saveUser();
    notifyListeners();
  }

  /// Clear stored session and log out.
  Future<void> logout() async {
    _currentUser = null;
    await _prefs.remove(_userKey);
    await _prefs.remove(_tokenKey);
    notifyListeners();
  }

  Future<void> _saveUser() async {
    if (_currentUser != null) {
      await _prefs.setString(
        _userKey,
        jsonEncode({
          'userId': _currentUser!.userId,
          'username': _currentUser!.username,
          'token': _currentUser!.token,
          'isGuest': _currentUser!.isGuest,
        }),
      );
    }
  }
}
