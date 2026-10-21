// Pure conversion from an actor view (see readActor.mjs) to a BattleSim Creature.
// No Foundry globals here, so this file is unit-testable in plain Node.

export const SLOT = {
  action: 0,
  bonusAction: 1,
  reaction: 4,
  other1: 5,
  other2: 6,
  beforeEncounter: -3,
}

const ENEMY_LEAST_HP = 'enemy with least HP'
const ALLY_LEAST_HP = 'ally with the least HP'
const SELF = 'self'

const SPELL_TEMPLATES = {
  'bane': { templateName: 'Bane', needsDC: true, condition: 'not used yet' },
  'bless': { templateName: 'Bless', condition: 'not used yet' },
  'fireball': { templateName: 'Fireball', needsToHit: true, condition: 'enemy count multiple' },
  'heal': { templateName: 'Heal', condition: 'ally under half HP' },
  'hypnotic-pattern': { templateName: 'Hypnotic Pattern', needsDC: true, condition: 'enemy count multiple' },
  'meteor-swarm': { templateName: 'Meteor Swarm', needsToHit: true, condition: 'enemy count multiple' },
  'shield': { templateName: 'Shield', condition: 'is under half HP' },
}

const HEALING_SPELLS = {
  'cure-wounds': { slot: SLOT.action, dice: '1d8' },
  'healing-word': { slot: SLOT.bonusAction, dice: '1d4' },
}

const DAMAGE_CANTRIPS = {
  'fire-bolt': { die: 'd10', save: false },
  'eldritch-blast': { die: 'd10', save: false, beams: true },
  'ray-of-frost': { die: 'd8', save: false },
  'chill-touch': { die: 'd8', save: false },
  'shocking-grasp': { die: 'd8', save: false },
  'produce-flame': { die: 'd8', save: false },
  'primal-savagery': { die: 'd10', save: false },
  'thorn-whip': { die: 'd6', save: false },
  'sacred-flame': { die: 'd8', save: true },
  'toll-the-dead': { die: 'd12', save: true },
  'word-of-radiance': { die: 'd6', save: true },
  'frostbite': { die: 'd6', save: true },
  'thunderclap': { die: 'd6', save: true },
  'poison-spray': { die: 'd12', save: true },
  'acid-splash': { die: 'd6', save: true },
  'mind-sliver': { die: 'd6', save: true },
  'vicious-mockery': { die: 'd4', save: true },
}

export function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export function actorViewToCreature(view, makeId = randomId) {
  const ctx = { view, makeId, has: slug => view.features.includes(slug) }
  const attackCount = extraAttackCount(view)
  const weaponAttacks = buildWeaponAttacks(ctx, attackCount)
  const actions = [
    ...buildSpellActions(ctx),
    ...weaponAttacks,
    ...buildCantripAttacks(ctx),
    ...buildFallbackAttack(ctx, weaponAttacks),
    ...buildClassRiders(ctx, weaponAttacks[0]),
  ]
  return {
    id: makeId(),
    mode: 'custom',
    name: view.name,
    count: 1,
    hp: view.hp,
    AC: view.ac,
    saveBonus: averageSaveBonus(view.saves),
    actions,
  }
}

export function buildSaveFile(creatures, name, now = Date.now()) {
  return {
    updated: now,
    name,
    players: creatures,
    encounters: [{ monsters: [], monstersSurprised: false, playersSurprised: false }],
  }
}

export function averageSaveBonus(saves) {
  const values = Object.values(saves)
  if (!values.length) return 0
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length)
}

export function extraAttackCount(view) {
  const fighter = view.classes.fighter ?? 0
  if (fighter >= 20) return 4
  if (fighter >= 11) return 3
  if (view.features.includes('extra-attack')) return 2
  return 1
}

export function averageOf(formula) {
  if (typeof formula === 'number') return formula
  let total = 0
  const normalized = String(formula).replace(/\s+/g, '').replace(/-/g, '+-')
  for (const term of normalized.split('+').filter(Boolean)) {
    const dice = term.match(/^(-?)(\d*)d(\d+)$/)
    if (dice) {
      const count = dice[2] === '' ? 1 : Number(dice[2])
      const sign = dice[1] === '-' ? -1 : 1
      total += sign * count * (Number(dice[3]) + 1) / 2
    } else if (!isNaN(Number(term))) {
      total += Number(term)
    }
  }
  return total
}

export function safeFormula(formula) {
  if (typeof formula === 'number') return formula
  const text = String(formula ?? '').trim()
  if (!text) return 0
  if (/^[0-9d+\-*/()\s]+$/.test(text) && !/d\D|d$/.test(text.replace(/\d+d\d+/g, 'X'))) return text
  return averageOf(text)
}

function buildWeaponAttacks(ctx, attackCount) {
  const { view, makeId } = ctx
  const ranked = view.weapons
    .filter(weapon => weapon.toHit !== undefined && weapon.damage)
    .map(weapon => ({ weapon, expected: averageOf(weapon.damage) }))
    .sort((a, b) => b.expected - a.expected)
  if (!ranked.length) return []

  const main = ranked[0].weapon
  const attacks = [{
    id: makeId(),
    name: attackCount > 1 ? `${main.name} x${attackCount}` : main.name,
    actionSlot: SLOT.action,
    type: 'atk',
    freq: 'at will',
    condition: 'default',
    targets: attackCount,
    target: ENEMY_LEAST_HP,
    toHit: main.toHit,
    dpr: safeFormula(main.damage),
  }]

  const offhand = ranked.slice(1).map(r => r.weapon).find(weapon => isLightMelee(weapon) && isLightMelee(main))
  if (offhand) attacks.push({
    id: makeId(),
    name: `${offhand.name} (off-hand)`,
    actionSlot: SLOT.bonusAction,
    type: 'atk',
    freq: 'at will',
    condition: 'default',
    targets: 1,
    target: ENEMY_LEAST_HP,
    toHit: offhand.toHit,
    dpr: safeFormula(ctx.has('fighting-style-two-weapon-fighting') ? offhand.damage : offhand.damageWithoutMod),
  })
  return attacks
}

function isLightMelee(weapon) {
  return weapon.attackType === 'melee' && weapon.properties.includes('lgt')
}

function cantripDice(level) {
  if (level >= 17) return 4
  if (level >= 11) return 3
  if (level >= 5) return 2
  return 1
}

function buildCantripAttacks(ctx) {
  const { view, makeId } = ctx
  const cantrips = usableSpells(view)
    .filter(spell => spell.level === 0 && DAMAGE_CANTRIPS[spell.slug])
    .map(spell => ({ spell, info: DAMAGE_CANTRIPS[spell.slug] }))
  if (!cantrips.length) return []
  const dice = cantripDice(view.level)
  const ranked = cantrips
    .map(({ spell, info }) => {
      const count = info.beams ? 1 : dice
      const beams = info.beams ? dice : 1
      const dpr = `${count}${info.die}` + (info.beams && view.features.includes('agonizing-blast') ? ` + ${Math.max(0, view.spellMod)}` : '')
      return { spell, info, beams, dpr, expected: averageOf(dpr) * beams }
    })
    .sort((a, b) => b.expected - a.expected)
  const best = ranked[0]
  return [{
    id: makeId(),
    name: best.beams > 1 ? `${best.spell.name} x${best.beams}` : best.spell.name,
    actionSlot: SLOT.action,
    type: 'atk',
    freq: 'at will',
    condition: 'default',
    targets: best.beams,
    target: ENEMY_LEAST_HP,
    toHit: best.info.save ? view.spellDC : view.spellAttack,
    useSaves: best.info.save || undefined,
    dpr: best.dpr,
  }]
}

function buildFallbackAttack(ctx, weaponAttacks) {
  const { view, makeId } = ctx
  const hasAnyAttack = weaponAttacks.length > 0 || usableSpells(view).some(spell => spell.level === 0 && DAMAGE_CANTRIPS[spell.slug])
  if (hasAnyAttack) return []
  const strMod = view.abilityMods?.str ?? 0
  return [{
    id: makeId(),
    name: 'Unarmed Strike',
    actionSlot: SLOT.action,
    type: 'atk',
    freq: 'at will',
    condition: 'default',
    targets: 1,
    target: ENEMY_LEAST_HP,
    toHit: view.pb + strMod,
    dpr: 1 + strMod,
  }]
}

function usableSpells(view) {
  const anyPrepared = view.spells.some(spell => spell.prepared >= 1)
  return view.spells.filter(spell => {
    if (spell.level === 0) return true
    if (spell.method && spell.method !== 'spell') return true
    return !anyPrepared || spell.prepared >= 1
  })
}

function slotFrequency(view, spellLevel) {
  const regular = Object.entries(view.slots)
    .filter(([level, max]) => Number(level) >= spellLevel && max > 0)
    .reduce((sum, [, max]) => sum + max, 0)
  const ownLevel = view.slots[spellLevel] ?? 0
  if (ownLevel > 0) return { reset: 'lr', uses: ownLevel }
  if (regular > 0) return { reset: 'lr', uses: regular }
  if (view.pactSlots.max > 0 && view.pactSlots.level >= spellLevel) return { reset: 'sr', uses: view.pactSlots.max }
  return null
}

function buildSpellActions(ctx) {
  const { view, makeId } = ctx
  const actions = []
  for (const spell of usableSpells(view)) {
    if (spell.level === 0) continue
    const freq = slotFrequency(view, spell.level)
    if (!freq) continue

    const template = SPELL_TEMPLATES[spell.slug]
    if (template) {
      const templateOptions = { templateName: template.templateName }
      if (template.needsDC) templateOptions.saveDC = view.spellDC
      if (template.needsToHit) templateOptions.toHit = view.spellDC
      actions.push({ id: makeId(), type: 'template', freq, condition: template.condition, templateOptions })
      continue
    }

    const healing = HEALING_SPELLS[spell.slug]
    if (healing) {
      actions.push({
        id: makeId(),
        name: spell.name,
        actionSlot: healing.slot,
        type: 'heal',
        freq,
        condition: 'ally at 0 HP',
        targets: 1,
        target: ALLY_LEAST_HP,
        amount: `${healing.dice} + ${Math.max(0, view.spellMod)}`,
      })
      continue
    }

    if (spell.slug === 'hunter-s-mark') {
      actions.push({
        id: makeId(),
        name: "Hunter's Mark",
        actionSlot: SLOT.bonusAction,
        type: 'buff',
        freq,
        condition: 'not used yet',
        targets: 1,
        target: SELF,
        buff: { duration: 'entire encounter', damage: '1d6' },
      })
    }
  }
  return actions
}

function buildClassRiders(ctx, mainAttack) {
  const { view, makeId, has } = ctx
  const riders = []
  const rogue = view.classes.rogue ?? 0
  const barbarian = view.classes.barbarian ?? 0
  const fighter = view.classes.fighter ?? 0
  const paladin = view.classes.paladin ?? 0

  if (rogue > 0 && has('sneak-attack')) riders.push({
    id: makeId(),
    name: 'Sneak Attack',
    actionSlot: SLOT.other1,
    type: 'buff',
    freq: 'at will',
    condition: 'default',
    targets: 1,
    target: SELF,
    buff: { duration: 'until next attack made', damage: `${Math.ceil(rogue / 2)}d6` },
  })

  if (has('uncanny-dodge')) riders.push({
    id: makeId(),
    name: 'Uncanny Dodge',
    actionSlot: SLOT.other2,
    type: 'buff',
    freq: 'at will',
    condition: 'default',
    targets: 1,
    target: SELF,
    buff: { duration: 'until next attack taken', damageTakenMultiplier: 0.5 },
  })

  if (barbarian > 0 && has('rage')) riders.push({
    id: makeId(),
    name: 'Rage',
    actionSlot: SLOT.bonusAction,
    type: 'buff',
    freq: { reset: 'lr', uses: rageUses(barbarian) },
    condition: 'not used yet',
    targets: 1,
    target: SELF,
    buff: { duration: 'entire encounter', damageTakenMultiplier: 0.5, damage: rageDamage(barbarian) },
  })

  if (fighter > 0 && has('action-surge') && mainAttack) riders.push({
    ...mainAttack,
    id: makeId(),
    name: `Action Surge: ${mainAttack.name}`,
    actionSlot: SLOT.other1,
    freq: { reset: 'sr', uses: fighter >= 17 ? 2 : 1 },
  })

  if (fighter > 0 && has('second-wind')) riders.push({
    id: makeId(),
    name: 'Second Wind',
    actionSlot: SLOT.bonusAction,
    type: 'heal',
    freq: { reset: 'sr', uses: 1 },
    condition: 'is under half HP',
    targets: 1,
    target: SELF,
    amount: `1d10 + ${fighter}`,
  })

  const smiteUses = (view.slots[1] ?? 0) + (view.slots[2] ?? 0)
  if (paladin >= 2 && has('divine-smite') && smiteUses > 0 && mainAttack) riders.push({
    id: makeId(),
    name: 'Divine Smite',
    actionSlot: SLOT.other1,
    type: 'buff',
    freq: { reset: 'lr', uses: smiteUses },
    condition: 'default',
    targets: 1,
    target: SELF,
    buff: { duration: 'until next attack made', damage: '2d8' },
  })

  return riders
}

function rageUses(level) {
  if (level >= 17) return 6
  if (level >= 12) return 5
  if (level >= 6) return 4
  if (level >= 3) return 3
  return 2
}

function rageDamage(level) {
  if (level >= 16) return 4
  if (level >= 9) return 3
  return 2
}

function randomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}
