import type { RoomMapDefinition, RoomMapHandle, RoomMapNode, RoomMapProvider, SessionContext } from '@bulkhead/sdk';
import { RoomMapChanged, RoomMapRole, definePlugin } from '@bulkhead/sdk';

function validate(definition: RoomMapDefinition): RoomMapDefinition {
  if (typeof definition.id !== 'string' || !definition.id.trim() || definition.id.length > 128) throw new TypeError('Room map id must be nonblank');
  if (typeof definition.name !== 'string' || !definition.name.trim()) throw new TypeError('Room map name must be nonblank');
  if (!Array.isArray(definition.rooms) || definition.rooms.length < 1 || definition.rooms.length > 512) throw new RangeError('Room map needs 1..512 rooms');
  const rooms = new Map<string, RoomMapNode>();
  for (const [index, room] of definition.rooms.entries()) {
    if (typeof room.id !== 'string' || !room.id.trim() || room.id.length > 80) throw new TypeError(`Room ${index} has an invalid id`);
    if (rooms.has(room.id)) throw new TypeError(`Room map repeats "${room.id}"`);
    if (typeof room.name !== 'string' || !room.name.trim()) throw new TypeError(`Room "${room.id}" needs a name`);
    if (typeof room.region !== 'string' || !room.region.trim()) throw new TypeError(`Room "${room.id}" needs a region`);
    const { x, y, w, h } = room.map;
    if (![x, y, w, h].every(value => Number.isSafeInteger(value) && value >= 0) || w < 1 || h < 1 || x + w > 512 || y + h > 512)
      throw new RangeError(`Room "${room.id}" has an invalid map rectangle`);
    rooms.set(room.id, Object.freeze({ ...room, map: Object.freeze({ ...room.map }) }));
  }
  if (!rooms.has(definition.start)) throw new TypeError('Room map start must name a room');
  if (!Array.isArray(definition.links)) throw new TypeError('Room map links must be an array');
  const adjacent = new Map<string, string[]>();
  const seen = new Set<string>();
  for (const link of definition.links) {
    if (!rooms.has(link.from) || !rooms.has(link.to)) throw new TypeError(`Room link ${link.from} -> ${link.to} references an unknown room`);
    if (link.from === link.to) throw new TypeError(`Room link ${link.from} -> ${link.to} is a self-link`);
    const key = `${link.from}\u0000${link.to}`;
    if (seen.has(key)) throw new TypeError(`Room link ${link.from} -> ${link.to} is duplicated`);
    seen.add(key);
    const list = adjacent.get(link.from) ?? [];
    list.push(link.to);
    adjacent.set(link.from, list);
  }
  return Object.freeze({
    id: definition.id, name: definition.name, start: definition.start,
    rooms: Object.freeze([...rooms.values()]),
    links: Object.freeze(definition.links.map(link => Object.freeze({ ...link }))),
  });
}

export default definePlugin({
  register(ctx) {
    ctx.provideRole(RoomMapRole, 'mechanics/room-map', Object.freeze({
      name: 'Explorable room map',
      description: 'Validated room graph with current/visited/revealed state; consumers own transitions and rendering.',
      create(owner: SessionContext, id: string, input: RoomMapDefinition): RoomMapHandle {
        if (typeof id !== 'string' || !id.trim() || id.length > 128) throw new TypeError('Room map instance id must be nonblank');
        const definition = validate(input);
        const byId = new Map(definition.rooms.map(room => [room.id, room]));
        const adjacent = new Map<string, readonly string[]>();
        for (const room of definition.rooms) adjacent.set(room.id, Object.freeze(definition.links.filter(link => link.from === room.id).map(link => link.to)));
        let current = definition.start;
        const visited = new Set<string>([definition.start]);
        const revealed = new Set<string>([definition.start, ...(adjacent.get(definition.start) ?? [])]);
        let revision = 0;
        let active = true;
        const state = () => Object.freeze({ current, visited: Object.freeze([...visited]), revealed: Object.freeze([...revealed]) });
        const publish = () => owner.events.emit(RoomMapChanged, { owner: owner.pluginId, instance: id, ...state(), revision });
        const writable = (): string | undefined => {
          if (!active) return 'Room map is disposed';
          return undefined;
        };
        const handle: RoomMapHandle = Object.freeze({
          id, get active() { return active; }, get revision() { return revision; }, definition,
          state,
          enter(room: string) {
            const blocked = writable(); if (blocked) return { ok: false, changed: false, reason: blocked };
            if (!byId.has(room)) return { ok: false, changed: false, reason: `Unknown room "${room}"` };
            const wasVisited = visited.has(room);
            const wasRevealed = revealed.has(room);
            const previous = current;
            if (current === room && wasVisited && wasRevealed) return { ok: true, changed: false, reason: '' };
            current = room;
            visited.add(room);
            revealed.add(room);
            for (const neighbor of adjacent.get(room) ?? []) revealed.add(neighbor);
            revision++;
            if (!wasVisited || !wasRevealed || previous !== room) publish();
            return { ok: true, changed: true, reason: '' };
          },
          reveal(room: string) {
            const blocked = writable(); if (blocked) return { ok: false, changed: false, reason: blocked };
            if (!byId.has(room)) return { ok: false, changed: false, reason: `Unknown room "${room}"` };
            if (revealed.has(room)) return { ok: true, changed: false, reason: '' };
            revealed.add(room); revision++; publish();
            return { ok: true, changed: true, reason: '' };
          },
          neighbors(room: string) { return adjacent.get(room) ?? Object.freeze([]); },
          dispose() { if (!active) return; active = false; visited.clear(); revealed.clear(); revision++; },
        });
        owner.scope.add(() => handle.dispose(), 'room-map');
        return handle;
      },
    }));
  },
});
