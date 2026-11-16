import { Adventure, AdventureActionResolved, Audio, SessionControl, ThemeRole, Ui, definePlugin } from '../../sdk/index.ts';
import type { AdventureCommand, Painter } from '../../sdk/index.ts';
import { STORY_CSS } from './styles.ts';

export default definePlugin({
  activate(ctx) {
    const ui = ctx.services.tryGet(Ui);
    const adventure = ctx.services.tryGet(Adventure);
    if (!ui || !adventure) return;
    ui.addStyles(ctx, STORY_CSS);
    const root = ui.mount(ctx, 'hud', 'story-ui');
    const doc = root.ownerDocument;
    const theme = ctx.role(ThemeRole)?.provider;
    const node = (tag: string, cls: string, parent: HTMLElement, text?: string): HTMLElement => {
      const el = doc.createElement(tag);
      el.className = cls;
      if (text !== undefined) el.textContent = text;
      parent.appendChild(el);
      return el;
    };
    const paint = (canvas: HTMLCanvasElement, painter: Painter | undefined): void => {
      if (!painter) { canvas.hidden = true; return; }
      canvas.hidden = false;
      canvas.width = painter.width;
      canvas.height = painter.height;
      const context = canvas.getContext('2d');
      if (context) painter.paint(context);
    };
    const wrap = node('main', 'story-wrap', root);
    const header = node('header', 'story-header', wrap);
    const title = node('div', '', header);
    node('div', 'story-kicker', title, adventure.chapter.subtitle);
    node('h1', '', title, adventure.chapter.name);
    node('div', 'story-kicker', header, adventure.chapter.tagline);
    const scene = node('section', 'story-scene', wrap);
    scene.setAttribute('aria-label', 'Scene and hotspots');
    const plate = doc.createElement('canvas');
    plate.className = 'story-plate';
    plate.setAttribute('aria-hidden', 'true');
    scene.appendChild(plate);
    node('div', 'story-illustration', scene);
    const sceneContent = node('div', 'story-scene-content', scene);
    node('div', 'story-kicker', sceneContent, 'Current location');
    const roomName = node('h2', '', sceneContent);
    const roomDescription = node('p', '', sceneContent);
    const actions = node('div', 'story-actions', sceneContent);
    actions.setAttribute('data-testid', 'story-actions');
    actions.setAttribute('role', 'group');
    actions.setAttribute('aria-label', 'Actions in this location');
    roomName.tabIndex = -1;
    const side = node('aside', 'story-side', wrap);
    node('h2', '', side, 'Your satchel');
    const inventory = node('ul', '', side);
    inventory.setAttribute('data-testid', 'story-inventory');
    node('div', 'story-divider', side);
    node('h2', '', side, 'Field journal');
    const journal = node('ul', '', side);
    journal.setAttribute('data-testid', 'story-journal');
    node('p', 'story-hint', side, adventure.chapter.hint);
    const controls = node('div', 'story-controls', side);
    const send = (command: AdventureCommand): void => {
      if (ctx.services.tryGet(SessionControl)?.playing !== false) adventure.enqueue(command);
    };
    for (const [label, type] of [['Save', 'save'], ['Load', 'load'], ['Start over', 'reset']] as const) {
      const button = node('button', '', controls, label) as HTMLButtonElement;
      button.type = 'button';
      button.dataset.testid = `story-${type}`;
      button.addEventListener('click', () => send({ type }));
    }
    const narrative = node('section', 'story-narrative', wrap);
    wrap.insertBefore(narrative, side);
    narrative.setAttribute('aria-live', 'polite');
    if (adventure.chapter.portrait && theme?.textures[adventure.chapter.portrait]) {
      const canvas = doc.createElement('canvas');
      canvas.className = 'story-portrait';
      paint(canvas, theme.textures[adventure.chapter.portrait]);
      narrative.appendChild(canvas);
    }
    node('h2', '', narrative, 'The story so far');
    const message = node('p', 'story-message', narrative);
    message.setAttribute('data-testid', 'story-message');
    const completion = node('section', 'story-completion', narrative);
    completion.dataset.testid = 'story-completion';
    node('h3', '', completion, adventure.chapter.victory.title);
    const outcome = node('p', 'story-outcome', completion);
    node('p', '', completion, adventure.chapter.victory.epilogue);
    completion.hidden = true;
    ctx.events.on(AdventureActionResolved, result => {
      if (result.sound) ctx.services.tryGet(Audio)?.play(result.sound);
    });
    let previous = '';
    let paintedArt = '';
    ctx.systems.addFrame({
      id: 'story/presentation.frame',
      update() {
        const state = adventure.state();
        const signature = JSON.stringify(state);
        if (signature === previous) return;
        previous = signature;
        const room = adventure.chapter.rooms.find(x => x.id === state.room);
        if (!room) return;
        scene.className = `story-scene story-motif-${room.motif}`;
        if (paintedArt !== room.art) {
          paintedArt = room.art;
          paint(plate, theme?.textures[room.art]);
        }
        roomName.textContent = room.name;
        roomDescription.textContent = room.description;
        message.textContent = state.message;
        message.classList.toggle('story-win', state.completed);
        completion.hidden = !state.completed;
        const ending = adventure.chapter.actions.find(action => action.flags?.includes(adventure.chapter.victory.flag) &&
          action.flags.every(flag => state.flags.includes(flag)) && (!action.once || state.flags.includes(action.once)));
        outcome.textContent = ending?.text ?? '';
        inventory.replaceChildren();
        for (const item of state.inventory) {
          const li = node('li', '', inventory);
          const definition = adventure.chapter.items[item];
          const icon = definition?.icon && theme?.textures[definition.icon];
          if (icon) {
            const canvas = doc.createElement('canvas');
            canvas.className = 'story-item-icon';
            canvas.setAttribute('aria-hidden', 'true');
            paint(canvas, icon);
            li.appendChild(canvas);
          }
          li.appendChild(doc.createTextNode(definition?.name ?? item));
        }
        if (!state.inventory.length) node('li', '', inventory, 'Your satchel is empty.');
        journal.replaceChildren();
        for (const entry of state.journal) node('li', '', journal, entry);
        if (!state.journal.length) node('li', '', journal, 'No clues recorded yet.');
        const focusedAction = actions.contains(doc.activeElement) ? (doc.activeElement as HTMLElement).dataset.testid : undefined;
        actions.replaceChildren();
        let restoredFocus = false;
        for (const action of adventure.chapter.actions.filter(x => x.room === state.room && (!x.once || !state.flags.includes(x.once)))) {
          const ready = !(action.require?.some(x => !state.flags.includes(x)) || action.missing?.some(x => state.flags.includes(x)) ||
            action.items?.some(x => !state.inventory.includes(x)) || action.add?.some(x => state.inventory.includes(x)));
          const button = node('button', '', actions, action.label) as HTMLButtonElement;
          button.type = 'button';
          button.dataset.testid = `story-action-${action.id}`;
          if (!ready) {
            button.setAttribute('aria-disabled', 'true');
            const missingItems = action.items?.filter(x => !state.inventory.includes(x)).map(x => adventure.chapter.items[x]?.name ?? x) ?? [];
            button.title = missingItems.length ? `Needed: ${missingItems.join(', ')}. Other clues may also be needed.` : 'Another clue or condition is needed first.';
          }
          button.addEventListener('click', () => {
            if (ctx.services.tryGet(SessionControl)?.playing === false) return;
            if (!ready) { message.textContent = button.title; return; }
            send({ type: 'action', id: action.id });
          });
          if (focusedAction === button.dataset.testid) { button.focus(); restoredFocus = true; }
        }
        if (focusedAction && !restoredFocus) roomName.focus();
      },
    });
  },
});
