import 'package:flutter/material.dart';
import '../services/combat_service.dart';
import 'perk_card.dart';

/// Panel for selecting a perk during the perk selection phase
class PerkSelectionPanel extends StatefulWidget {
  final List<PerkSlot> perkSlots;
  final bool isMyTurn;
  final Function(int perkId) onPerkSelected;
  final VoidCallback onPass;

  const PerkSelectionPanel({
    super.key,
    required this.perkSlots,
    required this.isMyTurn,
    required this.onPerkSelected,
    required this.onPass,
  });

  @override
  State<PerkSelectionPanel> createState() => _PerkSelectionPanelState();
}

class _PerkSelectionPanelState extends State<PerkSelectionPanel> {
  int? _selectedPerkId;

  @override
  Widget build(BuildContext context) {
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

  const CompactPerkBar({
    super.key,
    required this.perkSlots,
    required this.isMyTurn,
    required this.onPerkSelected,
    required this.onPass,
  });

  @override
  Widget build(BuildContext context) {
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
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.8),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.amber.shade700),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Perks
          ...perkSlots.where((s) => s.perkId > 0).map((slot) {
            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: CompactPerkCard(
                perkId: slot.perkId,
                perkName: slot.perkName,
                onTap: () => onPerkSelected(slot.perkId),
              ),
            );
          }),
          const SizedBox(width: 4),
          // Pass button
          GestureDetector(
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
}
