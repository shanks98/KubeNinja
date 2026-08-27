// Parse the `aws eks update-kubeconfig` commands people paste from their runbooks
// into { name, region } pairs. Mirrors DockerLens's ParseImportLines: we never
// shell out to the AWS CLI — we only read the --name and --region off each line
// and connect with the in-memory AWS session. The shorthand `<name> <region>`
// (as printed by many internal tools) is accepted too.

const REGION_RE = /^[a-z]{2}(-[a-z]+)+-\d$/;

export interface ParsedClusterLine {
  raw: string;
  name: string;
  region: string;
  error?: string;
}

function parseFlags(tokens: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].startsWith('--') && i + 1 < tokens.length && !tokens[i + 1].startsWith('--')) {
      flags[tokens[i]] = tokens[i + 1];
      i++;
    }
  }
  return flags;
}

export function parseImportLines(text: string): ParsedClusterLine[] {
  const out: ParsedClusterLine[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;

    let name = '';
    let region = '';
    if (line.includes('update-kubeconfig')) {
      const flags = parseFlags(line.split(/\s+/));
      name = flags['--name'] ?? '';
      region = flags['--region'] ?? '';
      if (!name || !region) {
        out.push({ raw: line, name, region, error: 'command must include --name and --region' });
        continue;
      }
    } else {
      const tokens = line.split(/\s+/);
      if (tokens.length !== 2) {
        out.push({ raw: line, name: '', region: '', error: "expected '<cluster-name> <region>' or an update-kubeconfig command" });
        continue;
      }
      [name, region] = tokens;
    }

    if (!REGION_RE.test(region)) {
      out.push({ raw: line, name, region, error: `'${region}' is not a valid AWS region` });
      continue;
    }
    out.push({ raw: line, name, region });
  }
  return out;
}
