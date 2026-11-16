import {
  CraftingMechanicRole, CraftingProviders, CraftingRecipes, Items, definePlugin,
  isObject, vArray, vId, vNumber, vObject, vString,
} from '../../sdk/index.ts';
import type { CraftingIngredient, CraftingProvider, Reporter } from '../../sdk/index.ts';

function ingredient(value: unknown, r: Reporter): CraftingIngredient | undefined {
  const o = vObject(value, r);
  if (!o) return undefined;
  const item = vId(o.item, r.at('item'));
  const count = vNumber(o.count, r.at('count'), { int: true, min: 1, max: 999 });
  if (item === undefined || count === undefined) return undefined;
  return { item, count };
}
function validIngredient(value: CraftingIngredient | undefined): value is CraftingIngredient { return value !== undefined; }

export default definePlugin({ register(ctx) {
  ctx.contentKind('crafting-recipe', {
    description: 'A known item-to-item recipe: { name, description, inputs: [{item,count}], output: {item,count} }.',
    load(data, c) {
      if (!isObject(data)) return void c.r.error('expected a recipe object');
      const name = vString(data.name, c.r.at('name'), { max: 80, nonEmpty: true });
      const description = vString(data.description, c.r.at('description'), { max: 240, nonEmpty: true });
      const rawInputs = vArray(data.inputs, c.r.at('inputs'), { min: 1, max: 6 });
      const inputs: CraftingIngredient[] = [];
      rawInputs?.forEach((entry, index) => {
        const parsed = ingredient(entry, c.r.at('inputs').at(index));
        if (parsed) inputs.push(parsed);
      });
      const output = ingredient(data.output, c.r.at('output'));
      if ([name, description, output].includes(undefined) || c.r.failed) return;
      const seen = new Set<string>();
      for (const input of inputs) {
        if (seen.has(input.item)) c.r.at('inputs').error(`item "${input.item}" appears more than once`);
        seen.add(input.item);
      }
      if (output && seen.has(output.item)) c.r.at('output').error('output item must differ from every input item');
      c.register(CraftingRecipes, c.id, Object.freeze({ name: name!, description: description!, inputs: Object.freeze(inputs.map(input => Object.freeze({ ...input }))), output: Object.freeze({ ...output! }) }));
    },
  });
  ctx.addValidator(v => {
    for (const entry of v.registries.entries(CraftingRecipes)) {
      const r = v.reporter(entry.owner, `crafting recipe "${entry.id}"`);
      for (const [index, input] of entry.value.inputs.entries()) if (!v.registries.has(Items, input.item)) r.at('inputs').at(index).at('item').error(`unknown item "${input.item}"`);
      if (!v.registries.has(Items, entry.value.output.item)) r.at('output').at('item').error(`unknown item "${entry.value.output.item}"`);
    }
  });
  ctx.provideRole(CraftingMechanicRole, 'mechanics/crafting', { name: 'Known item recipes', description: 'Atomic item-to-item crafting with known recipe definitions' });
  ctx.register(CraftingProviders, 'mechanics/crafting', { start(owner) {
    const provider: CraftingProvider = { preview(inventory, id) {
      const recipe = owner.registries.get(CraftingRecipes, id);
      if (!recipe) return { ok: false, reason: 'Unknown recipe', missing: [] };
      if (!inventory.active) return { ok: false, reason: 'Inventory is unavailable', missing: [] };
      const missing = recipe.inputs.map(input => ({ ...input, have: inventory.count(input.item) })).filter(input => input.have < input.count);
      return missing.length ? { ok: false, reason: `Missing ${missing.map(missing => `${missing.count - missing.have} ${missing.item}`).join(', ')}`, missing: Object.freeze(missing) } : { ok: true, reason: '', missing: [] };
    }, craft(inventory, id) {
      const recipe = owner.registries.get(CraftingRecipes, id);
      if (!recipe) return { ok: false, reason: 'Unknown recipe' };
      const check = provider.preview(inventory, id);
      if (!check.ok) return { ok: false, reason: check.reason };
      const removed: CraftingIngredient[] = [];
      for (const input of recipe.inputs) {
        const result = inventory.remove(input.item, input.count);
        if (!result.ok) {
          for (const restore of removed) inventory.add(restore.item, restore.count);
          return { ok: false, reason: result.reason };
        }
        removed.push(input);
      }
      const added = inventory.add(recipe.output.item, recipe.output.count);
      if (!added.ok) {
        for (const restore of removed) inventory.add(restore.item, restore.count);
        return { ok: false, reason: added.reason };
      }
      return { ok: true, reason: '' };
    } };
    return { preview: (inventory, id) => provider.preview(inventory, id), craft: (inventory, id) => provider.craft(inventory, id) };
  } });
} });
