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
const ENEMY_MOST_HP = 'enemy with most HP'
const ALLY_LEAST_HP = 'ally with the least HP'
const ALLY_HIGHEST_DPR = 'ally with the highest DPR'
const SELF = 'self'
const AOE_TARGETS = 2
const UNSAVEABLE_DC = 100

const SLOT_BY_ACTIVATION = { action: SLOT.action, bonus: SLOT.bonusAction, reaction: SLOT.reaction }

// Spells whose effect BattleSim cannot derive from dnd5e activity data. BattleSim's own templates
// carry no target unless noted, so one is supplied here.
const SPELL_TEMPLATES = {
  'bane': { templateName: 'Bane', needsDC: true, condition: 'not used yet', target: ENEMY_MOST_HP },
  'bless': { templateName: 'Bless', condition: 'not used yet', target: ALLY_HIGHEST_DPR },
  'hypnotic-pattern': { templateName: 'Hypnotic Pattern', needsDC: true, condition: 'enemy count multiple', target: ENEMY_MOST_HP },
  'shield': { templateName: 'Shield', condition: 'is under half HP' },
}

const SAVE_CONDITIONS = {
  'hold-person': 'Paralyzed',
  'hold-monster': 'Paralyzed',
  'blindness-deafness': 'Blinded',
}

export function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export function actorViewToCreature(view, makeId = randomId) {
  const ctx = { view, makeId, has: slug => view.features.includes(slug) }
  const attackCount = extraAttackCount(view)
  const weaponAttacks = buildWeaponAttacks(ctx, attackCount)
  const spells = buildSpellActions(ctx)
  const actions = [
    ...spells.leveled,
    ...weaponAttacks,
    ...spells.cantrips,
    ...buildFallbackAttack(ctx, weaponAttacks, spells.cantrips),
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

export function cantripDice(level) {
  if (level >= 17) return 4
  if (level >= 11) return 3
  if (level >= 5) return 2
  return 1
}

export function scaleCantripFormula(formula, level) {
  const multiplier = cantripDice(level)
  if (multiplier === 1) return formula
  return String(formula).replace(/(\d*)d(\d+)/, (_, count, die) => `${(count === '' ? 1 : Number(count)) * multiplier}d${die}`)
}

function buildWeaponAttacks(ctx, attackCount) {
  const { view, makeId } = ctx
  const ranked = view.weapons
    .filter(weapon => weapon.toHit !== undefined && weapon.damage)
    .map(weapon => ({ weapon, damage: [weapon.damage, ...(weapon.extraDamage ?? [])].join(' + ') }))
    .map(entry => ({ ...entry, expected: averageOf(entry.damage) }))
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
    dpr: safeFormula(ranked[0].damage),
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

function buildFallbackAttack(ctx, weaponAttacks, cantrips) {
  const { view, makeId } = ctx
  if (weaponAttacks.length || cantrips.some(action => action.type === 'atk')) return []
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

// Returns { leveled, cantrips }: leveled spells go before weapon attacks (limited uses first),
// cantrips after them. Only the strongest damage spell per spell level is kept, so one pool of
// slots is never spent twice.
function buildSpellActions(ctx) {
  const { view } = ctx
  const leveled = []
  const cantrips = []
  const bestDamageByLevel = new Map()

  for (const spell of usableSpells(view)) {
    const freq = spell.level === 0 ? 'at will' : slotFrequency(view, spell.level)
    if (!freq) continue
    for (const candidate of spellCandidates(ctx, spell, freq)) {
      if (spell.level === 0) {
        cantrips.push(candidate)
      } else if (candidate.expected === undefined) {
        leveled.push(candidate.action)
      } else {
        const current = bestDamageByLevel.get(spell.level)
        if (!current || candidate.expected > current.expected) bestDamageByLevel.set(spell.level, candidate)
      }
    }
  }

  const damageSpells = Array.from(bestDamageByLevel.entries())
    .sort(([a], [b]) => b - a)
    .map(([, candidate]) => candidate.action)
  const bestCantrip = cantrips.sort((a, b) => b.expected - a.expected)[0]

  return {
    leveled: [...damageSpells, ...leveled],
    cantrips: bestCantrip ? [bestCantrip.action] : [],
  }
}

// Each candidate is { action, expected }. `expected` is set only for damage dealers, which compete
// per spell level; heals, debuffs and templates always come through.
function spellCandidates(ctx, spell, freq) {
  const template = SPELL_TEMPLATES[spell.slug]
  if (template) return [{ action: templateAction(ctx, template, freq) }]
  if (spell.slug === 'hunter-s-mark') return [{ action: huntersMark(ctx, freq) }]

  const results = []
  for (const activity of spell.activities ?? []) {
    const candidate = activityCandidate(ctx, spell, activity, freq)
    if (candidate) results.push(candidate)
  }
  return results
}

function activityCandidate(ctx, spell, activity, freq) {
  const { view, makeId } = ctx
  const slot = SLOT_BY_ACTIVATION[activity.activation] ?? SLOT.action
  const base = { id: makeId(), name: spell.name, actionSlot: slot, freq }
  const hasDamage = !!activity.damage

  if (activity.type === 'heal' && hasDamage) {
    return { action: {
      ...base,
      type: 'heal',
      condition: slot === SLOT.bonusAction ? 'ally at 0 HP' : 'ally under half HP',
      targets: activity.targets ?? 1,
      target: ALLY_LEAST_HP,
      amount: safeFormula(activity.damage),
    } }
  }

  if (activity.type === 'save' && !hasDamage) {
    const condition = SAVE_CONDITIONS[spell.slug]
    if (!condition) return null
    return { action: {
      ...base,
      type: 'debuff',
      condition: 'default',
      targets: activity.aoe ? AOE_TARGETS : activity.targets ?? 1,
      target: ENEMY_LEAST_HP,
      saveDC: activity.dc ?? view.spellDC,
      buff: { duration: 'repeat the save each round', condition },
    } }
  }

  if (!hasDamage || !['attack', 'save', 'damage'].includes(activity.type)) return null

  const isCantrip = spell.level === 0
  const beams = isCantrip && spell.slug === 'eldritch-blast'
  const dpr = safeFormula(isCantrip && !beams ? scaleCantripFormula(activity.damage, view.level) : activity.damage)
  const targets = beams ? cantripDice(view.level) : activity.aoe ? AOE_TARGETS : activity.targets ?? 1
  const action = {
    ...base,
    name: beams && targets > 1 ? `${spell.name} x${targets}` : spell.name,
    type: 'atk',
    condition: activity.aoe ? 'enemy count multiple' : 'default',
    targets,
    target: ENEMY_LEAST_HP,
    dpr,
  }
  if (activity.type === 'attack') {
    action.toHit = activity.toHit || view.spellAttack
  } else {
    action.useSaves = true
    action.toHit = activity.type === 'damage' ? UNSAVEABLE_DC : activity.dc ?? view.spellDC
    if (activity.halfOnSave) action.halfOnSave = true
  }
  return { action, expected: averageOf(dpr) * targets }
}

function templateAction(ctx, template, freq) {
  const { view, makeId } = ctx
  const templateOptions = { templateName: template.templateName }
  if (template.needsDC) templateOptions.saveDC = view.spellDC
  if (template.target) templateOptions.target = template.target
  return { id: makeId(), type: 'template', freq, condition: template.condition, templateOptions }
}

function huntersMark(ctx, freq) {
  return {
    id: ctx.makeId(),
    name: "Hunter's Mark",
    actionSlot: SLOT.bonusAction,
    type: 'buff',
    freq,
    condition: 'not used yet',
    targets: 1,
    target: SELF,
    buff: { duration: 'entire encounter', damage: '1d6' },
  }
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
