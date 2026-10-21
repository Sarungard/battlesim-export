import { describe, it, expect } from 'vitest'
import { actorViewToCreature, buildSaveFile, averageOf, averageSaveBonus, extraAttackCount, safeFormula, slugify, scaleCantripFormula } from '../scripts/convert.mjs'

let counter = 0
const makeId = () => `id-${++counter}`

function baseView(overrides) {
  return {
    name: 'Test',
    level: 1,
    pb: 2,
    hp: 10,
    ac: 12,
    saves: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
    abilityMods: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
    spellDC: 10,
    spellMod: 0,
    spellAttack: 2,
    slots: {},
    pactSlots: { max: 0, level: 0 },
    classes: {},
    features: [],
    weapons: [],
    spells: [],
    ...overrides,
  }
}

function spell(name, level, activities, extra = {}) {
  return { name, slug: slugify(name), level, method: 'spell', prepared: 1, activities, ...extra }
}

const attack = (damage, toHit, extra = {}) => ({ type: 'attack', activation: 'action', toHit, damage, dc: null, halfOnSave: false, targets: 1, aoe: false, ...extra })
const save = (damage, dc, extra = {}) => ({ type: 'save', activation: 'action', toHit: 0, damage, dc, halfOnSave: true, targets: 1, aoe: false, ...extra })
const heal = (damage, extra = {}) => ({ type: 'heal', activation: 'action', toHit: 0, damage, dc: null, halfOnSave: false, targets: 1, aoe: false, ...extra })
const utility = () => ({ type: 'utility', activation: 'action', toHit: 0, damage: '', dc: null, halfOnSave: false, targets: null, aoe: false })

const rogueRanger = baseView({
  name: 'Lathriel',
  level: 8,
  pb: 3,
  hp: 65,
  ac: 15,
  saves: { str: 4, dex: 7, con: 2, int: 0, wis: 3, cha: 0 },
  spellDC: 14,
  spellMod: 3,
  spellAttack: 6,
  slots: { 1: 3 },
  classes: { rogue: 5, ranger: 3 },
  features: ['sneak-attack', 'uncanny-dodge', 'fighting-style-archery', 'cunning-action'],
  weapons: [
    { name: 'Shortsword', toHit: 7, damage: '1d6 + 4', damageWithoutMod: '1d6', extraDamage: [], attackType: 'melee', properties: ['fin', 'lgt'] },
    { name: 'Oathbow', toHit: 9, damage: '1d8 + 4', damageWithoutMod: '1d8', extraDamage: ['3d6'], attackType: 'ranged', properties: ['amm', 'hvy', 'two', 'mgc'] },
    { name: 'Staff', toHit: 4, damage: '1d6 + 1', damageWithoutMod: '1d6', extraDamage: [], attackType: 'melee', properties: ['ver'] },
  ],
  spells: [
    spell("Hunter's Mark", 1, [utility()]),
    spell('Cure Wounds', 1, [heal('1d8 + 3')]),
    spell('Jump', 1, [utility()]),
  ],
})

describe('helpers', () => {
  it('averages dice formulas', () => {
    expect(averageOf('1d8 + 4')).toBe(8.5)
    expect(averageOf('2d6 + 3 - 1')).toBe(9)
    expect(averageOf(7)).toBe(7)
  })

  it('rounds the mean save bonus', () => {
    expect(averageSaveBonus({ str: 4, dex: 7, con: 2, int: 0, wis: 3, cha: 0 })).toBe(3)
    expect(averageSaveBonus({ str: 1, dex: 1 })).toBe(1)
  })

  it('keeps clean formulas and replaces unresolved ones by their average', () => {
    expect(safeFormula('1d8 + 4')).toBe('1d8 + 4')
    expect(safeFormula('1d8 + @mod')).toBe(4.5)
    expect(safeFormula('')).toBe(0)
  })

  it('slugifies names like dnd5e identifiers', () => {
    expect(slugify("Hunter's Mark")).toBe('hunter-s-mark')
    expect(slugify('Fighting Style: Archery')).toBe('fighting-style-archery')
  })

  it('counts attacks from Extra Attack and fighter levels', () => {
    expect(extraAttackCount(baseView({}))).toBe(1)
    expect(extraAttackCount(baseView({ features: ['extra-attack'] }))).toBe(2)
    expect(extraAttackCount(baseView({ classes: { fighter: 11 }, features: ['extra-attack'] }))).toBe(3)
    expect(extraAttackCount(baseView({ classes: { fighter: 20 }, features: ['extra-attack'] }))).toBe(4)
  })

  it('scales cantrip dice by character level', () => {
    expect(scaleCantripFormula('1d10', 1)).toBe('1d10')
    expect(scaleCantripFormula('1d10', 5)).toBe('2d10')
    expect(scaleCantripFormula('1d8 + 2', 11)).toBe('3d8 + 2')
    expect(scaleCantripFormula('d6', 17)).toBe('4d6')
  })
})

describe('rogue/ranger multiclass', () => {
  const creature = actorViewToCreature(rogueRanger, makeId)
  const byName = name => creature.actions.find(action => action.name === name)

  it('copies the derived stats', () => {
    expect(creature.mode).toBe('custom')
    expect(creature.hp).toBe(65)
    expect(creature.AC).toBe(15)
    expect(creature.saveBonus).toBe(3)
    expect(creature.count).toBe(1)
  })

  it('folds the weapon rider damage into the strongest weapon attack', () => {
    const actionSlotAttacks = creature.actions.filter(action => action.actionSlot === 0 && action.type === 'atk')
    expect(actionSlotAttacks[0]).toMatchObject({ name: 'Oathbow', toHit: 9, dpr: '1d8 + 4 + 3d6', targets: 1, target: 'enemy with least HP' })
  })

  it('does not add an off-hand attack for a two-handed main weapon', () => {
    expect(creature.actions.some(action => action.name.includes('off-hand'))).toBe(false)
  })

  it('scales sneak attack from rogue levels only', () => {
    expect(byName('Sneak Attack')).toMatchObject({ actionSlot: 5, type: 'buff', buff: { duration: 'until next attack made', damage: '3d6' } })
    expect(byName('Uncanny Dodge')).toMatchObject({ actionSlot: 6, buff: { damageTakenMultiplier: 0.5 } })
  })

  it("maps Hunter's Mark and Cure Wounds from the known spells", () => {
    expect(byName("Hunter's Mark")).toMatchObject({ actionSlot: 1, type: 'buff', freq: { reset: 'lr', uses: 3 }, condition: 'not used yet' })
    expect(byName('Cure Wounds')).toMatchObject({ type: 'heal', amount: '1d8 + 3', target: 'ally with the least HP', condition: 'ally under half HP' })
    expect(byName('Jump')).toBeUndefined()
  })

  it('gives every action a unique id', () => {
    const ids = creature.actions.map(action => action.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('fighter', () => {
  const fighter = baseView({
    name: 'Brom',
    level: 11,
    pb: 4,
    hp: 104,
    ac: 19,
    classes: { fighter: 11 },
    features: ['extra-attack', 'action-surge', 'second-wind', 'fighting-style-two-weapon-fighting'],
    weapons: [
      { name: 'Longsword', toHit: 9, damage: '1d8 + 5', damageWithoutMod: '1d8', extraDamage: [], attackType: 'melee', properties: ['ver'] },
      { name: 'Handaxe', toHit: 9, damage: '1d6 + 5', damageWithoutMod: '1d6', extraDamage: [], attackType: 'melee', properties: ['lgt', 'thr'] },
      { name: 'Dagger', toHit: 9, damage: '1d4 + 5', damageWithoutMod: '1d4', extraDamage: [], attackType: 'melee', properties: ['fin', 'lgt', 'thr'] },
    ],
  })
  const creature = actorViewToCreature(fighter, makeId)
  const byName = name => creature.actions.find(action => action.name === name)

  it('attacks three times at fighter 11', () => {
    expect(byName('Longsword x3')).toMatchObject({ targets: 3, toHit: 9, dpr: '1d8 + 5' })
  })

  it('does not pair an off-hand attack with a non-light main weapon', () => {
    expect(creature.actions.some(action => action.name.includes('off-hand'))).toBe(false)
  })

  it('adds Action Surge as a second use of the main attack and Second Wind as a bonus heal', () => {
    expect(byName('Action Surge: Longsword x3')).toMatchObject({ actionSlot: 5, type: 'atk', targets: 3, freq: { reset: 'sr', uses: 1 } })
    expect(byName('Second Wind')).toMatchObject({ actionSlot: 1, type: 'heal', amount: '1d10 + 11', condition: 'is under half HP' })
  })
})

describe('two light weapons', () => {
  const rogue = baseView({
    classes: { rogue: 3 },
    features: ['sneak-attack'],
    weapons: [
      { name: 'Shortsword', toHit: 5, damage: '1d6 + 3', damageWithoutMod: '1d6', extraDamage: [], attackType: 'melee', properties: ['fin', 'lgt'] },
      { name: 'Dagger', toHit: 5, damage: '1d4 + 3', damageWithoutMod: '1d4', extraDamage: [], attackType: 'melee', properties: ['fin', 'lgt', 'thr'] },
    ],
  })
  const creature = actorViewToCreature(rogue, makeId)

  it('adds a bonus-action off-hand attack without the ability modifier', () => {
    expect(creature.actions.find(action => action.name === 'Dagger (off-hand)')).toMatchObject({ actionSlot: 1, dpr: '1d4', toHit: 5 })
  })
})

describe('cleric without a weapon', () => {
  const cleric = baseView({
    name: 'Mira',
    level: 5,
    pb: 3,
    hp: 38,
    ac: 18,
    spellDC: 14,
    spellMod: 3,
    spellAttack: 6,
    slots: { 1: 4, 2: 3, 3: 2 },
    classes: { cleric: 5 },
    features: ['channel-divinity'],
    spells: [
      spell('Sacred Flame', 0, [save('1d8', 14, { halfOnSave: false })], { prepared: 0 }),
      spell('Bless', 1, [utility()]),
      spell('Guiding Bolt', 1, [attack('4d6', 6)]),
      spell('Healing Word', 1, [heal('1d4 + 3', { activation: 'bonus' })]),
      spell('Spiritual Weapon', 2, [attack('1d8 + 3', 6, { activation: 'bonus' })], { prepared: 0 }),
    ],
  })
  const creature = actorViewToCreature(cleric, makeId)
  const byName = name => creature.actions.find(action => action.name === name)

  it('scales the damaging cantrip and keeps it save-based with the spell DC', () => {
    expect(byName('Sacred Flame')).toMatchObject({ type: 'atk', useSaves: true, toHit: 14, dpr: '2d8', targets: 1, freq: 'at will' })
    expect(byName('Sacred Flame').halfOnSave).toBeUndefined()
    expect(byName('Unarmed Strike')).toBeUndefined()
  })

  it('turns Bless into a BattleSim template action limited by level 1 slots', () => {
    const bless = creature.actions.find(action => action.type === 'template')
    expect(bless).toMatchObject({ freq: { reset: 'lr', uses: 4 }, condition: 'not used yet', templateOptions: { templateName: 'Bless', target: 'ally with the highest DPR' } })
  })

  it('converts a spell attack and a bonus-action heal from their activities', () => {
    expect(byName('Guiding Bolt')).toMatchObject({ type: 'atk', toHit: 6, dpr: '4d6', freq: { reset: 'lr', uses: 4 }, actionSlot: 0 })
    expect(byName('Healing Word')).toMatchObject({ actionSlot: 1, type: 'heal', amount: '1d4 + 3', condition: 'ally at 0 HP' })
  })

  it('skips unprepared leveled spells when something is prepared', () => {
    expect(byName('Spiritual Weapon')).toBeUndefined()
  })
})

describe('wizard spell list', () => {
  const wizard = baseView({
    name: 'Ezri',
    level: 5,
    pb: 3,
    hp: 27,
    ac: 12,
    spellDC: 14,
    spellMod: 4,
    spellAttack: 7,
    slots: { 1: 4, 2: 3, 3: 2 },
    classes: { wizard: 5 },
    spells: [
      spell('Ray of Frost', 0, [attack('1d8', 7)]),
      spell('Eldritch Blast', 0, [attack('1d10', 7)]),
      spell('Magic Missile', 1, [{ type: 'damage', activation: 'action', toHit: 0, damage: '1d4 + 1', dc: null, halfOnSave: false, targets: 1, aoe: false }]),
      spell('Scorching Ray', 2, [attack('2d6', 7, { targets: 3 })]),
      spell('Hold Person', 2, [save('', 14)]),
      spell('Fireball', 3, [save('8d6', 14, { targets: null, aoe: true })]),
      spell('Spirit Guardians', 3, [save('3d8', 14, { targets: null, aoe: true })]),
    ],
  })
  const creature = actorViewToCreature(wizard, makeId)
  const byName = name => creature.actions.find(action => action.name === name)

  it('keeps only the strongest damage spell per spell level, highest level first', () => {
    const leveled = creature.actions.filter(action => action.type === 'atk' && action.freq !== 'at will').map(action => action.name)
    expect(leveled).toEqual(['Fireball', 'Scorching Ray', 'Magic Missile'])
    expect(byName('Spirit Guardians')).toBeUndefined()
  })

  it('models an area save spell with half damage on a save and a multi-enemy condition', () => {
    expect(byName('Fireball')).toMatchObject({ useSaves: true, halfOnSave: true, toHit: 14, dpr: '8d6', targets: 2, condition: 'enemy count multiple', freq: { reset: 'lr', uses: 2 } })
  })

  it('turns a multi-target spell attack into that many hits', () => {
    expect(byName('Scorching Ray')).toMatchObject({ toHit: 7, dpr: '2d6', targets: 3, freq: { reset: 'lr', uses: 3 } })
  })

  it('makes plain damage spells unsaveable hits', () => {
    expect(byName('Magic Missile')).toMatchObject({ useSaves: true, toHit: 100, dpr: '1d4 + 1' })
    expect(byName('Magic Missile').halfOnSave).toBeUndefined()
  })

  it('maps a save without damage to a condition debuff when the spell is known', () => {
    expect(byName('Hold Person')).toMatchObject({ type: 'debuff', saveDC: 14, buff: { condition: 'Paralyzed', duration: 'repeat the save each round' } })
  })

  it('keeps one cantrip, scaled, and gives Eldritch Blast beams instead of dice', () => {
    const cantrips = creature.actions.filter(action => action.freq === 'at will' && action.type === 'atk')
    expect(cantrips).toHaveLength(1)
    expect(cantrips[0]).toMatchObject({ name: 'Eldritch Blast x2', targets: 2, dpr: '1d10', toHit: 7 })
    expect(byName('Ray of Frost')).toBeUndefined()
  })

  it('orders leveled spells before the cantrip in the action slot', () => {
    const slotZero = creature.actions.filter(action => action.actionSlot === 0).map(action => action.name)
    expect(slotZero.indexOf('Fireball')).toBeLessThan(slotZero.indexOf('Eldritch Blast x2'))
  })
})

describe('fallbacks', () => {
  it('gives a creature with no attack an unarmed strike', () => {
    const commoner = actorViewToCreature(baseView({ abilityMods: { str: 2 }, pb: 2 }), makeId)
    expect(commoner.actions).toEqual([expect.objectContaining({ name: 'Unarmed Strike', toHit: 4, dpr: 3 })])
  })

  it('uses pact slots on a short rest when there are no regular slots', () => {
    const warlock = actorViewToCreature(baseView({
      level: 5,
      pactSlots: { max: 2, level: 3 },
      spells: [spell('Hypnotic Pattern', 3, [utility()], { method: 'pact' })],
    }), makeId)
    expect(warlock.actions.find(action => action.type === 'template')).toMatchObject({ freq: { reset: 'sr', uses: 2 }, templateOptions: { templateName: 'Hypnotic Pattern', saveDC: 10, target: 'enemy with most HP' } })
  })

  it('ignores a spell whose activities carry nothing usable', () => {
    const bard = actorViewToCreature(baseView({ slots: { 1: 2 }, spells: [spell('Disguise Self', 1, [utility()])] }), makeId)
    expect(bard.actions.map(action => action.name)).toEqual(['Unarmed Strike'])
  })
})

describe('buildSaveFile', () => {
  it('matches the BattleSim save-file layout with one empty encounter', () => {
    const creature = actorViewToCreature(rogueRanger, makeId)
    const file = buildSaveFile([creature], 'Mamszisesh', 1234)
    expect(file).toEqual({
      updated: 1234,
      name: 'Mamszisesh',
      players: [creature],
      encounters: [{ monsters: [], monstersSurprised: false, playersSurprised: false }],
    })
  })
})
