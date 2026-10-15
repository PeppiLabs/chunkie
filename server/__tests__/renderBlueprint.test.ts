import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/**
 * Guards render.yaml, the Blueprint for Chunkie on Render. It checks the
 * staging settings, and that no secret is ever written into the file.
 */

type EnvVar = { key: string; value?: string; sync?: boolean; generateValue?: boolean };
type Service = {
  type: string;
  name: string;
  runtime: string;
  plan?: string;
  branch?: string;
  autoDeployTrigger?: string;
  buildCommand?: string;
  startCommand?: string;
  healthCheckPath?: string;
  envVars?: EnvVar[];
};
type Blueprint = {
  projects: { name: string; environments: { name: string; services: Service[] }[] }[];
};

const ROOT = resolve(__dirname, '../..');
const source = readFileSync(join(ROOT, 'render.yaml'), 'utf8');
const blueprint = parse(source) as Blueprint;
const allServices = blueprint.projects.flatMap((p) => p.environments.flatMap((e) => e.services));

function serviceIn(environment: string): Service {
  const env = blueprint.projects[0].environments.find((e) => e.name === environment);
  if (!env || env.services.length !== 1) throw new Error(`Expected one service in ${environment}.`);
  return env.services[0];
}

const staging = serviceIn('staging');

describe('render.yaml', () => {
  it('has one project, chunkie, with a staging environment', () => {
    expect(blueprint.projects).toHaveLength(1);
    expect(blueprint.projects[0].name).toBe('chunkie');
    expect(blueprint.projects[0].environments.map((e) => e.name)).toEqual(['staging']);
  });

  it('never carries a secret: no env var has a value written here', () => {
    for (const service of allServices) {
      for (const envVar of service.envVars ?? []) {
        expect(envVar.value, `${service.name} ${envVar.key}`).toBeUndefined();
      }
    }
    expect(source).not.toMatch(/scrypt:/);
  });
});

describe('the staging site', () => {
  it('is a password protected web service built from staging', () => {
    expect(staging).toMatchObject({
      type: 'web',
      name: 'chunkie-staging',
      runtime: 'node',
      plan: 'free',
      region: 'singapore',
      branch: 'staging',
      autoDeployTrigger: 'commit',
      buildCommand: 'npm ci && npm run build',
      startCommand: 'npm start',
      healthCheckPath: '/healthz',
    });
  });

  it('takes its password hash from the dashboard, and never opens the landing page', () => {
    expect(staging.envVars).toEqual([{ key: 'SITE_PASSWORD_HASH', sync: false }]);
    expect(staging.envVars?.some((v) => v.key === 'SITE_PUBLIC_LANDING')).toBe(false);
  });
});
