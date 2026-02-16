import 'package:flutter/foundation.dart' show kIsWeb;

class ServerConfig {
  static final String baseUrl = _resolve();

  static String get wsUrl {
    final uri = Uri.parse(baseUrl);
    final scheme = uri.scheme == 'https' ? 'wss' : 'ws';
    return '$scheme://${uri.host}:${uri.port}/ws';
  }

  static String _resolve() {
    const defined = String.fromEnvironment('SERVER_URL');
    if (defined.isNotEmpty) return defined;
    if (kIsWeb) return Uri.base.origin;
    return 'http://localhost:8080';
  }
}
