package perks

// PerkID represents the unique identifier for a perk
// These IDs are permanent and gaps are intentional
type PerkID int

const (
	// Fixed Commons (Slots 1-2)
	PerkPlaceAnother PerkID = 1
	PerkRemoveEnemy  PerkID = 2

	// Protection & Control
	PerkFreeze PerkID = 4
	PerkCloak  PerkID = 22
	PerkBlind  PerkID = 23

	// Placement Triggers
	PerkPortal    PerkID = 24
	PerkTrap      PerkID = 25
	PerkMirror    PerkID = 26
	PerkEcho      PerkID = 27
	PerkShockwave PerkID = 28

	// Removal Triggers
	PerkHydra    PerkID = 29
	PerkBackfire PerkID = 30
	PerkAbsorb   PerkID = 46

	// Conversion Perks
	PerkSplit    PerkID = 31
	PerkKamikaze PerkID = 32

	// Repositioning (Your Pieces)
	PerkRegroup  PerkID = 33
	PerkScatter  PerkID = 35
	PerkSignal   PerkID = 43

	// Repositioning (Enemy Pieces)
	PerkDisrupt  PerkID = 34
	PerkDisperse PerkID = 36
	PerkScramble PerkID = 13

	// Trade Perks
	PerkGambit PerkID = 37
	PerkSteal  PerkID = 38
	PerkRush   PerkID = 39

	// Deferred Perks
	PerkEnlist    PerkID = 40
	PerkAmbush    PerkID = 41
	PerkReinforce PerkID = 42

	// Duration Perks
	PerkSanctuary PerkID = 49
	PerkCapture   PerkID = 50

	// Raid Perks
	PerkRaid      PerkID = 51
	PerkRetaliate PerkID = 52

	// Counter Perk
	PerkNullify PerkID = 48
)

// PerkCategory represents the category of a perk
type PerkCategory string

const (
	CategoryOffensive PerkCategory = "offensive"
	CategoryDefensive PerkCategory = "defensive"
	CategoryUtility   PerkCategory = "utility"
)

// PerkTiming represents when a perk takes effect
type PerkTiming string

const (
	TimingInstant  PerkTiming = "instant"
	TimingTrigger  PerkTiming = "trigger"
	TimingDuration PerkTiming = "duration"
	TimingDeferred PerkTiming = "deferred"
)

// PerkTarget represents what the perk targets
type PerkTarget string

const (
	TargetYourLane      PerkTarget = "yourLane"
	TargetEnemyLane     PerkTarget = "enemyLane"
	TargetYourPiece     PerkTarget = "yourPiece"
	TargetEnemyPiece    PerkTarget = "enemyPiece"
	TargetTwoYourLanes  PerkTarget = "twoYourLanes"
	TargetTwoEnemyLanes PerkTarget = "twoEnemyLanes"
	TargetAuto          PerkTarget = "auto" // No selection required
)

// PerkSlotPool represents which slot pool a perk belongs to
type PerkSlotPool int

const (
	PoolFixed      PerkSlotPool = 0 // Always available in slots 1-2
	PoolSlot3      PerkSlotPool = 3 // React & Protect pool
	PoolSlot4      PerkSlotPool = 4 // Act & Disrupt pool
)

// PerkDefinition contains all metadata about a perk
type PerkDefinition struct {
	ID          PerkID
	Name        string
	Description string
	Category    PerkCategory
	Target      PerkTarget
	Timing      PerkTiming
	Duration    int          // For duration/trigger perks, how many turns
	SlotPool    PerkSlotPool
}

// AllPerks contains definitions for all 32 perks
var AllPerks = map[PerkID]*PerkDefinition{
	// Fixed Commons (always available)
	PerkPlaceAnother: {
		ID:          PerkPlaceAnother,
		Name:        "PlaceAnother",
		Description: "Place 1 of your pieces on any lane you choose",
		Category:    CategoryOffensive,
		Target:      TargetYourLane,
		Timing:      TimingInstant,
		SlotPool:    PoolFixed,
	},
	PerkRemoveEnemy: {
		ID:          PerkRemoveEnemy,
		Name:        "RemoveEnemy",
		Description: "Remove 1 enemy piece from any lane you choose (frontmost)",
		Category:    CategoryOffensive,
		Target:      TargetEnemyLane,
		Timing:      TimingInstant,
		SlotPool:    PoolFixed,
	},

	// Protection & Control (Slot 3 Pool)
	PerkFreeze: {
		ID:          PerkFreeze,
		Name:        "Freeze",
		Description: "Block enemy placement on this lane for 1 turn",
		Category:    CategoryDefensive,
		Target:      TargetYourLane,
		Timing:      TimingDuration,
		Duration:    1,
		SlotPool:    PoolSlot3,
	},
	PerkCloak: {
		ID:          PerkCloak,
		Name:        "Cloak",
		Description: "Hide ALL your pieces from opponent for 2 turns",
		Category:    CategoryDefensive,
		Target:      TargetAuto,
		Timing:      TimingDuration,
		Duration:    2,
		SlotPool:    PoolSlot3,
	},

	// Placement Triggers (Slot 3 Pool)
	PerkPortal: {
		ID:          PerkPortal,
		Name:        "Portal",
		Description: "Enemy pieces placed here teleport to random lane",
		Category:    CategoryDefensive,
		Target:      TargetEnemyLane,
		Timing:      TimingTrigger,
		Duration:    2,
		SlotPool:    PoolSlot3,
	},
	PerkTrap: {
		ID:          PerkTrap,
		Name:        "Trap",
		Description: "Enemy pieces placed here vanish",
		Category:    CategoryDefensive,
		Target:      TargetEnemyLane,
		Timing:      TimingTrigger,
		Duration:    2,
		SlotPool:    PoolSlot3,
	},
	PerkMirror: {
		ID:          PerkMirror,
		Name:        "Mirror",
		Description: "When enemy places here, you get 2 pieces on same lane",
		Category:    CategoryDefensive,
		Target:      TargetEnemyLane,
		Timing:      TimingTrigger,
		Duration:    1,
		SlotPool:    PoolSlot3,
	},
	PerkEcho: {
		ID:          PerkEcho,
		Name:        "Echo",
		Description: "When enemy places here, you get 2 pieces on random lanes",
		Category:    CategoryDefensive,
		Target:      TargetEnemyLane,
		Timing:      TimingTrigger,
		Duration:    1,
		SlotPool:    PoolSlot3,
	},
	PerkShockwave: {
		ID:          PerkShockwave,
		Name:        "Shockwave",
		Description: "When enemy places here, they lose 2 pieces from other lanes",
		Category:    CategoryOffensive,
		Target:      TargetEnemyLane,
		Timing:      TimingTrigger,
		Duration:    1,
		SlotPool:    PoolSlot3,
	},

	// Removal Triggers (Slot 3 Pool)
	PerkHydra: {
		ID:          PerkHydra,
		Name:        "Hydra",
		Description: "When enemy removes your piece here, you get 2 on random lanes",
		Category:    CategoryDefensive,
		Target:      TargetYourLane,
		Timing:      TimingTrigger,
		Duration:    1,
		SlotPool:    PoolSlot3,
	},
	PerkBackfire: {
		ID:          PerkBackfire,
		Name:        "Backfire",
		Description: "When enemy removes your piece here, they lose 2 pieces",
		Category:    CategoryOffensive,
		Target:      TargetYourLane,
		Timing:      TimingTrigger,
		Duration:    1,
		SlotPool:    PoolSlot3,
	},
	PerkAbsorb: {
		ID:          PerkAbsorb,
		Name:        "Absorb",
		Description: "When enemy removes your piece here, it reappears elsewhere",
		Category:    CategoryDefensive,
		Target:      TargetYourLane,
		Timing:      TimingTrigger,
		Duration:    1,
		SlotPool:    PoolSlot3,
	},

	// Repositioning - Your Pieces (Slot 3 Pool)
	PerkRegroup: {
		ID:          PerkRegroup,
		Name:        "Regroup",
		Description: "Swap ALL your pieces between 2 chosen lanes",
		Category:    CategoryUtility,
		Target:      TargetTwoYourLanes,
		Timing:      TimingInstant,
		SlotPool:    PoolSlot3,
	},
	PerkScatter: {
		ID:          PerkScatter,
		Name:        "Scatter",
		Description: "Move all your pieces from 1 lane to random other lanes",
		Category:    CategoryUtility,
		Target:      TargetYourLane,
		Timing:      TimingInstant,
		SlotPool:    PoolSlot3,
	},
	PerkSignal: {
		ID:          PerkSignal,
		Name:        "Signal",
		Description: "Place piece, next turn pull piece from most populated lane",
		Category:    CategoryUtility,
		Target:      TargetYourLane,
		Timing:      TimingDeferred,
		SlotPool:    PoolSlot3,
	},

	// Duration Perks (Slot 3 Pool)
	PerkSanctuary: {
		ID:          PerkSanctuary,
		Name:        "Sanctuary",
		Description: "Your removed pieces go to this lane for 2 turns",
		Category:    CategoryDefensive,
		Target:      TargetYourLane,
		Timing:      TimingDuration,
		Duration:    2,
		SlotPool:    PoolSlot3,
	},
	PerkRetaliate: {
		ID:          PerkRetaliate,
		Name:        "Retaliate",
		Description: "When enemy places here, spawn raid piece on their side",
		Category:    CategoryOffensive,
		Target:      TargetYourLane,
		Timing:      TimingTrigger,
		Duration:    1,
		SlotPool:    PoolSlot3,
	},

	// ---- Slot 4 Pool: Act & Disrupt ----

	// Offensive Perks (Slot 4 Pool)
	PerkScramble: {
		ID:          PerkScramble,
		Name:        "Scramble",
		Description: "Redistribute ALL enemy pieces randomly",
		Category:    CategoryOffensive,
		Target:      TargetAuto,
		Timing:      TimingInstant,
		SlotPool:    PoolSlot4,
	},
	PerkBlind: {
		ID:          PerkBlind,
		Name:        "Blind",
		Description: "Hide enemy pieces FROM THEM for 2 turns",
		Category:    CategoryOffensive,
		Target:      TargetAuto,
		Timing:      TimingDuration,
		Duration:    2,
		SlotPool:    PoolSlot4,
	},

	// Conversion Perks (Slot 4 Pool)
	PerkSplit: {
		ID:          PerkSplit,
		Name:        "Split",
		Description: "Sacrifice 1 piece, gain 2 on random lanes",
		Category:    CategoryUtility,
		Target:      TargetYourPiece,
		Timing:      TimingInstant,
		SlotPool:    PoolSlot4,
	},
	PerkKamikaze: {
		ID:          PerkKamikaze,
		Name:        "Kamikaze",
		Description: "Sacrifice 1 piece, enemy loses 2 random pieces",
		Category:    CategoryOffensive,
		Target:      TargetYourPiece,
		Timing:      TimingInstant,
		SlotPool:    PoolSlot4,
	},

	// Repositioning - Enemy Pieces (Slot 4 Pool)
	PerkDisrupt: {
		ID:          PerkDisrupt,
		Name:        "Disrupt",
		Description: "Swap ALL enemy pieces between 2 chosen lanes",
		Category:    CategoryOffensive,
		Target:      TargetTwoEnemyLanes,
		Timing:      TimingInstant,
		SlotPool:    PoolSlot4,
	},
	PerkDisperse: {
		ID:          PerkDisperse,
		Name:        "Disperse",
		Description: "Move all enemy pieces from 1 lane to random other lanes",
		Category:    CategoryOffensive,
		Target:      TargetEnemyLane,
		Timing:      TimingInstant,
		SlotPool:    PoolSlot4,
	},

	// Trade Perks (Slot 4 Pool)
	PerkGambit: {
		ID:          PerkGambit,
		Name:        "Gambit",
		Description: "Enemy gets 3 pieces spread, you get 2 concentrated",
		Category:    CategoryUtility,
		Target:      TargetAuto,
		Timing:      TimingInstant,
		SlotPool:    PoolSlot4,
	},
	PerkSteal: {
		ID:          PerkSteal,
		Name:        "Steal",
		Description: "Enemy loses 1 random piece, you gain 1 random piece",
		Category:    CategoryOffensive,
		Target:      TargetAuto,
		Timing:      TimingInstant,
		SlotPool:    PoolSlot4,
	},
	PerkRush: {
		ID:          PerkRush,
		Name:        "Rush",
		Description: "Both players get 2 pieces on same lane, you lose 1 elsewhere",
		Category:    CategoryOffensive,
		Target:      TargetYourLane,
		Timing:      TimingInstant,
		SlotPool:    PoolSlot4,
	},

	// Deferred Perks (Slot 4 Pool)
	PerkEnlist: {
		ID:          PerkEnlist,
		Name:        "Enlist",
		Description: "Place piece, next turn capture enemy piece and move both",
		Category:    CategoryOffensive,
		Target:      TargetYourLane,
		Timing:      TimingDeferred,
		SlotPool:    PoolSlot4,
	},
	PerkAmbush: {
		ID:          PerkAmbush,
		Name:        "Ambush",
		Description: "Place piece, next turn remove enemy from lane or adjacent",
		Category:    CategoryOffensive,
		Target:      TargetYourLane,
		Timing:      TimingDeferred,
		SlotPool:    PoolSlot4,
	},
	PerkReinforce: {
		ID:          PerkReinforce,
		Name:        "Reinforce",
		Description: "Place piece, next turn get bonus piece on same lane",
		Category:    CategoryUtility,
		Target:      TargetYourLane,
		Timing:      TimingDeferred,
		SlotPool:    PoolSlot4,
	},

	// Duration Perks (Slot 4 Pool)
	PerkCapture: {
		ID:          PerkCapture,
		Name:        "Capture",
		Description: "Enemy pieces you remove become yours on this lane",
		Category:    CategoryOffensive,
		Target:      TargetYourLane,
		Timing:      TimingDuration,
		Duration:    2,
		SlotPool:    PoolSlot4,
	},

	// Raid Perks (Slot 4 Pool)
	PerkRaid: {
		ID:          PerkRaid,
		Name:        "Raid",
		Description: "Place piece on enemy's side, roll for recruits next turn",
		Category:    CategoryOffensive,
		Target:      TargetEnemyLane,
		Timing:      TimingDeferred,
		SlotPool:    PoolSlot4,
	},

	// Counter Perk (Slot 4 Pool)
	PerkNullify: {
		ID:          PerkNullify,
		Name:        "Nullify",
		Description: "Cancel all triggers and markers on your lane",
		Category:    CategoryUtility,
		Target:      TargetYourLane,
		Timing:      TimingInstant,
		SlotPool:    PoolSlot4,
	},
}

// Slot3Pool contains all perks available in slot 3 (React & Protect)
var Slot3Pool = []PerkID{
	PerkFreeze, PerkCloak, PerkPortal, PerkTrap, PerkMirror, PerkEcho,
	PerkShockwave, PerkHydra, PerkBackfire, PerkAbsorb, PerkRegroup,
	PerkScatter, PerkSignal, PerkSanctuary, PerkRetaliate,
}

// Slot4Pool contains all perks available in slot 4 (Act & Disrupt)
var Slot4Pool = []PerkID{
	PerkScramble, PerkBlind, PerkSplit, PerkKamikaze, PerkDisrupt,
	PerkDisperse, PerkGambit, PerkSteal, PerkRush, PerkEnlist,
	PerkAmbush, PerkReinforce, PerkCapture, PerkRaid, PerkNullify,
}

// GetPerkDefinition returns the definition for a perk ID
func GetPerkDefinition(id PerkID) *PerkDefinition {
	return AllPerks[id]
}

// GetPerkName returns the name of a perk
func GetPerkName(id PerkID) string {
	if def := AllPerks[id]; def != nil {
		return def.Name
	}
	return "Unknown"
}
