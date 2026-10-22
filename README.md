# BattleSim Export

A Foundry VTT module for the dnd5e system that exports your party as a save file for
[Trekiros' BattleSim](https://github.com/Trekiros/battleSim), the 5e encounter simulator.

## Installation

In Foundry (or Forge: **Game Configuration**, **Modules**, **Install Module**) paste this manifest URL
into the installer and press **Install**:

```
https://github.com/Sarungard/battlesim-export/releases/latest/download/module.json
```

Updates arrive through the same URL whenever a new release is published.
Zips for a specific version are on the [releases page](https://github.com/Sarungard/battlesim-export/releases).

## How to use

1. Enable the module in your world.
2. Open the **Actors** sidebar tab and press **Export to BattleSim** in the footer.
3. Pick the characters (player-owned characters are pre-selected), name the save file, press **Export**.
4. In BattleSim press **Load Adventuring Day**, then the upload button, and choose the downloaded JSON.

Your party appears as custom creatures with their real hit points, armour class, save bonus and attacks.
Re-export whenever the party levels up or changes gear.

Macro users can call the same thing from a script:

```js
game.modules.get('battlesim-export').api.openExportDialog()
```

## What gets converted

| Foundry | BattleSim |
|---|---|
| Max HP, AC, proficiency, level | `hp`, `AC`, derived from the prepared actor |
| Six saving throw bonuses | `saveBonus` (rounded average, as BattleSim expects) |
| Best equipped weapon with an attack activity | Action-slot attack with dnd5e's own to-hit and damage (fighting styles, magic bonus and ability modifier included) |
| Extra "damage" activities on that weapon (Oathbow's 3d6 vs sworn enemy, Flame Tongue's fire) | Folded into the attack's damage, as long as the activity has no limited uses |
| Extra Attack, fighter 11 / 20 | Attack count 2 / 3 / 4 |
| Two light weapons | Bonus-action off-hand attack |
| Spell attack activities (Fire Bolt, Scorching Ray, Guiding Bolt) | Attacks with the spell attack bonus; multi-target spells become that many hits |
| Spell save activities with damage (Fireball, Sacred Flame, Spirit Guardians) | Save-based attacks with your spell DC, half damage on a save when the spell says so, two targets for areas |
| Plain damage activities (Magic Missile) | Unsaveable hits |
| Heal activities (Cure Wounds, Healing Word) | Heals on the least-hurt ally; action heals wait for an ally under half HP, bonus-action heals for one at 0 HP |
| Hold Person, Hold Monster, Blindness/Deafness | Debuffs applying Paralyzed or Blinded with a repeated save |
| Cantrips | Dice scaled by character level (Eldritch Blast gets beams instead) |
| Sneak Attack, Uncanny Dodge | Rogue riders scaled by rogue level |
| Rage | Bonus-action buff with rage damage and resistance, uses per long rest |
| Action Surge, Second Wind | Extra attack use per short rest, bonus-action self heal |
| Divine Smite | Extra 2d8 on hit, limited by level 1 and 2 slots |
| Hunter's Mark | Bonus-action damage buff for the encounter |
| Bless, Bane, Hypnotic Pattern, Shield | BattleSim's own action templates, limited by spell slots |

Spell uses come from your slots at the spell's level (pact slots reset on a short rest).
Leveled spells count only when prepared, unless nothing on the sheet is marked prepared.
Because BattleSim fires the first usable action in a slot, only the strongest damage spell of each
spell level and the single best cantrip are exported; heals, debuffs and templates always come through.

## Known limits

- Multiclass characters use the sum of class levels; only the class riders above are modelled.
- Sharpshooter and Great Weapon Master are not applied (BattleSim treats them as a manual toggle too).
- Spells are exported at their base slot level; upcasting is ignored.
- A weapon rider only exports if the item has it as a "damage" activity. Older embedded items may only describe it in text; re-import the item from the compendium or add the activity.
- Vorpal and other critical-hit effects have no BattleSim equivalent and are skipped.
- Utility and buff spells without a template above are not exported. Open the creature in BattleSim's advanced editor to add them.

## Development

```bash
npm install
npm test
npm run package
```

`npm run package` writes `dist/battlesim-export.zip`, the asset each GitHub release ships next to its `module.json`.

## Requirements

Foundry VTT 12 to 14 with the dnd5e system 4.0 or newer (activities-based items).
Live-tested on Foundry 13.351 with dnd5e 5.1.10; the fields and helpers it uses were audited against dnd5e 6.0.6 and the Foundry 14 API.
