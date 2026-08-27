import { describe, it, expect } from 'vitest';
import { parseImportLines } from './eksCommands';

describe('parseImportLines', () => {
  it('parses an aws eks update-kubeconfig command', () => {
    const [r] = parseImportLines('aws eks update-kubeconfig --name prod-eks --region ap-south-1');
    expect(r).toMatchObject({ name: 'prod-eks', region: 'ap-south-1' });
    expect(r.error).toBeUndefined();
  });

  it('accepts flags in any order and extra args', () => {
    const [r] = parseImportLines('aws eks update-kubeconfig --region us-east-1 --name staging --profile foo');
    expect(r).toMatchObject({ name: 'staging', region: 'us-east-1' });
  });

  it('accepts the "<name> <region>" shorthand', () => {
    const [r] = parseImportLines('my-cluster eu-west-1');
    expect(r).toMatchObject({ name: 'my-cluster', region: 'eu-west-1' });
    expect(r.error).toBeUndefined();
  });

  it('skips blank lines and comments, parses multiple', () => {
    const out = parseImportLines('\n# a note\naws eks update-kubeconfig --name a --region us-east-1\nb ap-south-1\n');
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.name)).toEqual(['a', 'b']);
  });

  it('flags a missing --region on the command', () => {
    const [r] = parseImportLines('aws eks update-kubeconfig --name only-name');
    expect(r.error).toMatch(/--name and --region/);
  });

  it('flags an invalid region', () => {
    const [r] = parseImportLines('cluster not-a-region');
    expect(r.error).toMatch(/not a valid AWS region/);
  });

  it('flags shorthand with the wrong token count', () => {
    const [r] = parseImportLines('just-one-token');
    expect(r.error).toMatch(/expected/);
  });
});
