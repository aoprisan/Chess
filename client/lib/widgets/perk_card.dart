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

/// Static perk definitions
class PerkDefinitions {
  static const Map<int, PerkInfo> perks = {
    0: PerkInfo(
      id: 0,
      name: 'Pass',
      description: 'Skip perk selection and end turn',
      category: PerkCategory.utility,
      requiresTarget: false,
    ),
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
    4: PerkInfo(
      id: 4,
      name: 'Freeze',
      description: 'Block enemy placement for 1 turn',
      category: PerkCategory.defensive,
    ),
    13: PerkInfo(
      id: 13,
      name: 'Scramble',
      description: 'Redistribute all enemy pieces',
      category: PerkCategory.offensive,
      requiresTarget: false,
    ),
    31: PerkInfo(
      id: 31,
      name: 'Split',
      description: 'Sacrifice 1, gain 2 elsewhere',
      category: PerkCategory.utility,
    ),
    32: PerkInfo(
      id: 32,
      name: 'Kamikaze',
      description: 'Sacrifice 1, enemy loses 2',
      category: PerkCategory.offensive,
    ),
    33: PerkInfo(
      id: 33,
      name: 'Regroup',
      description: 'Swap your pieces between 2 lanes',
      category: PerkCategory.utility,
    ),
    34: PerkInfo(
      id: 34,
      name: 'Disrupt',
      description: 'Swap enemy pieces between 2 lanes',
      category: PerkCategory.offensive,
    ),
    35: PerkInfo(
      id: 35,
      name: 'Scatter',
      description: 'Move your pieces to random lanes',
      category: PerkCategory.utility,
    ),
    36: PerkInfo(
      id: 36,
      name: 'Disperse',
      description: 'Move enemy pieces to random lanes',
      category: PerkCategory.offensive,
    ),
    38: PerkInfo(
      id: 38,
      name: 'Steal',
      description: 'Enemy -1, you +1 random',
      category: PerkCategory.offensive,
      requiresTarget: false,
    ),
  };

  static PerkInfo? getPerk(int id) => perks[id];
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
