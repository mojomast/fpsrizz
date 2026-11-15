import type { FlowResult, FlowService } from '../sdk/contracts/shooter.ts';

export function createFlow(emitEnded: (r: FlowResult) => void, now: () => number): FlowService {
  let ended = false;
  let result: FlowResult | undefined;
  let objective = '';
  let revision = 0;
  const status = new Map<string, { label: string; value: string }>();
  const notice = { text: '', at: 0 };

  return {
    get ended() { return ended; },
    get result() { return result; },
    get objective() { return objective; },
    get revision() { return revision; },
    get status() { return status; },
    get notice() { return notice; },
    setObjective(text) {
      if (text === objective) return;
      objective = text;
      revision++;
    },
    setStatus(key, label, value) {
      const cur = status.get(key);
      if (cur) {
        if (cur.label === label && cur.value === value) return;
        cur.label = label;
        cur.value = value;
      } else status.set(key, { label, value });
      revision++;
    },
    notify(text) {
      notice.text = text;
      notice.at = now();
      revision++;
    },
    end(r) {
      if (ended) return;
      ended = true;
      result = r;
      revision++;
      emitEnded(r);
    },
  };
}
