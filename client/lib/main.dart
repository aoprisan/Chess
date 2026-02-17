import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'services/auth_service.dart';
import 'services/websocket_service.dart';
import 'screens/main_menu_screen.dart';
import 'screens/welcome_screen.dart';

final authService = AuthService();

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  await SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  await authService.initialize();

  runApp(const KiddieChessApp());
}

class KiddieChessApp extends StatelessWidget {
  const KiddieChessApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: authService),
        Provider(create: (_) => WebSocketService()),
      ],
      child: Consumer<AuthService>(
        builder: (context, auth, _) {
          return MaterialApp(
            title: 'Kiddie Chess',
            debugShowCheckedModeBanner: false,
            theme: ThemeData(
              colorScheme: ColorScheme.fromSeed(
                seedColor: Colors.amber,
                brightness: Brightness.light,
              ),
              fontFamily: 'ComicSans',
              useMaterial3: true,
            ),
            home: auth.isLoggedIn
                ? const MainMenuScreen()
                : const WelcomeScreen(),
          );
        },
      ),
    );
  }
}
