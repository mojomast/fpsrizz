import type { AdventureAction, AdventureCommand, AdventureState } from '../../contracts/adventure.ts';
import { ExperienceRole, Profile, createCommandQueue, definePlugin, isObject } from '@bulkhead/sdk';
import { Adventure, AdventureActionResolved, AdventureChapters } from '../../contracts/adventure.ts';
import { loadChapter } from './validation.ts';

const MAX_QUEUE = 128;
const MAX_HISTORY = 4096;
const MAX_SNAPSHOT = 300000;

export default definePlugin({
  register(ctx) {
    ctx.provideRole(ExperienceRole, 'story/adventure', {
      name: 'Point and click',
      description: 'Explore, converse and solve a story.',
      pointer: 'free',
      controls: [['Mouse / keyboard', 'Choose hotspots and dialogue'], ['Tab / Enter', 'Navigate and activate']],
    });
    ctx.contentKind('adventure-chapter', {
      description: 'A versioned room and action graph for an adventure.',
      load: loadChapter,
    });
    ctx.addValidator(v => {
      const id = v.preset.options.chapter;
      if (typeof id !== 'string' || !v.registries.has(AdventureChapters, id)) {
        v.reporter('story/adventure', 'options.chapter').error('select an enabled adventure chapter');
      }
      if (v.selectedRole(ExperienceRole) !== 'story/adventure') {
        v.reporter('story/adventure', 'roles.sdk/experience').error('select story/adventure as the experience');
      }
    });
  },
  activate(ctx) {
    const id = ctx.preset.options.chapter as string;
    const chapter = ctx.registries.require(AdventureChapters, id);
    const saveKey = `story/save/${id}`;
    const initial = (): AdventureState => ({
      chapter: id,
      room: chapter.start,
      inventory: [],
      flags: [...(chapter.initialFlags ?? [])],
      journal: [],
      message: chapter.intro,
      completed: (chapter.initialFlags ?? []).includes(chapter.victory.flag),
    });
    let state = initial();
    let history: string[] = [];
    const queue = createCommandQueue<AdventureCommand>(ctx, { capacity: MAX_QUEUE, normalize(command) {
      if (!isObject(command)) return undefined;
      const type = command.type;
      if (type === 'action') {
        const id = command.id;
        if (typeof id !== 'string' || id.length > 64 || Object.keys(command).some(k => k !== 'type' && k !== 'id')) return undefined;
        return { type, id };
      }
      if (type === 'save' || type === 'load' || type === 'reset') {
        if (Object.keys(command).some(k => k !== 'type')) return undefined;
        return { type };
      }
      return undefined;
    } });
    const apply = (s: AdventureState, action: AdventureAction): boolean => {
      if (action.room !== s.room || (action.once && s.flags.includes(action.once)) ||
          action.require?.some(x => !s.flags.includes(x)) || action.missing?.some(x => s.flags.includes(x)) ||
          action.items?.some(x => !s.inventory.includes(x)) || action.add?.some(x => s.inventory.includes(x))) return false;
      s.inventory = s.inventory.filter(x => !action.consume?.includes(x));
      for (const item of action.add ?? []) s.inventory.push(item);
      for (const flag of [...(action.flags ?? []), ...(action.once ? [action.once] : [])]) {
        if (!s.flags.includes(flag)) s.flags.push(flag);
      }
      if (action.journal && !s.journal.includes(action.journal)) s.journal.push(action.journal);
      if (action.move) s.room = action.move;
      s.message = action.text;
      s.completed = s.flags.includes(chapter.victory.flag);
      return true;
    };
    const profile = ctx.services.tryGet(Profile);
    ctx.services.provide(Adventure, {
      chapter,
      state: () => ({ ...state, inventory: [...state.inventory], flags: [...state.flags], journal: [...state.journal] }),
      enqueue: queue.enqueue,
    });
    ctx.systems.add({
      id: 'story/adventure.commands',
      phase: 'rules',
      update() {
        for (const command of queue.drainBatch()) {
          if (command.type === 'action') {
            const action = chapter.actions.find(x => x.id === command.id);
            if (history.length < MAX_HISTORY && action && apply(state, action)) {
              history.push(action.id);
              ctx.events.emit(AdventureActionResolved, { id: action.id, sound: action.sound });
            }
          } else if (command.type === 'reset') {
            state = initial();
            history = [];
          } else if (command.type === 'save') {
            try {
              const loaded = profile?.load();
              if (!profile || !loaded?.ok) { state.message = 'Save unavailable.'; continue; }
              const snapshot = JSON.stringify({ schema: 1, chapter: id, version: chapter.version, history });
              if (snapshot.length > MAX_SNAPSHOT) { state.message = 'Adventure save is too large.'; continue; }
              const result = profile.save({ values: { ...(loaded.value?.values ?? {}), [saveKey]: snapshot } });
              state.message = result.ok ? 'Adventure saved.' : 'Save unavailable.';
            } catch { state.message = 'Save unavailable.'; }
          } else {
            try {
              const loaded = profile?.load();
              const raw = loaded?.ok && loaded.value?.values[saveKey];
              if (typeof raw !== 'string' || raw.length > MAX_SNAPSHOT) { state.message = 'No valid adventure save found.'; continue; }
              const saved: unknown = JSON.parse(raw);
              if (!isObject(saved) || Object.keys(saved).some(k => !['schema', 'chapter', 'version', 'history'].includes(k)) ||
                  saved.schema !== 1 || saved.chapter !== id || saved.version !== chapter.version ||
                  !Array.isArray(saved.history) || saved.history.length > MAX_HISTORY) {
                state.message = 'Incompatible or corrupt adventure save.';
                continue;
              }
              const restored = initial();
              let ok = true;
              for (const actionId of saved.history) {
                const action = chapter.actions.find(x => x.id === actionId);
                if (!action || !apply(restored, action)) { ok = false; break; }
              }
              if (!ok) { state.message = 'Incompatible or corrupt adventure save.'; continue; }
              state = restored;
              history = [...saved.history] as string[];
              state.message = 'Adventure restored.';
            } catch { state.message = 'Incompatible or corrupt adventure save.'; }
          }
        }
      },
    });
  },
});
