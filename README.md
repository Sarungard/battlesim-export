# BattleSim Export

A Foundry VTT module for the dnd5e system that exports your party as a save file for
[Trekiros' BattleSim](https://github.com/Trekiros/battleSim), the 5e encounter simulator.

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
| Extra Attack, fighter 11 / 20 | Attack count 2 / 3 / 4 |
| Two light weapons | Bonus-action off-hand attack |
| Best damaging cantrip | Attack (or save-based attack with your spell DC) when no weapon is better |
| Sneak Attack, Uncanny Dodge | Rogue riders scaled by rogue level |
| Rage | Bonus-action buff with rage damage and resistance, uses per long rest |
| Action Surge, Second Wind | Extra attack use per short rest, bonus-action self heal |
| Divine Smite | Extra 2d8 on hit, limited by level 1 and 2 slots |
| Hunter's Mark | Bonus-action damage buff for the encounter |
| Cure Wounds, Healing Word | Heals that fire when an ally drops to 0 HP |
| Bless, Bane, Fireball, Hypnotic Pattern, Heal, Meteor Swarm, Shield | BattleSim's own action templates, limited by spell slots |

Spell uses come from your slots at the spell's level (pact slots reset on a short rest).
Leveled spells count only when prepared, unless nothing on the sheet is marked prepared.

## Known limits

- Multiclass characters use the sum of class levels; only the class riders above are modelled.
- Sharpshooter and Great Weapon Master are not applied (BattleSim treats them as a manual toggle too).
- Other spells and features are not exported. Open the creature in BattleSim's advanced editor to add them.

## Development

```bash
npm install
npm test
npm run package
```

`npm run package` writes `dist/battlesim-export.zip`, which Forge and Foundry can install directly.

## Requirements

Foundry VTT 12 to 14 with the dnd5e system 4.0 or newer (activities-based items).
Live-tested on Foundry 13.351 with dnd5e 5.1.10; the fields and helpers it uses were audited against dnd5e 6.0.6 and the Foundry 14 API.
