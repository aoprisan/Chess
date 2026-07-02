import 'package:flutter/material.dart';

/// Perk definition for display purposes
class PerkInfo {
  final int id;
  final String name;
  final String description;
  final PerkCategory category;
  final bool requiresTarget;

  const PerkInfo({
    required this.id,
    required this.name,
    required this.description,
    required this.category,
    this.requiresTarget = true,
  });

  Color get categoryColor {
    switch (category) {
      case PerkCategory.offensive:
        return Colors.red.shade400;
      case PerkCategory.defensive:
        return Colors.blue.shade400;
      case PerkCategory.utility:
        return Colors.amber.shade400;
    }
  }

  IconData get categoryIcon {
    switch (category) {
      case PerkCategory.offensive:
        return Icons.flash_on;
      case PerkCategory.defensive:
        return Icons.shield;
      case PerkCategory.utility:
        return Icons.build;
    }
  }
}

enum PerkCategory { offensive, defensive, utility }

/// Static perk definitions for all 32 perks
class PerkDefinitions {
  static const Map<int, PerkInfo> perks = {
    // Pass (special)
    0: PerkInfo(
      id: 0,
      name: 'Pass',
      description: 'Skip perk selection and end turn',
      category: PerkCategory.utility,
      requiresTarget: false,
    ),

    // Fixed Commons (Slots 1-2)
    1: PerkInfo(
      id: 1,
      name: 'PlaceAnother',
      description: 'Place 1 piece on any lane',
      category: PerkCategory.offensive,
    ),
    2: PerkInfo(
      id: 2,
      name: 'RemoveEnemy',
      description: 'Remove enemy\'s frontmost piece',
      category: PerkCategory.offensive,
    ),

    // Protection & Control (Slot 3)
    4: PerkInfo(
      id: 4,
      name: 'Freeze',
      description: 'Block enemy placement for 1 turn',
      category: PerkCategory.defensive,
    ),
    22: PerkInfo(
      id: 22,
      name: 'Cloak',
      description: 'Hide your pieces for 2 turns',
      category: PerkCategory.defensive,
      requiresTarget: false,
    ),

    // Placement Triggers (Slot 3)
    24: PerkInfo(
      id: 24,
      name: 'Portal',
      description: 'Enemy pieces placed here teleport away',
      category: PerkCategory.defensive,
    ),
    25: PerkInfo(
      id: 25,
      name: 'Trap',
      description: 'Enemy pieces placed here vanish',
      category: PerkCategory.defensive,
    ),
    26: PerkInfo(
      id: 26,
      name: 'Mirror',
      description: 'Enemy places here, you get +2',
      category: PerkCategory.defensive,
    ),
    27: PerkInfo(
      id: 27,
      name: 'Echo',
      description: 'Enemy places here, you get +2 random',
      category: PerkCategory.defensive,
    ),
    28: PerkInfo(
      id: 28,
      name: 'Shockwave',
      description: 'Enemy places here, loses 2 elsewhere',
      category: PerkCategory.offensive,
    ),

    // Removal Triggers (Slot 3)
    29: PerkInfo(
      id: 29,
      name: 'Hydra',
      description: 'Piece removed here spawns 2 elsewhere',
      category: PerkCategory.defensive,
    ),
    30: PerkInfo(
      id: 30,
      name: 'Backfire',
      description: 'Piece removed here costs enemy 2',
      category: PerkCategory.offensive,
    ),
    46: PerkInfo(
      id: 46,
      name: 'Absorb',
      description: 'Removed piece reappears elsewhere',
      category: PerkCategory.defensive,
    ),

    // Repositioning - Your Pieces (Slot 3)
    33: PerkInfo(
      id: 33,
      name: 'Regroup',
      description: 'Swap your pieces between 2 lanes',
      category: PerkCategory.utility,
    ),
    35: PerkInfo(
      id: 35,
      name: 'Scatter',
      description: 'Move your pieces to random lanes',
      category: PerkCategory.utility,
    ),
    43: PerkInfo(
      id: 43,
      name: 'Signal',
      description: '+1 now, pull from most populated next turn',
      category: PerkCategory.utility,
    ),

    // Duration Perks (Slot 3)
    49: PerkInfo(
      id: 49,
      name: 'Sanctuary',
      description: 'Losses redirect here for 2 turns',
      category: PerkCategory.defensive,
    ),
    52: PerkInfo(
      id: 52,
      name: 'Retaliate',
      description: 'Enemy places here, raid their side',
      category: PerkCategory.offensive,
    ),

    // Slot 4: Act & Disrupt
    13: PerkInfo(
      id: 13,
      name: 'Scramble',
      description: 'Redistribute all enemy pieces',
      category: PerkCategory.offensive,
      requiresTarget: false,
    ),
    23: PerkInfo(
      id: 23,
      name: 'Blind',
      description: 'Hide enemy pieces for 2 turns',
      category: PerkCategory.offensive,
      requiresTarget: false,
    ),

    // Conversion Perks (Slot 4)
    31: PerkInfo(
      id: 31,
      name: 'Split',
      description: 'Sacrifice 1, gain 2 elsewhere',
      category: PerkCategory.utility,
    ),
    32: PerkInfo(
      id: 32,
      name: 'Kamikaze',
      description: 'Sacrifice 1, enemy loses 3',
      category: PerkCategory.offensive,
    ),

    // Repositioning - Enemy Pieces (Slot 4)
    34: PerkInfo(
      id: 34,
      name: 'Disrupt',
      description: 'Swap enemy pieces between 2 lanes',
      category: PerkCategory.offensive,
    ),
    36: PerkInfo(
      id: 36,
      name: 'Disperse',
      description: 'Move enemy pieces to random lanes',
      category: PerkCategory.offensive,
    ),

    // Trade Perks (Slot 4)
    37: PerkInfo(
      id: 37,
      name: 'Gambit',
      description: 'Enemy gets 2, you get 2 concentrated',
      category: PerkCategory.utility,
      requiresTarget: false,
    ),
    38: PerkInfo(
      id: 38,
      name: 'Steal',
      description: 'Enemy -1, you +1 random',
      category: PerkCategory.offensive,
      requiresTarget: false,
    ),
    39: PerkInfo(
      id: 39,
      name: 'Rush',
      description: 'Both +2 on lane, you -1 elsewhere',
      category: PerkCategory.offensive,
    ),

    // Deferred Perks (Slot 4)
    40: PerkInfo(
      id: 40,
      name: 'Enlist',
      description: '+1 now, capture enemy next turn',
      category: PerkCategory.offensive,
    ),
    41: PerkInfo(
      id: 41,
      name: 'Ambush',
      description: '+1 now, remove enemy next turn',
      category: PerkCategory.offensive,
    ),
    42: PerkInfo(
      id: 42,
      name: 'Reinforce',
      description: '+1 now, +1 more next turn',
      category: PerkCategory.utility,
    ),

    // Duration Perks (Slot 4)
    50: PerkInfo(
      id: 50,
      name: 'Capture',
      description: 'Removed enemies become yours here',
      category: PerkCategory.offensive,
    ),

    // Raid Perks (Slot 4)
    51: PerkInfo(
      id: 51,
      name: 'Raid',
      description: 'Place on enemy side, roll next turn',
      category: PerkCategory.offensive,
    ),

    // Counter Perk (Slot 4)
    48: PerkInfo(
      id: 48,
      name: 'Nullify',
      description: 'Cancel all triggers on your lane',
      category: PerkCategory.utility,
    ),
  };

  static PerkInfo? getPerk(int id) => perks[id];

  /// Get display name for a perk by name string (used by lane effect indicators)
  static String getDisplayName(String perkName) {
    final lower = perkName.toLowerCase();
    for (final perk in perks.values) {
      if (perk.name.toLowerCase() == lower) return perk.name;
    }
    return perkName;
  }
}

/// Widget displaying a single perk card
class PerkCard extends StatelessWidget {
  final int perkId;
  final String perkName;
  final bool isSelected;
  final bool isEnabled;
  final VoidCallback? onTap;

  const PerkCard({
    super.key,
    required this.perkId,
    required this.perkName,
    this.isSelected = false,
    this.isEnabled = true,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final perkInfo = PerkDefinitions.getPerk(perkId);
    final isPass = perkId == 0;

    return GestureDetector(
      onTap: isEnabled ? onTap : null,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: isSelected
              ? (perkInfo?.categoryColor ?? Colors.grey).withOpacity(0.3)
              : (isEnabled ? Colors.grey.shade800 : Colors.grey.shade900),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: isSelected
                ? (perkInfo?.categoryColor ?? Colors.white)
                : (isEnabled ? Colors.grey.shade600 : Colors.grey.shade700),
            width: isSelected ? 2 : 1,
          ),
          boxShadow: isSelected
              ? [
                  BoxShadow(
                    color: (perkInfo?.categoryColor ?? Colors.white).withOpacity(0.3),
                    blurRadius: 8,
                    spreadRadius: 1,
                  )
                ]
              : null,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Category icon and name
            Row(
              children: [
                if (perkInfo != null && !isPass)
                  Icon(
                    perkInfo.categoryIcon,
                    size: 16,
                    color: perkInfo.categoryColor,
                  ),
                if (perkInfo != null && !isPass) const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    perkInfo?.name ?? perkName,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      color: isEnabled ? Colors.white : Colors.grey.shade500,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            // Description
            Text(
              perkInfo?.description ?? '',
              style: TextStyle(
                fontSize: 10,
                color: isEnabled ? Colors.grey.shade400 : Colors.grey.shade600,
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}

/// Compact perk card for the selection panel
class CompactPerkCard extends StatelessWidget {
  final int perkId;
  final String perkName;
  final bool isSelected;
  final bool isEnabled;
  final VoidCallback? onTap;

  const CompactPerkCard({
    super.key,
    required this.perkId,
    required this.perkName,
    this.isSelected = false,
    this.isEnabled = true,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final perkInfo = PerkDefinitions.getPerk(perkId);
    final isPass = perkId == 0;

    return GestureDetector(
      onTap: isEnabled ? onTap : null,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected
              ? (perkInfo?.categoryColor ?? Colors.grey).withOpacity(0.3)
              : (isEnabled ? Colors.grey.shade800 : Colors.grey.shade900),
          borderRadius: BorderRadius.circular(6),
          border: Border.all(
            color: isSelected
                ? (perkInfo?.categoryColor ?? Colors.white)
                : (isEnabled ? Colors.grey.shade600 : Colors.grey.shade700),
            width: isSelected ? 2 : 1,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (perkInfo != null && !isPass)
              Icon(
                perkInfo.categoryIcon,
                size: 14,
                color: isEnabled ? perkInfo.categoryColor : Colors.grey.shade600,
              ),
            if (perkInfo != null && !isPass) const SizedBox(width: 6),
            Text(
              perkInfo?.name ?? perkName,
              style: TextStyle(
                fontSize: 11,
                fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                color: isEnabled ? Colors.white : Colors.grey.shade500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
