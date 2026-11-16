import type { AdventureChapter, ContentLoadContext } from '../../sdk/index.ts';
import { AdventureChapters, isObject } from '../../sdk/index.ts';

const IDENTIFIER = /^[a-z][a-z0-9-]{0,63}$/;
const THEME_KEY = /^[a-z][a-z0-9-]{0,63}$/;

/** Validates the entire chapter before registering any of it. */
export function loadChapter(data: unknown, c: ContentLoadContext): void {
  if (!isObject(data)) return void c.r.error('expected a chapter object');
  let valid = true;
  const error = (path: string, message: string): void => {
    valid = false;
    c.r.at(path).error(message);
  };
  const fields = (o: Record<string, unknown>, allowed: string[], path: string): void => {
    for (const key of Object.keys(o)) if (!allowed.includes(key)) error(`${path}.${key}`, 'unknown field');
  };
  const text = (value: unknown, path: string, max = 1000): void => {
    if (typeof value !== 'string' || !value.trim() || value.length > max) error(path, `expected non-empty text of at most ${max} characters`);
  };
  const identifier = (value: unknown, path: string): void => {
    if (typeof value !== 'string' || !IDENTIFIER.test(value)) error(path, 'expected a lowercase identifier of at most 64 characters');
  };
  const themeKey = (value: unknown, path: string): void => {
    if (typeof value !== 'string' || !THEME_KEY.test(value)) error(path, 'expected a theme key of at most 64 characters');
  };
  const list = (value: unknown, path: string, max: number): unknown[] => {
    if (!Array.isArray(value) || value.length > max) {
      error(path, `expected an array with at most ${max} entries`);
      return [];
    }
    return value;
  };
  const ids = (value: unknown, path: string): string[] => {
    const values = list(value, path, 64);
    for (const [i, item] of values.entries()) identifier(item, `${path}[${i}]`);
    if (new Set(values).size !== values.length) error(path, 'entries must be unique');
    return values.filter((item): item is string => typeof item === 'string');
  };

  fields(data, ['version', 'name', 'subtitle', 'tagline', 'hint', 'portrait', 'start', 'intro', 'initialFlags', 'victory', 'rooms', 'items', 'actions'], 'chapter');
  if (c.id.length > 100) error('id', 'chapter id must be at most 100 characters for profile storage');
  if (!Number.isSafeInteger(data.version) || (data.version as number) < 1) error('version', 'expected a positive integer');
  for (const key of ['name', 'subtitle', 'tagline', 'hint', 'intro']) text(data[key], key);
  identifier(data.start, 'start');
  if (data.portrait !== undefined) themeKey(data.portrait, 'portrait');
  const initialFlags = data.initialFlags === undefined ? [] : ids(data.initialFlags, 'initialFlags');
  if (!isObject(data.victory)) error('victory', 'expected a completion definition');
  else {
    fields(data.victory, ['flag', 'title', 'epilogue'], 'victory');
    identifier(data.victory.flag, 'victory.flag');
    text(data.victory.title, 'victory.title');
    text(data.victory.epilogue, 'victory.epilogue');
  }

  const roomIds = new Set<string>();
  const rooms = list(data.rooms, 'rooms', 64);
  if (!rooms.length) error('rooms', 'at least one room is required');
  for (const [i, room] of rooms.entries()) {
    const path = `rooms[${i}]`;
    if (!isObject(room)) { error(path, 'expected a room object'); continue; }
    fields(room, ['id', 'name', 'description', 'art', 'motif'], path);
    identifier(room.id, `${path}.id`);
    if (typeof room.id === 'string') {
      if (roomIds.has(room.id)) error(`${path}.id`, 'duplicate room');
      roomIds.add(room.id);
    }
    text(room.name, `${path}.name`);
    text(room.description, `${path}.description`);
    themeKey(room.art, `${path}.art`);
    if (!['tower', 'shelves', 'window', 'none'].includes(room.motif as string)) error(`${path}.motif`, 'expected tower, shelves, window or none');
  }
  if (typeof data.start === 'string' && !roomIds.has(data.start)) error('start', 'unknown room');

  const itemIds = new Set<string>();
  if (!isObject(data.items) || Object.keys(data.items).length > 128) error('items', 'expected at most 128 item definitions');
  else for (const [id, item] of Object.entries(data.items)) {
    identifier(id, `items.${id}`);
    itemIds.add(id);
    if (!isObject(item)) { error(`items.${id}`, 'expected an item object'); continue; }
    fields(item, ['name', 'icon'], `items.${id}`);
    text(item.name, `items.${id}.name`);
    if (item.icon !== undefined) themeKey(item.icon, `items.${id}.icon`);
  }

  const actions = list(data.actions, 'actions', 512);
  if (!actions.length) error('actions', 'at least one action is required');
  const actionIds = new Set<string>();
  const producedFlags = new Set(initialFlags);
  const producedItems = new Set<string>();
  const flagReferences: { path: string; id: string }[] = [];
  const itemReferences: { path: string; id: string }[] = [];
  for (const [i, action] of actions.entries()) {
    const path = `actions[${i}]`;
    if (!isObject(action)) { error(path, 'expected an action object'); continue; }
    fields(action, ['id', 'label', 'room', 'text', 'sound', 'require', 'missing', 'items', 'consume', 'add', 'flags', 'journal', 'move', 'once'], path);
    identifier(action.id, `${path}.id`);
    if (typeof action.id === 'string') {
      if (actionIds.has(action.id)) error(`${path}.id`, 'duplicate action');
      actionIds.add(action.id);
    }
    text(action.label, `${path}.label`);
    text(action.text, `${path}.text`);
    if (action.journal !== undefined) text(action.journal, `${path}.journal`);
    if (action.sound !== undefined) themeKey(action.sound, `${path}.sound`);
    if (typeof action.room !== 'string' || !roomIds.has(action.room)) error(`${path}.room`, 'unknown room');
    if (action.move !== undefined && (typeof action.move !== 'string' || !roomIds.has(action.move))) error(`${path}.move`, 'unknown room');
    if (action.once !== undefined) {
      identifier(action.once, `${path}.once`);
      if (typeof action.once === 'string') producedFlags.add(action.once);
    }
    for (const key of ['require', 'missing', 'items', 'consume', 'add', 'flags']) {
      if (action[key] === undefined) continue;
      for (const id of ids(action[key], `${path}.${key}`)) {
        if (key === 'flags') producedFlags.add(id);
        else if (key === 'require' || key === 'missing') flagReferences.push({ path: `${path}.${key}`, id });
        else {
          if (!itemIds.has(id)) error(`${path}.${key}`, `unknown item ${id}`);
          if (key === 'add') producedItems.add(id);
          else itemReferences.push({ path: `${path}.${key}`, id });
        }
      }
    }
    if (Array.isArray(action.consume) && action.consume.some(id => !Array.isArray(action.items) || !action.items.includes(id))) error(`${path}.consume`, 'consumed items must be required');
  }
  if (isObject(data.victory) && typeof data.victory.flag === 'string') flagReferences.push({ path: 'victory.flag', id: data.victory.flag });
  for (const ref of flagReferences) if (!producedFlags.has(ref.id)) error(ref.path, `flag ${ref.id} is never produced or initially set`);
  for (const ref of itemReferences) if (!producedItems.has(ref.id)) error(ref.path, `item ${ref.id} is never produced`);
  if (valid) c.register(AdventureChapters, c.id, data as unknown as AdventureChapter);
}
