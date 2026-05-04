/* eslint-disable @typescript-eslint/no-explicit-any */

import { splice } from "micromark-util-chunked";
import { classifyCharacter } from "micromark-util-classify-character";
import { resolveAll } from "micromark-util-resolve-all";

export function micromarkHighlight() {
  const tokenizer = {
    name: "highlight",
    tokenize: tokenizeHighlight,
    resolveAll: resolveAllHighlight,
  };

  return {
    text: {
      61: tokenizer,
    },
    insideSpan: {
      null: [tokenizer],
    },
    attentionMarkers: {
      null: [61],
    },
  };

  function resolveAllHighlight(events: any[], context: any) {
    let index = -1;

    while (++index < events.length) {
      if (
        events[index][0] === "enter" &&
        events[index][1].type === "highlightSequenceTemporary" &&
        events[index][1]._close
      ) {
        let open = index;

        while (open--) {
          if (
            events[open][0] === "exit" &&
            events[open][1].type === "highlightSequenceTemporary" &&
            events[open][1]._open &&
            events[index][1].end.offset - events[index][1].start.offset ===
              events[open][1].end.offset - events[open][1].start.offset
          ) {
            events[index][1].type = "highlightSequence";
            events[open][1].type = "highlightSequence";

            const highlight = {
              type: "highlight",
              start: Object.assign({}, events[open][1].start),
              end: Object.assign({}, events[index][1].end),
            };

            const text = {
              type: "highlightText",
              start: Object.assign({}, events[open][1].end),
              end: Object.assign({}, events[index][1].start),
            };

            const nextEvents = [
              ["enter", highlight, context],
              ["enter", events[open][1], context],
              ["exit", events[open][1], context],
              ["enter", text, context],
            ];

            const insideSpan = context.parser.constructs.insideSpan.null;
            if (insideSpan) {
              splice(
                nextEvents,
                nextEvents.length,
                0,
                resolveAll(insideSpan, events.slice(open + 1, index), context)
              );
            }

            splice(nextEvents, nextEvents.length, 0, [
              ["exit", text, context],
              ["enter", events[index][1], context],
              ["exit", events[index][1], context],
              ["exit", highlight, context],
            ]);
            splice(events, open - 1, index - open + 3, nextEvents);
            index = open + nextEvents.length - 2;
            break;
          }
        }
      }
    }

    index = -1;
    while (++index < events.length) {
      if (events[index][1].type === "highlightSequenceTemporary") {
        events[index][1].type = "data";
      }
    }

    return events;
  }

  function tokenizeHighlight(this: any, effects: any, ok: any, nok: any) {
    const previous = this.previous;
    const events = this.events;
    let size = 0;

    return start;

    function start(code: number | null) {
      if (
        previous === 61 &&
        events[events.length - 1][1].type !== "characterEscape"
      ) {
        return nok(code);
      }
      effects.enter("highlightSequenceTemporary");
      return more(code);
    }

    function more(code: number | null) {
      const before = classifyCharacter(previous);
      if (code === 61) {
        if (size > 1) return nok(code);
        effects.consume(code);
        size++;
        return more;
      }
      if (size < 2) return nok(code);
      const token = effects.exit("highlightSequenceTemporary");
      const after = classifyCharacter(code);
      token._open = !after || (after === 2 && Boolean(before));
      token._close = !before || (after === 2 && Boolean(after));
      return ok(code);
    }
  }
}
