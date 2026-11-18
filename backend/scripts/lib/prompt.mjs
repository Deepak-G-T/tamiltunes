// Ask for a secret without echoing it and without it appearing in the shell history or process list.
import readline from 'node:readline';

let pipedLines;

export function promptHidden(question) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    const output = process.stdout;
    if (!input.isTTY) { // piped input (tests, CI): one reader for all prompts, a line each
      pipedLines ??= readline.createInterface({ input })[Symbol.asyncIterator]();
      output.write(question);
      pipedLines.next().then((r) => { output.write('\n'); resolve(r.done ? '' : r.value); }, reject);
      return;
    }
    output.write(question);
    readline.emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    let value = '';
    const done = (fn, arg) => { input.setRawMode(false); input.pause(); input.removeListener('keypress', onKey); output.write('\n'); fn(arg); };
    const onKey = (str, key = {}) => {
      if (key.ctrl && key.name === 'c') return done(reject, new Error('Cancelled'));
      if (key.name === 'return' || key.name === 'enter') return done(resolve, value);
      if (key.name === 'backspace') value = value.slice(0, -1);
      else if (str && !key.ctrl && !key.meta) value += str;
    };
    input.on('keypress', onKey);
  });
}
