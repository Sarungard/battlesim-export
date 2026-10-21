// Foundry-side adapter: turns a prepared dnd5e Actor into a plain view object for convert.mjs.
import { slugify } from './convert.mjs'

export function readActor(actor) {
  const system = actor.system
  const spell = system.attributes.spell ?? {}
  return {
    name: actor.name,
    level: system.details.level,
    pb: system.attributes.prof,
    hp: system.attributes.hp.max,
    ac: system.attributes.ac.value,
    saves: mapValues(system.abilities, ability => ability.save?.value ?? ability.mod),
    abilityMods: mapValues(system.abilities, ability => ability.mod),
    spellDC: spell.dc ?? 8 + system.attributes.prof,
    spellMod: spell.mod ?? 0,
    spellAttack: spell.attack ?? system.attributes.prof + (spell.mod ?? 0),
    slots: readSlots(system.spells),
    pactSlots: { max: system.spells?.pact?.max ?? 0, level: system.spells?.pact?.level ?? 0 },
    classes: mapValues(actor.classes ?? {}, cls => cls.system.levels),
    features: readFeatures(actor),
    weapons: actor.itemTypes.weapon.filter(item => item.system.equipped).map(readWeapon).filter(Boolean),
    spells: actor.itemTypes.spell.map(readSpell),
  }
}

function mapValues(object, fn) {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, fn(value)]))
}

function readSlots(spells) {
  const slots = {}
  for (let level = 1; level <= 9; level++) {
    const max = spells?.[`spell${level}`]?.max ?? 0
    if (max > 0) slots[level] = max
  }
  return slots
}

function readFeatures(actor) {
  const slugs = new Set()
  for (const item of actor.itemTypes.feat) {
    slugs.add(slugify(item.name))
    if (item.system.identifier) slugs.add(item.system.identifier)
  }
  return Array.from(slugs)
}

function readWeapon(item) {
  const activity = item.system.activities?.getByType?.('attack')?.[0]
  if (!activity) return null
  const attackMode = pickAttackMode(item)
  const rolls = activity.getDamageConfig(attackMode ? { attackMode } : {}).rolls ?? []
  return {
    name: item.name,
    toHit: parseInt(activity.labels?.modifier) || 0,
    damage: joinRolls(rolls, true),
    damageWithoutMod: joinRolls(rolls, false),
    attackType: activity.attack?.type?.value ?? 'melee',
    properties: Array.from(item.system.properties ?? []),
  }
}

function pickAttackMode(item) {
  const properties = item.system.properties ?? new Set()
  const hasShield = item.actor?.itemTypes.equipment.some(e => e.system.equipped && e.system.type?.value === 'shield')
  const otherWeapons = item.actor?.itemTypes.weapon.filter(w => w.system.equipped && w.id !== item.id) ?? []
  if (properties.has('ver') && !hasShield && otherWeapons.length === 0) return 'twoHanded'
  return null
}

function joinRolls(rolls, includeMod) {
  return rolls
    .map(roll => {
      const parts = roll.parts.filter(part => includeMod || part !== '@mod')
      if (!parts.length) return ''
      const RollClass = foundry.dice?.Roll ?? globalThis.Roll
      return new RollClass(parts.join(' + '), roll.data).formula
    })
    .filter(Boolean)
    .join(' + ')
}

function readSpell(item) {
  return {
    name: item.name,
    slug: slugify(item.name),
    level: item.system.level,
    method: item.system.method ?? item.system.preparation?.mode ?? 'spell',
    prepared: Number(item.system.prepared ?? item.system.preparation?.prepared ?? 0),
  }
}
