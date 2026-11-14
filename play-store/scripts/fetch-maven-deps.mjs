import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const repositoryDir = path.join(projectDir, 'local-maven');
const repositories = [
  'https://dl.google.com/dl/android/maven2',
  'https://repo.maven.apache.org/maven2'
];
const seen = new Set();
const models = new Map();

const coordinatePath = ({ group, artifact, version }) => `${group.replaceAll('.', '/')}/${artifact}/${version}`;
const tag = (xml, name) => xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`))?.[1]?.trim() || '';
const blocks = (xml, name) => [...xml.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'g'))].map(match => match[1]);

async function fetchFromRepositories(relativePath, required = true) {
  for (const repository of repositories) {
    const url = `${repository}/${relativePath}`;
    const result = spawnSync('curl', ['--globoff', '-L', '--fail', '--silent', '--show-error', url], { encoding: null, maxBuffer: 128 * 1024 * 1024 });
    if (result.status === 0) return result.stdout;
    if (!String(result.stderr).includes('404')) throw new Error(`${String(result.stderr).trim()} ${url}`);
  }
  if (required) throw new Error(`Mavenファイルが見つかりません: ${relativePath}`);
  return null;
}

function resolveValue(value, properties) {
  let result = value;
  for (let i = 0; i < 8 && /\$\{[^}]+\}/.test(result); i += 1) {
    result = result.replace(/\$\{([^}]+)\}/g, (match, key) => properties[key] ?? match);
  }
  const exactRange = result.match(/^\[([^,]+)\]$/);
  if (exactRange) return exactRange[1];
  const lowerBound = result.match(/^[[(]([^,]+),/);
  return lowerBound ? lowerBound[1] : result;
}

function parseCoordinate(block, properties = {}) {
  return {
    group: resolveValue(tag(block, 'groupId'), properties),
    artifact: resolveValue(tag(block, 'artifactId'), properties),
    version: resolveValue(tag(block, 'version'), properties)
  };
}

async function loadModel(coordinate) {
  const key = `${coordinate.group}:${coordinate.artifact}:${coordinate.version}`;
  if (models.has(key)) return models.get(key);
  const promise = (async () => {
    const base = coordinatePath(coordinate);
    const pomName = `${coordinate.artifact}-${coordinate.version}.pom`;
    const pomBuffer = await fetchFromRepositories(`${base}/${pomName}`);
    const xml = pomBuffer.toString('utf8');
    const directory = path.join(repositoryDir, base);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, pomName), pomBuffer);
    const moduleName = `${coordinate.artifact}-${coordinate.version}.module`;
    const moduleBuffer = await fetchFromRepositories(`${base}/${moduleName}`, false);
    if (moduleBuffer) await fs.writeFile(path.join(directory, moduleName), moduleBuffer);

    const parentBlock = tag(xml, 'parent');
    const parentCoordinate = parentBlock ? parseCoordinate(parentBlock) : null;
    const parent = parentCoordinate?.group && parentCoordinate?.artifact && parentCoordinate?.version
      ? await loadModel(parentCoordinate)
      : { properties: {}, management: new Map() };
    const properties = { ...parent.properties };
    const propertiesBlock = tag(xml, 'properties');
    for (const match of propertiesBlock.matchAll(/<([\w.-]+)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g)) properties[match[1]] = match[2].trim();
    properties['project.groupId'] = coordinate.group;
    properties['project.artifactId'] = coordinate.artifact;
    properties['project.version'] = coordinate.version;
    properties['pom.groupId'] = coordinate.group;
    properties['pom.artifactId'] = coordinate.artifact;
    properties['pom.version'] = coordinate.version;

    const management = new Map(parent.management);
    const managementBlock = tag(xml, 'dependencyManagement');
    for (const dependencyBlock of blocks(managementBlock, 'dependency')) {
      const dependency = parseCoordinate(dependencyBlock, properties);
      const scope = tag(dependencyBlock, 'scope');
      const type = tag(dependencyBlock, 'type') || 'jar';
      if (scope === 'import' && type === 'pom' && dependency.version) {
        const imported = await loadModel(dependency);
        for (const [managedKey, managedVersion] of imported.management) management.set(managedKey, managedVersion);
      } else if (dependency.group && dependency.artifact && dependency.version) {
        management.set(`${dependency.group}:${dependency.artifact}`, dependency.version);
      }
    }

    const withoutManagement = xml.replace(/<dependencyManagement(?:\s[^>]*)?>[\s\S]*?<\/dependencyManagement>/g, '');
    const dependenciesBlock = tag(withoutManagement, 'dependencies');
    const dependencies = [];
    for (const dependencyBlock of blocks(dependenciesBlock, 'dependency')) {
      const dependency = parseCoordinate(dependencyBlock, properties);
      const scope = tag(dependencyBlock, 'scope') || 'compile';
      const optional = tag(dependencyBlock, 'optional') === 'true';
      if (optional || ['test', 'provided', 'system'].includes(scope)) continue;
      dependency.version ||= management.get(`${dependency.group}:${dependency.artifact}`) || '';
      dependency.version = resolveValue(dependency.version, properties);
      if (!dependency.group || !dependency.artifact || !dependency.version || dependency.version.includes('${')) {
        throw new Error(`依存関係のバージョンを解決できません: ${key} -> ${JSON.stringify(dependency)}`);
      }
      dependencies.push(dependency);
    }
    const projectWithoutParent = xml.replace(/<parent(?:\s[^>]*)?>[\s\S]*?<\/parent>/, '');
    const packaging = tag(projectWithoutParent, 'packaging') || 'jar';
    return { xml, properties, management, dependencies, packaging };
  })();
  models.set(key, promise);
  return promise;
}

async function downloadCoordinate(coordinate) {
  const key = `${coordinate.group}:${coordinate.artifact}:${coordinate.version}`;
  if (seen.has(key)) return;
  seen.add(key);
  const model = await loadModel(coordinate);
  if (model.packaging !== 'pom') {
    const extension = model.packaging === 'aar' ? 'aar' : 'jar';
    const base = coordinatePath(coordinate);
    const fileName = `${coordinate.artifact}-${coordinate.version}.${extension}`;
    const artifact = await fetchFromRepositories(`${base}/${fileName}`);
    await fs.writeFile(path.join(repositoryDir, base, fileName), artifact);
  }
  for (const dependency of model.dependencies) await downloadCoordinate(dependency);
}

await downloadCoordinate({ group: 'com.google.androidbrowserhelper', artifact: 'billing', version: '1.2.0' });
await downloadCoordinate({ group: 'com.google.androidbrowserhelper', artifact: 'androidbrowserhelper', version: '2.7.4' });
console.log(`Maven依存関係を保存しました: ${seen.size}モジュール`);
