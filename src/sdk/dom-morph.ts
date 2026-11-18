/**
 * Minimal DOM morphing for immediate-mode UIs (rebuild the tree each change, keep the live nodes).
 *
 *   const next = doc.createElement('div'); render(next); morphChildren(live, next);
 *
 * Children are matched by position, tag and `data-key`; matching nodes are updated in place (attributes, text,
 * children), so buttons under the pointer, focus, scroll positions and `<details>` stay put. Anything else is
 * replaced. Moves nodes out of `source`, which is left empty.
 */
export function morphChildren(target: Element, source: Element): void {
  const incoming = Array.from(source.childNodes);
  for (let i = 0; i < incoming.length; i++) {
    const next = incoming[i]!;
    const live = target.childNodes[i];
    if (live && sameKind(live, next)) morphNode(live, next);
    else if (live) target.replaceChild(next, live);
    else target.appendChild(next);
  }
  while (target.childNodes.length > incoming.length) target.lastChild!.remove();
}

function sameKind(a: Node, b: Node): boolean {
  if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) return false;
  if (a.nodeType !== 1) return true;
  return (a as Element).getAttribute('data-key') === (b as Element).getAttribute('data-key');
}

function morphNode(live: Node, next: Node): void {
  if (live.nodeType !== 1) {
    if (live.nodeValue !== next.nodeValue) live.nodeValue = next.nodeValue;
    return;
  }
  const a = live as Element, b = next as Element;
  for (const attr of Array.from(a.attributes)) if (!b.hasAttribute(attr.name)) a.removeAttribute(attr.name);
  for (const attr of Array.from(b.attributes)) if (a.getAttribute(attr.name) !== attr.value) a.setAttribute(attr.name, attr.value);
  // Reflected state that attributes alone do not reset once the user touched it.
  if ('disabled' in a && (a as HTMLButtonElement).disabled !== (b as HTMLButtonElement).disabled) (a as HTMLButtonElement).disabled = (b as HTMLButtonElement).disabled;
  morphChildren(a, b);
}
