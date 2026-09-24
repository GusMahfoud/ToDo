/**
 * Quick-add syntax: `Call dentist #health #calls !3`
 *   #tag  → tags (repeatable)   !0-3 → priority
 * Everything else is the title. Unknown tokens stay in the title.
 */
export interface QuickAddParse {
  title: string;
  tags: string[];
  priority: number;
}

const TAG = /^#([\w-]{1,40})$/;
const PRIORITY = /^!([0-3])$/;

export function parseQuickAdd(input: string): QuickAddParse {
  const words: string[] = [];
  const tags: string[] = [];
  let priority = 0;
  for (const token of input.trim().split(/\s+/)) {
    const tag = TAG.exec(token);
    if (tag?.[1]) {
      tags.push(tag[1].toLowerCase());
      continue;
    }
    const prio = PRIORITY.exec(token);
    if (prio?.[1]) {
      priority = Number(prio[1]);
      continue;
    }
    words.push(token);
  }
  return { title: words.join(" ").trim(), tags: [...new Set(tags)], priority };
}
