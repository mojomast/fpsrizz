import { ExperienceRole, NavigationRole, createCommandQueue, definePlugin, isObject } from '../../../../src/sdk/index.ts';
import { PushPuzzle, PuzzleCampaigns, PuzzleResolved } from '../../contracts/puzzle.ts';
import type { PuzzleBoard, PuzzleCommand } from '../../contracts/puzzle.ts';
import { loadCampaign } from './content.ts';
import { copyBoard, initialBoard, takeTurn } from './rules.ts';

export default definePlugin({
  register(ctx) {
    ctx.provideRole(ExperienceRole, 'puzzle/stonewake', {
      name: 'Stonewake', description: 'A 3D stone-pushing escape. Outsmart the ruins, one step at a time.', pointer: 'free',
      controls: [['WASD / arrows', 'Step or push (compass directions)'], ['Space', 'Wait one turn'], ['Z / R', 'Undo / restart chamber'], ['Q / E', 'Rotate the 3D camera'], ['Click a neighboring tile', 'Step or push']],
    });
    ctx.contentKind('push-puzzle', { description: 'A campaign of stone-pushing chambers.', load(data, c) {
      const campaign = loadCampaign(data, c.r);
      if (campaign) c.register(PuzzleCampaigns, c.id, campaign);
    } });
    ctx.addValidator(v => {
      const id = v.preset.options['campaign'];
      if (typeof id !== 'string' || !v.registries.has(PuzzleCampaigns, id)) v.reporter('preset', 'options.campaign').error('select an installed push-puzzle campaign');
      if (v.selectedRole(ExperienceRole) !== 'puzzle/stonewake') v.reporter('preset', 'roles.sdk/experience').error('select puzzle/stonewake for this campaign');
      const foreignExperiences = new Set(v.roleProviders(ExperienceRole).filter(provider => provider.owner !== 'puzzle/rules').map(provider => provider.owner));
      const incompatible = v.activePlugins.filter(id => foreignExperiences.has(id) || [
        'core/world', 'core/player', 'core/combat', 'core/enemies', 'core/modes', 'core/hud', 'core/presentation', 'core/content'].includes(id));
      if (incompatible.length) v.reporter('preset', 'plugins').error(`puzzle/rules requires its own experience; disable ${incompatible.join(', ')}`);
    });
  },
  activate(ctx) {
    const navigation = ctx.role(NavigationRole)!.provider;
    const campaign = ctx.registries.require(PuzzleCampaigns, String(ctx.preset.options['campaign']));
    let chamber = 0, board = initialBoard(campaign.chambers[0]!), totalTurns = 0, revision = 0;
    let message = campaign.chambers[0]!.hint;
    const history: PuzzleBoard[] = [];
    const queue = createCommandQueue<PuzzleCommand>(ctx, { capacity: 32, normalize(command) {
      if (!isObject(command)) return undefined;
      const type = command.type;
      if (type === 'move') {
        const direction = command.direction;
        if (direction === 'north' || direction === 'east' || direction === 'south' || direction === 'west') return { type, direction };
      } else if (type === 'wait' || type === 'undo' || type === 'restart' || type === 'next' || type === 'replay') return { type };
      return undefined;
    } });
    const reset = () => { board = initialBoard(campaign.chambers[chamber]!); history.length = 0; message = campaign.chambers[chamber]!.hint; };
    ctx.services.provide(PushPuzzle, {
      campaign, get revision() { return revision; },
      state: () => ({ ...copyBoard(board), chamber, totalTurns, revision, canUndo: history.length > 0, message }),
      enqueue: queue.enqueue,
    });
    ctx.systems.add({ id: 'puzzle/rules.commands', phase: 'control', update() {
      const command = queue.drainOne();
      if (!command) return;
      if (command.type === 'undo') {
        const previous = history.pop();
        if (previous) { board = previous; message = 'Turn rewound. The stones and golems remember nothing.'; revision++; ctx.events.emit(PuzzleResolved, { cue: 'puzzle-undo' }); }
        queue.clear();
        return;
      }
      if (command.type === 'restart' || command.type === 'replay') {
        if (command.type === 'replay') { chamber = 0; totalTurns = 0; }
        reset(); revision++; queue.clear(); return;
      }
      if (command.type === 'next') {
        if (board.status === 'cleared' && chamber < campaign.chambers.length - 1) { totalTurns += board.turns; chamber++; reset(); revision++; }
        queue.clear(); return;
      }
      const result = takeTurn(campaign.chambers[chamber]!, board, command.type === 'move' ? command.direction : null, navigation);
      if ('reason' in result) { message = result.reason; revision++; return; }
      history.push(copyBoard(board));
      if (history.length > 256) history.shift();
      board = result.board; revision++;
      const cue = board.status === 'cleared' ? 'puzzle-clear' : board.status === 'caught' ? 'puzzle-caught' : result.opened ? 'puzzle-gate' : result.pushed ? 'puzzle-push' : 'puzzle-step';
      message = board.status === 'cleared' ? 'Passage secured. The ruins yield to you.' : board.status === 'caught' ? 'A golem caught you. Undo to change your route.'
        : result.opened ? 'Every plate is weighted. The exit gate is open.' : result.pushed ? 'Stone shifted. Boulders block the golems as well as you.'
          : board.golems.length ? (board.turns % 2 ? 'The golems move after your next step. Plan your escape.' : 'The golems have moved. You have two steps.') : 'Weight every plate, then walk through the golden gate.';
      ctx.events.emit(PuzzleResolved, { cue });
      if (board.status !== 'playing') queue.clear();
    } });
  },
});
