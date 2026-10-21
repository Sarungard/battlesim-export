import { describe, it, expect } from 'vitest'
import { actorViewToCreature, buildSaveFile, averageOf, averageSaveBonus, extraAttackCount, safeFormula, slugify } from '../scripts/convert.mjs'

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
    { name: 'Shortsword', toHit: 7, damage: '1d6 + 4', damageWithoutMod: '1d6', attackType: 'melee', properties: ['fin', 'lgt'] },
    { name: 'Oathbow', toHit: 9, damage: '1d8 + 4', damageWithoutMod: '1d8', attackType: 'ranged', properties: ['amm', 'hvy', 'two', 'mgc'] },
    { name: 'Staff', toHit: 4, damage: '1d6 + 1', damageWithoutMod: '1d6', attackType: 'melee', properties: ['ver'] },
  ],
  spells: [
    { name: "Hunter's Mark", slug: 'hunter-s-mark', level: 1, method: 'spell', prepared: 1 },
    { name: 'Cure Wounds', slug: 'cure-wounds', level: 1, method: 'spell', prepared: 1 },
    { name: 'Jump', slug: 'jump', level: 1, method: 'spell', prepared: 1 },
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

  it('puts the strongest weapon first in the action slot', () => {
    const actionSlotAttacks = creature.actions.filter(action => action.actionSlot === 0 && action.type === 'atk')
    expect(actionSlotAttacks[0]).toMatchObject({ name: 'Oathbow', toHit: 9, dpr: '1d8 + 4', targets: 1, target: 'enemy with least HP' })
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
    expect(byName('Cure Wounds')).toMatchObject({ type: 'heal', amount: '1d8 + 3', target: 'ally with the least HP', condition: 'ally at 0 HP' })
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
      { name: 'Longsword', toHit: 9, damage: '1d8 + 5', damageWithoutMod: '1d8', attackType: 'melee', properties: ['ver'] },
      { name: 'Handaxe', toHit: 9, damage: '1d6 + 5', damageWithoutMod: '1d6', attackType: 'melee', properties: ['lgt', 'thr'] },
      { name: 'Dagger', toHit: 9, damage: '1d4 + 5', damageWithoutMod: '1d4', attackType: 'melee', properties: ['fin', 'lgt', 'thr'] },
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
      { name: 'Shortsword', toHit: 5, damage: '1d6 + 3', damageWithoutMod: '1d6', attackType: 'melee', properties: ['fin', 'lgt'] },
      { name: 'Dagger', toHit: 5, damage: '1d4 + 3', damageWithoutMod: '1d4', attackType: 'melee', properties: ['fin', 'lgt', 'thr'] },
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
      { name: 'Sacred Flame', slug: 'sacred-flame', level: 0, method: 'spell', prepared: 0 },
      { name: 'Bless', slug: 'bless', level: 1, method: 'spell', prepared: 1 },
      { name: 'Healing Word', slug: 'healing-word', level: 1, method: 'spell', prepared: 1 },
      { name: 'Spiritual Weapon', slug: 'spiritual-weapon', level: 2, method: 'spell', prepared: 0 },
    ],
  })
  const creature = actorViewToCreature(cleric, makeId)
  const byName = name => creature.actions.find(action => action.name === name)

  it('uses the best damaging cantrip as a save-based attack with the spell DC', () => {
    expect(byName('Sacred Flame')).toMatchObject({ type: 'atk', useSaves: true, toHit: 14, dpr: '2d8', targets: 1 })
    expect(byName('Unarmed Strike')).toBeUndefined()
  })

  it('turns Bless into a BattleSim template action limited by level 1 slots', () => {
    const bless = creature.actions.find(action => action.type === 'template')
    expect(bless).toMatchObject({ freq: { reset: 'lr', uses: 4 }, condition: 'not used yet', templateOptions: { templateName: 'Bless' } })
  })

  it('maps Healing Word to a bonus-action heal', () => {
    expect(byName('Healing Word')).toMatchObject({ actionSlot: 1, type: 'heal', amount: '1d4 + 3' })
  })

  it('skips unprepared leveled spells when something is prepared', () => {
    expect(byName('Spiritual Weapon')).toBeUndefined()
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
      spells: [{ name: 'Hypnotic Pattern', slug: 'hypnotic-pattern', level: 3, method: 'pact', prepared: 1 }],
    }), makeId)
    expect(warlock.actions.find(action => action.type === 'template')).toMatchObject({ freq: { reset: 'sr', uses: 2 }, templateOptions: { templateName: 'Hypnotic Pattern', saveDC: 10 } })
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
