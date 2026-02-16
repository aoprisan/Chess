import 'dart:io' show Platform;
import 'package:flutter/foundation.dart' show debugPrint, kIsWeb;

class ServerConfig {
  static final String baseUrl = _resolve();

  static String get wsUrl {
    final uri = Uri.parse(baseUrl);
    final scheme = uri.scheme == 'https' ? 'wss' : 'ws';
    return '$scheme://${uri.host}:${uri.port}/ws';
  }

  static String _resolve() {
    const defined = String.fromEnvironment('SERVER_URL');
    debugPrint('[ServerConfig] SERVER_URL env: "${defined}"');
    debugPrint('[ServerConfig] kIsWeb=$kIsWeb');
    if (defined.isNotEmpty) {
      debugPrint('[ServerConfig] Using dart-define SERVER_URL: $defined');
      return defined;
    }
    if (kIsWeb) {
      debugPrint('[ServerConfig] Web platform → ${Uri.base.origin}');
      return Uri.base.origin;
    }
    if (Platform.isAndroid || Platform.isIOS) {
      const url = 'http://35.156.232.123:9090';
      debugPrint('[ServerConfig] Mobile (android=${Platform.isAndroid}, ios=${Platform.isIOS}) → $url');
      return url;
    }
    debugPrint('[ServerConfig] Desktop → http://localhost:8080');
    return 'http://localhost:8080';
  }
}
