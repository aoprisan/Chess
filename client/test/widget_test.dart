import 'package:flutter_test/flutter_test.dart';

import 'package:kiddie_chess/main.dart';

void main() {
  testWidgets('KiddieChessApp smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const KiddieChessApp());
    await tester.pumpAndSettle();

    // Verify the app renders without crashing
    expect(find.byType(KiddieChessApp), findsOneWidget);
  });
}
