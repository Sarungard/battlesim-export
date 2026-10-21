import { readActor } from './readActor.mjs'
import { actorViewToCreature, buildSaveFile } from './convert.mjs'

export async function openExportDialog() {
  const characters = game.actors.filter(actor => actor.type === 'character' && actor.isOwner)
  const selection = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize('BATTLESIM.DialogTitle') },
    position: { width: 420 },
    content: dialogContent(characters),
    buttons: [
      {
        action: 'export',
        label: game.i18n.localize('BATTLESIM.Export'),
        icon: 'fa-solid fa-file-export',
        default: true,
        callback: (_event, button) => new (foundry.applications.ux?.FormDataExtended ?? globalThis.FormDataExtended)(button.form).object,
      },
      { action: 'cancel', label: game.i18n.localize('BATTLESIM.Cancel'), icon: 'fa-solid fa-xmark' },
    ],
  })
  if (!selection || selection === 'cancel') return null

  const chosen = characters.filter(actor => selection[`actor.${actor.id}`])
  if (!chosen.length) {
    ui.notifications.warn(game.i18n.localize('BATTLESIM.NoCharacters'))
    return null
  }
  return exportParty(chosen, selection.name || defaultSaveName())
}

export function exportParty(actors, name = defaultSaveName()) {
  const creatures = actors.map(actor => actorViewToCreature(readActor(actor)))
  const saveFile = buildSaveFile(creatures, name)
  downloadJson(saveFile, `${name}.json`)
  ui.notifications.info(game.i18n.format('BATTLESIM.Done', { count: creatures.length }))
  return saveFile
}

function defaultSaveName() {
  return game.world.title
}

function dialogContent(characters) {
  const rows = characters.map(actor => `
    <label style="display:flex;align-items:center;gap:.5rem;margin:.25rem 0">
      <input type="checkbox" name="actor.${actor.id}" ${actor.hasPlayerOwner ? 'checked' : ''} style="flex:0 0 auto">
      <img src="${actor.img}" alt="" style="flex:0 0 28px;width:28px;height:28px;object-fit:cover;border-radius:50%;border:none">
      <span style="flex:1 1 auto">${foundry.utils.escapeHTML(actor.name)}</span>
    </label>`).join('')
  return `
    <div class="form-group">
      <label>${game.i18n.localize('BATTLESIM.SaveName')}</label>
      <input type="text" name="name" value="${foundry.utils.escapeHTML(defaultSaveName())}">
    </div>
    <fieldset>
      <legend>${game.i18n.localize('BATTLESIM.Characters')}</legend>
      <div style="max-height:50vh;overflow-y:auto;padding-right:.25rem">${rows}</div>
    </fieldset>`
}

function downloadJson(data, filename) {
  const save = foundry.utils.saveDataToFile ?? globalThis.saveDataToFile
  save(JSON.stringify(data), 'application/json', filename)
}
