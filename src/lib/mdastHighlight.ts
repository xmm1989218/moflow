/* eslint-disable @typescript-eslint/no-explicit-any */

const constructsWithoutHighlight = [
  "autolink",
  "destinationLiteral",
  "destinationRaw",
  "reference",
  "titleQuote",
  "titleApostrophe",
  "highlight",
];

export function mdastHighlightFromMarkdown() {
  return {
    canContainEols: ["mark"],
    enter: { highlight: enterHighlight },
    exit: { highlight: exitHighlight },
  };
}

function enterHighlight(this: any, token: any) {
  this.enter({ type: "mark", children: [] }, token);
}

function exitHighlight(this: any, token: any) {
  this.exit(token);
}

export function mdastHighlightToMarkdown() {
  return {
    unsafe: [
      {
        character: "=",
        inConstruct: "phrasing",
        notInConstruct: constructsWithoutHighlight,
      },
    ],
    handlers: { mark: handleMark },
  };
}

function handleMark(node: any, _parent: any, state: any, info: any) {
  const tracker = state.createTracker(info);
  const exit = state.enter("highlight");
  let value = tracker.move("==");
  value += state.containerPhrasing(node, {
    ...tracker.current(),
    before: value,
    after: "=",
  });
  value += tracker.move("==");
  exit();
  return value;
}
