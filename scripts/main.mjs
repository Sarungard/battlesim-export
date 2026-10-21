import { readActor } from './readActor.mjs'
import { actorViewToCreature, buildSaveFile } from './convert.mjs'
import { openExportDialog, exportParty } from './exportDialog.mjs'

const MODULE_ID = 'battlesim-export'

Hooks.once('init', () => {
  game.modules.get(MODULE_ID).api = { openExportDialog, exportParty, readActor, actorViewToCreature, buildSaveFile }
})

Hooks.on('renderActorDirectory', (_app, element) => {
  if (game.system.id !== 'dnd5e') return
  const root = element instanceof HTMLElement ? element : element[0]
  const footer = root.querySelector('.directory-footer')
  if (!footer || footer.querySelector('[data-battlesim-export]')) return
  footer.appendChild(exportButton())
})

function exportButton() {
  const button = document.createElement('button')
  button.type = 'button'
  button.dataset.battlesimExport = ''
  button.innerHTML = `<i class="fa-solid fa-file-export" inert></i><span>${game.i18n.localize('BATTLESIM.Button')}</span>`
  button.addEventListener('click', () => openExportDialog())
  return button
}
