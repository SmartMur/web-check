import url from 'url';
import { execFile } from 'child_process';
import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { promisify } from 'util';
import middleware from './_common/middleware.js';

const execFileAsync = promisify(execFile);
const isWindows = process.platform.startsWith('win');

const parseHop = (hop) => {
  const line = hop.replace(/\*/g, '0').replace(/</g, '');
  const parts = line.split(' ').filter((part) => part && part !== 'ms');

  if (isWindows) {
    if (parts[4] === 'Request') return false;
    return { [parts[4]]: [+parts[1], +parts[2], +parts[3]] };
  }

  if (parts[1] === '0') return false;

  const parsedHop = {};
  let lastIp = parts[1];
  parsedHop[lastIp] = [+parts[2]];

  for (let i = 3; i < parts.length; i += 1) {
    if (isIP(parts[i])) {
      lastIp = parts[i];
      parsedHop[lastIp] = parsedHop[lastIp] || [];
    } else {
      parsedHop[lastIp].push(+parts[i]);
    }
  }

  return parsedHop;
};

const parseTraceOutput = (output) => {
  const lines = output.split('\n');
  const hops = [];

  lines.shift();
  lines.pop();

  if (isWindows) {
    const firstHopIndex = lines.findIndex((line) => /^\s+1/.test(line));
    if (firstHopIndex > -1) lines.splice(0, firstHopIndex);
    lines.pop();
    lines.pop();
  }

  for (const line of lines) {
    hops.push(parseHop(line));
  }

  return hops;
};

const traceRouteHandler = async (urlString, context) => {
  // Parse the URL and get the hostname
  const urlObject = url.parse(urlString);
  const host = urlObject.hostname;

  if (!host) {
    throw new Error('Invalid URL provided');
  }

  try {
    await lookup(host.toUpperCase());
  } catch (error) {
    if (isIP(host) === 0) throw new Error('Invalid host');
  }

  const command = isWindows ? 'tracert' : 'traceroute';
  const args = isWindows ? ['-d', host] : ['-q', '1', '-n', host];
  const { stdout } = await execFileAsync(command, args, { timeout: 30000 });
  const result = parseTraceOutput(stdout);

  if (!result) {
    throw new Error('No hops found');
  }

  return {
    message: "Traceroute completed!",
    result,
  };
};

export const handler = middleware(traceRouteHandler);
export default handler;
