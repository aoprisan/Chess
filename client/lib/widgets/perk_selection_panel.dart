import 'package:flutter/material.dart';
import '../services/combat_service.dart';
import 'perk_card.dart';

/// Panel for selecting a perk during the perk selection phase
class PerkSelectionPanel extends StatefulWidget {
  final List<PerkSlot> perkSlots;
  final bool isMyTurn;
  final Function(int perkId) onPerkSelected;
  final VoidCallback onPass;
  final int? aiHighlightPerkId;

  const PerkSelectionPanel({
    super.key,
    required this.perkSlots,
    required this.isMyTurn,
    required this.onPerkSelected,
    required this.onPass,
    this.aiHighlightPerkId,
  });

  @override
  State<PerkSelectionPanel> createState() => _PerkSelectionPanelState();
}

class _PerkSelectionPanelState extends State<PerkSelectionPanel> {
  int? _selectedPerkId;

  @override
  Widget build(BuildContext context) {
    // Show AI perk highlight instead of waiting indicator
    if (!widget.isMyTurn && widget.aiHighlightPerkId != null) {
      return _buildAIHighlightPanel();
    }

    if (!widget.isMyTurn) {
      return _buildWaitingIndicator();
    }

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.8),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.amber.shade700, width: 2),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Header
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.auto_awesome, color: Colors.amber.shade400, size: 20),
              const SizedBox(width: 8),
              Text(
                'Select a Perk',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: Colors.amber.shade400,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Perk slots
          Wrap(
            spacing: 8,
            runSpacing: 8,
            alignment: WrapAlignment.center,
            children: [
              // Fixed perks (slots 1-2)
              ...widget.perkSlots.where((s) => s.perkId > 0).map((slot) {
                return SizedBox(
                  width: 140,
                  child: PerkCard(
                    perkId: slot.perkId,
                    perkName: slot.perkName,
                    isSelected: _selectedPerkId == slot.perkId,
                    isEnabled: true,
                    onTap: () => _onPerkTapped(slot.perkId),
                  ),
                );
              }),
            ],
          ),
          const SizedBox(height: 12),

          // Action buttons
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // Pass button
              ElevatedButton.icon(
                onPressed: widget.onPass,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.grey.shade700,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                ),
                icon: const Icon(Icons.skip_next, size: 18),
                label: const Text('Pass'),
              ),
              const SizedBox(width: 12),
              // Use perk button
              ElevatedButton.icon(
                onPressed: _selectedPerkId != null
                    ? () => widget.onPerkSelected(_selectedPerkId!)
                    : null,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.amber.shade700,
                  foregroundColor: Colors.black,
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                ),
                icon: const Icon(Icons.flash_on, size: 18),
                label: const Text('Use Perk'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildAIHighlightPanel() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.8),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.cyan.shade400, width: 2),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.smart_toy, color: Colors.cyan.shade400, size: 20),
              const SizedBox(width: 8),
              Text(
                'AI chose a perk',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: Colors.cyan.shade400,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            alignment: WrapAlignment.center,
            children: widget.perkSlots.where((s) => s.perkId > 0).map((slot) {
              final isAIChoice = slot.perkId == widget.aiHighlightPerkId;
              return SizedBox(
                width: 140,
                child: Opacity(
                  opacity: isAIChoice ? 1.0 : 0.4,
                  child: Container(
                    decoration: isAIChoice
                        ? BoxDecoration(
                            borderRadius: BorderRadius.circular(8),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.cyan.withOpacity(0.6),
                                blurRadius: 12,
                                spreadRadius: 2,
                              ),
                            ],
                          )
                        : null,
                    child: Stack(
                      children: [
                        PerkCard(
                          perkId: slot.perkId,
                          perkName: slot.perkName,
                          isSelected: isAIChoice,
                          isEnabled: false,
                          onTap: () {},
                        ),
                        if (isAIChoice)
                          Positioned(
                            top: 2,
                            right: 4,
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                              decoration: BoxDecoration(
                                color: Colors.cyan.shade700,
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: const Text(
                                'AI',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 9,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }

  Widget _buildWaitingIndicator() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.7),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: 16,
            height: 16,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              valueColor: AlwaysStoppedAnimation<Color>(Colors.grey.shade400),
            ),
          ),
          const SizedBox(width: 12),
          Text(
            'Opponent\'s turn...',
            style: TextStyle(
              color: Colors.grey.shade400,
              fontSize: 14,
            ),
          ),
        ],
      ),
    );
  }

  void _onPerkTapped(int perkId) {
    setState(() {
      if (_selectedPerkId == perkId) {
        _selectedPerkId = null;
      } else {
        _selectedPerkId = perkId;
      }
    });
  }
}

/// Compact horizontal perk bar for smaller screens
class CompactPerkBar extends StatelessWidget {
  final List<PerkSlot> perkSlots;
  final bool isMyTurn;
  final Function(int perkId) onPerkSelected;
  final VoidCallback onPass;
  final int? aiHighlightPerkId;

  const CompactPerkBar({
    super.key,
    required this.perkSlots,
    required this.isMyTurn,
    required this.onPerkSelected,
    required this.onPass,
    this.aiHighlightPerkId,
  });

  @override
  Widget build(BuildContext context) {
    // Show AI perk highlight instead of waiting indicator
    if (!isMyTurn && aiHighlightPerkId != null) {
      return _buildAIHighlightBar();
    }

    if (!isMyTurn) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: Colors.black.withOpacity(0.7),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 14,
              height: 14,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                valueColor: AlwaysStoppedAnimation<Color>(Colors.grey.shade400),
              ),
            ),
            const SizedBox(width: 8),
            Text(
              'Opponent\'s turn',
              style: TextStyle(color: Colors.grey.shade400, fontSize: 12),
            ),
          ],
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.8),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.amber.shade700),
      ),
      child: Wrap(
        spacing: 8,
        runSpacing: 6,
        alignment: WrapAlignment.center,
        children: [
          // Perks
          ...perkSlots.where((s) => s.perkId > 0).map((slot) {
            return CompactPerkCard(
              perkId: slot.perkId,
              perkName: slot.perkName,
              onTap: () => onPerkSelected(slot.perkId),
            );
          }),
          // Pass button
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: onPass,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.grey.shade700,
                borderRadius: BorderRadius.circular(6),
              ),
              child: const Text(
                'Pass',
                style: TextStyle(color: Colors.white, fontSize: 11),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAIHighlightBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.8),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.cyan.shade400),
      ),
      child: Wrap(
        spacing: 8,
        runSpacing: 6,
        alignment: WrapAlignment.center,
        children: [
          // AI label
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
            decoration: BoxDecoration(
              color: Colors.cyan.shade700,
              borderRadius: BorderRadius.circular(4),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.smart_toy, color: Colors.white, size: 12),
                const SizedBox(width: 4),
                const Text(
                  'AI',
                  style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
                ),
              ],
            ),
          ),
          // Perks with highlight
          ...perkSlots.where((s) => s.perkId > 0).map((slot) {
            final isAIChoice = slot.perkId == aiHighlightPerkId;
            return Opacity(
              opacity: isAIChoice ? 1.0 : 0.4,
              child: Container(
                decoration: isAIChoice
                    ? BoxDecoration(
                        borderRadius: BorderRadius.circular(6),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.cyan.withOpacity(0.5),
                            blurRadius: 8,
                            spreadRadius: 1,
                          ),
                        ],
                      )
                    : null,
                child: CompactPerkCard(
                  perkId: slot.perkId,
                  perkName: slot.perkName,
                  onTap: () {},
                ),
              ),
            );
          }),
        ],
      ),
    );
  }
}
